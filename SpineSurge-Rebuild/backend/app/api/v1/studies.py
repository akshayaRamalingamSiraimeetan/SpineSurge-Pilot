"""Study routes — create a study under a patient/visit.

Scan binaries and DICOM ingest arrive in Step 5 (storage + Orthanc).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.audit import record_audit
from app.deps.auth import require_min_role
from app.deps.context import RequestContext, get_context
from app.models import Patient, Study
from app.schemas.clinical import StudyCreate, StudyOut

router = APIRouter(prefix="/studies", tags=["studies"])


@router.get("/{study_id}", response_model=StudyOut)
async def get_study(
    study_id: uuid.UUID, ctx: RequestContext = Depends(get_context)
) -> StudyOut:
    """Fetch a single study — the workspace uses it to resolve its patient from the route param."""
    study = await ctx.session.get(Study, study_id)
    if study is None or study.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Study not found")
    return StudyOut(
        id=study.id,
        patient_id=study.patient_id,
        visit_id=study.visit_id,
        modality=study.modality,
        source=study.source,
        acquisition_date=study.acquisition_date,
        orthanc_study_uid=study.orthanc_study_uid,
        scans=[],
    )


@router.post("", response_model=StudyOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_min_role("surgeon"))])
async def create_study(
    body: StudyCreate, ctx: RequestContext = Depends(get_context)
) -> StudyOut:
    patient = await ctx.session.get(Patient, body.patient_id)
    if patient is None or patient.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")

    study = Study(
        org_id=ctx.user.org_id,
        patient_id=body.patient_id,
        visit_id=body.visit_id,
        modality=body.modality,
        source=body.source,
        acquisition_date=body.acquisition_date,
    )
    if body.id is not None:
        study.id = body.id
    ctx.session.add(study)
    await ctx.session.flush()
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="study.create", entity_type="study", entity_id=study.id, ip=ctx.ip,
    )
    return StudyOut.model_validate(study)
