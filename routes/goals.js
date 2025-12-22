const express = require('express');
const router = express.Router();
const Goal = require('../models/Goal');
const Group = require('../models/Group');
const { requirePermissions, requireAuth } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');

// @route   GET /api/goals
// @desc    Get all goals
// @access  Private (requires goals.read permission)
router.get('/', requirePermissions('goals.read'), async (req, res) => {
    try {
        // Build query filter
        const filter = {};

        // If user is org_admin, only show goals from their organization
        if (req.user.role.name === 'org_admin' && req.user.organization) {
            filter.organization = req.user.organization;
        }
        // If user is super_admin, they can see all goals (no filter)

        // Apply status filter if provided
        if (req.query.status) {
            filter.status = req.query.status;
        }

        const goals = await Goal.find(filter)
            .populate('organization', 'name code')
            .populate('groups', 'name code')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        // Calculate progress for each goal
        const GoalEntry = require('../models/GoalEntry');
        const goalsWithProgress = await Promise.all(goals.map(async (goal) => {
            // Get entries with completion status
            const completionStatus = goal.completionStatus || 'Approved';
            const allEntries = await GoalEntry.find({ goal: goal._id });
            const completedEntries = await GoalEntry.find({
                goal: goal._id,
                status: completionStatus
            });

            let achievedValue = 0;
            let progress;

            // Auto-detect first numeric field from formSchema
            const numericField = goal.formSchema?.find(f => f.fieldType === 'number');

            // If numeric field exists and target is set, sum the values from that field
            if (numericField && goal.target) {
                achievedValue = completedEntries.reduce((sum, entry) => {
                    const value = entry.data?.[numericField.fieldName];
                    return sum + (parseFloat(value) || 0);
                }, 0);

                progress = {
                    achieved: achievedValue,
                    target: goal.target,
                    percentage: Math.min((achievedValue / goal.target) * 100, 100),
                    remaining: Math.max(0, goal.target - achievedValue),
                    totalLeads: allEntries.length,
                    completedLeads: completedEntries.length,
                    unit: 'value' // Indicates this is value-based tracking
                };
            } else {
                // Fallback to lead count if no numeric field
                const leadCount = completedEntries.length;
                progress = {
                    achieved: leadCount,
                    target: goal.target || 0,
                    percentage: goal.target ? Math.min((leadCount / goal.target) * 100, 100) : 0,
                    remaining: goal.target ? Math.max(0, goal.target - leadCount) : 0,
                    totalLeads: allEntries.length,
                    completedLeads: leadCount,
                    unit: 'count' // Indicates this is count-based tracking
                };
            }

            return {
                ...goal.toObject(),
                progress
            };
        }));

        res.json({
            success: true,
            count: goalsWithProgress.length,
            goals: goalsWithProgress
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/goals/:id
// @desc    Get single goal
// @access  Private
router.get('/:id', requirePermissions('goals.read'), async (req, res) => {
    try {
        const goal = await Goal.findById(req.params.id)
            .populate('organization', 'name code')
            .populate('groups', 'name code')
            .populate('createdBy', 'name email');

        if (!goal) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found'
            });
        }

        // Check if org_admin is accessing goal from their organization
        if (req.user.role.name === 'org_admin' && req.user.organization) {
            if (goal.organization._id.toString() !== req.user.organization.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Goal belongs to different organization'
                });
            }
        }

        // Calculate progress
        const GoalEntry = require('../models/GoalEntry');
        const completionStatus = goal.completionStatus || 'Approved';
        const allEntries = await GoalEntry.find({ goal: goal._id });
        const completedEntries = await GoalEntry.find({
            goal: goal._id,
            status: completionStatus
        });

        let achievedValue = 0;
        let progress;

        // Auto-detect first numeric field from formSchema
        const numericField = goal.formSchema?.find(f => f.fieldType === 'number');

        // If numeric field exists and target is set, sum the values from that field
        if (numericField && goal.target) {
            achievedValue = completedEntries.reduce((sum, entry) => {
                const value = entry.data?.[numericField.fieldName];
                return sum + (parseFloat(value) || 0);
            }, 0);

            progress = {
                achieved: achievedValue,
                target: goal.target,
                percentage: Math.min((achievedValue / goal.target) * 100, 100),
                remaining: Math.max(0, goal.target - achievedValue),
                totalLeads: allEntries.length,
                completedLeads: completedEntries.length,
                unit: 'value'
            };
        } else {
            // Fallback to lead count if no numeric field
            const leadCount = completedEntries.length;
            progress = {
                achieved: leadCount,
                target: goal.target || 0,
                percentage: goal.target ? Math.min((leadCount / goal.target) * 100, 100) : 0,
                remaining: goal.target ? Math.max(0, goal.target - leadCount) : 0,
                totalLeads: allEntries.length,
                completedLeads: leadCount,
                unit: 'count'
            };
        }

        res.json({
            success: true,
            goal,
            progress
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/goals/:id/form
// @desc    Get goal form schema
// @access  Private
router.get('/:id/form', requirePermissions('goals.read'), async (req, res) => {
    try {
        const goal = await Goal.findById(req.params.id).select('formSchema statusOptions');

        if (!goal) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found'
            });
        }

        res.json({
            success: true,
            formSchema: goal.formSchema,
            statusOptions: goal.statusOptions
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/goals
// @desc    Create new goal with dynamic form
// @access  Private (Admin)
router.post('/', requirePermissions('goals.create'), createAuditLog('CREATE', 'Goal'), async (req, res) => {
    try {
        const { title, description, target, timeline, groups, formSchema, statusOptions, pointsConfig, completionStatus } = req.body;

        // Validate required fields
        if (!title || !groups || groups.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Title and at least one group are required'
            });
        }

        // Determine organization
        let organizationId;
        if (req.user.role.name === 'org_admin') {
            organizationId = req.user.organization;
        } else if (req.user.role.name === 'super_admin' && req.body.organization) {
            organizationId = req.body.organization;
        } else {
            return res.status(400).json({
                success: false,
                message: 'Organization is required'
            });
        }

        // Validate that all groups belong to the same organization
        const groupDocs = await Group.find({ _id: { $in: groups } });
        if (groupDocs.length !== groups.length) {
            return res.status(400).json({
                success: false,
                message: 'One or more groups not found'
            });
        }

        const invalidGroups = groupDocs.filter(g => g.organization.toString() !== organizationId.toString());
        if (invalidGroups.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'All groups must belong to the same organization'
            });
        }

        // Validate form schema
        if (formSchema && formSchema.length > 0) {
            for (const field of formSchema) {
                if (!field.fieldName || !field.fieldType || !field.alias) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each form field must have fieldName, fieldType, and alias'
                    });
                }
            }
        }

        const goal = await Goal.create({
            title,
            description,
            target,
            timeline,
            organization: organizationId,
            groups,
            formSchema,
            statusOptions,
            pointsConfig,
            completionStatus,
            createdBy: req.user.id
        });

        const populatedGoal = await Goal.findById(goal._id)
            .populate('organization', 'name code')
            .populate('groups', 'name code')
            .populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            goal: populatedGoal
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
});

// @route   PUT /api/goals/:id
// @desc    Update goal
// @access  Private (Admin)
router.put('/:id', requirePermissions('goals.update'), createAuditLog('UPDATE', 'Goal'), async (req, res) => {
    try {
        const { title, description, target, timeline, groups, formSchema, statusOptions, pointsConfig, status, completionStatus } = req.body;

        let goal = await Goal.findById(req.params.id);

        if (!goal) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found'
            });
        }

        // Check if org_admin is updating goal from their organization
        if (req.user.role.name === 'org_admin' && req.user.organization) {
            if (goal.organization.toString() !== req.user.organization.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Goal belongs to different organization'
                });
            }
        }

        // Validate groups if provided
        if (groups && groups.length > 0) {
            const groupDocs = await Group.find({ _id: { $in: groups } });
            if (groupDocs.length !== groups.length) {
                return res.status(400).json({
                    success: false,
                    message: 'One or more groups not found'
                });
            }

            const invalidGroups = groupDocs.filter(g => g.organization.toString() !== goal.organization.toString());
            if (invalidGroups.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'All groups must belong to the same organization'
                });
            }
        }

        // Validate form schema if provided
        if (formSchema && formSchema.length > 0) {
            for (const field of formSchema) {
                if (!field.fieldName || !field.fieldType || !field.alias) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each form field must have fieldName, fieldType, and alias'
                    });
                }
            }
        }

        goal = await Goal.findByIdAndUpdate(
            req.params.id,
            { title, description, target, timeline, groups, formSchema, statusOptions, pointsConfig, status, completionStatus },
            { new: true, runValidators: true }
        ).populate('organization', 'name code')
            .populate('groups', 'name code')
            .populate('createdBy', 'name email');

        res.json({
            success: true,
            goal
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
});

// @route   DELETE /api/goals/:id
// @desc    Soft delete goal (set status to inactive)
// @access  Private (Admin)
router.delete('/:id', requirePermissions('goals.delete'), createAuditLog('DELETE', 'Goal'), async (req, res) => {
    try {
        const goal = await Goal.findById(req.params.id);

        if (!goal) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found'
            });
        }

        // Check if org_admin is deleting goal from their organization
        if (req.user.role.name === 'org_admin' && req.user.organization) {
            if (goal.organization.toString() !== req.user.organization.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Goal belongs to different organization'
                });
            }
        }

        // Soft delete: Set status to inactive
        goal.status = 'inactive';
        await goal.save();

        res.json({
            success: true,
            message: 'Goal marked as inactive successfully'
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
