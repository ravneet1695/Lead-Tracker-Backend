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

            // Find all goals that are NOT manually inactivated
            const goals = await Goal.find({
                status: { $ne: 'inactive' }
            });

            console.log(`Checking ${goals.length} goals for status transitions...`);

            let updatedCount = 0;
            const updatePromises = goals.map(async (goal) => {
                const now = new Date();
                const startDate = goal.timeline?.startDate ? new Date(goal.timeline.startDate) : null;
                const endDate = goal.timeline?.endDate ? new Date(goal.timeline.endDate) : null;

                let newStatus = goal.status;
                let isExpired = goal.isExpired;

                if (endDate && now > endDate) {
                    newStatus = 'closed';
                    isExpired = true;
                } else if (startDate && now < startDate) {
                    newStatus = 'upcoming';
                    isExpired = false;
                } else {
                    newStatus = 'active';
                    isExpired = false;
                }

                if (newStatus !== goal.status || isExpired !== goal.isExpired) {
                    const oldStatus = goal.status;
                    goal.status = newStatus;
                    goal.isExpired = isExpired;
                    await goal.save();
                    updatedCount++;
                    console.log(`Goal "${goal.title}" (${goal._id}) transitioned: ${oldStatus.toUpperCase()} -> ${newStatus.toUpperCase()}.`);
                }
            });

            await Promise.all(updatePromises);
            console.log(`--- Goal Status Transition Job Completed. ${updatedCount} goals updated. ---`);
        } catch (error) {
            console.error('Error in Goal Expiry Cron Job:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Setting to IST based on user's timezone if possible
    });
};

module.exports = initGoalExpiryJob;
