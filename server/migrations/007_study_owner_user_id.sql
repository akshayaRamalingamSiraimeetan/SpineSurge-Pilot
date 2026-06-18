-- =============================================================================
-- Migration: 007_study_owner_user_id
-- Description: Adds owner_user_id column to studies table.
--              Every study is owned by the user who created it.
--              Ownership NEVER changes.
--
-- Access rules enforced server-side:
--   Personal workspace  (organization_id IS NULL):
--     → show only studies WHERE owner_user_id = current_user
--
--   Organization workspace (organization_id = :orgId):
--     → member (viewer/surgeon): show only WHERE owner_user_id = current_user
--                                              AND organization_id = :orgId
--     → admin:                   show all WHERE organization_id = :orgId
--
-- Existing studies receive owner_user_id = NULL (pre-ownership era).
-- The server treats NULL owner as "visible to everyone" for backward compat.
-- =============================================================================

BEGIN;

LOCK TABLE studies IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT NULL
    REFERENCES users(id) ON DELETE SET NULL;

-- Index for fast per-user study lookups
CREATE INDEX IF NOT EXISTS idx_studies_owner_user_id
  ON studies(owner_user_id);

-- Composite index: org + owner (most common access pattern for members)
CREATE INDEX IF NOT EXISTS idx_studies_org_owner
  ON studies(organization_id, owner_user_id);

COMMIT;
