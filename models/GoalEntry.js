const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    name: String,
    designation: String,
    email: String,
    phone: String
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
    status: String,
    changedAt: {
        type: Date,
        default: Date.now
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { _id: false });

const goalEntrySchema = new mongoose.Schema({
    goal: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Goal',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
        required: true
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    status: {
        type: String,
        default: 'Initiated'
    },
    statusHistory: [statusHistorySchema],
    contacts: [contactSchema],
    remarks: {
        type: String
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

// Add to status history when status changes
goalEntrySchema.pre('save', function (next) {
    if (this.isModified('status')) {
        this.statusHistory.push({
            status: this.status,
            changedAt: new Date(),
            changedBy: this.user
        });
    }
    this.updatedAt = Date.now();
    next();
});

// Indexes for faster queries
goalEntrySchema.index({ goal: 1, user: 1 });
goalEntrySchema.index({ group: 1 });
goalEntrySchema.index({ status: 1 });

module.exports = mongoose.model('GoalEntry', goalEntrySchema);
