"""Step 5 unit tests (no DICOM server / no S3 / no DB)."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.orthanc import orthanc
from app.services.storage import storage

client = TestClient(app)


def test_storage_key_is_tenant_prefixed() -> None:
    org = uuid.uuid4()
    key = storage.object_key(org, "scan.png", prefix="scans")
    assert key.startswith(f"org/{org}/scans/")
    assert key.endswith("scan.png")
    # Slashes in the filename are stripped, so a traversal attempt adds no path segments:
    # the key always has exactly org/<id>/<prefix>/<file> => 3 slashes.
    traversal = storage.object_key(org, "../../etc/passwd")
    assert traversal.count("/") == 3


def test_orthanc_url_building(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "orthanc_url", "http://orthanc:8042/")
    monkeypatch.setattr(settings, "orthanc_dicomweb_root", "/dicom-web/")
    assert orthanc._base == "http://orthanc:8042"
    assert orthanc._dicomweb == "http://orthanc:8042/dicom-web"


def test_dicom_routes_registered() -> None:
    paths = {r.path for r in app.routes}
    assert {
        "/api/v1/dicom/studies",
        "/api/v1/dicom/qido/studies",
        "/api/v1/dicom/wado",
        "/api/v1/studies/{study_id}/scans",
        "/api/v1/reports/upload",
    }.issubset(paths)


def test_wado_requires_auth() -> None:
    assert client.get("/api/v1/dicom/wado?studyUID=1.2.3").status_code == 401


def test_qido_requires_auth() -> None:
    assert client.get("/api/v1/dicom/qido/studies").status_code == 401
