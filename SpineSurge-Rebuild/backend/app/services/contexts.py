"""Context persistence: upsert + per-collection diff (never delete-all-reinsert).

The browser sends the full workspace state on save. We compare incoming items (by id) against what
is stored and apply the minimal set of inserts/updates/deletes. This removes the write-amplification
of the old server (which deleted and re-inserted every measurement/implant on each edit).

The `_to_*` functions are pure (dict -> column kwargs) and unit-tested without a database.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Context,
    ContextStudy,
    Implant,
    Measurement,
    PedicleSimulation,
    ThreeDImplant,
)
from app.schemas.auth import CurrentUser
from app.schemas.contexts import ContextSave


# ── Pure mappers (frontend camelCase blob -> model column kwargs) ────────────
def _to_measurement(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "tool_key": item.get("toolKey") or item.get("tool_key") or "",
        "fragment_id": item.get("fragmentId") or item.get("fragment_id"),
        "points": item.get("points") or [],
        "result": item.get("result"),
        "meta": item.get("measurement") or item.get("metadata") or {},
        "timestamp": item.get("timestamp"),
    }


def _to_implant(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": item.get("type") or "screw",
        "fragment_id": item.get("fragmentId") or item.get("fragment_id"),
        "position": item.get("position"),
        "angle": item.get("angle"),
        "properties": item.get("properties") or {},
        "timestamp": item.get("timestamp"),
    }


def _to_three_d(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": item.get("type") or "screw",
        "position": item.get("position"),
        "direction": item.get("direction"),
        "properties": item.get("properties") or {},
        "level": item.get("level"),
        "side": item.get("side"),
        "simulation_id": item.get("simulationId") or item.get("simulation_id"),
    }


def _to_pedicle(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "label": item.get("label") or "",
        "landmarks": item.get("landmarks") or {},
        "suggested_screw_l": item.get("suggestedScrew_L") or item.get("suggested_screw_l"),
        "suggested_screw_r": item.get("suggestedScrew_R") or item.get("suggested_screw_r"),
        "grading": item.get("grading"),
    }


def _coerce_uuid(value: Any) -> uuid.UUID | None:
    if value in (None, ""):
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError):
        return None


async def _sync_collection(
    session: AsyncSession,
    model: Any,
    *,
    context_id: uuid.UUID,
    org_id: uuid.UUID,
    incoming: list[dict[str, Any]],
    mapper: Any,
) -> None:
    existing = (
        await session.execute(select(model).where(model.context_id == context_id))
    ).scalars().all()
    by_id = {str(row.id): row for row in existing}
    seen: set[str] = set()

    for item in incoming:
        item_id = _coerce_uuid(item.get("id"))
        cols = mapper(item)
        if item_id and str(item_id) in by_id:
            row = by_id[str(item_id)]
            for key, value in cols.items():
                setattr(row, key, value)
            seen.add(str(item_id))
        else:
            kwargs: dict[str, Any] = {"context_id": context_id, "org_id": org_id, **cols}
            if item_id:
                kwargs["id"] = item_id
                seen.add(str(item_id))
            session.add(model(**kwargs))

    for row_id, row in by_id.items():
        if row_id not in seen:
            await session.delete(row)


async def save_context(
    session: AsyncSession, user: CurrentUser, payload: ContextSave
) -> Context:
    # 1. Upsert the context row.
    ctx: Context | None = None
    if payload.id is not None:
        ctx = await session.get(Context, payload.id)
    if ctx is None:
        ctx = Context(org_id=user.org_id, patient_id=payload.patient_id, mode=payload.mode)
        if payload.id is not None:
            ctx.id = payload.id
        session.add(ctx)
    ctx.patient_id = payload.patient_id
    ctx.visit_id = payload.visit_id
    ctx.mode = payload.mode
    ctx.name = payload.name
    ctx.annotations = payload.state.annotations
    ctx.tool_state = payload.state.tool_state
    await session.flush()  # ensure ctx.id

    # 2. Sync study links (diff).
    existing_links = (
        await session.execute(
            select(ContextStudy).where(ContextStudy.context_id == ctx.id)
        )
    ).scalars().all()
    existing_study_ids = {str(link.study_id) for link in existing_links}
    incoming_study_ids = {str(sid) for sid in payload.study_ids}
    for link in existing_links:
        if str(link.study_id) not in incoming_study_ids:
            await session.delete(link)
    for sid in payload.study_ids:
        if str(sid) not in existing_study_ids:
            session.add(ContextStudy(context_id=ctx.id, study_id=sid, org_id=user.org_id))

    # 3. Sync child collections (diff, not delete-all-reinsert).
    await _sync_collection(
        session, Measurement, context_id=ctx.id, org_id=user.org_id,
        incoming=payload.state.measurements, mapper=_to_measurement,
    )
    await _sync_collection(
        session, Implant, context_id=ctx.id, org_id=user.org_id,
        incoming=payload.state.implants, mapper=_to_implant,
    )
    await _sync_collection(
        session, ThreeDImplant, context_id=ctx.id, org_id=user.org_id,
        incoming=payload.state.three_d_implants, mapper=_to_three_d,
    )
    await _sync_collection(
        session, PedicleSimulation, context_id=ctx.id, org_id=user.org_id,
        incoming=payload.state.pedicle_simulations, mapper=_to_pedicle,
    )
    return ctx


def measurement_out(row: Measurement) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "toolKey": row.tool_key,
        "fragmentId": row.fragment_id,
        "points": row.points or [],
        "result": row.result,
        "measurement": row.meta or {},
        "timestamp": row.timestamp,
    }


def implant_out(row: Implant) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "type": row.type,
        "fragmentId": row.fragment_id,
        "position": row.position,
        "angle": row.angle,
        "properties": row.properties or {},
        "timestamp": row.timestamp,
    }


def three_d_out(row: ThreeDImplant) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "type": row.type,
        "position": row.position,
        "direction": row.direction,
        "properties": row.properties or {},
        "level": row.level,
        "side": row.side,
        "simulationId": str(row.simulation_id) if row.simulation_id else None,
    }


def pedicle_out(row: PedicleSimulation) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "label": row.label,
        "landmarks": row.landmarks or {},
        "suggestedScrew_L": row.suggested_screw_l,
        "suggestedScrew_R": row.suggested_screw_r,
        "grading": row.grading,
    }


async def hydrate_contexts(
    session: AsyncSession, patient_id: uuid.UUID
) -> list[dict[str, Any]]:
    contexts = (
        await session.execute(select(Context).where(Context.patient_id == patient_id))
    ).scalars().all()
    result: list[dict[str, Any]] = []
    for ctx in contexts:
        links = (
            await session.execute(
                select(ContextStudy.study_id).where(ContextStudy.context_id == ctx.id)
            )
        ).scalars().all()
        measurements = (
            await session.execute(select(Measurement).where(Measurement.context_id == ctx.id))
        ).scalars().all()
        implants = (
            await session.execute(select(Implant).where(Implant.context_id == ctx.id))
        ).scalars().all()
        three_d = (
            await session.execute(select(ThreeDImplant).where(ThreeDImplant.context_id == ctx.id))
        ).scalars().all()
        pedicles = (
            await session.execute(
                select(PedicleSimulation).where(PedicleSimulation.context_id == ctx.id)
            )
        ).scalars().all()
        result.append(
            {
                "id": str(ctx.id),
                "patientId": str(ctx.patient_id),
                "visitId": str(ctx.visit_id) if ctx.visit_id else None,
                "studyIds": [str(s) for s in links],
                "mode": ctx.mode,
                "name": ctx.name,
                "lastModified": ctx.last_modified.isoformat() if ctx.last_modified else None,
                "annotations": ctx.annotations or [],
                "toolState": ctx.tool_state or {},
                "measurements": [measurement_out(m) for m in measurements],
                "implants": [implant_out(i) for i in implants],
                "threeDImplants": [three_d_out(t) for t in three_d],
                "pedicleSimulations": [pedicle_out(p) for p in pedicles],
            }
        )
    return result
