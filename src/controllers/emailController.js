const emailService = require('../services/emailService');

// POST /emails
async function createInbox(req, res) {
  try {
    const { email, timeToLive, includeBody } = req.body;

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email is required' });
    }

    const bodyPref = includeBody === false ? false : true;
    const result = await emailService.createInbox(email, timeToLive || 2, bodyPref);
    return res.status(201).json(result);

  } catch (error) {
    return res.status(400).json({ status: 'error', message: error.message });
  }
}

// GET /emails/:email?includeBody=false
async function getEmails(req, res) {
  try {
    const { email } = req.params;
    const includeBody = req.query.includeBody !== 'false';
    const result = await emailService.getEmails(email, includeBody);
    return res.status(200).json(result);

  } catch (error) {
    return res.status(404).json({ status: 'error', message: error.message });
  }
}

// GET /emails/:email/:messageId?includeBody=false
async function getMessage(req, res) {
  try {
    const { email, messageId } = req.params;
    const includeBody = req.query.includeBody !== 'false';
    const result = await emailService.getMessage(email, messageId, includeBody);
    return res.status(200).json(result);

  } catch (error) {
    return res.status(404).json({ status: 'error', message: error.message });
  }
}

// GET /emails/:email/poll
async function pollInbox(req, res) {
  try {
    const { email } = req.params;
    const { since } = req.query;
    const result = await emailService.pollInbox(email, since);
    return res.status(200).json(result);

  } catch (error) {
    return res.status(404).json({ status: 'error', message: error.message });
  }
}

// DELETE /emails/:email
async function deleteInbox(req, res) {
  try {
    const { email } = req.params;
    const result = await emailService.deleteInbox(email);
    return res.status(200).json(result);

  } catch (error) {
    return res.status(404).json({ status: 'error', message: error.message });
  }
}

// POST /webhook (called by Cloudflare Worker)
async function receiveEmail(req, res) {
  try {
    const secret = req.headers['x-webhook-secret'];

    if (secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const { to, from, subject, body } = req.body;

    if (!to || !from) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }

    const result = await emailService.storeIncomingEmail({ to, from, subject, body });
    return res.status(200).json({ status: 'success', messageId: result?.id });

  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
}

module.exports = {
  createInbox,
  getEmails,
  getMessage,
  pollInbox,
  deleteInbox,
  receiveEmail,
};
