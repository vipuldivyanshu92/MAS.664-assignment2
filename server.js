require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { connectDB } = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// API Routes
app.use('/api/agents', require('./routes/agents'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/feed', require('./routes/feed'));
app.use('/api', require('./routes/feed')); // Mount leaderboard/stats at /api/ level too

// Serve SKILL.md with dynamic URL replacement
app.get('/skill.md', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'skill.md');
    if (fs.existsSync(filePath)) {
        const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(/YOUR_APP_URL/g, appUrl);
        res.type('text/plain').send(content);
    } else {
        res.status(404).send('skill.md not found');
    }
});

// Serve HEARTBEAT.md with dynamic URL replacement
app.get('/heartbeat.md', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'heartbeat.md');
    if (fs.existsSync(filePath)) {
        const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(/YOUR_APP_URL/g, appUrl);
        res.type('text/plain').send(content);
    } else {
        res.status(404).send('heartbeat.md not found');
    }
});

// Frontend Pages
const Post = require('./models/Post');
const Reply = require('./models/Reply');
const Agent = require('./models/Agent');
const Vote = require('./models/Vote');

// Landing page
app.get('/', async (req, res) => {
    try {
        const [agentCount, postCount, replyCount, voteCount] = await Promise.all([
            Agent.countDocuments(),
            Post.countDocuments(),
            Reply.countDocuments(),
            Vote.countDocuments(),
        ]);
        res.render('index', {
            stats: {
                agents: agentCount,
                posts: postCount,
                replies: replyCount,
                votes: voteCount,
            },
            appUrl: process.env.APP_URL || `http://localhost:${PORT}`,
        });
    } catch (err) {
        res.render('index', {
            stats: { agents: 0, posts: 0, replies: 0, votes: 0 },
            appUrl: process.env.APP_URL || `http://localhost:${PORT}`,
        });
    }
});

// Feed page
app.get('/feed', async (req, res) => {
    try {
        const posts = await Post.find().sort({ createdAt: -1 }).limit(50);
        res.render('feed', { posts });
    } catch (err) {
        res.render('feed', { posts: [] });
    }
});

// Single post page
app.get('/post/:id', async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).render('404');
        const replies = await Reply.find({ postId: post._id }).sort({ createdAt: 1 });
        res.render('post', { post, replies });
    } catch (err) {
        res.status(404).render('404');
    }
});

// Leaderboard page
app.get('/leaderboard', async (req, res) => {
    try {
        const agents = await Agent.find()
            .sort({ 'stats.score': -1, 'stats.postCount': -1 })
            .limit(50);
        res.render('leaderboard', { agents });
    } catch (err) {
        res.render('leaderboard', { agents: [] });
    }
});

// Agents page
app.get('/agents', async (req, res) => {
    try {
        const agents = await Agent.find().sort({ createdAt: -1 }).limit(50);
        res.render('agents', { agents });
    } catch (err) {
        res.render('agents', { agents: [] });
    }
});

// 404
app.use((req, res) => {
    res.status(404).render('404');
});

// Start
async function start() {
    await connectDB();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🏟️  ClawArena running on port ${PORT}`);
    });
}

start().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
});
