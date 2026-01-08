const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Organization = require('../models/Organization');
const Role = require('../models/Role');
const Goal = require('../models/Goal');
const GoalEntry = require('../models/GoalEntry');
const { requireAuth } = require('../middleware/auth');

// @route   GET /api/dashboard
// @desc    Get role-based dashboard data
// @access  Private
router.get('/', requireAuth, async (req, res) => {
    try {
        const user = req.user;

        // Extract filter parameters from query
        const filters = {
            goals: req.query.goals ? req.query.goals.split(',') : null,
            startDate: req.query.startDate ? new Date(req.query.startDate) : null,
            endDate: req.query.endDate ? new Date(req.query.endDate) : null,
            status: req.query.status || null
        };

        let dashboardData = {
            role: user.role,
            user: {
                name: user.name,
                email: user.email,
                role: user.role
            },
            stats: {},
            charts: {},
            recentActivity: [],
            leaderboard: []
        };

        const roleName = req.user.role?.name;

        switch (roleName) {
            case 'super_admin':
                dashboardData = await getSuperAdminDashboard(user, filters);
                break;
            case 'org_admin':
                dashboardData = await getOrgAdminDashboard(user, filters);
                break;
            default:
                return res.status(400).json({ message: 'Invalid user role' });
        }

        res.json(dashboardData);
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Super Admin Dashboard - Multi-organization view
async function getSuperAdminDashboard(user, filters = {}) {
    return {
        role: 'super_admin',
        user: { name: user.name, email: user.email, role: user.role },
        goalStagesSummary: await getGoalStagesSummary({}, filters)
    };
}

// Org Admin Dashboard - Single organization view
async function getOrgAdminDashboard(user, filters = {}) {
    if (!user.organization) {
        throw new Error('User not assigned to any organization');
    }

    return {
        role: 'org_admin',
        user: { name: user.name, email: user.email, role: user.role },
        goalStagesSummary: await getGoalStagesSummary({ organization: user.organization }, filters)
    };
}

// Helper function to get goal stages summary
async function getGoalStagesSummary(filter, filters = {}) {
    // Apply goal filter to the base query
    let goalQuery = { ...filter };
    if (filters.goals && filters.goals.length > 0) {
        goalQuery._id = { $in: filters.goals };
    }

    const goals = await Goal.find(goalQuery)
        .select('title statusOptions completionStatus formSchema group organization status')
        .populate('organization', 'name')
        .populate({
            path: 'group',
            select: 'users',
            populate: {
                path: 'users',
                select: 'name email'
            }
        });

    const summary = await Promise.all(goals.map(async (goal) => {
        const firstField = goal.formSchema && goal.formSchema[0] ? goal.formSchema[0].fieldName : null;

        // Build entry query with filters
        let entryQuery = { goal: goal._id, ...filter };

        // Apply date range filter
        if (filters.startDate || filters.endDate) {
            entryQuery.createdAt = {};
            if (filters.startDate) {
                entryQuery.createdAt.$gte = filters.startDate;
            }
            if (filters.endDate) {
                entryQuery.createdAt.$lte = filters.endDate;
            }
        }

        // Apply status filter
        if (filters.status) {
            entryQuery.status = filters.status;
        }

        const entries = await GoalEntry.find(entryQuery)
            .populate('user', 'name email')
            .select('user status data _id createdAt');


        const groupMembers = goal.group?.users || [];
        const memberBreakdownObj = {};

        // Pre-populate all group members
        groupMembers.forEach(user => {
            memberBreakdownObj[user._id.toString()] = {
                userId: user._id.toString(),
                userName: user.name,
                stages: {}
            };
        });

        // Populate entries (using filtered entries)
        entries.forEach(entry => {
            const userId = entry.user?._id?.toString();
            if (!userId) return;

            const status = entry.status || 'Initiated';

            if (!memberBreakdownObj[userId]) {
                memberBreakdownObj[userId] = {
                    userId,
                    userName: entry.user.name,
                    stages: {}
                };
            }

            if (!memberBreakdownObj[userId].stages[status]) {
                memberBreakdownObj[userId].stages[status] = [];
            }

            const leadTitle = firstField && entry.data?.[firstField]
                ? entry.data[firstField]
                : `Lead ${entry._id.toString().slice(-6)}`;

            memberBreakdownObj[userId].stages[status].push({
                id: entry._id,
                title: leadTitle
            });
        });

        // Convert to array format
        const memberBreakdown = Object.values(memberBreakdownObj).map(member => ({
            userId: member.userId,
            userName: member.userName,
            stages: Object.entries(member.stages).map(([status, leads]) => ({
                status,
                leads,
                count: leads.length
            }))
        }));

        // Calculate stage totals
        const stageTotals = {};
        memberBreakdown.forEach(member => {
            member.stages.forEach(stage => {
                stageTotals[stage.status] = (stageTotals[stage.status] || 0) + stage.count;
            });
        });

        const stages = Object.entries(stageTotals).map(([status, count]) => ({
            status,
            count
        }));

        return {
            goalId: goal._id,
            goalTitle: goal.title,
            organization: goal.organization,
            status: goal.status,
            completionStatus: goal.completionStatus,
            stages,
            memberBreakdown
        };
    }));

    return summary;
}

module.exports = router;
