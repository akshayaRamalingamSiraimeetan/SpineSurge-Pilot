"""Report routes — list by visit, create metadata.

Binary upload (multipart → S3/MinIO) is wired in Step 5; this step manages report records and the
storage_key reference.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select

from app.core.audit import record_audit
from app.deps.auth import require_min_role
from app.deps.context import RequestContext, get_context
from app.models import Context, Measurement, Patient, Report, Visit
from app.schemas.clinical import ReportCreate, ReportGenerateRequest, ReportOut
from app.services.report_pdf import render_report_pdf
from app.services.storage import storage

router = APIRouter(prefix="/reports", tags=["reports"])


def _with_url(report: Report) -> ReportOut:
    out = ReportOut.model_validate(report)
    if report.storage_key:
        out.url = storage.presigned_get_url(report.storage_key)
    return out


@router.get("", response_model=list[ReportOut])
async def list_patient_reports(
    patient_id: uuid.UUID = Query(...), ctx: RequestContext = Depends(get_context)
) -> list[ReportOut]:
    rows = (
        await ctx.session.execute(
            select(Report)
            .where(Report.patient_id == patient_id, Report.org_id == ctx.user.org_id)
            .order_by(Report.created_at.desc().nullslast())
        )
    ).scalars().all()
    return [_with_url(r) for r in rows]


@router.post("/generate", response_model=ReportOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_min_role("surgeon"))])
async def generate_report(
    body: ReportGenerateRequest, ctx: RequestContext = Depends(get_context)
) -> ReportOut:
    org_id = ctx.user.org_id
    patient = await ctx.session.get(Patient, body.patient_id)
    if patient is None or patient.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Patient not found")

    # Resolve the context: explicit, else the patient's most-recently-modified one.
    context: Context | None = None
    if body.context_id:
        context = await ctx.session.get(Context, body.context_id)
        if context is None or context.org_id != org_id or context.patient_id != patient.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Context not found")
    else:
        context = (
            await ctx.session.execute(
                select(Context)
                .where(Context.patient_id == patient.id, Context.org_id == org_id)
                .order_by(Context.last_modified.desc().nullslast())
                .limit(1)
            )
        ).scalar_one_or_none()

    measurements: list[dict] = []
    if context is not None:
        rows = (
            await ctx.session.execute(
                select(Measurement).where(Measurement.context_id == context.id)
            )
        ).scalars().all()
        measurements = [{"tool_key": m.tool_key, "result": m.result} for m in rows]

    # Latest visit → diagnosis + (optional) anchor.
    visit = (
        await ctx.session.execute(
            select(Visit)
            .where(Visit.patient_id == patient.id, Visit.org_id == org_id)
            .order_by(Visit.created_at.desc().nullslast())
            .limit(1)
        )
    ).scalar_one_or_none()
    diagnosis = visit.diagnosis if visit else None
    visit_id = context.visit_id if (context and context.visit_id) else (visit.id if visit else None)

    pdf = render_report_pdf(
        patient={
            "name": patient.name, "age": patient.age, "gender": patient.gender,
            "dob": patient.dob, "contact": patient.contact,
        },
        diagnosis=diagnosis,
        measurements=measurements,
        title=body.title or "Spine Assessment Report",
    )

    key = storage.object_key(org_id, f"report-{patient.id}.pdf", prefix="reports")
    try:
        storage.upload_bytes(key, pdf, "application/pdf")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Upload failed: {exc}") from exc

    report = Report(
        org_id=org_id, patient_id=patient.id, visit_id=visit_id,
        title=body.title or "Spine Assessment Report", storage_key=key,
    )
    ctx.session.add(report)
    await ctx.session.flush()
    await record_audit(
        ctx.session, org_id=org_id, user_id=ctx.user.user_id,
        action="report.generate", entity_type="report", entity_id=report.id, ip=ctx.ip,
        meta={"measurements": len(measurements)},
    )
    return _with_url(report)


@router.get("/{visit_id}", response_model=list[ReportOut])
async def list_reports(
    visit_id: uuid.UUID, ctx: RequestContext = Depends(get_context)
) -> list[ReportOut]:
    rows = (
        await ctx.session.execute(
            select(Report).where(Report.visit_id == visit_id, Report.org_id == ctx.user.org_id)
        )
    ).scalars().all()
    return [_with_url(r) for r in rows]


@router.post("/upload", response_model=ReportOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_min_role("surgeon"))])
async def upload_report(
    ctx: RequestContext = Depends(get_context),
    visit_id: uuid.UUID = Form(...),
    title: str | None = Form(None),
    file: UploadFile = File(...),
) -> ReportOut:
    visit = await ctx.session.get(Visit, visit_id)
    if visit is None or visit.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")

    key = storage.object_key(ctx.user.org_id, file.filename or "report.pdf", prefix="reports")
    try:
        storage.upload_bytes(key, await file.read(), file.content_type or "application/pdf")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Upload failed: {exc}") from exc

    report = Report(org_id=ctx.user.org_id, visit_id=visit_id, title=title, storage_key=key)
    ctx.session.add(report)
    await ctx.session.flush()
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="report.upload", entity_type="report", entity_id=report.id, ip=ctx.ip,
    )
    return _with_url(report)


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_min_role("surgeon"))])
async def create_report(
    body: ReportCreate, ctx: RequestContext = Depends(get_context)
) -> ReportOut:
    visit = await ctx.session.get(Visit, body.visit_id)
    if visit is None or visit.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Visit not found")
    report = Report(
        org_id=ctx.user.org_id,
        visit_id=body.visit_id,
        title=body.title,
        storage_key=body.storage_key,
    )
    ctx.session.add(report)
    await ctx.session.flush()
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="report.create", entity_type="report", entity_id=report.id, ip=ctx.ip,
    )
    return ReportOut.model_validate(report)
