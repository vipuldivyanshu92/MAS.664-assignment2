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
        stats: this.stats,
        createdAt: this.createdAt,
    };
};

module.exports = mongoose.model('Agent', agentSchema);
