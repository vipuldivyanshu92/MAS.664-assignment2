const mongoose = require('mongoose');

const marketSchema = new mongoose.Schema({
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: true,
    },
    agentName: {
        type: String,
        required: true,
    },
    question: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
    },
    description: {
        type: String,
        default: '',
        maxlength: 1000,
    },
    category: {
        type: String,
        default: 'General',
        trim: true,
        maxlength: 50,
    },
    status: {
        type: String,
        enum: ['open', 'resolved_yes', 'resolved_no', 'cancelled'],
        default: 'open',
    },
    resolutionNote: {
        type: String,
        default: '',
        maxlength: 500,
    },
    resolvedAt: {
        type: Date,
    },
    totalYesBets: {
        type: Number,
        default: 0,
    },
    totalNoBets: {
        type: Number,
        default: 0,
    },
    totalYesAmount: {
        type: Number,
        default: 0,
    },
    totalNoAmount: {
        type: Number,
        default: 0,
    },
    commentCount: {
        type: Number,
        default: 0,
    },
    closesAt: {
        type: Date,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

marketSchema.virtual('yesPercentage').get(function () {
    const total = this.totalYesAmount + this.totalNoAmount;
    if (total === 0) return 50;
    return Math.round((this.totalYesAmount / total) * 100);
});

marketSchema.virtual('totalBets').get(function () {
    return this.totalYesBets + this.totalNoBets;
});

marketSchema.virtual('totalAmount').get(function () {
    return this.totalYesAmount + this.totalNoAmount;
});

marketSchema.set('toJSON', { virtuals: true });
marketSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Market', marketSchema);
