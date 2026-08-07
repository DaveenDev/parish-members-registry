-- Parish Members Online Registry — schema

CREATE TABLE IF NOT EXISTS admin_users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'Parish Secretary',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gkks (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS ministries (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS organizations (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS parish_settings (
  id      SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name    TEXT NOT NULL DEFAULT 'Our Lady of Guadalupe',
  address TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  email   TEXT NOT NULL DEFAULT '',
  logo    TEXT
);

CREATE TABLE IF NOT EXISTS households (
  id               SERIAL PRIMARY KEY,
  household_name   TEXT NOT NULL,
  street           TEXT NOT NULL,
  barangay         TEXT NOT NULL,
  city             TEXT NOT NULL,
  province         TEXT NOT NULL,
  zip              TEXT NOT NULL,
  contact          TEXT,
  email            TEXT,
  gkk              TEXT,
  family_grouping  TEXT,
  status           TEXT NOT NULL DEFAULT 'Pending', -- Pending | Verified
  volunteer        TEXT,                            -- Yes | Maybe | No
  notify_optin     BOOLEAN NOT NULL DEFAULT false,
  consent          BOOLEAN NOT NULL DEFAULT false,
  ref_no           TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id              SERIAL PRIMARY KEY,
  household_id    INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  middle_name     TEXT,
  last_name       TEXT NOT NULL,
  relationship    TEXT,
  sex             TEXT,
  dob             DATE,
  place_of_birth  TEXT,
  civil_status    TEXT,
  contact         TEXT,
  email           TEXT,
  occupation      TEXT,
  religion        TEXT DEFAULT 'Roman Catholic',
  blood_type      TEXT,

  has_baptism      BOOLEAN NOT NULL DEFAULT false,
  baptism_date     DATE,
  baptism_church   TEXT,

  has_communion    BOOLEAN NOT NULL DEFAULT false,
  communion_date   DATE,
  communion_church TEXT,

  has_confirmation BOOLEAN NOT NULL DEFAULT false,
  conf_date        DATE,
  conf_church      TEXT,
  conf_name        TEXT,
  conf_sponsor     TEXT,

  has_matrimony    BOOLEAN NOT NULL DEFAULT false,
  mat_date         DATE,
  mat_church       TEXT,
  mat_type         TEXT,

  ministries       TEXT[] NOT NULL DEFAULT '{}',
  organizations    TEXT[] NOT NULL DEFAULT '{}',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_household ON members(household_id);
CREATE INDEX IF NOT EXISTS idx_households_status ON households(status);
CREATE INDEX IF NOT EXISTS idx_households_gkk ON households(gkk);

-- Outbound email. One row, like parish_settings. The provider credential is
-- stored as AES-256-GCM ciphertext (see lib/crypto.js) and is never sent to
-- the browser — the admin UI only learns whether one is set.
CREATE TABLE IF NOT EXISTS email_settings (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  provider      TEXT NOT NULL DEFAULT 'brevo',
  api_key_enc   TEXT,
  sender_email  TEXT NOT NULL DEFAULT '',
  sender_name   TEXT NOT NULL DEFAULT '',
  reply_to      TEXT NOT NULL DEFAULT '',
  enabled       BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-use password reset tokens. Only the SHA-256 of the token is stored,
-- so a leaked database row cannot be replayed as a reset link.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);

-- Sessions are stateless JWTs, so a password change cannot revoke them on its
-- own. requireAuth rejects any token issued before this timestamp.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();
