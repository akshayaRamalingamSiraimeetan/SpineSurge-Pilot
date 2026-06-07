"""Reports: anchor to a patient + make the visit link optional.

A generated workspace report belongs to a patient and may not correspond to a recorded visit, so
`reports.patient_id` is added (nullable, FK → patients) and `reports.visit_id` is relaxed to
nullable (ON DELETE SET NULL). RLS is unchanged (org_id already present).

Revision ID: 0003_report_patient
Revises: 0002_collections
Create Date: 2026-06-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision = "0003_report_patient"
down_revision = "0002_collections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column("patient_id", PGUUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_reports_patient_id", "reports", "patients",
        ["patient_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index("ix_reports_patient_id", "reports", ["patient_id"])

    # Relax visit_id to nullable + SET NULL on delete.
    op.drop_constraint("reports_visit_id_fkey", "reports", type_="foreignkey")
    op.alter_column("reports", "visit_id", existing_type=PGUUID(as_uuid=True), nullable=True)
    op.create_foreign_key(
        "reports_visit_id_fkey", "reports", "visits",
        ["visit_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("reports_visit_id_fkey", "reports", type_="foreignkey")
    op.alter_column("reports", "visit_id", existing_type=PGUUID(as_uuid=True), nullable=False)
    op.create_foreign_key(
        "reports_visit_id_fkey", "reports", "visits",
        ["visit_id"], ["id"], ondelete="CASCADE",
    )
    op.drop_index("ix_reports_patient_id", table_name="reports")
    op.drop_constraint("fk_reports_patient_id", "reports", type_="foreignkey")
    op.drop_column("reports", "patient_id")
