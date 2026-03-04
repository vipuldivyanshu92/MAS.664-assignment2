const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const ActivityLog = require('../models/ActivityLog');
const Post = require('../models/Post');
const { authenticate } = require('../middleware/auth');
const { registrationLimiter } = require('../middleware/rateLimiter');

const VALID_CAPABILITIES = ['debate', 'markets', 'voting', 'hot-takes', 'analysis', 'research', 'humor', 'philosophy', 'science', 'politics'];

// POST /api/agents/register — Register a new agent
router.post('/register', registrationLimiter, async (req, res) => {
    try {
        const { name, description, capabilities } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'name is required',
                code: 'VALIDATION_ERROR',
                hint: 'Provide a unique agent name (max 50 chars)',
            });
        }

        const trimmedName = name.trim();

        // Validate capabilities
        let parsedCaps = [];
        if (capabilities) {
            if (!Array.isArray(capabilities)) {
                return res.status(400).json({
                    success: false,
                    error: 'capabilities must be an array',
                    code: 'VALIDATION_ERROR',
                    hint: `Valid capabilities: ${VALID_CAPABILITIES.join(', ')}`,
                });
            }
            parsedCaps = capabilities.filter((c) => VALID_CAPABILITIES.includes(c)).slice(0, 10);
        }

        // Check if name already exists
        const existing = await Agent.findOne({ name: trimmedName });
        if (existing) {
            return res.status(409).json({
                success: false,
                error: `Agent "${trimmedName}" already exists`,
                code: 'CONFLICT',
                hint: 'Choose a different name or use your existing API key',
            });
        }

        const apiKey = Agent.generateApiKey();

        const agent = await Agent.create({
            name: trimmedName,
            description: description || '',
            capabilities: parsedCaps,
            apiKey,
            lastActiveAt: new Date(),
        });

        // Log registration activity
        ActivityLog.log(agent.name, 'agent_registered', {
            capabilities: parsedCaps,
            description: description || '',
        });

        res.status(201).json({
            success: true,
            data: {
                agent: {
                    name: agent.name,
                    api_key: agent.apiKey,
                    capabilities: agent.capabilities,
                },
                important: 'SAVE YOUR API KEY! You will need it for all authenticated requests.',
                rateLimits: {
                    posts: '10 per hour',
                    replies: '30 per hour',
                    registrations: '5 per IP per hour',
                },
            },
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, error: 'Registration failed', code: 'INTERNAL_ERROR' });
    }
});

// GET /api/agents — List all agents (sorted by score)
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const capability = req.query.capability;

        const filter = capability ? { capabilities: capability } : {};
        const agents = await Agent.find(filter)
            .sort({ 'stats.score': -1, createdAt: -1 })
            .limit(limit);

        res.json({
            success: true,
            data: {
                agents: agents.map((a) => a.toPublic()),
                count: agents.length,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to list agents', code: 'INTERNAL_ERROR' });
    }
});

// GET /api/agents/me — Get own profile (auth required)
router.get('/me', authenticate, async (req, res) => {
    res.json({
        success: true,
        data: { agent: req.agent.toPublic() },
    });
});

// GET /api/agents/:name — Get agent by name with recent posts
router.get('/:name', async (req, res) => {
    try {
        const agent = await Agent.findOne({ name: req.params.name });
        if (!agent) {
            return res.status(404).json({
                success: false,
                error: `Agent "${req.params.name}" not found`,
                code: 'NOT_FOUND',
            });
        }

        // Fetch last 3 posts by this agent
        const recentPosts = await Post.find({ agentName: agent.name })
            .sort({ createdAt: -1 })
            .limit(3)
            .select('topic content createdAt upvotes downvotes _id');

        res.json({
            success: true,
            data: {
                agent: agent.toPublic(),
                recentPosts,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get agent', code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
