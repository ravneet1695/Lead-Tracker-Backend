const cron = require('node-cron');
const Goal = require('../models/Goal');

/**
 * Initializes a cron job that runs at the end of every day (23:59:59)
 * to mark expired goals as inactive.
 */
const initGoalExpiryJob = () => {
    // Run every day at 23:59:59
    // Cron format: minute hour day month day-of-week
    cron.schedule('59 59 23 * * *', async () => {
        console.log('--- Running Goal Expiry Cron Job ---');
        try {
            const currentDate = new Date();

            // Find all active goals with an end date
            const goals = await Goal.find({
                status: 'active',
                'timeline.endDate': { $exists: true }
            });

            console.log(`Checking ${goals.length} active goals for expiry...`);

            let expiredCount = 0;
            const updatePromises = goals.map(async (goal) => {
                // Since endDate is normalized to 23:59:59, 
                // we check if it's before the current moment.
                // Or simply check if currentMoment has passed the endDate.
                if (currentDate > goal.timeline.endDate) {
                    goal.status = 'inactive';
                    goal.isExpired = true;
                    await goal.save();
                    expiredCount++;
                    console.log(`Goal "${goal.title}" (${goal._id}) marked as EXPIRED.`);
                }
            });

            await Promise.all(updatePromises);
            console.log(`--- Goal Expiry Job Completed. ${expiredCount} goals expired. ---`);
        } catch (error) {
            console.error('Error in Goal Expiry Cron Job:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Setting to IST based on user's timezone if possible
    });
};

module.exports = initGoalExpiryJob;
