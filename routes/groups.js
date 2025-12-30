const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const User = require('../models/User');
const { requirePermissions, requireAuth } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');
const {
    validateGroupMembers,
    verifyGroupAccess,
    generateNextGroupCode,
    isSuperAdmin
} = require('../helpers/groupHelpers');

// @route   GET /api/groups
// @desc    Get all groups
// @access  Private (requires groups.read permission)
router.get('/', requirePermissions('groups.read'), async (req, res) => {
    try {
        const { search, status, organization } = req.query;
        const filter = {};

        // For non-Super Admin users, automatically filter by their organization
        if (!isSuperAdmin(req.user) && req.user.organization) {
            filter.organization = req.user.organization;
        } else if (organization && organization !== 'all') {
            // Super Admin can filter by specific organization via query param
            filter.organization = organization;
        }

        // Search by name or code
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } }
            ];
        }

        // Filter by status using env variables
        const STATUS_ACTIVE = process.env.STATUS_ACTIVE || 'active';
        const STATUS_INACTIVE = process.env.STATUS_INACTIVE || 'inactive';

        if (status === STATUS_ACTIVE) {
            filter.isActive = true;
        } else if (status === STATUS_INACTIVE) {
            filter.isActive = false;
        }

        const groups = await Group.find(filter)
            .populate('organization', 'name')
            .populate('users', 'name email')
            .populate('managers', 'name email')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: groups.length,
            groups
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/groups/next-code
// @desc    Get next group code
// @access  Private (requires groups.create permission)
router.get('/next-code', requirePermissions('groups.create'), async (req, res) => {
    try {
        // For Super Admin, organization MUST be provided in query params
        // For Org Admin, use their organization
        const isSuperAdminUser = isSuperAdmin(req.user);
        let organizationId;

        if (isSuperAdminUser) {
            // Super Admin must explicitly provide organization
            organizationId = req.query.organization;
            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    message: 'Super Admin must select an organization first to generate group code'
                });
            }
        } else {
            // Org Admin uses their own organization
            organizationId = req.user.organization;
            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization is required to generate group code'
                });
            }
        }

        // Use helper function to generate next code
        const nextCode = await generateNextGroupCode(organizationId, Group);

        res.json({
            success: true,
            code: nextCode
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/groups/:id
// @desc    Get single group
// @access  Private (requires groups.read permission)
router.get('/:id', requirePermissions('groups.read'), async (req, res) => {
    try {
        const group = await Group.findById(req.params.id)
            .populate('organization', 'name')
            .populate('users', 'name email role')
            .populate('managers', 'name email')
            .populate('createdBy', 'name email');

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        // Verify user has access to this group's organization using helper
        if (!verifyGroupAccess(req.user, group)) {
            return res.status(403).json({
                success: false,
                message: 'Access forbidden: Cannot access groups from other organizations'
            });
        }

        res.json({
            success: true,
            group
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/groups
// @desc    Create new group
// @access  Private (requires groups.create permission)
router.post('/', requirePermissions('groups.create'), createAuditLog('CREATE', 'Group'), async (req, res) => {
    try {
        const { code, name, description, organization, users, managers, isActive } = req.body;

        // Determine organization ID based on user role
        let organizationId;
        const isSuperAdminUser = isSuperAdmin(req.user);

        if (isSuperAdminUser) {
            // Super Admin must provide organization in request body
            organizationId = organization;
            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization is required for group creation'
                });
            }
        } else {
            // Org Admin uses their own organization
            organizationId = req.user.organization;
            if (!organizationId) {
                return res.status(400).json({
                    success: false,
                    message: 'User organization not found'
                });
            }
        }

        // Validate members using helper function
        const validation = await validateGroupMembers(users, managers, organizationId);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const group = await Group.create({
            code,
            name,
            description,
            organization: organizationId,
            users: users || [],
            managers: managers || [],
            isActive: isActive !== undefined ? isActive : true,
            createdBy: req.user.id
        });

        // Update users' groups array
        if (users && users.length > 0) {
            await User.updateMany(
                { _id: { $in: users } },
                { $addToSet: { groups: group._id } }
            );
        }

        const populatedGroup = await Group.findById(group._id)
            .populate('organization', 'name')
            .populate('users', 'name email')
            .populate('managers', 'name email');

        res.status(201).json({
            success: true,
            group: populatedGroup
        });
    } catch (error) {
        console.error(error);

        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Group code or name already exists for this organization'
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
});

// @route   PUT /api/groups/:id
// @desc    Update group
// @access  Private (requires groups.update permission)
router.put('/:id', requirePermissions('groups.update'), createAuditLog('UPDATE', 'Group'), async (req, res) => {
    try {
        const { name, description, users, managers, isActive, organization } = req.body;

        let group = await Group.findById(req.params.id);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        // Verify user has access to this group's organization using helper
        if (!verifyGroupAccess(req.user, group)) {
            return res.status(403).json({
                success: false,
                message: 'Access forbidden: Cannot update groups from other organizations'
            });
        }

        // Prevent changing organization field
        if (organization !== undefined && organization !== group.organization.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Cannot change organization after creation'
            });
        }

        // Validate members using helper function (only if being updated)
        if (users !== undefined || managers !== undefined) {
            const usersToValidate = users !== undefined ? users : group.users;
            const managersToValidate = managers !== undefined ? managers : group.managers;

            const validation = await validateGroupMembers(usersToValidate, managersToValidate, group.organization.toString());
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: validation.message
                });
            }
        }

        // Remove group from old users
        await User.updateMany(
            { groups: group._id },
            { $pull: { groups: group._id } }
        );

        // Update group
        if (name) group.name = name;
        if (description !== undefined) group.description = description;
        if (users !== undefined) group.users = users;
        if (managers !== undefined) group.managers = managers;
        if (isActive !== undefined) group.isActive = isActive;

        await group.save();

        // Add group to new users
        if (users && users.length > 0) {
            await User.updateMany(
                { _id: { $in: users } },
                { $addToSet: { groups: group._id } }
            );
        }

        const updatedGroup = await Group.findById(group._id)
            .populate('organization', 'name')
            .populate('users', 'name email')
            .populate('managers', 'name email');

        res.json({
            success: true,
            group: updatedGroup
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error'
        });
    }
});

// @route   DELETE /api/groups/:id
// @desc    Delete group
// @access  Private (requires groups.delete permission)
router.delete('/:id', requirePermissions('groups.delete'), createAuditLog('DELETE', 'Group'), async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        // Verify user has access to this group's organization using helper
        if (!verifyGroupAccess(req.user, group)) {
            return res.status(403).json({
                success: false,
                message: 'Access forbidden: Cannot delete groups from other organizations'
            });
        }

        // Remove group from all users
        await User.updateMany(
            { groups: group._id },
            { $pull: { groups: group._id } }
        );

        // Delete the group
        await Group.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Group deleted successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PATCH /api/groups/:id/toggle-status
// @desc    Toggle group active status
// @access  Private (requires groups.update permission)
router.patch('/:id/toggle-status', requirePermissions('groups.update'), createAuditLog('UPDATE', 'Group'), async (req, res) => {
    try {
        const group = await Group.findById(req.params.id);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found'
            });
        }

        // Verify user has access to this group's organization using helper
        if (!verifyGroupAccess(req.user, group)) {
            return res.status(403).json({
                success: false,
                message: 'Access forbidden: Cannot update groups from other organizations'
            });
        }

        group.isActive = !group.isActive;
        await group.save();

        const updatedGroup = await Group.findById(group._id)
            .populate('organization', 'name')
            .populate('users', 'name email')
            .populate('managers', 'name email');

        res.json({
            success: true,
            group: updatedGroup,
            message: `Group ${group.isActive ? 'activated' : 'deactivated'} successfully`
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
