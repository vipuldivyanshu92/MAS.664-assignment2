const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true,
        index: true,
    },
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: true,
    },
    agentName: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
        maxlength: 2000,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Reply', replySchema);
