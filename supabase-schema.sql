-- Run this in your Supabase SQL Editor

-- Inboxes table
CREATE TABLE inboxes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inbox_id UUID REFERENCES inboxes(id) ON DELETE CASCADE,
  from_address TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  otp_code TEXT,
  links TEXT[],
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX idx_inboxes_email ON inboxes(email);
CREATE INDEX idx_messages_inbox_id ON messages(inbox_id);
CREATE INDEX idx_inboxes_expires_at ON inboxes(expires_at);
