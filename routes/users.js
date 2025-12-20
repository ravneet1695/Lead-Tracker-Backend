const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Role = require('../models/Role');
const AuditLog = require('../models/AuditLog');
const Gamification = require('../models/Gamification');
const { requireAuth, requirePermissions } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');
const { isSuperAdmin, generateNextCode, applyOrganizationFilter } = require('../helpers/commonHelpers');
const upload = require('../middleware/upload');

// @route   GET /api/users
// @desc    Get all users
// @access  Private (requires users.read permission)
router.get('/', requirePermissions('users.read'), async (req, res) => {
    try {
        const { search, role, status, organization } = req.query;
        let filter = {};

        // Apply organization filter using helper
        filter = applyOrganizationFilter(req.user, filter, organization);

        // Search by name or email
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        if (role) filter.role = role;
        if (status) filter.status = status;

        const users = await User.find(filter)
            .populate('groups')
            .populate('organization')
            .populate('role', 'name label')
            .select('-password');

        res.json({
            success: true,
            count: users.length,
            users
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/users/next-code
// @desc    Get next user code
// @access  Private (Admin)
router.get('/next-code', requirePermissions('users.create'), async (req, res) => {
    try {
        // Use common helper to generate next code
        const prefix = process.env.USER_CODE_PREFIX || 'USR';
        const length = parseInt(process.env.USER_CODE_LENGTH) || 4;
        const nextCode = await generateNextCode(User, prefix, length);

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

// @route   PATCH /api/users/:id/status
// @desc    Activate or deactivate a user
// @access  Private (Admin)
router.patch('/:id/status', requirePermissions('users.update'), async (req, res) => {
    try {
        const { status } = req.body;

        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Valid status (active or inactive) is required'
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const oldStatus = user.status;
        user.status = status;
        await user.save();

        // Create audit log using AuditLog.log() directly
        const actionDescription = status === 'active'
            ? `Activated user: ${user.name}`
            : `Deactivated user: ${user.name}`;

        await AuditLog.log({
            user: req.user._id,
            userName: req.user.name,
            userEmail: req.user.email,
            organization: req.user.organization,
            action: 'UPDATE',
            resourceType: 'User',
            resourceId: user._id,
            resourceName: user.name,
            description: actionDescription,
            changes: {
                before: { status: oldStatus },
                after: { status: status }
            },
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent')
        });

        res.json({
            success: true,
            message: `User ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                status: user.status
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

// @route   GET /api/users/:id
// @desc    Get single user
// @access  Private (requires users.read permission)
router.get('/:id', requirePermissions('users.read'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('groups').select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/users
// @desc    Create new user
// @access  Private (requires users.create permission)
router.post('/', requirePermissions('users.create'), upload.single('profileImage'), createAuditLog('CREATE', 'User'), async (req, res) => {
    try {
        const { code, name, email, mobile, password, role, organization, status } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ $or: [{ email }, { mobile }] });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email or mobile already exists'
            });
        }

        // Handle profile image
        const profileImage = req.file ? `/uploads/profiles/${req.file.filename}` : null;

        // Create user
        const user = await User.create({
            code,
            name,
            email,
            mobile,
            password,
            role,
            organization,
            profileImage,
            status
        });

        // Create gamification record
        await Gamification.create({ user: user._id });

        res.status(201).json({
            success: true,
            user: await User.findById(user._id).select('-password')
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private (requires users.update permission)
router.put('/:id', requirePermissions('users.update'), upload.single('profileImage'), createAuditLog('UPDATE', 'User'), async (req, res) => {
    try {
        const { name, email, mobile, password, role, organization, status } = req.body;
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update user fields
        if (name) user.name = name;
        if (email) user.email = email;
        if (mobile) user.mobile = mobile;
        if (password) user.password = password;
        if (role) user.role = role;
        if (organization) user.organization = organization;
        if (status) user.status = status; // Added status update
        if (req.file) user.profileImage = `/uploads/profiles/${req.file.filename}`;

        await user.save(); // Save the updated user

        res.json({
            success: true,
            user: await User.findById(user._id).select('-password') // Re-fetch to exclude password
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   DELETE /api/users/:id
// @desc    Soft delete user (set status to inactive)
// @access  Private (requires users.delete permission)
router.delete('/:id', requirePermissions('users.delete'), createAuditLog('DELETE', 'User'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Soft delete: Set status to inactive
        user.status = 'inactive';
        await user.save();

        res.json({
            success: true,
            message: 'User marked as inactive successfully'
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
