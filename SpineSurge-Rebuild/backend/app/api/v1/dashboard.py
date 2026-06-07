"""Dashboard route — a read-only aggregate feed over the org's real data.

Everything is derived from rows the org owns (RLS + explicit org filter): recent studies, the
most-recently-edited workspace ("continue working"), in-progress contexts ("unfinished"), and a
small set of *truthful* task counts (missing DOB, flagged patients, unsaved workspaces). No mock
or fabricated values — empty inputs yield empty sections.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.deps.context import RequestContext, get_context
from app.models import Context, ContextStudy, Patient, Study, Visit
from app.schemas.dashboard import (
    ContinueWorking,
    DashboardFeed,
    RecentStudy,
    TaskRow,
    UnfinishedStudy,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _iso(value: object) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


async def _latest_diagnosis_map(
    ctx: RequestContext, patient_ids: list[uuid.UUID]
) -> dict[uuid.UUID, str | None]:
    """Most-recent (by created_at) non-empty visit diagnosis per patient."""
    if not patient_ids:
        return {}
    rows = (
        await ctx.session.execute(
            select(Visit.patient_id, Visit.diagnosis, Visit.created_at)
            .where(Visit.org_id == ctx.user.org_id, Visit.patient_id.in_(patient_ids))
            .order_by(Visit.created_at.asc().nullsfirst())
        )
    ).all()
    # Iterating ascending and overwriting leaves the newest non-null per patient.
    out: dict[uuid.UUID, str | None] = {}
    for pid, dx, _ in rows:
        if dx:
            out[pid] = dx
    return out


async def _study_count_map(
    ctx: RequestContext, patient_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    if not patient_ids:
        return {}
    rows = (
        await ctx.session.execute(
            select(Study.patient_id, func.count())
            .where(Study.org_id == ctx.user.org_id, Study.patient_id.in_(patient_ids))
            .group_by(Study.patient_id)
        )
    ).all()
    return {pid: n for pid, n in rows}


@router.get("", response_model=DashboardFeed)
async def get_dashboard(ctx: RequestContext = Depends(get_context)) -> DashboardFeed:
    org_id = ctx.user.org_id

    # ── Recent studies (newest first) joined to their patient ──────────────────
    recent_rows = (
        await ctx.session.execute(
            select(Study, Patient)
            .join(Patient, Patient.id == Study.patient_id)
            .where(Study.org_id == org_id, Patient.is_archived == False)  # noqa: E712
            .order_by(Study.created_at.desc().nullslast())
            .limit(6)
        )
    ).all()
    recent_patient_ids = list({p.id for _, p in recent_rows})

    # ── In-progress workspaces (contexts), newest edit first ───────────────────
    context_rows = (
        await ctx.session.execute(
            select(Context, Patient)
            .join(Patient, Patient.id == Context.patient_id)
            .where(Context.org_id == org_id, Patient.is_archived == False)  # noqa: E712
            .order_by(Context.last_modified.desc().nullslast())
            .limit(6)
        )
    ).all()
    context_patient_ids = list({p.id for _, p in context_rows})

    all_patient_ids = list(set(recent_patient_ids) | set(context_patient_ids))
    dx_map = await _latest_diagnosis_map(ctx, all_patient_ids)
    count_map = await _study_count_map(ctx, all_patient_ids)

    # Latest study per patient → (study_id, modality). Used to give context-derived cards a
    # navigation target (the workspace resolves a patient from a study id) and a fallback modality.
    latest_study: dict[uuid.UUID, tuple[uuid.UUID, str]] = {}
    if all_patient_ids:
        study_rows = (
            await ctx.session.execute(
                select(Study)
                .where(Study.org_id == org_id, Study.patient_id.in_(all_patient_ids))
                .order_by(Study.created_at.desc().nullslast())
            )
        ).scalars().all()
        for s in study_rows:
            latest_study.setdefault(s.patient_id, (s.id, s.modality))

    recent_studies = [
        RecentStudy(
            patient_id=patient.id,
            study_id=study.id,
            name=patient.name,
            dx=dx_map.get(patient.id),
            date=study.acquisition_date or _iso(study.created_at),
            studies=count_map.get(patient.id, 0),
            modality=study.modality,
        )
        for study, patient in recent_rows
    ]

    # Modality for a context = its first linked study's modality, else patient's latest.
    ctx_ids = [c.id for c, _ in context_rows]
    ctx_modality: dict[uuid.UUID, str] = {}
    if ctx_ids:
        link_rows = (
            await ctx.session.execute(
                select(ContextStudy.context_id, Study.modality)
                .join(Study, Study.id == ContextStudy.study_id)
                .where(ContextStudy.context_id.in_(ctx_ids))
            )
        ).all()
        for cid, modality in link_rows:
            ctx_modality.setdefault(cid, modality)

    def _patient_modality(pid: uuid.UUID) -> str | None:
        entry = latest_study.get(pid)
        return entry[1] if entry else None

    def _patient_study_id(pid: uuid.UUID) -> uuid.UUID | None:
        entry = latest_study.get(pid)
        return entry[0] if entry else None

    unfinished = [
        UnfinishedStudy(
            patient_id=patient.id,
            context_id=context.id,
            study_id=_patient_study_id(patient.id),
            name=patient.name,
            modality=ctx_modality.get(context.id) or _patient_modality(patient.id),
            date=_iso(context.created_at),
            dx=dx_map.get(patient.id) or context.name,
            edited=_iso(context.last_modified),
        )
        for context, patient in context_rows
    ]

    # ── Continue working: the single most-recently-edited workspace ────────────
    continue_working: ContinueWorking | None = None
    if context_rows:
        context, patient = context_rows[0]
        continue_working = ContinueWorking(
            patient_id=patient.id,
            context_id=context.id,
            study_id=_patient_study_id(patient.id),
            name=patient.name,
            stage=context.name or context.mode.capitalize(),
            date=_iso(context.created_at),
            tag=dx_map.get(patient.id),
            last_opened=_iso(context.last_modified),
            studies=count_map.get(patient.id, 0),
            modality=ctx_modality.get(context.id) or _patient_modality(patient.id),
        )
    elif recent_rows:
        study, patient = recent_rows[0]
        continue_working = ContinueWorking(
            patient_id=patient.id,
            study_id=study.id,
            name=patient.name,
            stage="New Study",
            date=study.acquisition_date or _iso(study.created_at),
            tag=dx_map.get(patient.id),
            last_opened=_iso(study.created_at),
            studies=count_map.get(patient.id, 0),
            modality=study.modality,
        )

    # ── Truthful task counts ───────────────────────────────────────────────────
    missing_dob = await ctx.session.scalar(
        select(func.count())
        .select_from(Patient)
        .where(
            Patient.org_id == org_id,
            Patient.is_archived == False,  # noqa: E712
            Patient.dob.is_(None),
        )
    )
    flagged = await ctx.session.scalar(
        select(func.count())
        .select_from(Patient)
        .where(
            Patient.org_id == org_id,
            Patient.is_archived == False,  # noqa: E712
            Patient.has_alert == True,  # noqa: E712
        )
    )

    tasks: list[TaskRow] = []
    if unfinished:
        tasks.append(
            TaskRow(
                group="Unsaved Workspaces",
                icon="folder",
                title=f"{len(unfinished)} workspace(s) in progress",
                sub=", ".join(u.name for u in unfinished[:3]),
                meta="Resume where you left off",
                tone="accent",
            )
        )
    if flagged:
        tasks.append(
            TaskRow(
                group="Flagged Patients",
                icon="warning",
                title=f"{flagged} flagged patient(s)",
                sub="Marked as needing attention",
                meta="Action required",
                tone="danger",
            )
        )
    if missing_dob:
        tasks.append(
            TaskRow(
                group="Missing Information",
                icon="user",
                title=f"{missing_dob} patient(s) missing DOB",
                sub="Required for report generation",
                meta="Missing: Patient DOB",
                tone="danger",
            )
        )

    return DashboardFeed(
        continue_working=continue_working,
        recent_studies=recent_studies,
        unfinished=unfinished,
        tasks=tasks,
    )
