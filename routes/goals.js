const express = require('express');
const router = express.Router();
const Goal = require('../models/Goal');
const { requirePermissions, requireAuth } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');

// @route   GET /api/goals
// @desc    Get all goals
// @access  Private (requires goals.read permission)
router.get('/', requirePermissions('goals.read'), async (req, res) => {
    try {
        // Users with goals.read permission can see all goals
        // Permission-based access control is handled by middleware
        const goals = await Goal.find({})
            .populate('groups', 'name')
            .populate('createdBy', 'name email');

        res.json({
            success: true,
            count: goals.length,
            goals
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
            .populate('groups', 'name')
            .populate('createdBy', 'name email');

        if (!goal) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found'
            });
        }

        res.json({
            success: true,
            goal
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
        const { title, description, target, timeline, groups, formSchema, statusOptions, pointsConfig } = req.body;

        const goal = await Goal.create({
            title,
            description,
            target,
            timeline,
            groups,
            formSchema,
            statusOptions,
            pointsConfig,
            createdBy: req.user.id
        });

        const populatedGoal = await Goal.findById(goal._id)
            .populate('groups', 'name')
            .populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            goal: populatedGoal
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/goals/:id
// @desc    Update goal
// @access  Private (Admin)
router.put('/:id', requirePermissions('goals.update'), createAuditLog('UPDATE', 'Goal'), async (req, res) => {
    try {
        const { title, description, target, timeline, groups, formSchema, statusOptions, pointsConfig, status } = req.body;

        let goal = await Goal.findById(req.params.id);

        if (!goal) {
            return res.status(404).json({
                success: false,
                message: 'Goal not found'
            });
        }

        goal = await Goal.findByIdAndUpdate(
            req.params.id,
            { title, description, target, timeline, groups, formSchema, statusOptions, pointsConfig, status },
            { new: true, runValidators: true }
        ).populate('groups', 'name')
            .populate('createdBy', 'name email');

        res.json({
            success: true,
            goal
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
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
