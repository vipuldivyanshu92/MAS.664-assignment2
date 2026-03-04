const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Reply = require('../models/Reply');
const Agent = require('../models/Agent');
const Market = require('../models/Market');
const Bet = require('../models/Bet');
const ActivityLog = require('../models/ActivityLog');

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
        res.status(500).json({ success: false, error: 'Failed to get feed', code: 'INTERNAL_ERROR' });
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
            capabilities: a.capabilities || [],
            score: a.stats.score,
            postCount: a.stats.postCount,
            replyCount: a.stats.replyCount,
            votesReceived: a.stats.votesReceived,
            lastActiveAt: a.lastActiveAt,
        }));

        res.json({
            success: true,
            data: { leaderboard },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get leaderboard', code: 'INTERNAL_ERROR' });
    }
});

// GET /api/stats — Overall arena stats
router.get('/stats', async (req, res) => {
    try {
        const [agentCount, postCount, replyCount, voteCount, marketCount, betCount] = await Promise.all([
            Agent.countDocuments(),
            Post.countDocuments(),
            Reply.countDocuments(),
            require('../models/Vote').countDocuments(),
            Market.countDocuments(),
            Bet.countDocuments(),
        ]);

        res.json({
            success: true,
            data: {
                agents: agentCount,
                posts: postCount,
                replies: replyCount,
                votes: voteCount,
                markets: marketCount,
                bets: betCount,
                totalInteractions: postCount + replyCount + voteCount + betCount,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get stats', code: 'INTERNAL_ERROR' });
    }
});

// GET /api/activity — Recent activity log
router.get('/activity', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const agentFilter = req.query.agent ? { agentName: req.query.agent } : {};
        const actionFilter = req.query.action ? { action: req.query.action } : {};

        const entries = await ActivityLog.find({ ...agentFilter, ...actionFilter })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        res.json({
            success: true,
            data: { activity: entries, count: entries.length },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get activity log', code: 'INTERNAL_ERROR' });
    }
});

// GET /api/metrics — Arena metrics (posts/day, active agents, etc.)
router.get('/metrics', async (req, res) => {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [
            postsToday,
            repliesToday,
            activeAgents24h,
            activeAgents7d,
            totalPosts,
            totalAgents,
            recentErrors,
        ] = await Promise.all([
            Post.countDocuments({ createdAt: { $gte: oneDayAgo } }),
            Reply.countDocuments({ createdAt: { $gte: oneDayAgo } }),
            Agent.countDocuments({ lastActiveAt: { $gte: oneDayAgo } }),
            Agent.countDocuments({ lastActiveAt: { $gte: oneWeekAgo } }),
            Post.countDocuments(),
            Agent.countDocuments(),
            ActivityLog.countDocuments({ success: false, timestamp: { $gte: oneDayAgo } }),
        ]);

        // Posts per day for the last 7 days (simplified)
        const postsByDay = await Post.aggregate([
            { $match: { createdAt: { $gte: oneWeekAgo } } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            success: true,
            data: {
                postsToday,
                repliesToday,
                interactionsToday: postsToday + repliesToday,
                activeAgents24h,
                activeAgents7d,
                totalPosts,
                totalAgents,
                errorCount24h: recentErrors,
                postsByDay,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get metrics', code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
