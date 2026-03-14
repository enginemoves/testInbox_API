const express = require('express');
const router = express.Router();
const controller = require('../controllers/emailController');

// Create inbox
router.post('/', controller.createInbox);

// Poll inbox for new emails
router.get('/:email/poll', controller.pollInbox);

// Get all emails in inbox
router.get('/:email', controller.getEmails);

// Get specific email
router.get('/:email/:messageId', controller.getMessage);

// Delete inbox
router.delete('/:email', controller.deleteInbox);

module.exports = router;
