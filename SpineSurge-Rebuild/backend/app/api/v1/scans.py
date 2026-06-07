"""Scan routes — upload a non-DICOM image (e.g. JPEG/PNG X-ray) to a study.

DICOM series are ingested via /dicom/studies (Orthanc); this handles plain images stored in
S3/MinIO.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.core.audit import record_audit
from app.deps.auth import require_min_role
from app.deps.context import RequestContext, get_context
from app.models import Scan, Study
from app.schemas.clinical import ScanOut
from app.services.storage import storage

router = APIRouter(prefix="/studies", tags=["scans"])


@router.post("/{study_id}/scans", response_model=ScanOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_min_role("surgeon"))])
async def upload_scan(
    study_id: uuid.UUID,
    ctx: RequestContext = Depends(get_context),
    type: str = Form("Imported"),
    date: str | None = Form(None),
    file: UploadFile = File(...),
) -> ScanOut:
    study = await ctx.session.get(Study, study_id)
    if study is None or study.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Study not found")

    key = storage.object_key(ctx.user.org_id, file.filename or "scan.png", prefix="scans")
    try:
        storage.upload_bytes(key, await file.read(), file.content_type or "image/png")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Upload failed: {exc}") from exc

    scan = Scan(org_id=ctx.user.org_id, study_id=study_id, type=type, date=date, storage_key=key)
    ctx.session.add(scan)
    await ctx.session.flush()
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="scan.upload", entity_type="scan", entity_id=scan.id, ip=ctx.ip,
    )
    out = ScanOut.model_validate(scan)
    out.url = storage.presigned_get_url(key)
    return out
