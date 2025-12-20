const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Gamification = require('../models/Gamification');
const { protect } = require('../middleware/auth');
const { logAction } = require('../middleware/auditLog');

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        // Check for user
        const user = await User.findOne({ email })
            .select('+password')
            .populate('role', 'name label permissions')
            .populate('organization', 'name logo');  // Populate organization with name and logo

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid user'
            });
        }

        // Check if password matches
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if user is active
        if (user.status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'Account is inactive'
            });
        }

        // Create token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE }
        );

        // Log successful login
        await logAction(
            user._id,
            user.name,
            user.email,
            'LOGIN',
            'User',
            `User logged in successfully`,
            {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent')
            }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                organization: user.organization,  // Now includes name and logo
                groups: user.groups
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

// @route   POST /api/auth/register
// @desc    Register new user (admin only in production)
// @access  Public (for demo, should be protected in production)
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }

        // Create user
        const user = await User.create({
            name,
            email,
            password,
            role: role || 'sales'
        });

        // Create gamification record
        await Gamification.create({ user: user._id });

        // Create token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE }
        );

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
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

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('groups')
            .populate('role', 'name label permissions');
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

// @route   POST /api/auth/logout
// @desc    Logout user (for audit trail)
// @access  Private
router.post('/logout', protect, async (req, res) => {
    try {
        // Log the logout event
        await logAction(
            req.user._id,
            req.user.name,
            req.user.email,
            'LOGOUT',
            'User',
            `User logged out`,
            {
                ipAddress: req.ip || req.connection.remoteAddress,
                userAgent: req.get('user-agent')
            }
        );

        res.json({
            success: true,
            message: 'Logged out successfully'
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
