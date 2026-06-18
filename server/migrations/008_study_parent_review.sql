-- =============================================================================
-- Migration: 008_study_parent_review
-- Description: Adds parent_study_id to studies to support admin review copies.
--
-- Original study: parent_study_id = NULL
-- Admin review:   parent_study_id = original study id
--
-- This allows admins to create their own measurement/annotation copy of a
-- member's study without touching the member's original data.
-- =============================================================================

BEGIN;

ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS parent_study_id TEXT NULL
    REFERENCES studies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_studies_parent_study_id
  ON studies(parent_study_id);

COMMIT;
