const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { requirePermissions, requireAuth } = require('../middleware/auth');
const { isSuperAdmin } = require('../helpers/commonHelpers');

// @route   GET /api/audit-logs
// @desc    Get all audit logs with filtering and pagination
// @access  Private (Super Admin only)
router.get('/', requirePermissions('audit-logs.read'), async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            action,
            resourceType,
            userId,
            organizationId,
            startDate,
            endDate,
            search
        } = req.query;

        // Build filter query
        const filter = {};

        if (action) filter.action = action;
        if (resourceType) filter.resourceType = resourceType;
        if (userId) filter.user = userId;
        if (organizationId) filter.organization = organizationId;

        // Date range filter
        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }

        // Search filter (search in description, userName, userEmail)
        if (search) {
            filter.$or = [
                { description: { $regex: search, $options: 'i' } },
                { userName: { $regex: search, $options: 'i' } },
                { userEmail: { $regex: search, $options: 'i' } },
                { resourceName: { $regex: search, $options: 'i' } }
            ];
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Fetch logs
        const logs = await AuditLog.find(filter)
            .populate('user', 'name email role')
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Get total count
        const total = await AuditLog.countDocuments(filter);

        res.json({
            success: true,
            logs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalLogs: total,
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching audit logs'
        });
    }
});

// @route   GET /api/audit-logs/:id
// @desc    Get single audit log
// @access  Private (Super Admin only)
router.get('/:id', requirePermissions('audit-logs.read'), async (req, res) => {
    try {
        const log = await AuditLog.findById(req.params.id)
            .populate('user', 'name email role');

        if (!log) {
            return res.status(404).json({
                success: false,
                message: 'Audit log not found'
            });
        }

        res.json({
            success: true,
            log
        });
    } catch (error) {
        console.error('Error fetching audit log:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching audit log'
        });
    }
});

// @route   GET /api/audit-logs/user/:userId
// @desc    Get audit logs for specific user
// @access  Private (Super Admin or own logs)
router.get('/user/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        // Only allow users to view their own logs unless they are super admin
        if (req.user._id.toString() !== userId && !isSuperAdmin(req.user)) {
            return res.status(403).json({
                success: false,
                message: 'Access forbidden'
            });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await AuditLog.find({ user: userId })
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await AuditLog.countDocuments({ user: userId });

        res.json({
            success: true,
            logs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalLogs: total,
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching user audit logs:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user audit logs'
        });
    }
});

// @route   GET /api/audit-logs/resource/:type/:id
// @desc    Get audit logs for specific resource
// @access  Private (Super Admin only)
router.get('/resource/:type/:id', requirePermissions('audit-logs.read'), async (req, res) => {
    try {
        const { type, id } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await AuditLog.find({
            resourceType: type,
            resourceId: id
        })
            .populate('user', 'name email role')
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await AuditLog.countDocuments({
            resourceType: type,
            resourceId: id
        });

        res.json({
            success: true,
            logs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / parseInt(limit)),
                totalLogs: total,
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error fetching resource audit logs:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching resource audit logs'
        });
    }
});

// @route   GET /api/audit-logs/stats
// @desc    Get audit log statistics
// @access  Private (Super Admin only)
router.get('/stats/summary', requirePermissions('audit-logs.read'), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.timestamp = {};
            if (startDate) dateFilter.timestamp.$gte = new Date(startDate);
            if (endDate) dateFilter.timestamp.$lte = new Date(endDate);
        }

        // Get action counts
        const actionStats = await AuditLog.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Get resource type counts
        const resourceStats = await AuditLog.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$resourceType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Get top users
        const topUsers = await AuditLog.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$user', count: { $sum: 1 }, userName: { $first: '$userName' } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Get total count
        const totalLogs = await AuditLog.countDocuments(dateFilter);

        res.json({
            success: true,
            stats: {
                totalLogs,
                actionStats,
                resourceStats,
                topUsers
            }
        });
    } catch (error) {
        console.error('Error fetching audit log stats:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching audit log stats'
        });
    }
});

// @route   GET /api/audit-logs/export
// @desc    Export audit logs to CSV
// @access  Private (Super Admin only)
router.get('/export/csv', requirePermissions('audit-logs.export'), async (req, res) => {
    try {
        const {
            action,
            resourceType,
            userId,
            startDate,
            endDate,
            search
        } = req.query;

        // Build filter query
        const filter = {};

        if (action) filter.action = action;
        if (resourceType) filter.resourceType = resourceType;
        if (userId) filter.user = userId;

        // Date range filter
        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }

        // Search filter
        if (search) {
            filter.$or = [
                { description: { $regex: search, $options: 'i' } },
                { userName: { $regex: search, $options: 'i' } },
                { userEmail: { $regex: search, $options: 'i' } },
                { resourceName: { $regex: search, $options: 'i' } }
            ];
        }

        // Fetch logs
        const logs = await AuditLog.find(filter)
            .populate('user', 'name email role')
            .sort({ timestamp: -1 })
            .limit(10000); // Limit to prevent memory issues

        // Convert to CSV
        const csvHeaders = ['Timestamp', 'User Name', 'User Email', 'Action', 'Resource Type', 'Resource Name', 'Description', 'IP Address', 'Status'];
        const csvRows = logs.map(log => [
            new Date(log.timestamp).toISOString(),
            log.userName,
            log.userEmail,
            log.action,
            log.resourceType,
            log.resourceName || 'N/A',
            log.description,
            log.ipAddress || 'N/A',
            log.status
        ]);

        // Create CSV content
        const csvContent = [
            csvHeaders.join(','),
            ...csvRows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        // Set headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting audit logs:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while exporting audit logs'
        });
    }
});

module.exports = router;
