"""Auth tests that need no database.

Covers token mint/verify, the RBAC hierarchy, route rejection without a token, the dev-token
endpoint gating, and the /auth/me happy path (with the DB context dependency overridden).
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import jwt
import pytest
from fastapi.testclient import TestClient

from app.core import security
from app.core.config import settings
from app.deps.auth import ROLE_RANK, get_principal, require_min_role
from app.deps.context import RequestContext, get_context
from app.main import app
from app.schemas.auth import CurrentUser, Principal


@pytest.fixture(autouse=True)
def _dev_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_dev_mode", True)
    monkeypatch.setattr(settings, "auth_dev_secret", "test-secret-0123456789-abcdefghij-klmno")


def test_mint_and_verify_roundtrip() -> None:
    token = security.mint_dev_token(
        subject="u1", org_id="org-1", role="admin", email="a@b.com", org_name="Hosp"
    )
    claims = security.verify_token(token)
    assert claims["sub"] == "u1"
    assert claims[settings.oidc_org_claim] == "org-1"
    assert claims[settings.oidc_role_claim] == "admin"


def test_verify_rejects_garbage() -> None:
    with pytest.raises(security.AuthError):
        security.verify_token("not-a-token")


def test_verify_rejects_wrong_secret() -> None:
    bad = jwt.encode(
        {"sub": "u1", "org_id": "o"}, "wrong-secret-0123456789-abcdefghij-x", algorithm="HS256"
    )
    with pytest.raises(security.AuthError):
        security.verify_token(bad)


def test_role_hierarchy() -> None:
    assert ROLE_RANK["owner"] > ROLE_RANK["admin"] > ROLE_RANK["surgeon"] > ROLE_RANK["viewer"]


def test_require_min_role_allows_and_blocks() -> None:
    import asyncio

    from fastapi import HTTPException

    checker = require_min_role("admin")
    admin = Principal(subject="u", org_external="o", role="admin")
    viewer = Principal(subject="u", org_external="o", role="viewer")

    assert asyncio.run(checker(principal=admin)) is admin
    with pytest.raises(HTTPException) as exc:
        asyncio.run(checker(principal=viewer))
    assert exc.value.status_code == 403


def test_me_requires_token() -> None:
    client = TestClient(app)
    assert client.get("/api/v1/auth/me").status_code == 401


def test_dev_token_endpoint_and_me_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app)

    # Mint a token through the gated endpoint.
    resp = client.post("/api/v1/auth/dev-token", json={"subject": "u1", "org_id": "org-1"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]

    # Override the DB-backed context so the route runs without Postgres.
    fake_user = CurrentUser(
        user_id=uuid.uuid4(), org_id=uuid.uuid4(), role="surgeon", subject="u1", email="a@b.com"
    )

    def _fake_context() -> RequestContext:
        return RequestContext(session=MagicMock(), user=fake_user, ip="127.0.0.1")

    app.dependency_overrides[get_context] = _fake_context
    try:
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "surgeon"
        assert body["org_id"] == str(fake_user.org_id)
    finally:
        app.dependency_overrides.clear()


def test_dev_token_blocked_when_not_dev(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "auth_dev_mode", False)
    client = TestClient(app)
    assert client.post("/api/v1/auth/dev-token", json={}).status_code == 404


def test_get_principal_rejects_missing_org() -> None:
    import asyncio

    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    # Sign with the active dev secret so it passes signature check; it just lacks the org claim.
    token = jwt.encode({"sub": "u1"}, settings.auth_dev_secret, algorithm="HS256")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_principal(creds=creds))
    assert exc.value.status_code == 403
