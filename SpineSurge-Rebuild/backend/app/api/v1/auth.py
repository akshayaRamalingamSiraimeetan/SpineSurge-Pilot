"""Auth routes.

  GET  /auth/me          — verified identity + active org/role (JIT-provisions on first call).
  POST /auth/dev-token   — mint a local HS256 token; 404 unless auth_dev_mode (never in prod).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.audit import record_audit
from app.core.config import settings
from app.core.security import mint_dev_token
from app.deps.context import RequestContext, get_context
from app.schemas.auth import DevTokenRequest, DevTokenResponse, Me

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=Me)
async def me(ctx: RequestContext = Depends(get_context)) -> Me:
    await record_audit(
        ctx.session,
        org_id=ctx.user.org_id,
        user_id=ctx.user.user_id,
        action="auth.me",
        ip=ctx.ip,
    )
    return Me(
        user_id=ctx.user.user_id,
        org_id=ctx.user.org_id,
        role=ctx.user.role,
        email=ctx.user.email,
    )


@router.post("/dev-token", response_model=DevTokenResponse)
async def dev_token(body: DevTokenRequest) -> DevTokenResponse:
    if not settings.auth_dev_mode:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    # `users.email` is globally unique, but identity is keyed on `subject`. Derive a per-subject
    # email when the caller doesn't supply one, so two distinct dev subjects never collide on the
    # unique constraint (the real UI always sends an explicit, user-entered email).
    email = body.email or f"{body.subject}@dev.local"
    token = mint_dev_token(
        subject=body.subject,
        org_id=body.org_id,
        role=body.role,
        email=email,
        org_name=body.org_name,
    )
    return DevTokenResponse(access_token=token)
