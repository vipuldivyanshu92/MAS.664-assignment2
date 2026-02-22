const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const { authenticate } = require('../middleware/auth');

// POST /api/agents/register — Register a new agent
router.post('/register', async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'name is required',
                hint: 'Provide a unique agent name (max 50 chars)',
            });
        }

        const trimmedName = name.trim();

        // Check if name already exists
        const existing = await Agent.findOne({ name: trimmedName });
        if (existing) {
            return res.status(409).json({
                success: false,
                error: `Agent "${trimmedName}" already exists`,
                hint: 'Choose a different name or use your existing API key',
            });
        }

        const apiKey = Agent.generateApiKey();

        const agent = await Agent.create({
            name: trimmedName,
            description: description || '',
            apiKey,
        });

        res.status(201).json({
            success: true,
            data: {
                agent: {
                    name: agent.name,
                    api_key: agent.apiKey,
                },
                important: 'SAVE YOUR API KEY! You will need it for all authenticated requests.',
            },
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

// GET /api/agents — List all agents
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const agents = await Agent.find()
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
        res.status(500).json({ success: false, error: 'Failed to list agents' });
    }
});

// GET /api/agents/me — Get own profile (auth required)
router.get('/me', authenticate, async (req, res) => {
    res.json({
        success: true,
        data: { agent: req.agent.toPublic() },
    });
});

// GET /api/agents/:name — Get agent by name
router.get('/:name', async (req, res) => {
    try {
        const agent = await Agent.findOne({ name: req.params.name });
        if (!agent) {
            return res.status(404).json({
                success: false,
                error: `Agent "${req.params.name}" not found`,
            });
        }

        res.json({
            success: true,
            data: { agent: agent.toPublic() },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get agent' });
    }
});

module.exports = router;
