const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Role name is required'],
        trim: true,
        lowercase: true
    },
    label: {
        type: String,
        required: [true, 'Role label is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    permissions: [{
        type: String,
        trim: true
    }],
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: function () {
            // Only required for custom (non-system) roles
            return !this.isSystem;
        }
    },
    isSystem: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
roleSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Prevent deletion of system roles
roleSchema.methods.canDelete = function () {
    return !this.isSystem;
};

// Indexes for faster queries
roleSchema.index({ organization: 1 });   // Filter by organization
roleSchema.index({ isSystem: 1 });       // Filter system vs custom roles
roleSchema.index({ isActive: 1 });       // Filter active roles
roleSchema.index({ createdAt: -1 });     // Sort by creation date

// Compound indexes for common query patterns
roleSchema.index({ organization: 1, isActive: 1 }); // Active roles per org
roleSchema.index({ isSystem: 1, isActive: 1 });     // Active system roles

// Unique constraint: System roles must have globally unique names
roleSchema.index(
    { name: 1 },
    {
        unique: true,
        partialFilterExpression: { isSystem: true },
        name: 'unique_system_role_name'
    }
);

// Unique constraint: Custom roles must have unique names within their organization
roleSchema.index(
    { name: 1, organization: 1 },
    {
        unique: true,
        partialFilterExpression: { isSystem: false },
        name: 'unique_custom_role_per_org'
    }
);

module.exports = mongoose.model('Role', roleSchema);
