const mongoose = require('mongoose');
require('dotenv').config();

const Role = require('../models/Role');
const User = require('../models/User');

async function removeObsoleteRoles() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find the roles to be removed
        const rolesToRemove = ['manager', 'sales'];
        const roles = await Role.find({ name: { $in: rolesToRemove } });

        if (roles.length === 0) {
            console.log('ℹ️  No obsolete roles found. Migration complete.');
            process.exit(0);
        }

        console.log(`📋 Found ${roles.length} roles to remove: ${roles.map(r => r.name).join(', ')}`);

        // Check if any users are assigned these roles
        const roleIds = roles.map(r => r._id);
        const usersWithObsoleteRoles = await User.find({ role: { $in: roleIds } })
            .populate('role');

        if (usersWithObsoleteRoles.length > 0) {
            console.log(`\n⚠️  WARNING: ${usersWithObsoleteRoles.length} users are assigned to these roles:`);
            usersWithObsoleteRoles.forEach(user => {
                console.log(`   - ${user.name} (${user.email}) - Role: ${user.role.name}`);
            });

            console.log('\n❌ Cannot remove roles while users are assigned to them.');
            console.log('   Please reassign these users to org_admin or super_admin first.');
            console.log('\n   You can do this by:');
            console.log('   1. Logging into the admin panel');
            console.log('   2. Going to User Management');
            console.log('   3. Editing each user and changing their role');
            process.exit(1);
        }

        // Remove the roles
        console.log('\n🗑️  Removing obsolete roles...');
        const result = await Role.deleteMany({ name: { $in: rolesToRemove } });
        console.log(`   ✓ Removed ${result.deletedCount} roles`);

        console.log('\n✅ Migration complete! Only super_admin and org_admin roles remain.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during migration:', error);
        process.exit(1);
    }
}

// Run the migration
removeObsoleteRoles();
