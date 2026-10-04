-- =============================================================================
-- Migration: 015_usage_events  (MON-01)
-- Description: Activity log for the platform owner's live monitor (/platform):
--   what each user did (uploads, tools, plans, comparisons, reports, pages).
--   Written by the server on saves and by the client for UI actions.
-- Idempotent.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS usage_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  patient_id  TEXT NULL,
  study_id    TEXT NULL,
  context_id  TEXT NULL,
  detail      JSONB NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_created_idx ON usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_idx    ON usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_kind_idx    ON usage_events (kind);

COMMIT;
