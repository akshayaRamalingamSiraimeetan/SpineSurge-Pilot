"""Context routes — list (hydrated) for a patient, and save (upsert/diff)."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status

from app.core.audit import record_audit
from app.deps.auth import require_min_role
from app.deps.context import RequestContext, get_context
from app.schemas.contexts import ContextSave
from app.services.contexts import hydrate_contexts, save_context

router = APIRouter(prefix="/contexts", tags=["contexts"])


@router.get("")
async def list_contexts(
    patient_id: uuid.UUID = Query(..., alias="patientId"),
    ctx: RequestContext = Depends(get_context),
) -> list[dict[str, Any]]:
    return await hydrate_contexts(ctx.session, patient_id)


@router.post("", status_code=status.HTTP_200_OK,
             dependencies=[Depends(require_min_role("surgeon"))])
async def save(
    body: ContextSave, ctx: RequestContext = Depends(get_context)
) -> dict[str, Any]:
    context = await save_context(ctx.session, ctx.user, body)
    await ctx.session.flush()
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="context.save", entity_type="context", entity_id=context.id, ip=ctx.ip,
    )
    return {"success": True, "id": str(context.id)}
