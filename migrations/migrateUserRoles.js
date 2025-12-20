const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Role = require('../models/Role');

async function migrateUserRoles() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get all roles
        const roles = await Role.find();
        const roleMap = {};
        roles.forEach(role => {
            roleMap[role.name] = role._id;
        });

        console.log('📋 Found roles:', Object.keys(roleMap));

        // Get all users
        const users = await User.find();
        console.log(`\n🔄 Migrating ${users.length} users...`);

        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const user of users) {
            try {
                // Check if role is already an ObjectId
                if (user.role && mongoose.Types.ObjectId.isValid(user.role) && user.role.constructor.name === 'ObjectId') {
                    console.log(`   ⏭️  Skipped ${user.email} - already migrated`);
                    skippedCount++;
                    continue;
                }

                // Handle undefined or null roles - default to 'sales'
                let roleName = 'sales';
                if (user.role) {
                    roleName = user.role.toString().toLowerCase();
                } else {
                    console.log(`   ⚠️  ${user.email} has no role, defaulting to 'sales'`);
                }

                const roleId = roleMap[roleName];

                if (!roleId) {
                    console.log(`   ⚠️  Warning: No role '${roleName}' found for ${user.email}, defaulting to 'sales'`);
                    const salesRoleId = roleMap['sales'];
                    if (!salesRoleId) {
                        console.log(`   ❌ Error: Sales role not found!`);
                        errorCount++;
                        continue;
                    }
                    // Update user role to sales
                    await User.updateOne(
                        { _id: user._id },
                        { $set: { role: salesRoleId } }
                    );
                    console.log(`   ✓ Migrated ${user.email}: ${roleName} -> sales`);
                    migratedCount++;
                    continue;
                }

                // Update user role to ObjectId
                await User.updateOne(
                    { _id: user._id },
                    { $set: { role: roleId } }
                );

                console.log(`   ✓ Migrated ${user.email}: ${roleName} -> ${roleId}`);
                migratedCount++;
            } catch (error) {
                console.error(`   ❌ Error migrating ${user.email}:`, error.message);
                errorCount++;
            }
        }

        console.log('\n📊 Migration Summary:');
        console.log(`   ✅ Migrated: ${migratedCount}`);
        console.log(`   ⏭️  Skipped: ${skippedCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);
        console.log(`   📝 Total: ${users.length}`);

        if (errorCount > 0) {
            console.log('\n⚠️  Some users could not be migrated. Please review the errors above.');
        } else {
            console.log('\n✅ Migration completed successfully!');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    }
}

// Run the migration
migrateUserRoles();
