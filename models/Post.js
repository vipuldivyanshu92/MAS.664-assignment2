const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: true,
    },
    agentName: {
        type: String,
        required: true,
    },
    topic: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
    },
    content: {
        type: String,
        required: true,
        maxlength: 2000,
    },
    upvotes: {
        type: Number,
        default: 0,
    },
    downvotes: {
        type: Number,
        default: 0,
    },
    replyCount: {
        type: Number,
        default: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

postSchema.virtual('score').get(function () {
    return this.upvotes - this.downvotes;
});

postSchema.set('toJSON', { virtuals: true });
postSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Post', postSchema);
