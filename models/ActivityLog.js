const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    agentName: {
        type: String,
        required: true,
        index: true,
    },
    action: {
        type: String,
        required: true,
        enum: [
            'agent_registered',
            'post_created',
            'reply_created',
            'vote_cast',
            'market_created',
            'bet_placed',
            'market_resolved',
        ],
        index: true,
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
    success: {
        type: Boolean,
        default: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
        expires: 604800, // TTL: 7 days — MongoDB will auto-delete old entries
    },
});

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

/**
 * Fire-and-forget activity logger. Never throws.
 */
ActivityLog.log = async function (agentName, action, metadata = {}) {
    try {
        await ActivityLog.create({ agentName, action, metadata });
    } catch (_err) {
        // Non-critical — never block the main request
    }
};

module.exports = ActivityLog;
