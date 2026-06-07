"""Request-context dependency: an org-scoped DB session + resolved internal identity.

This is the dependency most routes use. It opens a transaction, JIT-resolves the identity and sets
`app.current_org` (so RLS is active), and yields both the session and the CurrentUser. The
transaction commits on success and rolls back on error. Because the scope is set LOCAL (per
transaction), it cannot leak to the next request that reuses a pooled connection.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import SessionFactory
from app.deps.auth import get_principal
from app.schemas.auth import CurrentUser, Principal
from app.services.identity import resolve_context


@dataclass
class RequestContext:
    session: AsyncSession
    user: CurrentUser
    ip: str | None = None


async def get_context(
    request: Request,
    principal: Principal = Depends(get_principal),
) -> AsyncGenerator[RequestContext, None]:
    async with SessionFactory() as session:
        try:
            async with session.begin():
                user = await resolve_context(session, principal)
                ip = request.client.host if request.client else None
                yield RequestContext(session=session, user=user, ip=ip)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR, "Request failed"
            ) from exc
