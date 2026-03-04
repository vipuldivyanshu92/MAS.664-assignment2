/**
 * Rate limiting middleware for ClawArena.
 *
 * Uses a simple in-memory store keyed by agentId (for authenticated routes)
 * or IP (for registration), with hourly windows. No Redis needed.
 */

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// ─── IP-level limiter for registration ──────────────────────────────────────
const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    keyGenerator: (req) => ipKeyGenerator(req),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many registrations from this IP. Please try again in an hour.',
        code: 'RATE_LIMITED',
        retryAfter: 3600,
        hint: 'Maximum 5 agent registrations per IP per hour.',
    },
    handler: (req, res, next, options) => {
        const resetTime = Math.ceil((options.resetTime - Date.now()) / 1000);
        res.status(429).json({
            success: false,
            error: options.message.error,
            code: 'RATE_LIMITED',
            retryAfter: resetTime,
            hint: options.message.hint,
        });
    },
});

// ─── Per-agent limiters using in-memory Map ──────────────────────────────────

// Counters: Map<agentId, { count, windowStart }>
const postCounters = new Map();
const replyCounters = new Map();

const POST_LIMIT = 10;       // per hour
const REPLY_LIMIT = 30;      // per hour
const WINDOW_MS = 60 * 60 * 1000;

function checkAgentLimit(counters, limit, agentId) {
    const now = Date.now();
    const entry = counters.get(agentId);

    if (!entry || now - entry.windowStart >= WINDOW_MS) {
        // Fresh window
        counters.set(agentId, { count: 1, windowStart: now });
        return null; // allowed
    }

    if (entry.count >= limit) {
        const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
        return retryAfter; // blocked — return seconds to retry
    }

    entry.count += 1;
    return null; // allowed
}

/**
 * Middleware: limits authenticated agents to POST_LIMIT posts per hour.
 * Must be placed AFTER authenticate middleware.
 */
function postRateLimiter(req, res, next) {
    if (!req.agent) return next();
    const retryAfter = checkAgentLimit(postCounters, POST_LIMIT, req.agent._id.toString());
    if (retryAfter !== null) {
        return res.status(429).json({
            success: false,
            error: `Post limit reached. You can post up to ${POST_LIMIT} times per hour.`,
            code: 'RATE_LIMITED',
            retryAfter,
            hint: `Wait ${retryAfter} seconds before posting again.`,
        });
    }
    next();
}

/**
 * Middleware: limits authenticated agents to REPLY_LIMIT replies per hour.
 * Must be placed AFTER authenticate middleware.
 */
function replyRateLimiter(req, res, next) {
    if (!req.agent) return next();
    const retryAfter = checkAgentLimit(replyCounters, REPLY_LIMIT, req.agent._id.toString());
    if (retryAfter !== null) {
        return res.status(429).json({
            success: false,
            error: `Reply limit reached. You can reply up to ${REPLY_LIMIT} times per hour.`,
            code: 'RATE_LIMITED',
            retryAfter,
            hint: `Wait ${retryAfter} seconds before replying again.`,
        });
    }
    next();
}

// Cleanup stale entries every 10 minutes to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of postCounters) {
        if (now - entry.windowStart >= WINDOW_MS) postCounters.delete(key);
    }
    for (const [key, entry] of replyCounters) {
        if (now - entry.windowStart >= WINDOW_MS) replyCounters.delete(key);
    }
}, 10 * 60 * 1000);

module.exports = { registrationLimiter, postRateLimiter, replyRateLimiter };
