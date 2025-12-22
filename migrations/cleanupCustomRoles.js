const mongoose = require('mongoose');
require('dotenv').config();

const Role = require('../models/Role');

async function cleanupAllNonSystemRoles() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find all roles
        const allRoles = await Role.find();
        console.log(`\n📋 Total roles in database: ${allRoles.length}`);

        allRoles.forEach(role => {
            console.log(`   - ${role.name} (${role.label}) - System: ${role.isSystem}`);
        });

        // Find non-system roles (custom organization roles)
        const customRoles = await Role.find({ isSystem: false });

        if (customRoles.length === 0) {
            console.log('\n✅ No custom roles found.');
        } else {
            console.log(`\n⚠️  Found ${customRoles.length} custom (non-system) roles:`);
            customRoles.forEach(role => {
                console.log(`   - ${role.name} (${role.label}) - Org: ${role.organization}`);
            });

            // Delete custom roles
            console.log('\n🗑️  Deleting custom roles...');
            const result = await Role.deleteMany({ isSystem: false });
            console.log(`   ✓ Deleted ${result.deletedCount} custom roles`);
        }

        // Show final state
        const finalRoles = await Role.find();
        console.log(`\n✅ Final system roles (${finalRoles.length}):`);
        finalRoles.forEach(role => {
            console.log(`   - ${role.name} (${role.label})`);
        });

        console.log('\n✅ Cleanup complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    }
}

// Run the cleanup
cleanupAllNonSystemRoles();
