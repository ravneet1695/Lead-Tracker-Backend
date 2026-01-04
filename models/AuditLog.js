const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    userEmail: {
        type: String,
        required: true
    },
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization'
    },
    action: {
        type: String,
        required: true,
        enum: [
            'CREATE',
            'UPDATE',
            'DELETE',
            'LOGIN',
            'LOGOUT',
            'VIEW',
            'EXPORT',
            'IMPORT',
            'RESTORE',
            'ARCHIVE'
        ]
    },
    resourceType: {
        type: String,
        required: true,
        enum: ['User', 'Organization', 'Group', 'Goal', 'GoalEntry', 'Role']
    },
    resourceId: {
        type: mongoose.Schema.Types.ObjectId
    },
    resourceName: {
        type: String
    },
    changes: {
        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed
    },
    description: {
        type: String,
        required: true
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILURE', 'PENDING'],
        default: 'SUCCESS'
    },
    errorMessage: {
        type: String
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Indexes for efficient querying
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ organization: 1, timestamp: -1 });

// Static method to create audit log
auditLogSchema.statics.log = async function (logData) {
    try {
        const log = new this(logData);
        await log.save();
        return log;
    } catch (error) {
        console.error('Error creating audit log:', error);
        // Don't throw error to prevent audit logging from breaking main functionality
        return null;
    }
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
