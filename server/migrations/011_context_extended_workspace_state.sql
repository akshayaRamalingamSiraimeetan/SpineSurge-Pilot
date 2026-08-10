-- =============================================================================
-- Migration: 011_context_extended_workspace_state
-- Description: Adds columns to the contexts table to persist the full
--              workspace state that was previously dropped silently:
--
--   comparison_left     – Image A measurements/implants in Compare mode
--   comparison_right    – Image B measurements/implants in Compare mode
--   three_d_implants    – 3-D screw/rod placements (DICOM planning)
--   pedicle_simulations – Pedicle simulation landmarks and grading
--   viewport_state      – Canvas zoom/pan/rotation/brightness/contrast
--
-- All columns are nullable TEXT (JSON-serialised) so existing rows are
-- unaffected and no data migration is required.
-- =============================================================================

BEGIN;

ALTER TABLE contexts
  ADD COLUMN IF NOT EXISTS comparison_left      TEXT NULL,
  ADD COLUMN IF NOT EXISTS comparison_right     TEXT NULL,
  ADD COLUMN IF NOT EXISTS three_d_implants     TEXT NULL,
  ADD COLUMN IF NOT EXISTS pedicle_simulations  TEXT NULL,
  ADD COLUMN IF NOT EXISTS viewport_state       TEXT NULL;

COMMIT;
