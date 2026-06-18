-- =============================================================================
-- Migration: 004_multi_org_workspace
-- Description: Adds multi-organization membership support.
--              Users can now belong to multiple organizations.
--              Introduces the organization_memberships join table.
--              Active workspace selection is frontend-only (Zustand + localStorage).
--              No active_org_id column needed in the database.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Lock affected tables to prevent write conflicts during ALTER TABLE ops.
-- ---------------------------------------------------------------------------
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 1. Add created_by to orgs so we can return "created organizations" list.
--    This records which user originally created each org.
-- ---------------------------------------------------------------------------
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS created_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Create organization_memberships join table.
--    A user can have multiple rows — one per org they belong to.
--    This replaces the single users.org_id relationship for multi-org support
--    while keeping users.org_id for backward compatibility.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_memberships (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     TEXT        NOT NULL REFERENCES orgs(id)  ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'viewer',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org_id  ON organization_memberships(org_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill organization_memberships from existing users.org_id data.
--    Any user who already has an orgId gets a membership row inserted.
--    Role defaults to 'viewer'; if they created the org they get 'admin'.
-- ---------------------------------------------------------------------------
INSERT INTO organization_memberships (user_id, org_id, role)
SELECT
  u.id           AS user_id,
  u.org_id       AS org_id,
  u.role         AS role
FROM users u
WHERE u.org_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Backfill orgs.created_by from existing membership data where role=admin.
--    Only sets it if created_by is not already populated.
-- ---------------------------------------------------------------------------
UPDATE orgs o
SET created_by = (
  SELECT m.user_id
  FROM organization_memberships m
  WHERE m.org_id = o.id AND m.role = 'admin'
  ORDER BY m.joined_at ASC
  LIMIT 1
)
WHERE o.created_by IS NULL;

COMMIT;
