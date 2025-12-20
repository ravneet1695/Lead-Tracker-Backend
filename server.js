require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/goal-entries', require('./routes/goalEntries'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/gamification', require('./routes/gamification'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/organizations', require('./routes/organizations'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/master-config', require('./routes/masterConfig'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Goal Tracking API is running',
        timestamp: new Date().toISOString()
    });
});

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
