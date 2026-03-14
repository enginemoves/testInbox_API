require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const emailRoutes = require('./routes/emails');
const rateLimiter = require('./middleware/rateLimiter');
const { receiveEmail } = require('./controllers/emailController');
const { cleanupExpired } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(rateLimiter);

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'TestInbox API',
    status: 'running',
    version: '1.0.0',
    domain: process.env.DOMAIN || 'testinbox.icu',
  });
});

// Email routes
app.use('/emails', emailRoutes);

// Webhook - receives emails from Cloudflare Worker
app.post('/webhook', receiveEmail);

// Cleanup expired inboxes every 30 minutes
cron.schedule('*/30 * * * *', () => {
  console.log('Running cleanup job...');
  cleanupExpired().catch(console.error);
});

// Start server
app.listen(PORT, () => {
  console.log(`TestInbox API running on port ${PORT}`);
  console.log(`Domain: ${process.env.DOMAIN || 'testinbox.icu'}`);
});

module.exports = app;
