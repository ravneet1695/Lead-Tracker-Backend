const express = require('express');
const router = express.Router();
const GoalEntry = require('../models/GoalEntry');
const Goal = require('../models/Goal');
const Gamification = require('../models/Gamification');
const { requireAuth } = require('../middleware/auth');

// @route   GET /api/goal-entries
// @desc    Get goal entries (filtered by role)
// @access  Private
router.get('/', requireAuth, async (req, res) => {
    try {
        const { goal, group, status } = req.query;
        let filter = {};

        // Role-based filtering
        if (req.user.role === 'sales') {
            filter.user = req.user.id;
        } else if (req.user.role === 'manager') {
            filter.group = { $in: req.user.groups };
        }
        // Admin sees all

        if (goal) filter.goal = goal;
        if (group) filter.group = group;
        if (status) filter.status = status;

        const entries = await GoalEntry.find(filter)
            .populate('goal', 'title')
            .populate('user', 'name email')
            .populate('group', 'name')
            .sort('-updatedAt');

        res.json({
            success: true,
            count: entries.length,
            entries
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/goal-entries/:id
// @desc    Get single goal entry
// @access  Private
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const entry = await GoalEntry.findById(req.params.id)
            .populate('goal')
            .populate('user', 'name email')
            .populate('group', 'name');

        if (!entry) {
            return res.status(404).json({
                success: false,
                message: 'Entry not found'
            });
        }

        res.json({
            success: true,
            entry
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/goal-entries/:id/history
// @desc    Get status history for entry
// @access  Private
router.get('/:id/history', requireAuth, async (req, res) => {
    try {
        const entry = await GoalEntry.findById(req.params.id)
            .select('statusHistory')
            .populate('statusHistory.changedBy', 'name email');

        if (!entry) {
            return res.status(404).json({
                success: false,
                message: 'Entry not found'
            });
        }

        res.json({
            success: true,
            history: entry.statusHistory
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/goal-entries
// @desc    Create new goal entry
// @access  Private
router.post('/', requireAuth, async (req, res) => {
    try {
        const { goal, group, data, status, contacts, remarks } = req.body;

        // Verify goal exists
        const goalDoc = await Goal.findById(goal);
        if (!goalDoc) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found'
            });
        }

        const entry = await GoalEntry.create({
            goal,
            user: req.user.id,
            group,
            data,
            status: status || 'Initiated',
            contacts,
            remarks
        });

        // Award points for entry creation
        const gamification = await Gamification.findOne({ user: req.user.id });
        if (gamification) {
            await gamification.addPoints(goalDoc.pointsConfig.entryCreation);
        }

        const populatedEntry = await GoalEntry.findById(entry._id)
            .populate('goal', 'title')
            .populate('user', 'name email')
            .populate('group', 'name');

        res.status(201).json({
            success: true,
            entry: populatedEntry
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/goal-entries/:id
// @desc    Update goal entry
// @access  Private
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const { data, status, contacts, remarks } = req.body;

        let entry = await GoalEntry.findById(req.params.id);

        if (!entry) {
            return res.status(404).json({
                success: false,
                message: 'Entry not found'
            });
        }

        // Check if user owns this entry or is manager/admin
        if (req.user.role === 'sales' && entry.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this entry'
            });
        }

        const oldStatus = entry.status;

        entry = await GoalEntry.findByIdAndUpdate(
            req.params.id,
            { data, status, contacts, remarks },
            { new: true, runValidators: true }
        ).populate('goal', 'title pointsConfig')
            .populate('user', 'name email')
            .populate('group', 'name');

        // Award points for status update
        if (status && status !== oldStatus) {
            const gamification = await Gamification.findOne({ user: entry.user._id });
            if (gamification) {
                await gamification.addPoints(entry.goal.pointsConfig.statusUpdate);
            }
        }

        res.json({
            success: true,
            entry
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   DELETE /api/goal-entries/:id
// @desc    Delete goal entry
// @access  Private
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const entry = await GoalEntry.findById(req.params.id);

        if (!entry) {
            return res.status(404).json({
                success: false,
                message: 'Entry not found'
            });
        }

        // Check if user owns this entry or is admin
        if (req.user.role === 'sales' && entry.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this entry'
            });
        }

        await entry.deleteOne();

        res.json({
            success: true,
            message: 'Entry deleted successfully'
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
