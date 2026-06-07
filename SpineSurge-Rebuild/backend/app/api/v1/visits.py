"""Visit routes — upsert under a patient, delete."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.audit import record_audit
from app.deps.auth import require_min_role
from app.deps.context import RequestContext, get_context
from app.models import Patient, Visit
from app.schemas.clinical import VisitCreate, VisitOut

router = APIRouter(tags=["visits"])


@router.post(
    "/patients/{patient_id}/visits",
    response_model=VisitOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_min_role("surgeon"))],
)
async def upsert_visit(
    patient_id: uuid.UUID, body: VisitCreate, ctx: RequestContext = Depends(get_context)
) -> VisitOut:
    patient = await ctx.session.get(Patient, patient_id)
    if patient is None or patient.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")

    visit: Visit | None = None
    if body.id is not None:
        visit = await ctx.session.get(Visit, body.id)
        if visit is not None and visit.org_id != ctx.user.org_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    if visit is None:
        visit = Visit(org_id=ctx.user.org_id, patient_id=patient_id)
        if body.id is not None:
            visit.id = body.id
        ctx.session.add(visit)

    for key, value in body.model_dump(exclude={"id"}, exclude_unset=True).items():
        setattr(visit, key, value)
    await ctx.session.flush()
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="visit.upsert", entity_type="visit", entity_id=visit.id, ip=ctx.ip,
    )
    return VisitOut.model_validate(visit)


@router.delete("/visits/{visit_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_min_role("admin"))])
async def delete_visit(visit_id: uuid.UUID, ctx: RequestContext = Depends(get_context)) -> None:
    visit = await ctx.session.get(Visit, visit_id)
    if visit is None or visit.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    await ctx.session.delete(visit)
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="visit.delete", entity_type="visit", entity_id=visit_id, ip=ctx.ip,
    )
