const express = require('express');
const router = express.Router();
const Market = require('../models/Market');
const Bet = require('../models/Bet');
const MarketComment = require('../models/MarketComment');
const Agent = require('../models/Agent');
const { authenticate } = require('../middleware/auth');

// Admin auth middleware
function adminAuth(req, res, next) {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
        return res.status(403).json({
            success: false,
            error: 'Admin access required',
            hint: 'Provide x-admin-key header with the correct admin key',
        });
    }
    next();
}

// POST /api/markets — Create a market (auth required)
router.post('/', authenticate, async (req, res) => {
    try {
        const { question, description, category, closesAt } = req.body;

        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'question is required',
                hint: 'Provide a yes/no question (max 200 chars)',
            });
        }

        const market = await Market.create({
            agentId: req.agent._id,
            agentName: req.agent.name,
            question: question.trim(),
            description: (description || '').trim(),
            category: (category || 'General').trim(),
            closesAt: closesAt ? new Date(closesAt) : undefined,
        });

        res.status(201).json({
            success: true,
            data: { market },
        });
    } catch (err) {
        console.error('Create market error:', err);
        res.status(500).json({ success: false, error: 'Failed to create market' });
    }
});

// GET /api/markets — List markets
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const filter = {};

        if (req.query.status) {
            filter.status = req.query.status;
        }
        if (req.query.category) {
            filter.category = { $regex: req.query.category, $options: 'i' };
        }

        let sortBy = { createdAt: -1 };
        if (req.query.sort === 'popular') {
            sortBy = { totalYesBets: -1, totalNoBets: -1, createdAt: -1 };
        }

        const markets = await Market.find(filter).sort(sortBy).limit(limit);

        res.json({
            success: true,
            data: { markets, count: markets.length },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to list markets' });
    }
});

// GET /api/markets/:id — Get market detail with bets and comments
router.get('/:id', async (req, res) => {
    try {
        const market = await Market.findById(req.params.id);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found',
            });
        }

        const [bets, comments] = await Promise.all([
            Bet.find({ marketId: market._id }).sort({ createdAt: -1 }),
            MarketComment.find({ marketId: market._id }).sort({ createdAt: 1 }),
        ]);

        res.json({
            success: true,
            data: { market, bets, comments },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to get market' });
    }
});

// POST /api/markets/:id/bet — Place a bet (auth required)
router.post('/:id/bet', authenticate, async (req, res) => {
    try {
        const { position, amount } = req.body;

        if (!position || !['yes', 'no'].includes(position)) {
            return res.status(400).json({
                success: false,
                error: 'position must be "yes" or "no"',
            });
        }

        const betAmount = parseInt(amount);
        if (!betAmount || betAmount < 1 || betAmount > 100) {
            return res.status(400).json({
                success: false,
                error: 'amount must be between 1 and 100',
            });
        }

        const market = await Market.findById(req.params.id);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found',
            });
        }

        if (market.status !== 'open') {
            return res.status(400).json({
                success: false,
                error: 'Market is no longer open for betting',
            });
        }

        // Check if market has passed its close date
        if (market.closesAt && new Date() > market.closesAt) {
            return res.status(400).json({
                success: false,
                error: 'Market betting period has closed',
            });
        }

        // Prevent betting on own market
        if (market.agentId.toString() === req.agent._id.toString()) {
            return res.status(400).json({
                success: false,
                error: 'You cannot bet on your own market',
            });
        }

        // Check for existing bet
        const existingBet = await Bet.findOne({
            marketId: market._id,
            agentId: req.agent._id,
        });

        if (existingBet) {
            return res.status(409).json({
                success: false,
                error: 'You already placed a bet on this market',
                hint: 'One bet per agent per market',
            });
        }

        const bet = await Bet.create({
            marketId: market._id,
            agentId: req.agent._id,
            agentName: req.agent.name,
            position,
            amount: betAmount,
        });

        // Update market tallies
        const update = {};
        if (position === 'yes') {
            update.$inc = { totalYesBets: 1, totalYesAmount: betAmount };
        } else {
            update.$inc = { totalNoBets: 1, totalNoAmount: betAmount };
        }
        await Market.findByIdAndUpdate(market._id, update);

        res.status(201).json({
            success: true,
            data: {
                bet,
                message: `Bet ${betAmount} tokens on ${position.toUpperCase()}`,
            },
        });
    } catch (err) {
        console.error('Bet error:', err);
        res.status(500).json({ success: false, error: 'Failed to place bet' });
    }
});

// POST /api/markets/:id/comment — Comment on a market (auth required)
router.post('/:id/comment', authenticate, async (req, res) => {
    try {
        const { content } = req.body;

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'content is required',
            });
        }

        const market = await Market.findById(req.params.id);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found',
            });
        }

        const comment = await MarketComment.create({
            marketId: market._id,
            agentId: req.agent._id,
            agentName: req.agent.name,
            content: content.trim(),
        });

        await Market.findByIdAndUpdate(market._id, {
            $inc: { commentCount: 1 },
        });

        res.status(201).json({
            success: true,
            data: { comment },
        });
    } catch (err) {
        console.error('Comment error:', err);
        res.status(500).json({ success: false, error: 'Failed to comment' });
    }
});

// POST /api/markets/:id/resolve — Admin resolves market
router.post('/:id/resolve', adminAuth, async (req, res) => {
    try {
        const { outcome, note } = req.body;

        if (!outcome || !['yes', 'no', 'cancel'].includes(outcome)) {
            return res.status(400).json({
                success: false,
                error: 'outcome must be "yes", "no", or "cancel"',
            });
        }

        const market = await Market.findById(req.params.id);
        if (!market) {
            return res.status(404).json({
                success: false,
                error: 'Market not found',
            });
        }

        if (market.status !== 'open') {
            return res.status(400).json({
                success: false,
                error: 'Market is already resolved or cancelled',
            });
        }

        // Handle cancellation — refund all bets
        if (outcome === 'cancel') {
            await Market.findByIdAndUpdate(market._id, {
                status: 'cancelled',
                resolutionNote: note || 'Market cancelled by admin',
                resolvedAt: new Date(),
            });

            // Mark all bets as settled with payout = amount (refund)
            const bets = await Bet.find({ marketId: market._id });
            for (const bet of bets) {
                bet.payout = bet.amount;
                bet.settled = true;
                await bet.save();
            }

            return res.json({
                success: true,
                data: { message: 'Market cancelled, all bets refunded', market: await Market.findById(market._id) },
            });
        }

        // Resolve YES or NO
        const winningPosition = outcome; // "yes" or "no"
        const newStatus = outcome === 'yes' ? 'resolved_yes' : 'resolved_no';

        await Market.findByIdAndUpdate(market._id, {
            status: newStatus,
            resolutionNote: note || `Resolved as ${outcome.toUpperCase()}`,
            resolvedAt: new Date(),
        });

        // Settle bets
        const allBets = await Bet.find({ marketId: market._id });
        const winners = allBets.filter((b) => b.position === winningPosition);
        const losers = allBets.filter((b) => b.position !== winningPosition);

        const totalWinPool = winners.reduce((sum, b) => sum + b.amount, 0);
        const totalLosePool = losers.reduce((sum, b) => sum + b.amount, 0);

        // Settle losers — they lose their wager
        for (const bet of losers) {
            bet.payout = 0;
            bet.settled = true;
            await bet.save();

            // Deduct from agent score
            await Agent.findByIdAndUpdate(bet.agentId, {
                $inc: { 'stats.score': -bet.amount },
            });
        }

        // Settle winners — they get their wager back + proportional share of losing pool
        for (const bet of winners) {
            let profit = 0;
            if (totalWinPool > 0) {
                profit = Math.round((bet.amount / totalWinPool) * totalLosePool);
            }
            bet.payout = bet.amount + profit;
            bet.settled = true;
            await bet.save();

            // Add profit to agent score
            await Agent.findByIdAndUpdate(bet.agentId, {
                $inc: { 'stats.score': profit },
            });
        }

        const resolvedMarket = await Market.findById(market._id);

        res.json({
            success: true,
            data: {
                message: `Market resolved as ${outcome.toUpperCase()}`,
                market: resolvedMarket,
                settlement: {
                    winners: winners.length,
                    losers: losers.length,
                    totalWinPool,
                    totalLosePool,
                },
            },
        });
    } catch (err) {
        console.error('Resolve error:', err);
        res.status(500).json({ success: false, error: 'Failed to resolve market' });
    }
});

module.exports = router;
