"""Baseline schema + Row-Level Security.

Creates every table from the SQLModel metadata, then enables and FORCEs RLS on each tenant-scoped
table with a tenant-isolation policy. The policy reads `app.current_org` (a per-session GUC set by
the request in Step 3). `current_setting(..., true)` returns NULL when unset, so an unscoped session
sees zero rows — default-deny.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-06-01
"""

from __future__ import annotations

from alembic import op

from app.db.base import target_metadata
from app.models import TENANT_SCOPED_TABLES

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

_POLICY = "tenant_isolation"


def upgrade() -> None:
    bind = op.get_bind()

    # Required extensions (also created by infra/postgres/init for docker; idempotent here for
    # non-docker databases).
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    # Create all tables defined on the SQLModel metadata.
    target_metadata.create_all(bind=bind)

    # Apply RLS to every tenant-scoped table.
    for table in TENANT_SCOPED_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {_POLICY} ON {table}
            USING (org_id = current_setting('app.current_org', true)::uuid)
            WITH CHECK (org_id = current_setting('app.current_org', true)::uuid)
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    for table in TENANT_SCOPED_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {_POLICY} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    target_metadata.drop_all(bind=bind)
