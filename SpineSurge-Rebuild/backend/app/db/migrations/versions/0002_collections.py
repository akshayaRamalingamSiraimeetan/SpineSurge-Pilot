"""Library collections: collections + collection_studies (tenant-scoped, RLS).

Adds the two library tables and applies the same tenant-isolation RLS policy used by the baseline
(reads `app.current_org`; unscoped sessions see zero rows — default-deny).

Revision ID: 0002_collections
Revises: 0001_baseline
Create Date: 2026-06-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision = "0002_collections"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

_POLICY = "tenant_isolation"
_TABLES = ("collections", "collection_studies")


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", PGUUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"),
                  primary_key=True),
        sa.Column("org_id", PGUUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("owner_user_id", PGUUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    )
    op.create_table(
        "collection_studies",
        sa.Column("collection_id", PGUUID(as_uuid=True),
                  sa.ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("study_id", PGUUID(as_uuid=True),
                  sa.ForeignKey("studies.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("org_id", PGUUID(as_uuid=True), sa.ForeignKey("orgs.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    )

    for table in _TABLES:
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
    for table in _TABLES:
        op.execute(f"DROP POLICY IF EXISTS {_POLICY} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("collection_studies")
    op.drop_table("collections")
