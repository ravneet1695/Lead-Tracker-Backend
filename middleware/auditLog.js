const AuditLog = require('../models/AuditLog');

// Middleware to create audit log
exports.createAuditLog = (action, resourceType) => {
    return async (req, res, next) => {
        // Store original methods
        const originalJson = res.json;
        const originalSend = res.send;

        // Override res.json to capture response
        res.json = function (data) {
            // Create audit log after successful response
            if (res.statusCode >= 200 && res.statusCode < 300) {
                createLog(req, res, action, resourceType, data);
            }
            return originalJson.call(this, data);
        };

        // Override res.send to capture response
        res.send = function (data) {
            // Create audit log after successful response
            if (res.statusCode >= 200 && res.statusCode < 300) {
                createLog(req, res, action, resourceType, data);
            }
            return originalSend.call(this, data);
        };

        next();
    };
};

// Helper function to create audit log
async function createLog(req, res, action, resourceType, responseData) {
    try {
        if (!req.user) return; // Skip if no user (shouldn't happen with auth)

        const logData = {
            user: req.user._id,
            userName: req.user.name,
            userEmail: req.user.email,
            organization: req.user.organization, // Capture user's organization
            action,
            resourceType,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent'),
            timestamp: new Date()
        };

        // Extract resource information from response or request
        if (responseData) {
            // Handle different response structures
            const resource = responseData.organization ||
                responseData.user ||
                responseData.group ||
                responseData.goal ||
                responseData.data;

            if (resource && resource._id) {
                logData.resourceId = resource._id;
                logData.resourceName = resource.name || resource.email || resource.title;
            }
        }

        // For UPDATE actions, try to capture before/after
        if (action === 'UPDATE' && req.body) {
            logData.changes = {
                after: req.body
            };
        }

        // For CREATE actions, capture created data
        if (action === 'CREATE' && req.body) {
            logData.changes = {
                after: req.body
            };
        }

        // Generate description
        logData.description = generateDescription(action, resourceType, logData.resourceName);

        // Create audit log
        await AuditLog.log(logData);
    } catch (error) {
        console.error('Error in audit logging:', error);
        // Don't throw error to prevent audit logging from breaking main functionality
    }
}

// Generate human-readable description
function generateDescription(action, resourceType, resourceName) {
    const name = resourceName || 'resource';

    switch (action) {
        case 'CREATE':
            return `Created ${resourceType.toLowerCase()}: ${name}`;
        case 'UPDATE':
            return `Updated ${resourceType.toLowerCase()}: ${name}`;
        case 'DELETE':
            return `Deleted ${resourceType.toLowerCase()}: ${name}`;
        case 'VIEW':
            return `Viewed ${resourceType.toLowerCase()}: ${name}`;
        case 'LOGIN':
            return `User logged in`;
        case 'LOGOUT':
            return `User logged out`;
        case 'RESTORE':
            return `Restored ${resourceType.toLowerCase()}: ${name}`;
        default:
            return `Performed ${action} on ${resourceType.toLowerCase()}: ${name}`;
    }
}

// Manual audit log creation (for special cases like login/logout)
exports.logAction = async (userId, userName, userEmail, action, resourceType, description, metadata = {}) => {
    try {
        const logData = {
            user: userId,
            userName,
            userEmail,
            organization: metadata.organization, // Capture organization if provided
            action,
            resourceType,
            description,
            metadata,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
            timestamp: new Date()
        };

        await AuditLog.log(logData);
    } catch (error) {
        console.error('Error logging action:', error);
    }
};
