-- Additive migration on the existing Help Center D1 binding.
CREATE TABLE IF NOT EXISTS waitlist_entries (
  reference TEXT PRIMARY KEY,
  submission_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  business TEXT NOT NULL,
  location TEXT NOT NULL,
  phone TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('lite','teledelo','pro')),
  privacy_policy_url TEXT NOT NULL,
  contact_consent_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_review','closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS demo_requests (
  reference TEXT PRIMARY KEY,
  submission_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  business TEXT NOT NULL,
  demo_topic TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_review','closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS privacy_requests (
  reference TEXT PRIMARY KEY,
  submission_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('access','correct','delete','withdraw','other')),
  details TEXT,
  verification_started_at INTEGER NOT NULL,
  email_verified_at INTEGER,
  identity_verified_at INTEGER,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_review','fulfilled','closed_unverified')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  CHECK (status <> 'fulfilled' OR (email_verified_at IS NOT NULL AND identity_verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist_entries(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_status ON demo_requests(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_status ON privacy_requests(status,updated_at DESC);
CREATE TABLE IF NOT EXISTS intake_audit (
  reference TEXT NOT NULL,
  staff_email TEXT NOT NULL,
  action TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (reference,version)
);
CREATE INDEX IF NOT EXISTS idx_intake_audit_created ON intake_audit(created_at);
