const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    code: {
        type: String,
        required: [true, 'Group code is required'],
        trim: true,
        uppercase: true
    },
    name: {
        type: String,
        required: [true, 'Group name is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization is required']
    },
    users: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    managers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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

// Ensure unique group code within organization
groupSchema.index({ code: 1, organization: 1 }, { unique: true });

// Ensure unique group name within organization
groupSchema.index({ name: 1, organization: 1 }, { unique: true });

// Virtual for member count
groupSchema.virtual('memberCount').get(function () {
    return this.users.length;
});

// Update timestamp on save
groupSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Group', groupSchema);
