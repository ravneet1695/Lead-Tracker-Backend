const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/goal_tracking', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const User = require('../models/User');
const Organization = require('../models/Organization');

async function migrateData() {
    try {
        console.log('🚀 Starting data migration...\n');

        // Step 1: Create default organization
        console.log('📦 Step 1: Creating default organization...');
        let defaultOrg = await Organization.findOne({ name: 'Default Organization' });

        if (!defaultOrg) {
            defaultOrg = await Organization.create({
                name: 'Default Organization',
                email: 'admin@defaultorg.com',
                phone: '000-000-0000',
                address: {
                    street: 'Default Street',
                    city: 'Default City',
                    state: 'Default State',
                    country: 'Default Country',
                    pincode: '000000'
                },
                description: 'Default organization created during migration',
                status: 'active'
            });
            console.log('✅ Default organization created:', defaultOrg.name);
        } else {
            console.log('ℹ️  Default organization already exists');
        }

        // Step 2: Update user roles from 'admin' to 'super_admin'
        console.log('\n👥 Step 2: Updating user roles...');
        const adminUsers = await User.find({ role: 'admin' });
        console.log(`Found ${adminUsers.length} admin users to migrate`);

        for (const user of adminUsers) {
            user.role = 'super_admin';
            await user.save({ validateBeforeSave: false });
            console.log(`✅ Updated ${user.email} to super_admin`);
        }

        // Step 3: Assign organization to users who don't have one
        console.log('\n🏢 Step 3: Assigning users to default organization...');
        const usersWithoutOrg = await User.find({
            organization: { $exists: false },
            role: { $ne: 'super_admin' }
        });
        console.log(`Found ${usersWithoutOrg.length} users without organization`);

        for (const user of usersWithoutOrg) {
            user.organization = defaultOrg._id;
            await user.save({ validateBeforeSave: false });
            console.log(`✅ Assigned ${user.email} to default organization`);
        }

        // Step 4: Set default organization admin
        console.log('\n👑 Step 4: Setting organization admin...');
        const orgAdmin = await User.findOne({
            role: 'org_admin',
            organization: defaultOrg._id
        });

        if (orgAdmin && !defaultOrg.admin) {
            defaultOrg.admin = orgAdmin._id;
            await defaultOrg.save();
            console.log(`✅ Set ${orgAdmin.email} as organization admin`);
        } else if (!defaultOrg.admin) {
            console.log('ℹ️  No org_admin found for default organization');
        }

        // Step 5: Verify migration
        console.log('\n🔍 Step 5: Verifying migration...');
        const userStats = await User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        console.log('\nUser Role Distribution:');
        userStats.forEach(stat => {
            console.log(`  ${stat._id}: ${stat.count}`);
        });

        const usersWithOrg = await User.countDocuments({
            organization: { $exists: true },
            role: { $ne: 'super_admin' }
        });
        const totalNonSuperAdmin = await User.countDocuments({
            role: { $ne: 'super_admin' }
        });

        console.log(`\nOrganization Assignment:`);
        console.log(`  Users with organization: ${usersWithOrg}/${totalNonSuperAdmin}`);

        if (usersWithOrg === totalNonSuperAdmin) {
            console.log('\n✅ Migration completed successfully!');
        } else {
            console.log('\n⚠️  Warning: Some users may not have organization assigned');
        }

        console.log('\n📊 Migration Summary:');
        console.log(`  - Default Organization ID: ${defaultOrg._id}`);
        console.log(`  - Super Admins: ${await User.countDocuments({ role: 'super_admin' })}`);
        console.log(`  - Org Admins: ${await User.countDocuments({ role: 'org_admin' })}`);
        console.log(`  - Managers: ${await User.countDocuments({ role: 'manager' })}`);
        console.log(`  - Sales: ${await User.countDocuments({ role: 'sales' })}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
    }
}

// Run migration
migrateData()
    .then(() => {
        console.log('\n✨ Migration script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration script failed:', error);
        process.exit(1);
    });
