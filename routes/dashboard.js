const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Organization = require('../models/Organization');
const Role = require('../models/Role');
const Goal = require('../models/Goal');
const GoalEntry = require('../models/GoalEntry');
const { requireAuth } = require('../middleware/auth');
const { getRoleName } = require('../helpers/commonHelpers');

// @route   GET /api/dashboard
// @desc    Get role-based dashboard data
// @access  Private
router.get('/', requireAuth, async (req, res) => {
    try {
        const user = req.user;
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
        const superAdminRole = getRoleName('super_admin');
        const orgAdminRole = getRoleName('org_admin');

        switch (roleName) {
            case superAdminRole:
                // Super Admin Dashboard
                dashboardData = await getSuperAdminDashboard(user);
                break;
            case orgAdminRole:
                dashboardData = await getOrgAdminDashboard(user);
                break;
            case 'manager':
                dashboardData = await getManagerDashboard(user);
                break;
            case 'sales':
                dashboardData = await getSalesDashboard(user);
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
async function getSuperAdminDashboard(user) {
    const totalOrgs = await Organization.countDocuments({ deletedAt: null });
    const activeOrgs = await Organization.countDocuments({ status: 'active', deletedAt: null });
    const totalUsers = await User.countDocuments();
    const totalGoals = await Goal.countDocuments();

    const usersByRole = await User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    const orgStats = await Organization.aggregate([
        { $match: { deletedAt: null } },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: 'organization',
                as: 'users'
            }
        },
        {
            $project: {
                name: 1,
                status: 1,
                userCount: { $size: '$users' },
                createdAt: 1
            }
        },
        { $sort: { userCount: -1 } },
        { $limit: 10 }
    ]);

    return {
        role: getRoleName('super_admin'),
        user: { name: user.name, email: user.email, role: user.role },
        stats: {
            totalOrganizations: totalOrgs,
            activeOrganizations: activeOrgs,
            totalUsers,
            totalGoals,
            usersByRole: usersByRole.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {})
        },
        charts: {
            organizationGrowth: orgStats,
            userDistribution: usersByRole
        },
        topOrganizations: orgStats,
        goalStagesSummary: await getGoalStagesSummary({}),
        recentActivity: await getRecentActivity(null, 10)
    };
}

// Org Admin Dashboard - Single organization view
async function getOrgAdminDashboard(user) {
    if (!user.organization) {
        throw new Error('User not assigned to any organization');
    }

    const organization = await Organization.findById(user.organization);
    const orgUsers = await User.countDocuments({ organization: user.organization });

    // Get role counts by populating and filtering
    const managerRole = await Role.findOne({ name: 'manager' });
    const salesRole = await Role.findOne({ name: 'sales' });

    const orgManagers = managerRole ? await User.countDocuments({ organization: user.organization, role: managerRole._id }) : 0;
    const orgSales = salesRole ? await User.countDocuments({ organization: user.organization, role: salesRole._id }) : 0;

    const usersByRole = await User.aggregate([
        { $match: { organization: user.organization } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);


    return {
        role: getRoleName('org_admin'),
        user: { name: user.name, email: user.email, role: user.role },
        organization: {
            id: organization._id,
            name: organization.name,
            status: organization.status
        },
        stats: {
            totalUsers: orgUsers,
            managers: orgManagers,
            salesReps: orgSales,
            usersByRole: usersByRole.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {})
        },
        leaderboard: [],
        goalStagesSummary: await getGoalStagesSummary({ organization: user.organization }),
        recentActivity: await getRecentActivity(user.organization, 10)
    };
}

// Manager Dashboard - Team view
async function getManagerDashboard(user) {
    // Get sales role ID
    const salesRole = await Role.findOne({ name: 'sales' });

    const teamMembers = await User.find({
        groups: { $in: user.groups },
        role: salesRole ? salesRole._id : null
    });

    const teamMemberIds = teamMembers.map(m => m._id);

    const teamGoalEntries = await GoalEntry.countDocuments({
        user: { $in: teamMemberIds }
    });

    const completedEntries = await GoalEntry.countDocuments({
        user: { $in: teamMemberIds },
        status: 'approved'
    });


    return {
        role: 'manager',
        user: { name: user.name, email: user.email, role: user.role },
        stats: {
            teamSize: teamMembers.length,
            totalEntries: teamGoalEntries,
            completedEntries,
            completionRate: teamGoalEntries > 0 ? ((completedEntries / teamGoalEntries) * 100).toFixed(2) : 0
        },
        teamPerformance: [],
        leaderboard: [],
        goalStagesSummary: await getGoalStagesSummary({ user: { $in: teamMemberIds } }),
        recentActivity: await getRecentActivity(null, 10, teamMemberIds)
    };
}

// Sales Dashboard - Personal view
async function getSalesDashboard(user) {
    const myEntries = await GoalEntry.countDocuments({ user: user._id });
    const completedEntries = await GoalEntry.countDocuments({ user: user._id, status: 'approved' });
    const pendingEntries = await GoalEntry.countDocuments({ user: user._id, status: 'pending' });


    const recentEntries = await GoalEntry.find({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('goal', 'name');

    return {
        role: 'sales',
        user: { name: user.name, email: user.email, role: user.role },
        stats: {
            totalEntries: myEntries,
            completedEntries,
            pendingEntries,
            totalPoints: 0,
            badges: [],
            level: 1
        },
        recentEntries,
        goalStagesSummary: await getGoalStagesSummary({ user: user._id }),
        recentActivity: await getRecentActivity(null, 10, [user._id])
    };
}

// Helper function to get goal stages summary
async function getGoalStagesSummary(filter) {
    const goals = await Goal.find(filter)
        .select('title statusOptions completionStatus formSchema group')
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

        const entries = await GoalEntry.find({ goal: goal._id, ...filter })
            .populate('user', 'name email')
            .select('user status data _id');

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

        // Populate entries
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
            completionStatus: goal.completionStatus,
            stages,
            memberBreakdown
        };
    }));

    return summary;
}

// Helper function to get recent activity
async function getRecentActivity(organizationId = null, limit = 10, userIds = null) {
    let query = {};

    if (userIds) {
        query.user = { $in: userIds };
    } else if (organizationId) {
        const orgUsers = await User.find({ organization: organizationId }).distinct('_id');
        query.user = { $in: orgUsers };
    }

    const activities = await GoalEntry.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user', 'name email')
        .populate('goal', 'name');

    return activities.map(entry => ({
        id: entry._id,
        type: 'goal_entry',
        user: entry.user?.name || 'Unknown',
        goal: entry.goal?.name || 'Unknown',
        status: entry.status,
        createdAt: entry.createdAt
    }));
}

module.exports = router;
