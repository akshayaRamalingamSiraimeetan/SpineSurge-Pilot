-- =============================================================================
-- Migration: 005_membership_status
-- Description: Adds membership status column to organization_memberships.
--              Supports: active, removed, blacklisted.
--              Removed/blacklisted users lose access to org workspace but
--              membership row is retained for audit/history purposes.
-- =============================================================================

BEGIN;

LOCK TABLE organization_memberships IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- Add status column (nullable first for safety, then backfill, then default)
-- ---------------------------------------------------------------------------
ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- ---------------------------------------------------------------------------
-- Add CHECK constraint
-- ---------------------------------------------------------------------------
ALTER TABLE organization_memberships
  DROP CONSTRAINT IF EXISTS chk_membership_status;

ALTER TABLE organization_memberships
  ADD CONSTRAINT chk_membership_status
  CHECK (status IN ('active', 'removed', 'blacklisted'));

-- ---------------------------------------------------------------------------
-- Index for fast lookup of active memberships per user
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_memberships_user_status
  ON organization_memberships(user_id, status);

CREATE INDEX IF NOT EXISTS idx_memberships_org_status
  ON organization_memberships(org_id, status);

COMMIT;
