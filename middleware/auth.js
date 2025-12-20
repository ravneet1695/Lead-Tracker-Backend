const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
exports.protect = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id)
                .select('-password')
                .populate('role', 'name label permissions');

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Check if role exists
            if (!req.user.role) {
                return res.status(401).json({
                    success: false,
                    message: 'User role not found'
                });
            }

            next();
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Role-based authorization
exports.authorize = (...roleNames) => {
    return (req, res, next) => {
        const userRoleName = req.user.role?.name;

        if (!userRoleName || !roleNames.includes(userRoleName)) {
            return res.status(403).json({
                success: false,
                message: `User role ${userRoleName || 'unknown'} is not authorized to access this route`
            });
        }
        next();
    };
};

// Admin only (includes super_admin and org_admin)
exports.requireAdmin = [exports.protect, exports.authorize('org_admin', 'super_admin')];

// Manager or Admin
exports.requireManager = [exports.protect, exports.authorize('org_admin', 'super_admin', 'manager')];

// Super Admin only
exports.requireSuperAdmin = [exports.protect, exports.authorize('super_admin')];

// Permission-based authorization (NEW)
exports.requirePermissions = (...permissions) => {
    return [exports.protect, (req, res, next) => {
        const userPermissions = req.user.role?.permissions || [];

        // Check for wildcard permission (grants all access)
        if (userPermissions.includes('*')) {
            return next();
        }

        // Check if user has all required permissions
        const hasAllPermissions = permissions.every(permission =>
            userPermissions.includes(permission)
        );

        if (!hasAllPermissions) {
            const missingPermissions = permissions.filter(p => !userPermissions.includes(p));
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
                required: permissions,
                missing: missingPermissions
            });
        }

        next();
    }];
};

// Any authenticated user
exports.requireAuth = exports.protect;
