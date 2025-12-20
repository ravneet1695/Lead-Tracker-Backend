const mongoose = require('mongoose');

const leadStatusSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    color: {
        type: String,
        default: '#667eea'
    },
    order: {
        type: Number,
        default: 0
    },
    isDefault: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const customFieldSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'number', 'date', 'dropdown', 'checkbox'],
        default: 'text'
    },
    required: {
        type: Boolean,
        default: false
    },
    options: [{
        type: String
    }]
}, { _id: false });

const masterConfigSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        unique: true
    },
    leadSources: [{
        type: String,
        trim: true
    }],
    leadStatuses: [leadStatusSchema],
    productCategories: [{
        type: String,
        trim: true
    }],
    customFields: [customFieldSchema],
    tags: [{
        type: String,
        trim: true
    }],
    settings: {
        businessHours: {
            start: {
                type: String,
                default: '09:00'
            },
            end: {
                type: String,
                default: '18:00'
            }
        },
        notifications: {
            email: {
                type: Boolean,
                default: true
            },
            sms: {
                type: Boolean,
                default: false
            }
        }
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
masterConfigSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('MasterConfig', masterConfigSchema);
