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
        const { goal, group, status } = req.query; // 'group' query param can still filter by specific group
        let filter = {};

        // Role-based filtering
        const userRole = req.user.role.name;

        if (userRole === 'super_admin') {
            // Super Admin sees all
        } else if (userRole === 'org_admin') {
            // Org Admin sees leads for their organization's goals
            // Since we don't store org on entry directly, we might rely on the fact they can only see goals for their org.
            // However, to be safe, we should filter by goals that belong to their org.
            // But simpler first step: Org Admin usually sees all leads. 
            // Let's filter by the goals they have access to? 
            // Actually, if we just don't filter 'user', they see all leads for the keys they request (likely filtered by goal).
            // But to prevent cross-org data leak if they query global:
            if (req.user.organization) {
                // Find all goals for this org to filter entries
                const orgGoals = await Goal.find({ organization: req.user.organization }).select('_id');
                const orgGoalIds = orgGoals.map(g => g._id);
                filter.goal = { $in: orgGoalIds };
            }
        } else {
            // Regular User (e.g. sales, manager, etc.)
            // STRICT PRIVACY: User sees ONLY their own leads
            filter.user = req.user.id;
        }
        // Admin sees all

        // Apply user filters safely
        if (goal) {
            // If security filter exists (e.g. org_admin restricted to org goals)
            if (filter.goal && filter.goal.$in) {
                // Verify requested goal is allowed
                const allowedIds = filter.goal.$in.map(id => id.toString());
                if (allowedIds.includes(goal)) {
                    filter.goal = goal;
                } else {
                    // Requested goal is not allowed - return empty
                    return res.json({ success: true, count: 0, entries: [] });
                }
            } else {
                filter.goal = goal;
            }
        }

        if (group) {
            // Similar logic could apply if we restricted groups, but currently groups are filtered by goal context
            filter.groups = group;
        }

        if (status) filter.status = status;

        const entries = await GoalEntry.find(filter)
            .populate('goal', 'title')
            .populate('user', 'name email')
            .populate('groups', 'name')
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
        const { goal, groups, data, status, contacts, remarks } = req.body;

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

        // Validate selected groups
        const selectedGroups = Array.isArray(groups) ? groups : (groups ? [groups] : []);

        if (selectedGroups.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please select at least one group'
            });
        }

        // Validate selected groups are assigned to this goal
        const invalidGroups = selectedGroups.filter(g => !goalGroupIds.includes(g));
        if (invalidGroups.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'One or more selected groups are not assigned to this goal'
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

        // Handle auto number fields
        if (goalDoc.formSchema && goalDoc.formSchema.length > 0) {
            for (const field of goalDoc.formSchema) {
                if (field.fieldType === 'autoNumber') {
                    // Find the highest auto number for this field in this goal
                    const existingEntries = await GoalEntry.find({ goal: goalDoc._id })
                        .select(`data.${field.fieldName}`)
                        .sort({ [`data.${field.fieldName}`]: -1 })
                        .limit(1);

                    let nextNumber = 1;
                    if (existingEntries.length > 0 && existingEntries[0].data && existingEntries[0].data[field.fieldName]) {
                        const currentMax = parseInt(existingEntries[0].data[field.fieldName]);
                        nextNumber = isNaN(currentMax) ? 1 : currentMax + 1;
                    }

                    // Set the auto number in the data
                    if (!data) data = {};
                    data[field.fieldName] = nextNumber;
                }
            }
        }

        const entry = await GoalEntry.create({
            goal,
            user: req.user.id,
            groups: selectedGroups,
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
            .populate('groups', 'name');

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
