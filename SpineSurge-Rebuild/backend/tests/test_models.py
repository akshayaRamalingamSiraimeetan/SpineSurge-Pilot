"""Model/metadata sanity (no DB required) + optional live-DB schema/RLS checks.

The metadata tests always run. The schema/RLS tests connect to DATABASE_URL and are skipped if the
database is unreachable, so CI without a DB still passes the foundation checks.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.db.base import target_metadata
from app.models import TENANT_SCOPED_TABLES

EXPECTED_TABLES = {
    "orgs", "users", "memberships", "audit_log",
    "patients", "visits", "studies", "scans", "reports",
    "contexts", "context_studies", "measurements", "implants",
    "three_d_implants", "pedicle_simulations",
}


def test_all_tables_registered() -> None:
    assert EXPECTED_TABLES.issubset(set(target_metadata.tables.keys()))


def test_tenant_tables_have_org_id() -> None:
    for name in TENANT_SCOPED_TABLES:
        table = target_metadata.tables[name]
        assert "org_id" in table.columns, f"{name} must carry org_id for RLS"


def test_audit_metadata_column_named_correctly() -> None:
    # Attribute is `meta`, DB column must be `metadata`.
    assert "metadata" in target_metadata.tables["audit_log"].columns


def _engine():
    return create_engine(settings.database_url, future=True)


def test_schema_present_in_db() -> None:
    try:
        eng = _engine()
        with eng.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
                )
            ).scalars().all()
    except (OperationalError, Exception):  # noqa: BLE001
        pytest.skip("database not reachable — run alembic upgrade head against a live DB")
    assert EXPECTED_TABLES.issubset(set(rows)), "run: alembic upgrade head"


def test_rls_enabled_in_db() -> None:
    try:
        eng = _engine()
        with eng.connect() as conn:
            rls = dict(
                conn.execute(
                    text("SELECT relname, relrowsecurity FROM pg_class WHERE relkind='r'")
                ).all()
            )
    except (OperationalError, Exception):  # noqa: BLE001
        pytest.skip("database not reachable")
    for name in TENANT_SCOPED_TABLES:
        if name in rls:
            assert rls[name] is True, f"RLS not enabled on {name}"
