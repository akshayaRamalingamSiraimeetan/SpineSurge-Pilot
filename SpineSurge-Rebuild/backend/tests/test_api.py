"""API surface tests (no database): route registration + auth gating."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_expected_routes_registered() -> None:
    paths = {route.path for route in app.routes}
    expected = {
        "/api/v1/patients",
        "/api/v1/patients/{patient_id}",
        "/api/v1/patients/{patient_id}/archive",
        "/api/v1/patients/{patient_id}/visits",
        "/api/v1/visits/{visit_id}",
        "/api/v1/studies",
        "/api/v1/contexts",
        "/api/v1/reports",
        "/api/v1/reports/{visit_id}",
    }
    assert expected.issubset(paths)


def test_list_patients_requires_auth() -> None:
    assert client.get("/api/v1/patients").status_code == 401


def test_create_patient_requires_auth() -> None:
    assert client.post("/api/v1/patients", json={"name": "x"}).status_code == 401


def test_list_contexts_requires_auth() -> None:
    r = client.get(f"/api/v1/contexts?patientId={uuid.uuid4()}")
    assert r.status_code == 401


def test_openapi_includes_resources() -> None:
    spec = client.get("/api/v1/openapi.json").json()
    assert "/api/v1/patients" in spec["paths"]
    assert "/api/v1/contexts" in spec["paths"]
