const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Role = require('../models/Role');

async function fixAdminRole() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get super_admin role
        const superAdminRole = await Role.findOne({ name: 'super_admin' });
        if (!superAdminRole) {
            console.log('❌ Super admin role not found!');
            process.exit(1);
        }

        // Update admin@system.com to super_admin
        const result = await User.updateOne(
            { email: 'admin@system.com' },
            { $set: { role: superAdminRole._id } }
        );

        if (result.modifiedCount > 0) {
            console.log('✅ Updated admin@system.com to super_admin role');
        } else {
            console.log('ℹ️  Admin user not found or already has super_admin role');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixAdminRole();
