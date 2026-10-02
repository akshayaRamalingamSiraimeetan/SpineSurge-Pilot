-- =============================================================================
-- Migration: 011_schema_drift_fix
-- Description: Brings the database in line with server/schema.ts. These
--              schema changes were made in code without a migration:
--
--   1. reports.study_id / reports.version (comparison-report versioning).
--      Without them every POST /api/reports fails, leaving orphaned PDFs in
--      server/uploads and an empty reports table.
--   2. measurements.timestamp / implants.timestamp INTEGER -> BIGINT.
--      Date.now() (~1.78e12) overflows a 32-bit integer, so every context
--      save that contained a measurement or implant was rolled back.
--   3. users.full_name is nullable in the schema (set during profile
--      completion) but NOT NULL in 0001_pilot_tables.sql on fresh databases.
--
-- Idempotent: safe to run on databases that already have some of these.
-- =============================================================================

BEGIN;

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS study_id TEXT NULL REFERENCES studies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS version  INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_reports_study_id ON reports(study_id);

ALTER TABLE measurements ALTER COLUMN "timestamp" TYPE BIGINT;
ALTER TABLE implants     ALTER COLUMN "timestamp" TYPE BIGINT;

ALTER TABLE users ALTER COLUMN full_name DROP NOT NULL;

COMMIT;
