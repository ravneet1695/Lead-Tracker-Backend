const mongoose = require('mongoose');
const Role = require('../models/Role');
require('dotenv').config();

async function migrateRoleOrganizations() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Set organization to null for all system roles
        const systemRolesResult = await Role.updateMany(
            { isSystem: true },
            { $set: { organization: null } }
        );

        console.log(`\n✅ Migration Complete!`);
        console.log(`Updated ${systemRolesResult.modifiedCount} system roles (organization set to null)`);

        // Display all roles with their organization status
        const allRoles = await Role.find().populate('organization', 'name');
        console.log('\n📋 Current Roles:');
        allRoles.forEach(role => {
            const orgName = role.organization ? role.organization.name : 'Global (System)';
            console.log(`  - ${role.label} (${role.name}): ${orgName}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrateRoleOrganizations();
