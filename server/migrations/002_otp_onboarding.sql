-- =============================================================================
-- Migration: 002_otp_onboarding
-- Description: Adds OTP email verification, profile completion, and invitation
--              tables/columns to support the OTP-based onboarding flow.
-- Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10,
--               13.11
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Lock users table to prevent write conflicts during ALTER TABLE operations.
-- SHARE ROW EXCLUSIVE MODE blocks concurrent INSERT/UPDATE/DELETE on users
-- while still allowing reads, ensuring a clean schema change.
-- (Requirement 13.11)
-- ---------------------------------------------------------------------------
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 1. Relax org_id constraint: users now exist before joining/creating an org.
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ALTER COLUMN org_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Add new onboarding columns to users.
--    All additions use ADD COLUMN IF NOT EXISTS and supply safe defaults so
--    existing rows are never left in an invalid state.
--    (Requirements 13.1 – 13.6)
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_email_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verified_at  TIMESTAMPTZ  NULL,
  ADD COLUMN IF NOT EXISTS profile_completed  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS designation        TEXT         NULL,
  ADD COLUMN IF NOT EXISTS country            TEXT         NULL,
  ADD COLUMN IF NOT EXISTS avatar_url         TEXT         NULL,
  ADD COLUMN IF NOT EXISTS full_name          TEXT         NULL;

-- ---------------------------------------------------------------------------
-- 3. OTP storage table.
--    Raw OTPs are never persisted; only SHA-256 hashes are stored.
--    (Requirement 13.7)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_otps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash   TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient look-up by user and for expiry sweeps.
-- (Requirement 13.8)
CREATE INDEX IF NOT EXISTS idx_otp_user_id    ON email_verification_otps(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at ON email_verification_otps(expires_at);

-- ---------------------------------------------------------------------------
-- 4. Organization invitations table.
--    (Requirement 13.9)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_invitations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         TEXT        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invited_email  TEXT        NOT NULL,
  role           TEXT        NOT NULL DEFAULT 'viewer',
  status         TEXT        NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at    TIMESTAMPTZ NULL
);

-- Indexes for pending-invitation look-up by email.
-- (Requirement 13.10)
CREATE INDEX IF NOT EXISTS idx_inv_email        ON org_invitations(invited_email);
CREATE INDEX IF NOT EXISTS idx_inv_email_status ON org_invitations(invited_email, status);

-- ---------------------------------------------------------------------------
-- 5. OTP attempt log table (brute-force protection).
--    Tracks per-user OTP submission attempts for the 5-failure / 15-minute
--    lockout check.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_attempt_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded    BOOLEAN     NOT NULL DEFAULT FALSE
);

-- Composite index supports the sliding-window count query efficiently.
CREATE INDEX IF NOT EXISTS idx_otp_attempts_user ON otp_attempt_log(user_id, attempted_at);

COMMIT;
