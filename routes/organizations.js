const express = require('express');
const router = express.Router();
const Organization = require('../models/Organization');
const User = require('../models/User');
const Role = require('../models/Role');
const MasterConfig = require('../models/MasterConfig');
const { requirePermissions } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');
const { generateNextCode, getRoleName } = require('../helpers/commonHelpers');
const upload = require('../middleware/upload');
const path = require('path');
const fs = require('fs');

// @route   GET /api/organizations
// @desc    Get all organizations
// @access  Private (Admin & Super Admin)
router.get('/', requirePermissions('organizations.read'), async (req, res) => {
    try {
        const organizations = await Organization.find({})
            .populate('admin', 'name email mobile')  // Populate admin user details
            .select('name code status email alias admin')  // Include admin in selection
            .sort({ createdAt: -1 })
            .lean();  // Return plain JS objects (20-30% faster)

        res.json({
            success: true,
            count: organizations.length,
            organizations
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/organizations/stats
// @desc    Get organization statistics
// @access  Private (Super Admin only)
router.get('/stats', requirePermissions('organizations.read'), async (req, res) => {
    try {
        const totalOrganizations = await Organization.countDocuments();
        const activeOrganizations = await Organization.countDocuments({ isActive: true });
        const inactiveOrganizations = await Organization.countDocuments({ isActive: false });

        res.json({
            success: true,
            stats: {
                total: totalOrganizations,
                active: activeOrganizations,
                inactive: inactiveOrganizations
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// @route   GET /api/organizations/next-code
// @desc    Get next organization code for auto-generation
// @access  Private (Super Admin only)
router.get('/next-code', requirePermissions('organizations.create'), async (req, res) => {
    try {
        // Use common helper to generate next code
        const prefix = process.env.ORG_CODE_PREFIX || 'ORG-';
        const length = parseInt(process.env.ORG_CODE_LENGTH) || 3;
        const nextCode = await generateNextCode(Organization, prefix, length);

        res.json({ code: nextCode });
    } catch (error) {
        console.error('Error generating next code:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// @route   GET /api/organizations/:id
// @desc    Get single organization
// @access  Private (Admin & Super Admin)
router.get('/:id', requirePermissions('organizations.read'), async (req, res) => {
    try {
        const organization = await Organization.findOne({
            _id: req.params.id,
            deletedAt: null
        });

        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Fetch departments from MasterConfig
        const config = await MasterConfig.findOne({ organization: req.params.id });
        console.log(`Config for org ${req.params.id}:`, config ? 'Found' : 'Not Found');
        if (config) console.log('Departments in config:', config.departments);

        const orgObj = organization.toObject();
        orgObj.departments = config ? config.departments : [];

        res.json({
            success: true,
            organization: orgObj
        });
    } catch (error) {
        console.error('Error fetching organization:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching organization'
        });
    }
});

// @route   POST /api/organizations
// @desc    Create new organization with admin user
// @access  Private (Super Admin only)
router.post('/', requirePermissions('organizations.create'), createAuditLog('CREATE', 'Organization'), async (req, res) => {
    try {
        const { name, email, website, alias, phone, address, logo, description, status, adminUser, departments } = req.body;

        // Validate required fields
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Name and email are required'
            });
        }

        // Validate admin user details
        if (!adminUser || !adminUser.name || !adminUser.email || !adminUser.password) {
            return res.status(400).json({
                success: false,
                message: 'Admin user details (name, email, password) are required'
            });
        }

        // Check if organization with same name or email exists
        const existingOrg = await Organization.findOne({
            $or: [{ name }, { email }],
            deletedAt: null
        });

        if (existingOrg) {
            return res.status(400).json({
                success: false,
                message: 'Organization with this name or email already exists'
            });
        }

        // Check if user with same email exists
        const User = require('../models/User');
        const existingUser = await User.findOne({ email: adminUser.email });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Create organization first
        const organization = await Organization.create({
            name,
            email,
            website,
            alias,
            phone,
            address,
            logo,
            description,
            status: status || 'active'
        });

        try {
            // Find the org_admin role from database using helper
            const orgAdminRoleName = getRoleName('org_admin');
            const orgAdminRole = await Role.findOne({ name: orgAdminRoleName, isActive: true });

            if (!orgAdminRole) {
                // Rollback organization creation
                await Organization.findByIdAndDelete(organization._id);
                return res.status(500).json({
                    success: false,
                    message: 'Organization admin role not found in system. Please contact administrator.'
                });
            }

            // Create admin user - password will be hashed by User model's pre-save hook
            const user = await User.create({
                name: adminUser.name,
                email: adminUser.email,
                mobile: parseInt(adminUser.mobile, 10),
                password: adminUser.password, // Pass plain password, pre-save hook will hash it
                role: orgAdminRole._id, // Use role ID from database
                organization: organization._id
            });

            // Update organization with admin reference
            organization.admin = user._id;
            await organization.save();

            // Create MasterConfig with departments
            await MasterConfig.create({
                organization: organization._id,
                departments: (departments && departments.length > 0) ? departments : [
                    'Sales',
                    'Marketing',
                    'Operations',
                    'Finance',
                    'Human Resources',
                    'IT Support',
                    'Customer Success'
                ],
                leadSources: ['Website', 'Referral', 'Social Media', 'Cold Call'],
                leadStatuses: [
                    { name: 'New', color: '#3b82f6', order: 1, isDefault: true },
                    { name: 'Contacted', color: '#8b5cf6', order: 2, isDefault: false },
                    { name: 'Won', color: '#10b981', order: 3, isDefault: false },
                    { name: 'Lost', color: '#6b7280', order: 4, isDefault: false }
                ]
            });

            res.status(201).json({
                success: true,
                message: 'Organization and admin user created successfully',
                organization: {
                    ...organization.toObject(),
                    adminUser: {
                        name: user.name,
                        email: user.email,
                        phone: user.phone,
                        role: user.role
                    }
                }
            });
        } catch (userError) {
            // If user creation fails, delete the organization
            await Organization.findByIdAndDelete(organization._id);
            throw userError;
        }
    } catch (error) {
        console.error('Error creating organization:', error);

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }

        // Handle duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `User with this ${field} already exists`
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while creating organization'
        });
    }
});

// @route   PUT /api/organizations/:id
// @desc    Update organization
// @access  Private (Super Admin only)
router.put('/:id', requirePermissions('organizations.update'), createAuditLog('UPDATE', 'Organization'), async (req, res) => {
    try {
        const { name, email, website, alias, phone, address, logo, description, status, departments } = req.body;

        let organization = await Organization.findOne({
            _id: req.params.id,
            deletedAt: null
        });

        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if name or email is being changed to an existing one
        if (name !== organization.name || email !== organization.email) {
            const existingOrg = await Organization.findOne({
                _id: { $ne: req.params.id },
                $or: [{ name }, { email }],
                deletedAt: null
            });

            if (existingOrg) {
                return res.status(400).json({
                    success: false,
                    message: 'Organization with this name or email already exists'
                });
            }
        }

        organization = await Organization.findByIdAndUpdate(
            req.params.id,
            {
                name,
                email,
                website,
                alias,
                phone,
                address,
                logo,
                description,
                status,
                updatedAt: Date.now()
            },
            { new: true, runValidators: true }
        );

        // Update departments in MasterConfig
        if (departments !== undefined) {
            console.log(`Updating departments for org ${req.params.id}:`, departments);
            await MasterConfig.findOneAndUpdate(
                { organization: req.params.id },
                { $set: { departments } },
                { upsert: true, new: true }
            );
        }

        res.json({
            success: true,
            message: 'Organization updated successfully',
            organization
        });
    } catch (error) {
        console.error('Error updating organization:', error);

        // Handle validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while updating organization'
        });
    }
});

// @route   DELETE /api/organizations/:id
// @desc    Soft delete organization
// @access  Private (Super Admin only)
router.delete('/:id', requirePermissions('organizations.delete'), createAuditLog('DELETE', 'Organization'), async (req, res) => {
    try {
        const organization = await Organization.findOne({
            _id: req.params.id,
            deletedAt: null
        });

        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        await organization.softDelete();

        res.json({
            success: true,
            message: 'Organization deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting organization:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting organization'
        });
    }
});

// @route   PATCH /api/organizations/:id/restore
// @desc    Restore soft-deleted organization
// @access  Private (Super Admin only)
router.patch('/:id/restore', requirePermissions('organizations.update'), createAuditLog('RESTORE', 'Organization'), async (req, res) => {
    try {
        const organization = await Organization.findOne({
            _id: req.params.id,
            deletedAt: { $ne: null }
        });

        if (!organization) {
            return res.status(404).json({
                success: false,
                message: 'Deleted organization not found'
            });
        }

        await organization.restore();

        res.json({
            success: true,
            message: 'Organization restored successfully',
            organization
        });
    } catch (error) {
        console.error('Error restoring organization:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while restoring organization'
        });
    }
});

module.exports = router;
