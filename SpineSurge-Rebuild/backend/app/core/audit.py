"""Append-only audit logging for PHI access/mutation (HIPAA).

`meta` must never contain PHI — store ids and action names only. Writes use the same org-scoped
session, so the audit row inherits the tenant via RLS WITH CHECK.
"""

from __future__ import annotations

import ipaddress
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


def _coerce_inet(ip: str | None) -> str | None:
    """The `ip` column is Postgres INET. `request.client.host` can be a non-address string
    (Starlette's TestClient sends "testclient"; a proxy may pass a hostname), which would raise
    InvalidTextRepresentation and fail the whole request. Keep valid addresses; drop the rest."""
    if not ip:
        return None
    try:
        return str(ipaddress.ip_address(ip))
    except ValueError:
        return None


async def record_audit(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    ip: str | None = None,
    meta: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            org_id=org_id,
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            ip=_coerce_inet(ip),
            meta=meta,
        )
    )
