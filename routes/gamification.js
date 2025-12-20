const express = require('express');
const router = express.Router();
const Gamification = require('../models/Gamification');
const { requireAuth } = require('../middleware/auth');

// @route   GET /api/gamification/leaderboard
// @desc    Get leaderboard (weekly/monthly)
// @access  Private
router.get('/leaderboard', requireAuth, async (req, res) => {
    try {
        const { period = 'all' } = req.query;

        let leaderboard = await Gamification.find()
            .populate('user', 'name email role')
            .sort('-points')
            .limit(50);

        // Calculate ranks
        leaderboard = leaderboard.map((entry, index) => ({
            rank: index + 1,
            userId: entry.user._id,
            userName: entry.user.name,
            userRole: entry.user.role,
            points: entry.points,
            badges: entry.badges
        }));

        res.json({
            success: true,
            period,
            leaderboard
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/gamification/my-stats
// @desc    Get current user's gamification stats
// @access  Private
router.get('/my-stats', requireAuth, async (req, res) => {
    try {
        let stats = await Gamification.findOne({ user: req.user.id });

        if (!stats) {
            // Create if doesn't exist
            stats = await Gamification.create({ user: req.user.id });
        }

        // Get user's rank
        const allStats = await Gamification.find().sort('-points');
        const rank = allStats.findIndex(s => s.user.toString() === req.user.id) + 1;

        res.json({
            success: true,
            stats: {
                points: stats.points,
                badges: stats.badges,
                rank,
                totalUsers: allStats.length
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/gamification/award-points
// @desc    Award points to user (internal use)
// @access  Private (Admin)
router.post('/award-points', requireAuth, async (req, res) => {
    try {
        const { userId, points } = req.body;

        let gamification = await Gamification.findOne({ user: userId });

        if (!gamification) {
            gamification = await Gamification.create({ user: userId });
        }

        await gamification.addPoints(points);

        res.json({
            success: true,
            gamification
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

module.exports = router;
