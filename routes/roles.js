const express = require('express');
const router = express.Router();
const Role = require('../models/Role');
const { requirePermissions, protect } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');
const { isSuperAdmin, applyOrganizationFilter, getRoleName } = require('../helpers/commonHelpers');

// @route   GET /api/roles
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
        let filter = includeInactive === 'true' ? {} : { isActive: true };

        // If organization filter is specified, include both:
        // 1. Roles for that specific organization
        // 2. System roles (where organization is null)
        if (organization) {
            filter.$or = [
                { organization: organization },  // Roles for this organization
                { organization: null },          // System roles
                { isSystem: true }               // System roles (alternative check)
            ];
        } else {
            // Apply organization filter using helper for non-specific queries
            filter = applyOrganizationFilter(req.user, filter, organization);
        }

        const allRoles = await Role.find(filter)
            .select('name label isSystem organization')  // Only return relevant fields
            .populate('organization', 'name')             // Only populate org name
            .sort({ isSystem: -1, name: 1 }) // System roles first
            .lean();  // Return plain JS objects (20-30% faster)

        // Filter out super_admin and org_admin roles for non-super-admin users
        let roles = allRoles;
        const superAdminRole = getRoleName('super_admin');
        const orgAdminRole = getRoleName('org_admin');

        if (!isSuperAdmin(req.user)) {
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

        // Check if role with same name exists globally
        const existingRole = await Role.findOne({ name: name.toLowerCase() });

        if (existingRole) {
            return res.status(400).json({
                success: false,
                message: 'Role with this name already exists'
            });
        }

        // Determine organization for the role
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
