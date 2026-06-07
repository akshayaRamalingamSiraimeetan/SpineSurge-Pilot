"""End-to-end CRUD against a live database.

Skipped automatically when DATABASE_URL is unreachable (or tables are missing), so the suite still
passes on a machine without Postgres. To run it:  bring up Postgres, `alembic upgrade head`, then
`pytest tests/test_crud_integration.py`.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.main import app


def _db_ready() -> bool:
    try:
        eng = create_engine(settings.database_url, future=True)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1 FROM patients LIMIT 1"))
        return True
    except SQLAlchemyError:
        return False
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(not _db_ready(), reason="database not reachable / not migrated")


@pytest.fixture(autouse=True)
def _dev_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_dev_mode", True)
    monkeypatch.setattr(settings, "auth_dev_secret", "test-secret-0123456789-abcdefghij-klmno")


def _auth_headers(client: TestClient, org: str, role: str = "surgeon") -> dict[str, str]:
    token = client.post(
        "/api/v1/auth/dev-token",
        json={"subject": f"user-{uuid.uuid4()}", "org_id": org, "role": role},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_patient_lifecycle_and_tenant_isolation() -> None:
    client = TestClient(app)
    org_a = f"org-{uuid.uuid4()}"
    org_b = f"org-{uuid.uuid4()}"
    hdr_a = _auth_headers(client, org_a)
    hdr_b = _auth_headers(client, org_b)

    # Create a patient in org A.
    created = client.post("/api/v1/patients", json={"name": "Alpha", "gender": "M"}, headers=hdr_a)
    assert created.status_code == 201
    pid = created.json()["id"]

    # Org A sees it.
    listing_a = client.get("/api/v1/patients", headers=hdr_a).json()
    assert any(p["id"] == pid for p in listing_a["items"])

    # Org B must NOT see it (RLS tenant isolation).
    listing_b = client.get("/api/v1/patients", headers=hdr_b).json()
    assert all(p["id"] != pid for p in listing_b["items"])
    assert client.get(f"/api/v1/patients/{pid}", headers=hdr_b).status_code == 404

    # Save a context with a measurement, then verify upsert/diff on re-save.
    save = client.post(
        "/api/v1/contexts",
        json={
            "patient_id": pid,
            "mode": "plan",
            "name": "Plan 1",
            "state": {"measurements": [{"id": str(uuid.uuid4()), "toolKey": "cobb",
                                         "points": [], "result": {"value": 10}}]},
        },
        headers=hdr_a,
    )
    assert save.status_code == 200
    ctx_id = save.json()["id"]

    hydrated = client.get(f"/api/v1/contexts?patientId={pid}", headers=hdr_a).json()
    ctx = next(c for c in hydrated if c["id"] == ctx_id)
    assert len(ctx["measurements"]) == 1
    assert ctx["measurements"][0]["toolKey"] == "cobb"


def test_rbac_viewer_cannot_write() -> None:
    client = TestClient(app)
    org = f"org-{uuid.uuid4()}"
    hdr_viewer = _auth_headers(client, org, role="viewer")
    resp = client.post("/api/v1/patients", json={"name": "X"}, headers=hdr_viewer)
    assert resp.status_code == 403


def test_dashboard_feed_aggregates_real_data() -> None:
    client = TestClient(app)
    org = f"org-{uuid.uuid4()}"
    hdr = _auth_headers(client, org)

    # Patient with no DOB (drives the "Missing Information" task), a visit, and a study.
    pid = client.post(
        "/api/v1/patients", json={"name": "Dashboard Pt", "gender": "F"}, headers=hdr
    ).json()["id"]
    client.post(
        f"/api/v1/patients/{pid}/visits",
        json={"diagnosis": "Lumbar Degeneration", "date": "2024-01-10"},
        headers=hdr,
    )
    client.post(
        "/api/v1/studies",
        json={"patient_id": pid, "modality": "X-RAY", "acquisition_date": "Jan 10, 2024"},
        headers=hdr,
    )
    # A saved workspace → drives continue_working / unfinished.
    client.post(
        "/api/v1/contexts",
        json={"patient_id": pid, "mode": "plan", "name": "Pre-op", "state": {"measurements": []}},
        headers=hdr,
    )

    feed = client.get("/api/v1/dashboard", headers=hdr)
    assert feed.status_code == 200
    body = feed.json()

    # Recent studies carry the real patient + derived diagnosis + modality.
    assert any(
        s["name"] == "Dashboard Pt"
        and s["dx"] == "Lumbar Degeneration"
        and s["modality"] == "X-RAY"
        for s in body["recent_studies"]
    )
    # The saved context surfaces as the active workspace.
    assert body["continue_working"] is not None
    assert body["continue_working"]["name"] == "Dashboard Pt"
    assert any(u["name"] == "Dashboard Pt" for u in body["unfinished"])
    # The DOB-less patient produces a truthful task (never a fabricated one).
    assert any(t["group"] == "Missing Information" for t in body["tasks"])

    # Tenant isolation: another org sees an empty feed.
    other = _auth_headers(client, f"org-{uuid.uuid4()}")
    empty = client.get("/api/v1/dashboard", headers=other).json()
    assert empty["recent_studies"] == []
    assert empty["continue_working"] is None


def test_collection_lifecycle_and_isolation() -> None:
    client = TestClient(app)
    org = f"org-{uuid.uuid4()}"
    hdr = _auth_headers(client, org)

    pid = client.post(
        "/api/v1/patients", json={"name": "Coll Pt", "gender": "M", "age": 58}, headers=hdr
    ).json()["id"]
    sid = client.post(
        "/api/v1/studies", json={"patient_id": pid, "modality": "X-RAY"}, headers=hdr
    ).json()["id"]

    # Create a collection and add the study.
    created = client.post(
        "/api/v1/collections",
        json={"name": "PSO Cases", "description": "PSO", "is_private": True},
        headers=hdr,
    )
    assert created.status_code == 201
    cid = created.json()["id"]
    assert client.post(
        f"/api/v1/collections/{cid}/studies", json={"study_id": sid}, headers=hdr
    ).status_code == 201
    # Adding the same study twice is idempotent (no duplicate, no error).
    client.post(f"/api/v1/collections/{cid}/studies", json={"study_id": sid}, headers=hdr)

    listing = client.get("/api/v1/collections", headers=hdr).json()
    row = next(c for c in listing if c["id"] == cid)
    assert row["count"] == 1

    detail = client.get(f"/api/v1/collections/{cid}", headers=hdr).json()
    assert len(detail["studies"]) == 1
    assert detail["studies"][0]["patient"] == "Coll Pt"

    # Remove the study → count drops to 0.
    assert client.request(
        "DELETE", f"/api/v1/collections/{cid}/studies/{sid}", headers=hdr
    ).status_code == 204
    assert client.get(f"/api/v1/collections/{cid}", headers=hdr).json()["studies"] == []

    # Tenant isolation: another org cannot see or fetch the collection.
    other = _auth_headers(client, f"org-{uuid.uuid4()}")
    assert client.get("/api/v1/collections", headers=other).json() == []
    assert client.get(f"/api/v1/collections/{cid}", headers=other).status_code == 404

    # A viewer cannot create collections.
    viewer = _auth_headers(client, org, role="viewer")
    assert client.post("/api/v1/collections", json={"name": "X"}, headers=viewer).status_code == 403


def test_org_settings_endpoints() -> None:
    client = TestClient(app)
    org = f"org-{uuid.uuid4()}"
    hdr = _auth_headers(client, org, role="admin")

    # Seed one patient + study so stats are non-zero.
    pid = client.post("/api/v1/patients", json={"name": "Stat Pt"}, headers=hdr).json()["id"]
    client.post("/api/v1/studies", json={"patient_id": pid, "modality": "CT"}, headers=hdr)

    # Members: the admin themselves is a real member of this org.
    members = client.get("/api/v1/org/members", headers=hdr)
    assert members.status_code == 200
    assert any(m["role"] == "Admin" for m in members.json())

    # Stats: real counts.
    stats = client.get("/api/v1/org/stats", headers=hdr).json()
    assert stats["patients"] >= 1
    assert stats["studies"] >= 1

    # PACS: the single configured Orthanc connection (never a fabricated list).
    pacs = client.get("/api/v1/org/pacs", headers=hdr).json()
    assert len(pacs) == 1
    assert pacs[0]["ae"] == "ORTHANC"

    # Member list is admin-gated: a surgeon (non-admin) is forbidden.
    surgeon = _auth_headers(client, org, role="surgeon")
    assert client.get("/api/v1/org/members", headers=surgeon).status_code == 403
