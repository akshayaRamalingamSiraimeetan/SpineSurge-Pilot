from __future__ import annotations

from fastapi.testclient import TestClient


def test_healthz_liveness(client: TestClient) -> None:
    resp = client.get("/api/v1/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_openapi_served(client: TestClient) -> None:
    resp = client.get("/api/v1/openapi.json")
    assert resp.status_code == 200
    assert resp.json()["info"]["title"] == "SpineSurge Pro API"
