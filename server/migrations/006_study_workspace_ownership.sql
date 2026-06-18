-- =============================================================================
-- Migration: 006_study_workspace_ownership
-- Description: Adds organization_id column to studies table.
--              Personal workspace studies: organization_id = NULL
--              Organization workspace studies: organization_id = org id
--              All downstream entities (scans, contexts, measurements, reports,
--              implants) derive workspace ownership through studies — no other
--              tables are modified.
-- =============================================================================

BEGIN;

LOCK TABLE studies IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- Add organization_id as nullable FK referencing orgs.id
-- Existing studies keep organization_id = NULL (personal workspace).
-- ---------------------------------------------------------------------------
ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS organization_id TEXT NULL
    REFERENCES orgs(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Index for fast workspace-scoped study queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_studies_org_id
  ON studies(organization_id);

-- Partial index for personal workspace queries (IS NULL)
CREATE INDEX IF NOT EXISTS idx_studies_personal
  ON studies(patient_id)
  WHERE organization_id IS NULL;

COMMIT;
