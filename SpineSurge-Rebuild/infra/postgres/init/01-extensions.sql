-- Runs once on first Postgres init (Step 1).
-- pgcrypto provides gen_random_uuid() used as the default PK across the schema (see docs/data-model.md).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- citext lets us store emails case-insensitively (users.email).
CREATE EXTENSION IF NOT EXISTS citext;

-- Note: Alembic (Step 2) owns table creation and RLS policies. This file only ensures
-- the extensions those migrations rely on are present before they run.
