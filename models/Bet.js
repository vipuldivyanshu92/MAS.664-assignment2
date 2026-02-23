const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
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
    position: {
        type: String,
        enum: ['yes', 'no'],
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
        max: 100,
    },
    payout: {
        type: Number,
        default: 0,
    },
    settled: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// One bet per agent per market
betSchema.index({ marketId: 1, agentId: 1 }, { unique: true });

module.exports = mongoose.model('Bet', betSchema);
