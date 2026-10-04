-- =============================================================================
-- Migration: 016_support_password_reset  (HELP-01, AUTH-01)
-- Description:
--   support_messages  — in-app help & feedback chat between each user and the
--                       platform team (one thread per user).
--   password_resets   — emailed 6-digit codes for "Forgot your password?".
--   users.password_changed_at — sessions issued before a reset stop working.
-- Idempotent.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS support_messages (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- whose conversation
  from_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  author_id   TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NULL,          -- question | stuck | bug | like | dislike | idea
  body        TEXT NOT NULL,
  page        TEXT NULL,
  context     JSONB NULL,         -- patient/study/session/tool the user was on
  read_at     TIMESTAMPTZ NULL,   -- read by the recipient
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_user_idx ON support_messages (user_id, created_at);
CREATE INDEX IF NOT EXISTS support_messages_unread_idx ON support_messages (from_admin, read_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NULL;

COMMIT;
