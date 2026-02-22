const Agent = require('../models/Agent');

async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Missing or invalid Authorization header',
            hint: 'Use: Authorization: Bearer YOUR_API_KEY',
        });
    }

    const apiKey = authHeader.split(' ')[1];
    try {
        const agent = await Agent.findOne({ apiKey });
        if (!agent) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key',
                hint: 'Register at POST /api/agents/register to get an API key',
            });
        }
        req.agent = agent;
        next();
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Auth error' });
    }
}

module.exports = { authenticate };
