-- orgs
CREATE TABLE IF NOT EXISTS "orgs" (
  "id"         TEXT        PRIMARY KEY,
  "name"       TEXT        NOT NULL,
  "slug"       TEXT        NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- users
CREATE TABLE IF NOT EXISTS "users" (
  "id"            TEXT        PRIMARY KEY,
  "org_id"        TEXT        NOT NULL REFERENCES "orgs"("id"),
  "email"         TEXT        NOT NULL UNIQUE,
  "password_hash" TEXT        NOT NULL,
  "full_name"     TEXT        NOT NULL,
  "role"          TEXT        NOT NULL CHECK ("role" IN ('admin','surgeon','viewer')),
  "is_active"     BOOLEAN     NOT NULL DEFAULT TRUE,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- audit_log
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id"          TEXT        PRIMARY KEY,
  "org_id"      TEXT        REFERENCES "orgs"("id"),
  "user_id"     TEXT        REFERENCES "users"("id"),
  "action"      TEXT        NOT NULL,
  "entity_type" TEXT,
  "entity_id"   TEXT,
  "metadata"    JSONB,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- indexes
CREATE INDEX IF NOT EXISTS "audit_log_org_id_idx"  ON "audit_log"("org_id");
CREATE INDEX IF NOT EXISTS "audit_log_user_id_idx" ON "audit_log"("user_id");
CREATE INDEX IF NOT EXISTS "audit_log_action_idx"  ON "audit_log"("action");
