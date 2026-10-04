-- =============================================================================
-- Migration: 014_patient_workspace  (UI12-21)
-- Description: A patient belongs to the workspace it was created in
--   (NULL = personal, set = organization), like its studies. Backfilled from the
--   patient's earliest study; patients without studies stay personal.
-- Idempotent.
-- =============================================================================

BEGIN;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS organization_id TEXT NULL REFERENCES orgs(id) ON DELETE SET NULL;

UPDATE patients p
   SET organization_id = s.organization_id
  FROM (
        SELECT DISTINCT ON (patient_id) patient_id, organization_id
          FROM studies
         ORDER BY patient_id, acquisition_date NULLS LAST, id
       ) s
 WHERE p.id = s.patient_id
   AND p.organization_id IS NULL
   AND s.organization_id IS NOT NULL;

COMMIT;
