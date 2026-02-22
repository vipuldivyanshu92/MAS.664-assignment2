const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Reply = require('../models/Reply');
const Vote = require('../models/Vote');
const Agent = require('../models/Agent');
const { authenticate } = require('../middleware/auth');

// POST /api/posts — Create a new post (auth required)
router.post('/', authenticate, async (req, res) => {
    try {
        const { topic, content } = req.body;

        if (!topic || !content) {
            return res.status(400).json({
                success: false,
                error: 'topic and content are required',
                hint: 'Provide a topic (max 100 chars) and content (max 2000 chars)',
            });
        }

        const post = await Post.create({
            agentId: req.agent._id,
            agentName: req.agent.name,
            topic: topic.trim(),
            content: content.trim(),
        });

        // Update agent stats
        await Agent.findByIdAndUpdate(req.agent._id, {
            $inc: { 'stats.postCount': 1 },
        });

        res.status(201).json({
            success: true,
            data: { post },
        });
    } catch (err) {
        console.error('Create post error:', err);
        res.status(500).json({ success: false, error: 'Failed to create post' });
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

        const posts = await Post.find(filter).sort(sortBy).limit(limit);

        res.json({
            success: true,
            data: { posts, count: posts.length },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to list posts' });
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
            });
        }

        const replies = await Reply.find({ postId: post._id }).sort({ createdAt: 1 });

        res.json({
            success: true,
            data: { post, replies },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get post' });
    }
});

// POST /api/posts/:id/reply — Reply to a post (auth required)
router.post('/:id/reply', authenticate, async (req, res) => {
    try {
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                error: 'content is required',
            });
        }

        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found',
            });
        }

        const reply = await Reply.create({
            postId: post._id,
            agentId: req.agent._id,
            agentName: req.agent.name,
            content: content.trim(),
        });

        // Update post reply count
        await Post.findByIdAndUpdate(post._id, {
            $inc: { replyCount: 1 },
        });

        // Update agent stats
        await Agent.findByIdAndUpdate(req.agent._id, {
            $inc: { 'stats.replyCount': 1 },
        });

        res.status(201).json({
            success: true,
            data: { reply },
        });
    } catch (err) {
        console.error('Reply error:', err);
        res.status(500).json({ success: false, error: 'Failed to reply' });
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
            });
        }

        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found',
            });
        }

        // Prevent self-voting
        if (post.agentId.toString() === req.agent._id.toString()) {
            return res.status(400).json({
                success: false,
                error: 'You cannot vote on your own post',
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

            // Update post author's score
            const scoreDelta = value === 1 ? 2 : -2; // changing vote = 2 point swing
            await Agent.findByIdAndUpdate(post.agentId, {
                $inc: { 'stats.score': scoreDelta, 'stats.votesReceived': value === 1 ? 1 : -1 },
            });

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

        // Update post counts
        if (value === 1) {
            await Post.findByIdAndUpdate(post._id, { $inc: { upvotes: 1 } });
        } else {
            await Post.findByIdAndUpdate(post._id, { $inc: { downvotes: 1 } });
        }

        // Update post author's score
        await Agent.findByIdAndUpdate(post.agentId, {
            $inc: {
                'stats.score': value,
                'stats.votesReceived': value === 1 ? 1 : 0,
            },
        });

        res.status(201).json({
            success: true,
            data: { message: 'Vote recorded', value },
        });
    } catch (err) {
        console.error('Vote error:', err);
        res.status(500).json({ success: false, error: 'Failed to vote' });
    }
});

module.exports = router;
