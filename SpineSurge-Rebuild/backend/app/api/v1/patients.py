"""Patient routes — list (paginated/filtered), create, detail, update, archive.

All queries carry an explicit org filter in addition to RLS (defense-in-depth + index use).
Reads require any authenticated role; writes require surgeon+; archive requires admin+.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.core.audit import record_audit
from app.deps.auth import require_min_role
from app.deps.context import RequestContext, get_context
from app.models import Patient, Scan, Study, Visit
from app.schemas.clinical import (
    ArchiveRequest,
    PatientCreate,
    PatientDetail,
    PatientOut,
    PatientUpdate,
    ScanOut,
    StudyOut,
    VisitOut,
)
from app.schemas.common import Page
from app.services.storage import storage

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=Page[PatientOut])
async def list_patients(
    ctx: RequestContext = Depends(get_context),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    q: str | None = None,
    archived: bool = False,
) -> Page[PatientOut]:
    org_id = ctx.user.org_id
    stmt = select(Patient).where(Patient.org_id == org_id, Patient.is_archived == archived)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Patient.name.ilike(like), Patient.contact.ilike(like)))

    total = await ctx.session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await ctx.session.execute(
            stmt.order_by(Patient.last_visit.desc().nullslast())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).scalars().all()

    return Page(
        items=[PatientOut.model_validate(r) for r in rows],
        page=page,
        page_size=page_size,
        total=total or 0,
    )


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_min_role("surgeon"))])
async def create_patient(
    body: PatientCreate, ctx: RequestContext = Depends(get_context)
) -> PatientOut:
    patient = Patient(org_id=ctx.user.org_id, **body.model_dump())
    ctx.session.add(patient)
    await ctx.session.flush()
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="patient.create", entity_type="patient", entity_id=patient.id, ip=ctx.ip,
    )
    return PatientOut.model_validate(patient)


@router.get("/{patient_id}", response_model=PatientDetail)
async def get_patient(
    patient_id: uuid.UUID, ctx: RequestContext = Depends(get_context)
) -> PatientDetail:
    org_id = ctx.user.org_id
    patient = await ctx.session.get(Patient, patient_id)
    if patient is None or patient.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")

    visits = (
        await ctx.session.execute(
            select(Visit).where(Visit.patient_id == patient_id, Visit.org_id == org_id)
        )
    ).scalars().all()
    studies = (
        await ctx.session.execute(
            select(Study).where(Study.patient_id == patient_id, Study.org_id == org_id)
        )
    ).scalars().all()
    study_ids = [s.id for s in studies]
    scans_by_study: dict[uuid.UUID, list[ScanOut]] = {sid: [] for sid in study_ids}
    if study_ids:
        scans = (
            await ctx.session.execute(select(Scan).where(Scan.study_id.in_(study_ids)))
        ).scalars().all()
        for scan in scans:
            out = ScanOut.model_validate(scan)
            if scan.storage_key:
                out.url = storage.presigned_get_url(scan.storage_key)
            scans_by_study.setdefault(scan.study_id, []).append(out)

    detail = PatientDetail.model_validate(patient)
    detail.visits = [VisitOut.model_validate(v) for v in visits]
    detail.studies = [
        StudyOut(
            **StudyOut.model_validate(s).model_dump(exclude={"scans"}),
            scans=scans_by_study.get(s.id, []),
        )
        for s in studies
    ]
    return detail


@router.patch("/{patient_id}", response_model=PatientOut,
              dependencies=[Depends(require_min_role("surgeon"))])
async def update_patient(
    patient_id: uuid.UUID, body: PatientUpdate, ctx: RequestContext = Depends(get_context)
) -> PatientOut:
    patient = await ctx.session.get(Patient, patient_id)
    if patient is None or patient.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(patient, key, value)
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="patient.update", entity_type="patient", entity_id=patient.id, ip=ctx.ip,
    )
    return PatientOut.model_validate(patient)


@router.post("/{patient_id}/archive", dependencies=[Depends(require_min_role("admin"))])
async def archive_patient(
    patient_id: uuid.UUID, body: ArchiveRequest, ctx: RequestContext = Depends(get_context)
) -> dict[str, bool]:
    patient = await ctx.session.get(Patient, patient_id)
    if patient is None or patient.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")
    patient.is_archived = body.archived
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="patient.archive", entity_type="patient", entity_id=patient.id,
        ip=ctx.ip, meta={"archived": body.archived},
    )
    return {"success": True}
