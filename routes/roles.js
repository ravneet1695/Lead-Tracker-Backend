const express = require('express');
const router = express.Router();
const Role = require('../models/Role');
const { requirePermissions, protect } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');
const { isSuperAdmin, applyOrganizationFilter, getRoleName } = require('../helpers/commonHelpers');
const { SYSTEM_PERMISSIONS } = require('../constants/permissions');

// @route   GET /api/roles/permissions
// @desc    Get all available permissions registry
// @access  Private (Admin)
router.get('/permissions', protect, (req, res) => {
    res.json({
        success: true,
        permissions: SYSTEM_PERMISSIONS
    });
});
// @desc    Get all active roles (filtered by organization for org admins)
// @access  Private (requires roles.read OR users.create OR users.update permission)
router.get('/', protect, async (req, res) => {
    try {
        // Ensure user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Check if user has permission to read roles or manage users
        const userPermissions = req.user.role?.permissions || [];
        const hasPermission = userPermissions.includes('*') ||
            userPermissions.includes('roles.read') ||
            userPermissions.includes('users.create') ||
            userPermissions.includes('users.update');

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access roles'
            });
        }

        const { includeInactive, organization } = req.query;

        // Determine if user is Super Admin
        const userIsSuperAdmin = isSuperAdmin(req.user);

        // Build base filter for active/inactive roles
        let filter = {};
        if (includeInactive !== 'true') {
            filter.isActive = true;
        }

        // Apply organization-based filtering
        if (userIsSuperAdmin) {
            // Super Admin: Can filter by organization or see all
            if (organization && organization !== 'all') {
                // Show system roles + custom roles for selected organization
                filter.$or = [
                    { isSystem: true },                    // All system roles
                    { organization: organization, isSystem: false }  // Custom roles for selected org
                ];
            } else {
                // Show all roles (system + all custom roles from all orgs)
                // No additional filter needed - will return everything
            }
        } else {
            // Org Admin: Only see their organization's roles
            const userOrgId = req.user.organization;

            if (!userOrgId) {
                return res.status(400).json({
                    success: false,
                    message: 'User organization not found'
                });
            }

            // Show system roles + custom roles for their organization only
            filter.$or = [
                { isSystem: true },                    // All system roles
                { organization: userOrgId, isSystem: false }  // Custom roles for their org
            ];
        }

        // Fetch roles with all necessary fields
        const allRoles = await Role.find(filter)
            .select('name label description isSystem isActive organization permissions')
            .populate('organization', 'name code')
            .sort({ isSystem: -1, name: 1 }) // System roles first, then alphabetically
            .lean();

        // For non-super-admin users, filter out super_admin and org_admin roles
        let roles = allRoles;
        if (!userIsSuperAdmin) {
            const superAdminRole = getRoleName('super_admin');
            const orgAdminRole = getRoleName('org_admin');

            roles = allRoles.filter(role =>
                role.name !== superAdminRole && role.name !== orgAdminRole
            );
        }

        res.json({
            success: true,
            count: roles.length,
            roles: roles
        });
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching roles'
        });
    }
});

// @route   GET /api/roles/:id
// @desc    Get single role
// @access  Private (Admin)
router.get('/:id', requirePermissions('roles.read'), async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        res.json({
            success: true,
            role
        });
    } catch (error) {
        console.error('Error fetching role:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching role'
        });
    }
});

// @route   POST /api/roles
// @desc    Create new role (system or custom)
// @access  Private (requires roles.create permission)
router.post('/', requirePermissions('roles.create'), createAuditLog('CREATE', 'Role'), async (req, res) => {
    try {
        const { name, label, description, permissions, isActive, isSystem, organization } = req.body;

        // Validate required fields
        if (!name || !label) {
            return res.status(400).json({
                success: false,
                message: 'Name and label are required'
            });
        }

        // Validate organization for custom roles
        if (!isSystem && !organization && !req.user.organization) { // If not system, and no org provided, and user is not org admin
            return res.status(400).json({
                success: false,
                message: 'Organization is required for custom roles'
            });
        }

        // Only super_admin can create system roles
        if (isSystem && !isSuperAdmin(req.user)) {
            return res.status(403).json({
                success: false,
                message: 'Only super administrators can create system roles'
            });
        }

        // Determine organization for the role first
        let organizationId = null;
        if (!isSystem) {
            // Auto-assign organization based on user role
            if (isSuperAdmin(req.user)) {
                // Super admin can create roles for any organization
                organizationId = organization || null;
            } else {
                // Org admin can only create roles for their own organization
                organizationId = req.user.organization;
            }
        }

        // Check if role with same name exists within the same scope
        let duplicateQuery;
        if (isSystem) {
            // For system roles, check globally
            duplicateQuery = { name: name.toLowerCase(), isSystem: true };
        } else {
            // For custom roles, check within the organization
            duplicateQuery = {
                name: name.toLowerCase(),
                organization: organizationId,
                isSystem: false
            };
        }

        const existingRole = await Role.findOne(duplicateQuery);

        if (existingRole) {
            const errorMessage = isSystem
                ? 'A system role with this name already exists'
                : 'A role with this name already exists in this organization';
            return res.status(400).json({
                success: false,
                message: errorMessage
            });
        }

        const role = await Role.create({
            name: name.toLowerCase(),
            label,
            description,
            permissions: permissions || [],
            isSystem: isSystem || false,
            organization: organizationId,
            isActive: isActive !== undefined ? isActive : true
        });

        res.status(201).json({
            success: true,
            message: 'Role created successfully',
            role
        });
    } catch (error) {
        console.error('Error creating role:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while creating role'
        });
    }
});

// @route   PUT /api/roles/:id
// @desc    Update role
// @access  Private (requires roles.update permission)
router.put('/:id', requirePermissions('roles.update'), createAuditLog('UPDATE', 'Role'), async (req, res) => {
    try {
        const { label, description, permissions, isActive, isSystem, organization } = req.body;

        const role = await Role.findById(req.params.id);

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Prevent modification of super_admin role
        const superAdminRole = getRoleName('super_admin');
        if (role.name === superAdminRole) {
            return res.status(403).json({
                success: false,
                message: 'Cannot modify super admin role'
            });
        }

        // For system roles, only Super Admin can update permissions
        if (role.isSystem && !isSuperAdmin(req.user)) {
            return res.status(403).json({
                success: false,
                message: 'Only Super Admin can modify system roles'
            });
        }

        // Prevent changing isSystem field
        if (isSystem !== undefined && isSystem !== role.isSystem) {
            return res.status(403).json({
                success: false,
                message: 'Cannot change role type (isSystem) after creation'
            });
        }

        // Prevent changing organization field
        if (organization !== undefined && organization !== role.organization?.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Cannot change organization after creation'
            });
        }

        // Update fields
        if (label) role.label = label;
        if (description !== undefined) role.description = description;
        if (permissions) role.permissions = permissions;
        if (isActive !== undefined) role.isActive = isActive;

        await role.save();

        res.json({
            success: true,
            message: 'Role updated successfully',
            role
        });
    } catch (error) {
        console.error('Error updating role:', error);

        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while updating role'
        });
    }
});

// @route   DELETE /api/roles/:id
// @desc    Delete role (soft delete by setting isActive to false)
// @access  Private (requires roles.delete permission)
router.delete('/:id', requirePermissions('roles.delete'), createAuditLog('DELETE', 'Role'), async (req, res) => {
    try {
        const role = await Role.findById(req.params.id);

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Prevent deletion of super_admin role
        const superAdminRole = getRoleName('super_admin');
        if (role.name === superAdminRole) {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete super admin role'
            });
        }

        // Prevent deletion of system roles
        if (role.isSystem) {
            return res.status(403).json({
                success: false,
                message: 'Cannot delete system roles'
            });
        }

        // Check organization permissions for custom roles
        if (!isSuperAdmin(req.user) && role.organization) {
            // Org admin can only delete roles from their organization
            if (!req.user.organization || role.organization.toString() !== req.user.organization.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only delete roles from your organization'
                });
            }
        }

        // Check if any users have this role
        const User = require('../models/User');
        const usersWithRole = await User.countDocuments({ role: role._id });

        if (usersWithRole > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete role.${usersWithRole} user(s) are assigned this role.`
            });
        }

        // Soft delete by setting isActive to false
        role.isActive = false;
        await role.save();

        res.json({
            success: true,
            message: 'Role deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting role'
        });
    }
});

module.exports = router;
