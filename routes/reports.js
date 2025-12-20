const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const GoalEntry = require('../models/GoalEntry');
const { requireAuth } = require('../middleware/auth');

// @route   POST /api/reports/export
// @desc    Export data (Excel/CSV)
// @access  Private
router.post('/export', requireAuth, async (req, res) => {
    try {
        const { format = 'excel', filters = {} } = req.body;

        // Build query based on filters
        let query = {};

        if (filters.goal) query.goal = filters.goal;
        if (filters.group) query.group = filters.group;
        if (filters.status) query.status = filters.status;
        if (filters.user) query.user = filters.user;

        // Role-based filtering
        if (req.user.role === 'sales') {
            query.user = req.user.id;
        } else if (req.user.role === 'manager') {
            query.group = { $in: req.user.groups };
        }

        if (filters.dateRange) {
            query.createdAt = {
                $gte: new Date(filters.dateRange.start),
                $lte: new Date(filters.dateRange.end)
            };
        }

        const entries = await GoalEntry.find(query)
            .populate('goal', 'title')
            .populate('user', 'name email')
            .populate('group', 'name')
            .sort('-createdAt');

        if (format === 'excel' || format === 'csv') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Goal Entries');

            // Add headers
            worksheet.columns = [
                { header: 'Entry ID', key: 'id', width: 25 },
                { header: 'Goal', key: 'goal', width: 30 },
                { header: 'User', key: 'user', width: 25 },
                { header: 'Group', key: 'group', width: 20 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Remarks', key: 'remarks', width: 40 },
                { header: 'Created At', key: 'createdAt', width: 20 },
                { header: 'Updated At', key: 'updatedAt', width: 20 }
            ];

            // Add data
            entries.forEach(entry => {
                worksheet.addRow({
                    id: entry._id.toString(),
                    goal: entry.goal.title,
                    user: entry.user.name,
                    group: entry.group.name,
                    status: entry.status,
                    remarks: entry.remarks || '',
                    createdAt: entry.createdAt.toISOString(),
                    updatedAt: entry.updatedAt.toISOString()
                });
            });

            // Style header row
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4472C4' }
            };

            // Set response headers
            const filename = `goal_entries_${Date.now()}.${format === 'csv' ? 'csv' : 'xlsx'}`;
            res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            // Write to response
            if (format === 'csv') {
                await workbook.csv.write(res);
            } else {
                await workbook.xlsx.write(res);
            }

            res.end();
        } else {
            res.status(400).json({
                success: false,
                message: 'Unsupported format'
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/reports/insights
// @desc    Get AI-generated insights (placeholder)
// @access  Private
router.get('/insights', requireAuth, async (req, res) => {
    try {
        // This is a placeholder for AI-generated insights
        // In production, this would integrate with an AI service

        const entries = await GoalEntry.find()
            .populate('goal', 'title')
            .populate('user', 'name');

        // Simple analytics
        const totalEntries = entries.length;
        const statusCounts = {};
        entries.forEach(entry => {
            statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1;
        });

        const insights = [
            `Total of ${totalEntries} goal entries have been created.`,
            `Most common status: ${Object.keys(statusCounts).reduce((a, b) => statusCounts[a] > statusCounts[b] ? a : b, '')}`,
            `Average entries per user: ${(totalEntries / (await GoalEntry.distinct('user')).length).toFixed(2)}`
        ];

        res.json({
            success: true,
            insights,
            analytics: {
                totalEntries,
                statusDistribution: statusCounts
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

module.exports = router;
