const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// Load location data from JSON file
const locationsPath = path.join(__dirname, '../data/locations.json');
let locationData = {};

try {
    const data = fs.readFileSync(locationsPath, 'utf8');
    locationData = JSON.parse(data);
} catch (error) {
    console.error('Error loading location data:', error);
}

// @route   GET /api/locations/states
// @desc    Get all states
// @access  Private
router.get('/states', requireAuth, async (req, res) => {
    try {
        const states = Object.keys(locationData);
        res.json({
            success: true,
            states
        });
    } catch (error) {
        console.error('Error fetching states:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching states'
        });
    }
});

// @route   GET /api/locations/cities/:state
// @desc    Get cities for a specific state
// @access  Private
router.get('/cities/:state', requireAuth, async (req, res) => {
    try {
        const { state } = req.params;

        if (!locationData[state]) {
            return res.status(404).json({
                success: false,
                message: 'State not found'
            });
        }

        const cities = Object.keys(locationData[state]);
        res.json({
            success: true,
            cities
        });
    } catch (error) {
        console.error('Error fetching cities:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching cities'
        });
    }
});

// @route   GET /api/locations/pincodes/:state/:city
// @desc    Get pincodes for a specific city in a state
// @access  Private
router.get('/pincodes/:state/:city', requireAuth, async (req, res) => {
    try {
        const { state, city } = req.params;

        if (!locationData[state]) {
            return res.status(404).json({
                success: false,
                message: 'State not found'
            });
        }

        if (!locationData[state][city]) {
            return res.status(404).json({
                success: false,
                message: 'City not found'
            });
        }

        const pincodes = locationData[state][city];
        res.json({
            success: true,
            pincodes
        });
    } catch (error) {
        console.error('Error fetching pincodes:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching pincodes'
        });
    }
});

// @route   GET /api/locations/all
// @desc    Get all location data
// @access  Private
router.get('/all', requireAuth, async (req, res) => {
    try {
        res.json({
            success: true,
            data: locationData
        });
    } catch (error) {
        console.error('Error fetching location data:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching location data'
        });
    }
});

module.exports = router;
