-- =============================================================================
-- Migration: 003_orgs_organization_email
-- Description: Adds organization_email column to the orgs table.
--              Required by onboarding flow: Create Organization page collects
--              both Organization Name and Organization Email, both of which
--              must be stored.
-- Safe for existing databases: uses ADD COLUMN IF NOT EXISTS, backfills
-- existing rows before applying NOT NULL + UNIQUE constraints.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Lock orgs table to prevent write conflicts during ALTER TABLE operations.
-- SHARE ROW EXCLUSIVE MODE blocks concurrent INSERT/UPDATE/DELETE while
-- allowing reads, ensuring a clean schema change.
-- ---------------------------------------------------------------------------
LOCK TABLE orgs IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- Step 1: Add organization_email as nullable.
--         This is safe for existing rows — they receive NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS organization_email TEXT NULL;

-- ---------------------------------------------------------------------------
-- Step 2: Backfill existing organizations.
--         Existing orgs get a placeholder derived from their slug so that
--         the NOT NULL constraint can be applied without breaking them.
--         Format: noreply+<slug>@placeholder.invalid
--         The .invalid TLD is reserved (RFC 2606) and will never resolve,
--         making it clearly synthetic while remaining parseable as an email.
-- ---------------------------------------------------------------------------
UPDATE orgs
   SET organization_email = 'noreply+' || slug || '@placeholder.invalid'
 WHERE organization_email IS NULL;

-- ---------------------------------------------------------------------------
-- Step 3: Add a unique index on organization_email before making it NOT NULL.
--         Using CREATE UNIQUE INDEX IF NOT EXISTS so this step is idempotent.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_organization_email
    ON orgs(organization_email);

-- ---------------------------------------------------------------------------
-- Step 4: Enforce NOT NULL now that every row has a value.
-- ---------------------------------------------------------------------------
ALTER TABLE orgs
  ALTER COLUMN organization_email SET NOT NULL;

COMMIT;
