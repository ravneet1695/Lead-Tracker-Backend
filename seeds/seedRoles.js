const mongoose = require('mongoose');
require('dotenv').config();

const Role = require('../models/Role');

const defaultRoles = [
    {
        name: 'super_admin',
        label: 'Super Admin',
        description: 'Full system access with all permissions',
        permissions: ['*'], // Wildcard for all permissions
        isSystem: true,
        isActive: true
    },
    {
        name: 'org_admin',
        label: 'Organization Admin',
        description: 'Full access within organization scope',
        permissions: [
            'users.create',
            'users.read',
            'users.update',
            'users.delete',
            'groups.create',
            'groups.read',
            'groups.update',
            'groups.delete',
            'goals.create',
            'goals.read',
            'goals.update',
            'goals.delete',
            'reports.read',
            'dashboard.read'
        ],
        isSystem: true,
        isActive: true
    },
    {
        name: 'manager',
        label: 'Manager',
        description: 'Team management and reporting access',
        permissions: [
            'users.read',
            'groups.read',
            'goals.read',
            'goals.update',
            'goal-entries.create',
            'goal-entries.read',
            'goal-entries.update',
            'reports.read',
            'dashboard.read'
        ],
        isSystem: true,
        isActive: true
    },
    {
        name: 'sales',
        label: 'Sales',
        description: 'Basic sales user access',
        permissions: [
            'goals.read',
            'goal-entries.create',
            'goal-entries.read',
            'goal-entries.update',
            'dashboard.read'
        ],
        isSystem: true,
        isActive: true
    }
];

async function seedRoles() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Check if roles already exist
        const existingRoles = await Role.countDocuments();

        if (existingRoles > 0) {
            console.log(`ℹ️  ${existingRoles} roles already exist. Skipping seed.`);
            console.log('   To re-seed, please delete existing roles first.');
            process.exit(0);
        }

        // Create default roles
        console.log('🌱 Seeding default roles...');

        for (const roleData of defaultRoles) {
            const role = await Role.create(roleData);
            console.log(`   ✓ Created role: ${role.label} (${role.name})`);
        }

        console.log('✅ Default roles seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding roles:', error);
        process.exit(1);
    }
}

// Run the seed function
seedRoles();
