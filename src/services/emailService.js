const supabase = require('../db/supabase');
const redis = require('../db/redis');
const { parseEmail } = require('./parserService');

const DEFAULT_TTL_HOURS = 2;
const MAX_TTL_HOURS = 10;
const DOMAIN = process.env.DOMAIN || 'testinbox.icu';

// Create or return existing inbox
async function createInbox(email, ttlHours = DEFAULT_TTL_HOURS) {
  // Validate email domain
  if (!email.endsWith(`@${DOMAIN}`)) {
    throw new Error(`Email must use @${DOMAIN} domain`);
  }

  // Cap TTL at max
  const hours = Math.min(ttlHours, MAX_TTL_HOURS);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);

  // Check Redis cache first (faster than hitting DB)
  const cached = await redis.get(`inbox:${email}`);
  if (cached) {
    return {
      email: cached.email,
      inboxId: cached.id,
      timeToLive: `${hours} hour(s)`,
      expiresAt: cached.expires_at,
    };
  }

  // Check if inbox already exists in DB
  const { data: existing } = await supabase
    .from('inboxes')
    .select('*')
    .eq('email', email)
    .single();

  if (existing) {
    // Cache it in Redis
    await redis.set(`inbox:${email}`, existing, { ex: hours * 3600 });
    return {
      email: existing.email,
      inboxId: existing.id,
      timeToLive: `${hours} hour(s)`,
      expiresAt: existing.expires_at,
    };
  }

  // Create new inbox
  const { data, error } = await supabase
    .from('inboxes')
    .insert([{ email, expires_at: expiresAt.toISOString() }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Cache in Redis
  await redis.set(`inbox:${email}`, data, { ex: hours * 3600 });

  return {
    email: data.email,
    inboxId: data.id,
    timeToLive: `${hours} hour(s)`,
    expiresAt: data.expires_at,
  };
}

// Get all emails in an inbox
async function getEmails(email) {
  // Check inbox exists and not expired
  const { data: inbox, error: inboxError } = await supabase
    .from('inboxes')
    .select('*')
    .eq('email', email)
    .single();

  if (inboxError || !inbox) {
    throw new Error('Inbox not found');
  }

  if (new Date(inbox.expires_at) < new Date()) {
    throw new Error('Inbox has expired');
  }

  // Get messages
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('inbox_id', inbox.id)
    .order('received_at', { ascending: false });

  if (error) throw new Error(error.message);

  return {
    emailAddress: email,
    messages: messages.map(msg => ({
      id: msg.id,
      subject: msg.subject,
      from: msg.from_address,
      receivedAt: msg.received_at,
      body: msg.body,
      links: msg.links || [],
    })),
  };
}

// Get a specific email message
async function getMessage(email, messageId) {
  const { data: inbox } = await supabase
    .from('inboxes')
    .select('*')
    .eq('email', email)
    .single();

  if (!inbox) throw new Error('Inbox not found');

  const { data: message, error } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .eq('inbox_id', inbox.id)
    .single();

  if (error || !message) throw new Error('Message not found');

  return {
    id: message.id,
    subject: message.subject,
    from: message.from_address,
    body: message.body,
    code: message.otp_code,
    links: message.links || [],
    receivedAt: message.received_at,
  };
}

// Poll inbox - wait for new email (up to 30 seconds)
async function pollInbox(email, since) {
  const { data: inbox } = await supabase
    .from('inboxes')
    .select('*')
    .eq('email', email)
    .single();

  if (!inbox) throw new Error('Inbox not found');

  const sinceDate = since ? new Date(since) : new Date(Date.now() - 60000);

  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('inbox_id', inbox.id)
    .gt('received_at', sinceDate.toISOString())
    .order('received_at', { ascending: false });

  if (error) throw new Error(error.message);

  return {
    emailAddress: email,
    newMessages: messages.map(msg => ({
      id: msg.id,
      subject: msg.subject,
      from: msg.from_address,
      receivedAt: msg.received_at,
      code: msg.otp_code,
      links: msg.links || [],
    })),
  };
}

// Delete inbox and all its messages
async function deleteInbox(email) {
  const { data: inbox } = await supabase
    .from('inboxes')
    .select('*')
    .eq('email', email)
    .single();

  if (!inbox) throw new Error('Inbox not found');

  // Delete messages first
  await supabase
    .from('messages')
    .delete()
    .eq('inbox_id', inbox.id);

  // Delete inbox
  const { error } = await supabase
    .from('inboxes')
    .delete()
    .eq('id', inbox.id);

  if (error) throw new Error(error.message);

  return { status: 'success', message: 'Inbox deleted successfully' };
}

// Store incoming email from Cloudflare Worker
async function storeIncomingEmail({ to, from, subject, body }) {
  // Find inbox
  const { data: inbox } = await supabase
    .from('inboxes')
    .select('*')
    .eq('email', to)
    .single();

  if (!inbox) {
    console.log(`No inbox found for ${to} - ignoring email`);
    return null;
  }

  if (new Date(inbox.expires_at) < new Date()) {
    console.log(`Inbox ${to} has expired - ignoring email`);
    return null;
  }

  // Parse OTP and links
  const { otp, links } = parseEmail(body);

  // Store message
  const { data, error } = await supabase
    .from('messages')
    .insert([{
      inbox_id: inbox.id,
      from_address: from,
      subject: subject || '(no subject)',
      body: body || '',
      otp_code: otp,
      links: links,
      received_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Store latest message timestamp in Redis for fast polling
  await redis.set(`lastmail:${to}`, new Date().toISOString(), { ex: MAX_TTL_HOURS * 3600 });

  return data;
}

// Cleanup expired inboxes (run on cron)
async function cleanupExpired() {
  const now = new Date().toISOString();

  const { data: expired } = await supabase
    .from('inboxes')
    .select('id')
    .lt('expires_at', now);

  if (!expired || expired.length === 0) return;

  const ids = expired.map(i => i.id);

  await supabase.from('messages').delete().in('inbox_id', ids);
  await supabase.from('inboxes').delete().in('id', ids);

  console.log(`Cleaned up ${ids.length} expired inboxes`);
}

module.exports = {
  createInbox,
  getEmails,
  getMessage,
  pollInbox,
  deleteInbox,
  storeIncomingEmail,
  cleanupExpired,
};
