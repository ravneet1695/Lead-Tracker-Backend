const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Organization = require('../models/Organization');
const Role = require('../models/Role');
const Goal = require('../models/Goal');
const GoalEntry = require('../models/GoalEntry');
const Gamification = require('../models/Gamification');
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

    const topPerformers = await Gamification.find({ user: { $in: await User.find({ organization: user.organization }).distinct('_id') } })
        .sort({ totalPoints: -1 })
        .limit(10)
        .populate('user', 'name email');

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
        leaderboard: topPerformers,
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

    const teamPerformance = await Gamification.find({ user: { $in: teamMemberIds } })
        .sort({ totalPoints: -1 })
        .populate('user', 'name email');

    return {
        role: 'manager',
        user: { name: user.name, email: user.email, role: user.role },
        stats: {
            teamSize: teamMembers.length,
            totalEntries: teamGoalEntries,
            completedEntries,
            completionRate: teamGoalEntries > 0 ? ((completedEntries / teamGoalEntries) * 100).toFixed(2) : 0
        },
        teamPerformance,
        leaderboard: teamPerformance.slice(0, 10),
        recentActivity: await getRecentActivity(null, 10, teamMemberIds)
    };
}

// Sales Dashboard - Personal view
async function getSalesDashboard(user) {
    const myEntries = await GoalEntry.countDocuments({ user: user._id });
    const completedEntries = await GoalEntry.countDocuments({ user: user._id, status: 'approved' });
    const pendingEntries = await GoalEntry.countDocuments({ user: user._id, status: 'pending' });

    const myStats = await Gamification.findOne({ user: user._id });

    const recentEntries = await GoalEntry.find({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('goal', 'name points');

    return {
        role: 'sales',
        user: { name: user.name, email: user.email, role: user.role },
        stats: {
            totalEntries: myEntries,
            completedEntries,
            pendingEntries,
            totalPoints: myStats?.totalPoints || 0,
            badges: myStats?.badges || [],
            level: myStats?.level || 1
        },
        recentEntries,
        recentActivity: await getRecentActivity(null, 10, [user._id])
    };
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
