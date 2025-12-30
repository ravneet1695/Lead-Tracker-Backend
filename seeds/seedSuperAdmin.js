require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Role = require('../models/Role');

async function seedSuperAdmin() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find or create Super Admin role
        let superAdminRole = await Role.findOne({ name: 'super_admin' });

        if (!superAdminRole) {
            console.log('🔧 Super Admin role not found. Creating it...');
            superAdminRole = await Role.create({
                name: 'super_admin',
                label: 'Super Admin',
                description: 'Full system access with all permissions',
                permissions: ['*'], // Wildcard for all permissions
                isSystem: true,
                isActive: true
            });
            console.log('✅ Super Admin role created');
        } else {
            console.log('✅ Super Admin role already exists');
        }

        // Check if Super Admin user already exists
        const existingSuperAdmin = await User.findOne({ role: superAdminRole._id });

        if (existingSuperAdmin) {
            console.log('ℹ️  Super Admin user already exists:');
            console.log(`   Email: ${existingSuperAdmin.email}`);
            console.log(`   Name: ${existingSuperAdmin.name}`);
            console.log('\n   To create a new Super Admin, please delete the existing one first.');
            process.exit(0);
        }

        // Create Super Admin user
        const superAdmin = await User.create({
            name: 'Super Admin',
            email: 'superadmin@system.com',
            mobile: 9999999999,
            password: 'SuperAdmin@123',
            role: superAdminRole._id,
            status: 'active'
        });

        console.log('\n✅ Super Admin user created successfully!');
        console.log('\n📝 Login Credentials:');
        console.log('   Email: superadmin@system.com');
        console.log('   Password: SuperAdmin@123');
        console.log(`   User Code: ${superAdmin.code}`);
        console.log('\n⚠️  Please change the password after first login!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding Super Admin:', error);
        process.exit(1);
    }
}

// Run the seed function
seedSuperAdmin();
