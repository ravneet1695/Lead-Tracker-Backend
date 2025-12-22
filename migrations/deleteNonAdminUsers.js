const mongoose = require('mongoose');
require('dotenv').config();

const Role = require('../models/Role');
const User = require('../models/User');

async function deleteNonAdminUsers() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find super_admin and org_admin roles
        const adminRoles = await Role.find({
            name: { $in: ['super_admin', 'org_admin'] }
        });

        if (adminRoles.length === 0) {
            console.log('❌ No admin roles found in the database!');
            process.exit(1);
        }

        const adminRoleIds = adminRoles.map(r => r._id);
        console.log(`📋 Found ${adminRoles.length} admin roles: ${adminRoles.map(r => r.name).join(', ')}`);

        // Find all users who are NOT super_admin or org_admin
        const usersToDelete = await User.find({
            role: { $nin: adminRoleIds }
        }).populate('role');

        if (usersToDelete.length === 0) {
            console.log('\n✅ No non-admin users found. All users are already super_admin or org_admin.');
            process.exit(0);
        }

        console.log(`\n⚠️  Found ${usersToDelete.length} non-admin users to delete:`);
        usersToDelete.forEach(user => {
            const roleName = user.role ? user.role.name : 'unknown';
            console.log(`   - ${user.name} (${user.email}) - Role: ${roleName}`);
        });

        // Delete the users
        console.log('\n🗑️  Deleting non-admin users...');
        const userIdsToDelete = usersToDelete.map(u => u._id);
        const result = await User.deleteMany({ _id: { $in: userIdsToDelete } });

        console.log(`   ✓ Deleted ${result.deletedCount} users`);

        // Show remaining users
        const remainingUsers = await User.find().populate('role');
        console.log(`\n✅ Remaining users (${remainingUsers.length}):`);
        remainingUsers.forEach(user => {
            const roleName = user.role ? user.role.name : 'unknown';
            console.log(`   - ${user.name} (${user.email}) - Role: ${roleName}`);
        });

        console.log('\n✅ Cleanup complete! Only super_admin and org_admin users remain.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    }
}

// Run the cleanup
deleteNonAdminUsers();
