const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
    name: String,
    earnedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const gamificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    points: {
        type: Number,
        default: 0
    },
    badges: [badgeSchema],
    weeklyRank: {
        type: Number,
        default: 0
    },
    monthlyRank: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Method to add points
gamificationSchema.methods.addPoints = function (points) {
    this.points += points;
    this.lastUpdated = Date.now();

    // Award badges based on points
    if (this.points >= 1000 && !this.badges.find(b => b.name === 'Bronze Star')) {
        this.badges.push({ name: 'Bronze Star' });
    }
    if (this.points >= 5000 && !this.badges.find(b => b.name === 'Silver Star')) {
        this.badges.push({ name: 'Silver Star' });
    }
    if (this.points >= 10000 && !this.badges.find(b => b.name === 'Gold Star')) {
        this.badges.push({ name: 'Gold Star' });
    }

    return this.save();
};

gamificationSchema.index({ points: -1 });

module.exports = mongoose.model('Gamification', gamificationSchema);
