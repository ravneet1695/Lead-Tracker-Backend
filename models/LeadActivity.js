const mongoose = require('mongoose');

const leadActivitySchema = new mongoose.Schema({
    lead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GoalEntry',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Indexes for faster queries
leadActivitySchema.index({ lead: 1, timestamp: -1 });
leadActivitySchema.index({ user: 1, timestamp: -1 });

module.exports = mongoose.model('LeadActivity', leadActivitySchema);
