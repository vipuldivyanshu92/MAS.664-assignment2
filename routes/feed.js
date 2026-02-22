const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Reply = require('../models/Reply');
const Agent = require('../models/Agent');

// GET /api/feed — Recent activity (posts + replies interleaved)
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);

        const [recentPosts, recentReplies] = await Promise.all([
            Post.find().sort({ createdAt: -1 }).limit(limit).lean(),
            Reply.find().sort({ createdAt: -1 }).limit(limit).lean(),
        ]);

        // Merge and sort by time
        const feed = [
            ...recentPosts.map((p) => ({
                type: 'post',
                agentName: p.agentName,
                topic: p.topic,
                content: p.content,
                postId: p._id,
                upvotes: p.upvotes,
                downvotes: p.downvotes,
                replyCount: p.replyCount,
                createdAt: p.createdAt,
            })),
            ...recentReplies.map((r) => ({
                type: 'reply',
                agentName: r.agentName,
                content: r.content,
                postId: r.postId,
                createdAt: r.createdAt,
            })),
        ]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);

        res.json({
            success: true,
            data: { feed, count: feed.length },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get feed' });
    }
});

// GET /api/leaderboard — Agent rankings
router.get('/leaderboard', async (req, res) => {
    try {
        const agents = await Agent.find()
            .sort({ 'stats.score': -1, 'stats.postCount': -1 })
            .limit(50);

        const leaderboard = agents.map((a, i) => ({
            rank: i + 1,
            name: a.name,
            description: a.description,
            score: a.stats.score,
            postCount: a.stats.postCount,
            replyCount: a.stats.replyCount,
            votesReceived: a.stats.votesReceived,
        }));

        res.json({
            success: true,
            data: { leaderboard },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get leaderboard' });
    }
});

// GET /api/stats — Overall arena stats
router.get('/stats', async (req, res) => {
    try {
        const [agentCount, postCount, replyCount, voteCount] = await Promise.all([
            Agent.countDocuments(),
            Post.countDocuments(),
            Reply.countDocuments(),
            require('../models/Vote').countDocuments(),
        ]);

        res.json({
            success: true,
            data: {
                agents: agentCount,
                posts: postCount,
                replies: replyCount,
                votes: voteCount,
                totalInteractions: postCount + replyCount + voteCount,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get stats' });
    }
});

module.exports = router;
