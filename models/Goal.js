const mongoose = require('mongoose');

const formFieldSchema = new mongoose.Schema({
    fieldName: {
        type: String,
        required: true
    },
    fieldType: {
        type: String,
        enum: ['text', 'number', 'date', 'dropdown', 'email', 'phone', 'multiContact', 'autoNumber', 'autoCalculate', 'textarea', 'formArray'],
        required: true
    },
    alias: {
        type: String,
        required: true
    },
    mandatory: {
        type: Boolean,
        default: false
    },
    options: [{
        type: String
    }],
    calculation: {
        type: String // For auto-calculate fields
    },
    maxContacts: {
        type: Number,
        default: 5 // For multiContact fields
    },
    order: {
        type: Number,
        default: 0
    },
    // FormArray specific fields
    isArrayField: {
        type: Boolean,
        default: false
    },
    displayMode: {
        type: String,
        enum: ['cards', 'table'],
        default: 'cards'
    },
    columnCount: {
        type: Number,
        min: 1,
        max: 10,
        default: 2
    },
    arrayFields: [{
        fieldName: String,
        fieldType: {
            type: String,
            enum: ['text', 'number', 'date', 'dropdown', 'email', 'phone', 'textarea']
        },
        alias: String,
        mandatory: {
            type: Boolean,
            default: false
        },
        options: [String],
        order: {
            type: Number,
            default: 0
        },
        columnIndex: {
            type: Number,
            default: 0
        },
        dependsOn: {
            fieldName: String,
            mappings: [{
                when: String,
                then: {
                    label: String,
                    options: [String],
                    defaultValue: mongoose.Schema.Types.Mixed,
                    show: {
                        type: Boolean,
                        default: true
                    }
                }
            }]
        }
    }],
    minInstances: {
        type: Number,
        default: 1
    },
    maxInstances: {
        type: Number,
        default: 10
    }
}, { _id: false });

const goalSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Goal title is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    timeline: {
        startDate: Date,
        endDate: Date
    },
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization is required']
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: [true, 'Group is required']
    },
    target: {
        type: Number,
        default: 0
    },
    formSchema: [formFieldSchema],
    statusOptions: [{
        type: String
    }],
    completionStatus: {
        type: String,
        default: 'Approved',
        // Status that indicates a lead counts toward goal achievement
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    isExpired: {
        type: Boolean,
        default: false
    },
    completedAt: {
        type: Date
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

goalSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('Goal', goalSchema);
