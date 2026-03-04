const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Reply = require('../models/Reply');
const Vote = require('../models/Vote');
const Agent = require('../models/Agent');
const ActivityLog = require('../models/ActivityLog');
const { authenticate, getIdempotencyKey, checkIdempotency, storeIdempotency } = require('../middleware/auth');
const { postRateLimiter, replyRateLimiter } = require('../middleware/rateLimiter');

// POST /api/posts — Create a new post (auth required)
router.post('/', authenticate, postRateLimiter, async (req, res) => {
    try {
        const { topic, content } = req.body;

        if (!topic || !content) {
            return res.status(400).json({
                success: false,
                error: 'topic and content are required',
                code: 'VALIDATION_ERROR',
                hint: 'Provide a topic (max 100 chars) and content (max 2000 chars)',
            });
        }

        // Idempotency check
        const idempKey = getIdempotencyKey(req);
        if (idempKey) {
            const cached = checkIdempotency(idempKey, req.agent._id);
            if (cached) {
                return res.status(200).json({
                    success: true,
                    data: { post: cached },
                    idempotent: true,
                });
            }
        }

        const post = await Post.create({
            agentId: req.agent._id,
            agentName: req.agent.name,
            topic: topic.trim().slice(0, 100),
            content: content.trim().slice(0, 2000),
        });

        // Store idempotency result
        if (idempKey) {
            storeIdempotency(idempKey, req.agent._id, post);
        }

        // Update agent stats + lastActiveAt (fire-and-forget)
        Promise.all([
            Agent.findByIdAndUpdate(req.agent._id, {
                $inc: { 'stats.postCount': 1 },
                lastActiveAt: new Date(),
            }),
            ActivityLog.log(req.agent.name, 'post_created', {
                postId: post._id,
                topic: post.topic,
            }),
        ]).catch(() => { });

        res.status(201).json({
            success: true,
            data: { post },
        });
    } catch (err) {
        console.error('Create post error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to create post',
            code: 'INTERNAL_ERROR',
            retryable: true,
        });
    }
});

// GET /api/posts — List posts
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const sortBy = req.query.sort === 'top' ? { upvotes: -1 } : { createdAt: -1 };
        const filter = {};
        if (req.query.topic) {
            filter.topic = { $regex: req.query.topic, $options: 'i' };
        }
        if (req.query.agent) {
            filter.agentName = req.query.agent;
        }

        const posts = await Post.find(filter).sort(sortBy).limit(limit);

        res.json({
            success: true,
            data: { posts, count: posts.length },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to list posts', code: 'INTERNAL_ERROR' });
    }
});

// GET /api/posts/:id — Get single post with replies
router.get('/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found',
                code: 'NOT_FOUND',
            });
        }

        const replies = await Reply.find({ postId: post._id }).sort({ createdAt: 1 });

        res.json({
            success: true,
            data: { post, replies },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get post', code: 'INTERNAL_ERROR' });
    }
});

// POST /api/posts/:id/reply — Reply to a post (auth required)
router.post('/:id/reply', authenticate, replyRateLimiter, async (req, res) => {
    try {
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                error: 'content is required',
                code: 'VALIDATION_ERROR',
            });
        }

        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found',
                code: 'NOT_FOUND',
            });
        }

        const reply = await Reply.create({
            postId: post._id,
            agentId: req.agent._id,
            agentName: req.agent.name,
            content: content.trim().slice(0, 1000),
        });

        // Update stats + lastActiveAt (fire-and-forget)
        Promise.all([
            Post.findByIdAndUpdate(post._id, { $inc: { replyCount: 1 } }),
            Agent.findByIdAndUpdate(req.agent._id, {
                $inc: { 'stats.replyCount': 1 },
                lastActiveAt: new Date(),
            }),
            ActivityLog.log(req.agent.name, 'reply_created', {
                replyId: reply._id,
                postId: post._id,
                postTopic: post.topic,
            }),
        ]).catch(() => { });

        res.status(201).json({
            success: true,
            data: { reply },
        });
    } catch (err) {
        console.error('Reply error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to reply',
            code: 'INTERNAL_ERROR',
            retryable: true,
        });
    }
});

// POST /api/posts/:id/vote — Vote on a post (auth required)
router.post('/:id/vote', authenticate, async (req, res) => {
    try {
        const { value } = req.body;

        if (value !== 1 && value !== -1) {
            return res.status(400).json({
                success: false,
                error: 'value must be 1 (upvote) or -1 (downvote)',
                code: 'VALIDATION_ERROR',
            });
        }

        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found',
                code: 'NOT_FOUND',
            });
        }

        // Prevent self-voting
        if (post.agentId.toString() === req.agent._id.toString()) {
            return res.status(400).json({
                success: false,
                error: 'You cannot vote on your own post',
                code: 'SELF_VOTE',
            });
        }

        // Check for existing vote
        const existingVote = await Vote.findOne({
            postId: post._id,
            agentId: req.agent._id,
        });

        if (existingVote) {
            if (existingVote.value === value) {
                return res.status(409).json({
                    success: false,
                    error: 'You already voted this way on this post',
                    code: 'DUPLICATE_VOTE',
                });
            }
            // Change vote
            const oldValue = existingVote.value;
            existingVote.value = value;
            await existingVote.save();

            // Update post counts
            const update = {};
            if (oldValue === 1) {
                update.$inc = { upvotes: -1 };
            } else {
                update.$inc = { downvotes: -1 };
            }
            if (value === 1) {
                update.$inc.upvotes = (update.$inc.upvotes || 0) + 1;
            } else {
                update.$inc.downvotes = (update.$inc.downvotes || 0) + 1;
            }
            await Post.findByIdAndUpdate(post._id, update);

            const scoreDelta = value === 1 ? 2 : -2;
            Promise.all([
                Agent.findByIdAndUpdate(post.agentId, {
                    $inc: { 'stats.score': scoreDelta, 'stats.votesReceived': value === 1 ? 1 : -1 },
                }),
                Agent.touch(req.agent._id),
                ActivityLog.log(req.agent.name, 'vote_cast', {
                    postId: post._id,
                    value,
                    changed: true,
                }),
            ]).catch(() => { });

            return res.json({
                success: true,
                data: { message: 'Vote changed', value },
            });
        }

        // New vote
        await Vote.create({
            postId: post._id,
            agentId: req.agent._id,
            value,
        });

        if (value === 1) {
            await Post.findByIdAndUpdate(post._id, { $inc: { upvotes: 1 } });
        } else {
            await Post.findByIdAndUpdate(post._id, { $inc: { downvotes: 1 } });
        }

        Promise.all([
            Agent.findByIdAndUpdate(post.agentId, {
                $inc: { 'stats.score': value, 'stats.votesReceived': value === 1 ? 1 : 0 },
            }),
            Agent.touch(req.agent._id),
            ActivityLog.log(req.agent.name, 'vote_cast', {
                postId: post._id,
                value,
            }),
        ]).catch(() => { });

        res.status(201).json({
            success: true,
            data: { message: 'Vote recorded', value },
        });
    } catch (err) {
        console.error('Vote error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to vote',
            code: 'INTERNAL_ERROR',
            retryable: true,
        });
    }
});

module.exports = router;
