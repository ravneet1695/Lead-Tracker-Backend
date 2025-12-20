require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const Goal = require('../models/Goal');
const GoalEntry = require('../models/GoalEntry');
const Gamification = require('../models/Gamification');

const seedData = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Clear existing data
        await User.deleteMany({});
        await Group.deleteMany({});
        await Goal.deleteMany({});
        await GoalEntry.deleteMany({});
        await Gamification.deleteMany({});
        console.log('🗑️  Cleared existing data');

        // Create Admin
        const admin = await User.create({
            name: 'Admin User',
            email: 'admin@system.com',
            password: 'Admin@123',
            role: 'admin'
        });
        await Gamification.create({ user: admin._id });
        console.log('✅ Created Admin user');

        // Create Managers
        const manager1 = await User.create({
            name: 'John Manager',
            email: 'john.manager@system.com',
            password: 'Manager@123',
            role: 'manager'
        });
        await Gamification.create({ user: manager1._id });

        const manager2 = await User.create({
            name: 'Sarah Manager',
            email: 'sarah.manager@system.com',
            password: 'Manager@123',
            role: 'manager'
        });
        await Gamification.create({ user: manager2._id });
        console.log('✅ Created 2 Managers');

        // Create Sales Users
        const salesUsers = [];
        for (let i = 1; i <= 10; i++) {
            const user = await User.create({
                name: `Sales User ${i}`,
                email: `sales${i}@system.com`,
                password: 'Sales@123',
                role: 'sales'
            });
            await Gamification.create({ user: user._id });
            salesUsers.push(user);
        }
        console.log('✅ Created 10 Sales users');

        // Create Groups
        const groupA = await Group.create({
            name: 'Group A - Hospital Onboarding',
            description: 'Focus on onboarding new hospitals for RCM services',
            users: [salesUsers[0]._id, salesUsers[1]._id, salesUsers[2]._id, salesUsers[3]._id, salesUsers[4]._id, salesUsers[5]._id, salesUsers[6]._id, salesUsers[7]._id],
            managers: [manager1._id, manager2._id],
            createdBy: admin._id
        });

        const groupB = await Group.create({
            name: 'Group B - Feedback Collection',
            description: 'Collect feedback from existing clients',
            users: [salesUsers[2]._id, salesUsers[3]._id, salesUsers[4]._id, salesUsers[5]._id, salesUsers[6]._id, salesUsers[7]._id],
            managers: [manager1._id, manager2._id],
            createdBy: admin._id
        });

        // Update users with group assignments
        await User.updateMany(
            { _id: { $in: [salesUsers[0]._id, salesUsers[1]._id, salesUsers[2]._id, salesUsers[3]._id, salesUsers[4]._id, salesUsers[5]._id, salesUsers[6]._id, salesUsers[7]._id] } },
            { $addToSet: { groups: groupA._id } }
        );
        await User.updateMany(
            { _id: { $in: [salesUsers[2]._id, salesUsers[3]._id, salesUsers[4]._id, salesUsers[5]._id, salesUsers[6]._id, salesUsers[7]._id] } },
            { $addToSet: { groups: groupB._id } }
        );
        await User.updateMany(
            { _id: { $in: [manager1._id, manager2._id] } },
            { $addToSet: { groups: { $each: [groupA._id, groupB._id] } } }
        );
        console.log('✅ Created 2 Groups');

        // Create Goal 1: Hospital Onboarding
        const goal1 = await Goal.create({
            title: 'Onboarding Hospitals for RCM',
            description: 'Onboard new hospitals for Revenue Cycle Management services',
            target: 50,
            timeline: {
                startDate: new Date('2025-01-01'),
                endDate: new Date('2025-12-31')
            },
            groups: [groupA._id],
            formSchema: [
                { fieldName: 'serialNo', fieldType: 'autoNumber', alias: 'S.No', mandatory: true, order: 1 },
                { fieldName: 'hospitalName', fieldType: 'text', alias: 'Hospital Name', mandatory: true, order: 2 },
                { fieldName: 'city', fieldType: 'text', alias: 'City', mandatory: true, order: 3 },
                { fieldName: 'cghs', fieldType: 'number', alias: 'CGHS Volume', mandatory: false, order: 4 },
                { fieldName: 'echs', fieldType: 'number', alias: 'ECHS Volume', mandatory: false, order: 5 },
                { fieldName: 'capf', fieldType: 'number', alias: 'CAPF Volume', mandatory: false, order: 6 },
                { fieldName: 'totalVolume', fieldType: 'autoCalculate', alias: 'Total Est. Volume', calculation: 'cghs + echs + capf', order: 7 },
                { fieldName: 'contacts', fieldType: 'multiContact', alias: 'Contact Details', maxContacts: 5, order: 8 },
                { fieldName: 'status', fieldType: 'dropdown', alias: 'Status', mandatory: true, order: 9 },
                { fieldName: 'remarks', fieldType: 'textarea', alias: 'Remarks', mandatory: false, order: 10 }
            ],
            statusOptions: ['Initiated', 'Meeting', 'Presentation', 'Audit', 'Negotiation', 'Agreement', 'Drop', 'On Hold', 'Signed', 'Activated'],
            pointsConfig: {
                entryCreation: 10,
                statusUpdate: 5,
                fieldCompletion: 2
            },
            createdBy: admin._id,
            status: 'active'
        });
        console.log('✅ Created Goal 1: Hospital Onboarding');

        // Create Goal 2: Feedback Collection
        const goal2 = await Goal.create({
            title: 'Collect Client Feedback',
            description: 'Gather feedback from existing hospital clients',
            target: 30,
            timeline: {
                startDate: new Date('2025-01-01'),
                endDate: new Date('2025-06-30')
            },
            groups: [groupB._id],
            formSchema: [
                { fieldName: 'serialNo', fieldType: 'autoNumber', alias: 'S.No', mandatory: true, order: 1 },
                { fieldName: 'hospitalName', fieldType: 'text', alias: 'Hospital Name', mandatory: true, order: 2 },
                { fieldName: 'city', fieldType: 'text', alias: 'City', mandatory: true, order: 3 },
                { fieldName: 'cghs', fieldType: 'number', alias: 'CGHS Volume', mandatory: false, order: 4 },
                { fieldName: 'echs', fieldType: 'number', alias: 'ECHS Volume', mandatory: false, order: 5 },
                { fieldName: 'capf', fieldType: 'number', alias: 'CAPF Volume', mandatory: false, order: 6 },
                { fieldName: 'totalVolume', fieldType: 'autoCalculate', alias: 'Total Est. Volume', calculation: 'cghs + echs + capf', order: 7 },
                { fieldName: 'contacts', fieldType: 'multiContact', alias: 'Contact Details', maxContacts: 5, order: 8 },
                { fieldName: 'status', fieldType: 'dropdown', alias: 'Status', mandatory: true, order: 9 },
                { fieldName: 'remarks', fieldType: 'textarea', alias: 'Remarks', mandatory: false, order: 10 }
            ],
            statusOptions: ['Not Contacted', 'Contacted', 'Happy', 'Satisfied', 'Facing Issues', 'Will Renew', 'Will Stop'],
            pointsConfig: {
                entryCreation: 10,
                statusUpdate: 5,
                fieldCompletion: 2
            },
            createdBy: admin._id,
            status: 'active'
        });
        console.log('✅ Created Goal 2: Feedback Collection');

        // Create sample entries
        const sampleEntry1 = await GoalEntry.create({
            goal: goal1._id,
            user: salesUsers[0]._id,
            group: groupA._id,
            data: {
                serialNo: 1,
                hospitalName: 'Apollo Hospital',
                city: 'Delhi',
                cghs: 1000,
                echs: 500,
                capf: 300,
                totalVolume: 1800
            },
            status: 'Meeting',
            contacts: [
                { name: 'Dr. Sharma', designation: 'Director', email: 'sharma@apollo.com', phone: '9876543210' }
            ],
            remarks: 'Initial meeting scheduled for next week'
        });

        const sampleEntry2 = await GoalEntry.create({
            goal: goal2._id,
            user: salesUsers[2]._id,
            group: groupB._id,
            data: {
                serialNo: 1,
                hospitalName: 'Fortis Hospital',
                city: 'Mumbai',
                cghs: 800,
                echs: 400,
                capf: 200,
                totalVolume: 1400
            },
            status: 'Happy',
            contacts: [
                { name: 'Dr. Patel', designation: 'CEO', email: 'patel@fortis.com', phone: '9876543211' }
            ],
            remarks: 'Very satisfied with our services'
        });

        console.log('✅ Created sample goal entries');

        console.log('\n🎉 Seed data created successfully!');
        console.log('\n📝 Login Credentials:');
        console.log('Admin: admin@system.com / Admin@123');
        console.log('Manager: john.manager@system.com / Manager@123');
        console.log('Sales: sales1@system.com / Sales@123');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding data:', error);
        process.exit(1);
    }
};

seedData();
