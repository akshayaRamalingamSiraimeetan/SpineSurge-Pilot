"""DICOM routes — STOW upload, QIDO search, WADO retrieve.

Tenant isolation is enforced from OUR database (the studies table), not by trusting Orthanc to
filter: QIDO results are intersected with the org's known StudyInstanceUIDs, and WADO verifies
ownership before streaming a single byte.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.audit import record_audit
from app.deps.auth import require_min_role
from app.deps.context import RequestContext, get_context
from app.models import Patient, Scan, Study
from app.schemas.dicom import DicomIngestResult
from app.services.orthanc import TAG_STUDY_INSTANCE_UID, orthanc

router = APIRouter(prefix="/dicom", tags=["dicom"])


async def _org_study_uids(ctx: RequestContext) -> set[str]:
    rows = (
        await ctx.session.execute(
            select(Study.orthanc_study_uid).where(
                Study.org_id == ctx.user.org_id, Study.orthanc_study_uid.is_not(None)
            )
        )
    ).scalars().all()
    return {uid for uid in rows if uid}


@router.post("/studies", response_model=DicomIngestResult, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_min_role("surgeon"))])
async def upload_study(
    ctx: RequestContext = Depends(get_context),
    patient_id: uuid.UUID = Form(...),
    visit_id: uuid.UUID | None = Form(None),
    files: list[UploadFile] = File(...),
) -> DicomIngestResult:
    patient = await ctx.session.get(Patient, patient_id)
    if patient is None or patient.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")

    blobs = [await f.read() for f in files]
    try:
        result = await orthanc.ingest(blobs)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"DICOM ingest failed: {exc}") from exc

    # Upsert the study by its DICOM UID (idempotent re-uploads).
    study = (
        await ctx.session.execute(
            select(Study).where(
                Study.org_id == ctx.user.org_id,
                Study.orthanc_study_uid == result.orthanc_study_uid,
            )
        )
    ).scalar_one_or_none()
    if study is None:
        study = Study(
            org_id=ctx.user.org_id,
            patient_id=patient_id,
            visit_id=visit_id,
            modality="CT",
            source="upload",
            orthanc_study_uid=result.orthanc_study_uid,
        )
        ctx.session.add(study)
        await ctx.session.flush()

    existing_series = {
        s.orthanc_series_uid
        for s in (
            await ctx.session.execute(select(Scan).where(Scan.study_id == study.id))
        ).scalars().all()
        if s.orthanc_series_uid
    }
    for series_uid in result.series_uids:
        if series_uid not in existing_series:
            ctx.session.add(
                Scan(
                    org_id=ctx.user.org_id,
                    study_id=study.id,
                    type="Imported",
                    orthanc_series_uid=series_uid,
                )
            )

    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="dicom.upload", entity_type="study", entity_id=study.id, ip=ctx.ip,
        meta={"series": len(result.series_uids), "instances": result.instance_count},
    )
    return DicomIngestResult(
        study_id=study.id,
        orthanc_study_uid=result.orthanc_study_uid,
        series_count=len(result.series_uids),
        instance_count=result.instance_count,
    )


@router.get("/qido/studies")
async def qido_studies(
    ctx: RequestContext = Depends(get_context),
    PatientName: str | None = None,  # noqa: N803  (DICOM query keyword)
    PatientID: str | None = None,  # noqa: N803
    StudyDate: str | None = None,  # noqa: N803
) -> list[dict]:
    params = {k: v for k, v in {
        "PatientName": PatientName, "PatientID": PatientID, "StudyDate": StudyDate
    }.items() if v}
    try:
        results = await orthanc.qido_studies(params)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"PACS query failed: {exc}") from exc

    allowed = await _org_study_uids(ctx)

    def uid_of(item: dict) -> str | None:
        entry = item.get(TAG_STUDY_INSTANCE_UID, {})
        values = entry.get("Value") or []
        return values[0] if values else None

    return [item for item in results if uid_of(item) in allowed]


@router.get("/wado")
async def wado_retrieve(
    studyUID: str,  # noqa: N803
    ctx: RequestContext = Depends(get_context),
) -> StreamingResponse:
    owned = (
        await ctx.session.execute(
            select(Study.id).where(
                Study.org_id == ctx.user.org_id, Study.orthanc_study_uid == studyUID
            )
        )
    ).scalar_one_or_none()
    if owned is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Study not found")

    return StreamingResponse(
        orthanc.wado_stream(studyUID),
        media_type="multipart/related; type=application/dicom",
    )
