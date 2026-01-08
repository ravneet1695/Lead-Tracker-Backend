const express = require('express');
const router = express.Router();
const GoalEntry = require('../models/GoalEntry');
const Goal = require('../models/Goal');
const LeadActivity = require('../models/LeadActivity');
const { requireAuth } = require('../middleware/auth');

// Helper to log lead activity
const logLeadActivity = async (leadId, userId, action, description, metadata = {}) => {
    try {
        await LeadActivity.create({
            lead: leadId,
            user: userId,
            action,
            description,
            metadata
        });
    } catch (error) {
        console.error('Error logging lead activity:', error);
    }
};

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
            filter.group = group;
        }

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
        const { goal, data, status, contacts, remarks } = req.body;

        // Verify goal exists and populate group
        const goalDoc = await Goal.findById(goal).populate('group');
        if (!goalDoc) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found'
            });
        }

        // Verify user belongs to the goal's assigned group
        const userGroups = req.user.groups || [];
        const goalGroupId = goalDoc.group._id.toString();
        const hasAccess = userGroups.some(userGroupId =>
            userGroupId.toString() === goalGroupId
        );

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'You are not assigned to any groups for this goal'
            });
        }

        // Use the goal's group
        const selectedGroup = goalDoc.group._id.toString();

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
            group: selectedGroup,
            data,
            status: status || goalDoc.statusOptions?.[0] || 'New',
            contacts,
            remarks: remarks ? [{
                text: remarks,
                user: req.user.id,
                createdAt: new Date()
            }] : []
        });

        // Log activity
        await logLeadActivity(entry._id, req.user.id, 'CREATED', 'Lead created');

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
            goalCompleted
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
        const oldData = JSON.stringify(entry.data);

        // Update basic fields
        if (status) entry.status = status;
        if (data) entry.data = data;
        if (contacts) entry.contacts = contacts;

        // Note: remarks are handled via a separate endpoint now for better tracking,
        // but if sent in PUT, we append them for backward compatibility or bulk updates.
        if (remarks && typeof remarks === 'string') {
            entry.remarks.push({
                text: remarks,
                user: req.user.id,
                createdAt: new Date()
            });
        }

        await entry.save();

        const updatedEntry = await GoalEntry.findById(req.params.id)
            .populate('goal', 'title')
            .populate('user', 'name email')
            .populate('group', 'name')
            .populate('remarks.user', 'name');

        // Log activities
        if (status && status !== oldStatus) {
            await logLeadActivity(entry._id, req.user.id, 'STATUS_CHANGE', `Status updated from ${oldStatus} to ${status}`, { oldStatus, newStatus: status });
        }

        if (data && JSON.stringify(data) !== oldData) {
            await logLeadActivity(entry._id, req.user.id, 'DATA_UPDATE', 'Lead details updated');
        }

        if (remarks) {
            await logLeadActivity(entry._id, req.user.id, 'REMARK_ADDED', 'New remark added');
        }


        res.json({
            success: true,
            entry: updatedEntry
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

// @route   POST /api/goal-entries/:id/remarks
// @desc    Add remark to lead
// @access  Private
router.post('/:id/remarks', requireAuth, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ success: false, message: 'Remark text is required' });
        }

        const entry = await GoalEntry.findById(req.params.id);
        if (!entry) {
            return res.status(404).json({ success: false, message: 'Lead not found' });
        }

        entry.remarks.push({
            text,
            user: req.user.id,
            createdAt: new Date()
        });

        await entry.save();

        await logLeadActivity(entry._id, req.user.id, 'REMARK_ADDED', `Remark added: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);

        const updatedEntry = await GoalEntry.findById(entry._id)
            .populate('remarks.user', 'name');

        res.json({
            success: true,
            remarks: updatedEntry.remarks
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// @route   GET /api/goal-entries/:id/activities
// @desc    Get activity logs for lead
// @access  Private
router.get('/:id/activities', requireAuth, async (req, res) => {
    try {
        const activities = await LeadActivity.find({ lead: req.params.id })
            .populate('user', 'name')
            .sort('-timestamp');

        res.json({
            success: true,
            activities
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
