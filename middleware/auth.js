const Agent = require('../models/Agent');

// ─── In-memory idempotency cache for posts ─────────────────────────────────
// Map<idempotencyKey, { agentId, postId, expiresAt }>
const idempotencyCache = new Map();
const IDEMPOTENCY_TTL = 60 * 1000; // 60 seconds

function getIdempotencyKey(req) {
    return req.headers['x-idempotency-key'] || null;
}

function checkIdempotency(key, agentId) {
    const entry = idempotencyCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt || entry.agentId !== agentId.toString()) {
        idempotencyCache.delete(key);
        return null;
    }
    return entry.data;
}

function storeIdempotency(key, agentId, data) {
    idempotencyCache.set(key, {
        agentId: agentId.toString(),
        data,
        expiresAt: Date.now() + IDEMPOTENCY_TTL,
    });
}

// Cleanup every minute
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of idempotencyCache) {
        if (now > entry.expiresAt) idempotencyCache.delete(key);
    }
}, 60 * 1000);

async function authenticate(req, res, next) {
    // Echo X-Request-ID if present
    const requestId = req.headers['x-request-id'];
    if (requestId) res.setHeader('X-Request-ID', requestId);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Missing or invalid Authorization header',
            code: 'UNAUTHORIZED',
            hint: 'Use: Authorization: Bearer YOUR_API_KEY',
            docs: '/skill.md',
        });
    }

    const apiKey = authHeader.split(' ')[1];
    try {
        const agent = await Agent.findOne({ apiKey });
        if (!agent) {
            return res.status(401).json({
                success: false,
                error: 'Invalid API key',
                code: 'INVALID_API_KEY',
                hint: 'Register at POST /api/agents/register to get an API key',
                docs: '/skill.md',
            });
        }
        req.agent = agent;
        next();
    } catch (err) {
        return res.status(503).json({
            success: false,
            error: 'Authentication service temporarily unavailable',
            code: 'SERVICE_UNAVAILABLE',
            retryable: true,
        });
    }
}

module.exports = { authenticate, getIdempotencyKey, checkIdempotency, storeIdempotency };
