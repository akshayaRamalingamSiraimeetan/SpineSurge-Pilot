-- Migration 010: Study display name and workflow status
ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS name   TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Draft';

CREATE INDEX IF NOT EXISTS idx_studies_status ON studies(status);
