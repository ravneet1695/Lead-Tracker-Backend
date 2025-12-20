const express = require('express');
const router = express.Router();
const MasterConfig = require('../models/MasterConfig');
const { protect, requirePermissions } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLog');

// Get master configuration for organization
router.get('/', protect, async (req, res) => {
    try {
        let config = await MasterConfig.findOne({ organization: req.user.organization });

        // If no config exists, create default one
        if (!config) {
            config = await MasterConfig.create({
                organization: req.user.organization,
                leadSources: [],
                leadStatuses: [],
                productCategories: [],
                customFields: [],
                tags: [],
                settings: {
                    businessHours: {
                        start: '09:00',
                        end: '18:00'
                    },
                    notifications: {
                        email: true,
                        sms: false
                    }
                }
            });
        }

        res.status(200).json({
            success: true,
            config
        });
    } catch (error) {
        console.error('Error fetching master config:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching master configuration'
        });
    }
});

// Update master configuration
router.put('/', requirePermissions('master-config.update'), createAuditLog('UPDATE', 'MasterConfig'), async (req, res) => {
    try {
        const {
            leadSources,
            leadStatuses,
            productCategories,
            customFields,
            tags,
            settings
        } = req.body;

        let config = await MasterConfig.findOne({ organization: req.user.organization });

        if (!config) {
            // Create new config if doesn't exist
            config = await MasterConfig.create({
                organization: req.user.organization,
                leadSources: leadSources || [],
                leadStatuses: leadStatuses || [],
                productCategories: productCategories || [],
                customFields: customFields || [],
                tags: tags || [],
                settings: settings || {}
            });
        } else {
            // Update existing config
            if (leadSources !== undefined) config.leadSources = leadSources;
            if (leadStatuses !== undefined) config.leadStatuses = leadStatuses;
            if (productCategories !== undefined) config.productCategories = productCategories;
            if (customFields !== undefined) config.customFields = customFields;
            if (tags !== undefined) config.tags = tags;
            if (settings !== undefined) config.settings = { ...config.settings, ...settings };

            await config.save();
        }

        res.status(200).json({
            success: true,
            message: 'Master configuration updated successfully',
            config
        });
    } catch (error) {
        console.error('Error updating master config:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating master configuration'
        });
    }
});

// Seed default master data
router.post('/seed', requirePermissions('master-config.create'), createAuditLog('CREATE', 'MasterConfig'), async (req, res) => {
    try {
        // Check if config already exists
        let config = await MasterConfig.findOne({ organization: req.user.organization });

        if (config) {
            return res.status(400).json({
                success: false,
                message: 'Master configuration already exists for this organization'
            });
        }

        // Create default configuration
        config = await MasterConfig.create({
            organization: req.user.organization,
            leadSources: [
                'Website',
                'Referral',
                'Social Media',
                'Cold Call',
                'Email Campaign',
                'Trade Show',
                'Partner'
            ],
            leadStatuses: [
                { name: 'New', color: '#3b82f6', order: 1, isDefault: true },
                { name: 'Contacted', color: '#8b5cf6', order: 2, isDefault: false },
                { name: 'Qualified', color: '#10b981', order: 3, isDefault: false },
                { name: 'Proposal Sent', color: '#f59e0b', order: 4, isDefault: false },
                { name: 'Negotiation', color: '#ef4444', order: 5, isDefault: false },
                { name: 'Won', color: '#059669', order: 6, isDefault: false },
                { name: 'Lost', color: '#6b7280', order: 7, isDefault: false }
            ],
            productCategories: [
                'Software',
                'Hardware',
                'Services',
                'Consulting',
                'Training'
            ],
            customFields: [],
            tags: [
                'Hot Lead',
                'VIP',
                'Follow Up',
                'Demo Scheduled',
                'Contract Sent'
            ],
            settings: {
                businessHours: {
                    start: '09:00',
                    end: '18:00'
                },
                notifications: {
                    email: true,
                    sms: false
                }
            }
        });

        res.status(201).json({
            success: true,
            message: 'Default master configuration created successfully',
            config
        });
    } catch (error) {
        console.error('Error seeding master config:', error);
        res.status(500).json({
            success: false,
            message: 'Error seeding master configuration'
        });
    }
});

module.exports = router;
