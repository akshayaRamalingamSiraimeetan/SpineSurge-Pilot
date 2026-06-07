"""Token verification.

Production path: verify an RS256 JWT issued by the OIDC provider, using its published JWKS public
keys (signature + issuer + audience + expiry). The API never sees passwords and holds no signing
secret — it only validates.

Dev path (auth_dev_mode, never allowed in production): mint + verify HS256 tokens with a shared
secret so the app and frontend can run locally without standing up Keycloak/Clerk.
"""

from __future__ import annotations

import time
from functools import lru_cache

import jwt
from jwt import PyJWKClient

from app.core.config import settings


class AuthError(Exception):
    """Raised when a token is missing/invalid/expired. Mapped to HTTP 401 by the dependency."""


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    if not settings.oidc_jwks_url:
        raise AuthError("OIDC is not configured (OIDC_JWKS_URL missing)")
    # PyJWKClient caches keys and refreshes on unknown kid.
    return PyJWKClient(settings.oidc_jwks_url, cache_keys=True, lifespan=3600)


def verify_token(token: str) -> dict:
    """Return verified claims, or raise AuthError."""
    if settings.auth_dev_mode:
        try:
            return jwt.decode(
                token,
                settings.auth_dev_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except jwt.PyJWTError as exc:  # noqa: BLE001
            raise AuthError(f"invalid dev token: {exc}") from exc

    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=settings.oidc_algorithms,
            audience=settings.oidc_audience or None,
            issuer=settings.oidc_issuer or None,
            options={
                "require": ["exp"],
                "verify_aud": bool(settings.oidc_audience),
                "verify_iss": bool(settings.oidc_issuer),
            },
        )
    except jwt.PyJWTError as exc:  # noqa: BLE001
        raise AuthError(f"invalid token: {exc}") from exc


def mint_dev_token(
    *,
    subject: str,
    org_id: str,
    role: str = "surgeon",
    email: str | None = None,
    name: str | None = None,
    org_name: str | None = None,
    expires_in: int = 3600,
) -> str:
    """Mint a local HS256 token. Only meaningful when auth_dev_mode is on."""
    now = int(time.time())
    claims: dict[str, object] = {
        "sub": subject,
        settings.oidc_org_claim: org_id,
        settings.oidc_role_claim: role,
        "iat": now,
        "exp": now + expires_in,
    }
    if email:
        claims["email"] = email
    if name:
        claims["name"] = name
    if org_name:
        claims[settings.oidc_org_name_claim] = org_name
    return jwt.encode(claims, settings.auth_dev_secret, algorithm="HS256")
