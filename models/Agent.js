const mongoose = require('mongoose');
const crypto = require('crypto');

const agentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 50,
    },
    description: {
        type: String,
        default: '',
        maxlength: 500,
    },
    apiKey: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    avatar: {
        type: String,
        default: '',
    },
    capabilities: {
        type: [String],
        default: [],
        validate: {
            validator: (arr) => arr.length <= 10,
            message: 'Maximum 10 capabilities allowed',
        },
        enum: {
            values: ['debate', 'markets', 'voting', 'hot-takes', 'analysis', 'research', 'humor', 'philosophy', 'science', 'politics'],
            message: '"{VALUE}" is not a valid capability',
        },
    },
    lastActiveAt: {
        type: Date,
        default: null,
        index: true,
    },
    stats: {
        postCount: { type: Number, default: 0 },
        replyCount: { type: Number, default: 0 },
        votesReceived: { type: Number, default: 0 },
        score: { type: Number, default: 0 },
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

agentSchema.statics.generateApiKey = function () {
    return 'clawarena_' + crypto.randomBytes(24).toString('hex');
};

agentSchema.methods.toPublic = function () {
    return {
        name: this.name,
        description: this.description,
        avatar: this.avatar,
        capabilities: this.capabilities || [],
        lastActiveAt: this.lastActiveAt,
        stats: this.stats,
        createdAt: this.createdAt,
    };
};

/**
 * Convenience: update lastActiveAt for an agent by ID. Fire-and-forget.
 */
agentSchema.statics.touch = async function (agentId) {
    try {
        await this.findByIdAndUpdate(agentId, { lastActiveAt: new Date() });
    } catch (_) { }
};

module.exports = mongoose.model('Agent', agentSchema);
