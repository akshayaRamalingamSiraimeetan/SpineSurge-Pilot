"""Authentication & RBAC dependencies (stateless — token only, no DB)."""

from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.security import AuthError, verify_token
from app.schemas.auth import Principal

_bearer = HTTPBearer(auto_error=False)

# Role hierarchy (higher index = more privilege).
ROLE_RANK: dict[str, int] = {"viewer": 0, "surgeon": 1, "admin": 2, "owner": 3}


async def get_principal(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> Principal:
    if creds is None or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        claims = verify_token(creds.credentials)
    except AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    subject = claims.get("sub")
    org_external = claims.get(settings.oidc_org_claim)
    if not subject:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing subject")
    if not org_external:
        # Org-scoped SaaS: a session must target one organization.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token has no active organization")

    role = claims.get(settings.oidc_role_claim, "viewer")
    if role not in ROLE_RANK:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Unknown role: {role}")

    return Principal(
        subject=str(subject),
        org_external=str(org_external),
        role=role,
        email=claims.get("email"),
        name=claims.get("name"),
        org_name=claims.get(settings.oidc_org_name_claim),
    )


def require_min_role(
    minimum: str,
) -> Callable[[Principal], Coroutine[Any, Any, Principal]]:
    """Dependency factory enforcing a minimum role (hierarchy-aware)."""
    threshold = ROLE_RANK[minimum]

    async def _checker(principal: Principal = Depends(get_principal)) -> Principal:
        if ROLE_RANK[principal.role] < threshold:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Requires role '{minimum}' or higher",
            )
        return principal

    return _checker
