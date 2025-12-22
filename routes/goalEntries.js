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

        // Verify goal exists and populate groups
        const goalDoc = await Goal.findById(goal).populate('groups');
        if (!goalDoc) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found'
            });
        }

        // Verify user belongs to one of the goal's assigned groups
        const userGroups = req.user.groups || [];
        const goalGroupIds = goalDoc.groups.map(g => g._id.toString());
        const hasAccess = userGroups.some(userGroupId =>
            goalGroupIds.includes(userGroupId.toString())
        );

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'You are not assigned to any groups for this goal'
            });
        }

        // Validate group is one of the goal's groups
        if (!goalGroupIds.includes(group)) {
            return res.status(400).json({
                success: false,
                message: 'Selected group is not assigned to this goal'
            });
        }

        // Validate required form fields
        if (goalDoc.formSchema && goalDoc.formSchema.length > 0) {
            const missingFields = [];

            for (const field of goalDoc.formSchema) {
                if (field.mandatory && (!data || !data[field.fieldName])) {
                    missingFields.push(field.alias || field.fieldName);
                }
            }

            if (missingFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Missing required fields: ${missingFields.join(', ')}`
                });
            }
        }

        const entry = await GoalEntry.create({
            goal,
            user: req.user.id,
            group,
            data,
            status: status || goalDoc.statusOptions?.[0] || 'New',
            contacts,
            remarks
        });

        // Award points for entry creation
        const gamification = await Gamification.findOne({ user: req.user.id });
        if (gamification && goalDoc.pointsConfig) {
            await gamification.addPoints(goalDoc.pointsConfig.entryCreation || 10);
        }

        // Check if goal target is reached based on revenue or lead count
        let goalCompleted = false;
        const completionStatus = goalDoc.completionStatus || 'Approved';

        if (goalDoc.target && goalDoc.status !== 'completed') {
            // Auto-detect first numeric field from formSchema
            const numericField = goalDoc.formSchema?.find(f => f.fieldType === 'number');

            if (numericField) {
                // Revenue-based goal completion
                const completedEntries = await GoalEntry.find({
                    goal: goalDoc._id,
                    status: completionStatus
                });

                const achievedValue = completedEntries.reduce((sum, entry) => {
                    const value = entry.data?.[numericField.fieldName];
                    return sum + (parseFloat(value) || 0);
                }, 0);

                if (achievedValue >= goalDoc.target) {
                    await Goal.findByIdAndUpdate(goalDoc._id, {
                        status: 'completed',
                        completedAt: new Date()
                    });

                    // Award bonus points for goal completion (50 points)
                    if (gamification) {
                        await gamification.addPoints(50);
                    }

                    goalCompleted = true;
                }
            } else {
                // Count-based goal completion (fallback)
                const completedLeadCount = await GoalEntry.countDocuments({
                    goal: goalDoc._id,
                    status: completionStatus
                });

                if (completedLeadCount >= goalDoc.target) {
                    await Goal.findByIdAndUpdate(goalDoc._id, {
                        status: 'completed',
                        completedAt: new Date()
                    });

                    // Award bonus points for goal completion (50 points)
                    if (gamification) {
                        await gamification.addPoints(50);
                    }

                    goalCompleted = true;
                }
            }
        }

        const populatedEntry = await GoalEntry.findById(entry._id)
            .populate('goal', 'title')
            .populate('user', 'name email')
            .populate('group', 'name');

        res.status(201).json({
            success: true,
            message: goalCompleted ? 'Lead created successfully! 🎉 Goal target reached!' : 'Lead created successfully',
            entry: populatedEntry,
            goalCompleted,
            bonusPoints: goalCompleted ? 50 : 0
        });
    } catch (error) {
        console.error('Error creating goal entry:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating lead'
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
