-- =============================================================================
-- Migration: 013_ownership_sharing  (UI12-10)
-- Description: Every patient and study belongs to the user who created it.
--   1. patients.owner_user_id — backfilled from the owner of the patient's
--      earliest study. Patients nobody owns (no owned studies) stay NULL and
--      are visible to no one until claimed/cleaned up.
--   2. study_shares — a study shared with another user, view or edit.
--      Removing a share (by either side) never touches the study itself.
-- Idempotent.
-- =============================================================================

BEGIN;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL;

UPDATE patients p
   SET owner_user_id = s.owner_user_id
  FROM (
        SELECT DISTINCT ON (patient_id) patient_id, owner_user_id
          FROM studies
         WHERE owner_user_id IS NOT NULL
         ORDER BY patient_id, acquisition_date NULLS LAST, id
       ) s
 WHERE p.id = s.patient_id
   AND p.owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_owner ON patients(owner_user_id);

CREATE TABLE IF NOT EXISTS study_shares (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id     TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  shared_by    TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  shared_with  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission   TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (study_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_study_shares_with  ON study_shares(shared_with);
CREATE INDEX IF NOT EXISTS idx_study_shares_study ON study_shares(study_id);

COMMIT;
