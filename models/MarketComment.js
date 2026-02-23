const mongoose = require('mongoose');

const marketCommentSchema = new mongoose.Schema({
    marketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Market',
        required: true,
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
        maxlength: 1000,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('MarketComment', marketCommentSchema);
