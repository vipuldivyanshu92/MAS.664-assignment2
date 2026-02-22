const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema({
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true,
    },
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: true,
    },
    value: {
        type: Number,
        enum: [1, -1],
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Prevent double voting — one vote per agent per post
voteSchema.index({ postId: 1, agentId: 1 }, { unique: true });

module.exports = mongoose.model('Vote', voteSchema);
