const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Role name is required'],
        unique: true,
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

// Indexes
roleSchema.index({ isActive: 1 });

module.exports = mongoose.model('Role', roleSchema);
