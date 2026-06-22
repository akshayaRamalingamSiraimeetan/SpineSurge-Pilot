-- =============================================================================
-- Migration: 009_context_current_image
-- Description: Adds current_image column to contexts table so the active
--              scan URL is persisted and restored when a study is reopened.
--              Without this, users see a blank canvas / import dialog when
--              they reopen a study that was previously in progress.
-- =============================================================================

BEGIN;

ALTER TABLE contexts
  ADD COLUMN IF NOT EXISTS current_image TEXT NULL;

COMMIT;
