"""Organisation/admin routes for the Settings panels.

Everything is real and tenant-scoped: members come from memberships joined to the global users
table; usage stats are live row counts; the PACS panel reports the actually-configured Orthanc
connection from settings (no fabricated server list). Reads require any authenticated role; the
member list requires admin+ (it exposes other users in the org).
"""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.config import settings
from app.deps.auth import require_min_role
from app.deps.context import RequestContext, get_context
from app.models import Collection, Membership, Patient, Report, Study, User
from app.schemas.org import OrgMember, OrgStats, PacsConnection

router = APIRouter(prefix="/org", tags=["org"])


@router.get("/members", response_model=list[OrgMember],
            dependencies=[Depends(require_min_role("admin"))])
async def list_members(ctx: RequestContext = Depends(get_context)) -> list[OrgMember]:
    rows = (
        await ctx.session.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.org_id == ctx.user.org_id)
        )
    ).all()
    members = []
    for membership, user in rows:
        name = user.display_name or (user.email.split("@")[0] if user.email else "User")
        members.append(
            OrgMember(
                user_id=user.id,
                name=name,
                email=user.email,
                role=membership.role.capitalize(),
            )
        )
    return members


@router.get("/stats", response_model=OrgStats)
async def org_stats(ctx: RequestContext = Depends(get_context)) -> OrgStats:
    org_id = ctx.user.org_id

    async def _count(model, *extra) -> int:
        stmt = select(func.count()).select_from(model).where(model.org_id == org_id, *extra)
        return await ctx.session.scalar(stmt) or 0

    return OrgStats(
        patients=await _count(Patient, Patient.is_archived == False),  # noqa: E712
        studies=await _count(Study),
        reports=await _count(Report),
        collections=await _count(Collection),
    )


@router.get("/pacs", response_model=list[PacsConnection])
async def list_pacs(ctx: RequestContext = Depends(get_context)) -> list[PacsConnection]:
    """Report the configured Orthanc DICOMweb endpoint (the real PACS this org talks to).

    We deliberately do NOT invent a list of hospital PACS servers — only the connection the backend
    is actually wired to is shown, so the panel never misrepresents connectivity.
    """
    parsed = urlparse(settings.orthanc_url)
    host = parsed.hostname or settings.orthanc_url
    port = str(parsed.port) if parsed.port else ("443" if parsed.scheme == "https" else "80")
    return [
        PacsConnection(
            server="Orthanc (DICOMweb)",
            ae="ORTHANC",
            host=host,
            port=port,
            status="Configured" if settings.orthanc_url else "Not configured",
        )
    ]
