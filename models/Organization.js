const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Organization name is required'],
        unique: true,
        trim: true,
        uppercase: true
    },
    code: {
        type: String,
        unique: true,
        trim: true,
        uppercase: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please provide a valid email']
    },
    website: {
        type: String,
        trim: true,
        match: [/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/, 'Please provide a valid website URL']
    },
    alias: {
        type: String,
        trim: true,
        uppercase: true
    },
    address: {
        street: {
            type: String,
            trim: true
        },
        city: {
            type: String,
            trim: true
        },
        state: {
            type: String,
            trim: true
        },
        country: {
            type: String,
            trim: true,
            default: 'India'
        },
        pincode: {
            type: String,
            trim: true
        }
    },
    logo: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    defaultPassword: {
        type: String,
        required: [true, 'Default password is required']
    },
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    departments: {
        type: [{
            type: String,
            trim: true,
            uppercase: true
        }],
        validate: {
            validator: function (v) {
                return v && v.length > 0;
            },
            message: 'At least one department is required'
        }
    },
    defaultDepartment: {
        type: String,
        trim: true,
        uppercase: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    deletedAt: {
        type: Date,
        default: null
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

// Auto-generate organization code before saving
organizationSchema.pre('save', async function (next) {
    this.updatedAt = Date.now();

    // Generate code only for new organizations
    if (this.isNew && !this.code) {
        try {
            // Find the highest code number
            const lastOrg = await this.constructor.findOne({}, { code: 1 })
                .sort({ code: -1 })
                .limit(1);

            let nextNumber = 1;
            if (lastOrg && lastOrg.code) {
                const match = lastOrg.code.match(/ORG-(\d+)/);
                if (match) {
                    nextNumber = parseInt(match[1]) + 1;
                }
            }

            this.code = `ORG-${String(nextNumber).padStart(3, '0')}`;
        } catch (error) {
            return next(error);
        }
    }

    next();
});

// Query helper to exclude soft-deleted organizations
organizationSchema.query.notDeleted = function () {
    return this.where({ deletedAt: null });
};

// Query helper to get only deleted organizations
organizationSchema.query.onlyDeleted = function () {
    return this.where({ deletedAt: { $ne: null } });
};

// Instance method for soft delete
organizationSchema.methods.softDelete = function () {
    this.deletedAt = Date.now();
    return this.save();
};

// Instance method to restore soft-deleted organization
organizationSchema.methods.restore = function () {
    this.deletedAt = null;
    return this.save();
};

// Indexes for faster queries
// Note: code, email, and name already have indexes via unique: true
organizationSchema.index({ status: 1 });     // Status filter
organizationSchema.index({ deletedAt: 1 });  // Soft delete queries
organizationSchema.index({ createdAt: -1 }); // Sort by creation date

// Compound indexes
organizationSchema.index({ status: 1, deletedAt: 1 }); // Active non-deleted orgs

module.exports = mongoose.model('Organization', organizationSchema);
