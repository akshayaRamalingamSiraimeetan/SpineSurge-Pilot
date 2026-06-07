"""Library collection routes — curated sets of studies, tenant-scoped (org filter + RLS).

Reads require any authenticated role; writes require surgeon+. Study membership is validated to
belong to the same org before linking.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select

from app.core.audit import record_audit
from app.deps.auth import require_min_role
from app.deps.context import RequestContext, get_context
from app.models import Collection, CollectionStudy, Patient, Study, User
from app.schemas.library import (
    AddStudyRequest,
    CollectionCreate,
    CollectionDetail,
    CollectionOut,
    CollectionStudyOut,
    CollectionUpdate,
)

router = APIRouter(prefix="/collections", tags=["collections"])


def _iso(value: object) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


async def _counts(ctx: RequestContext, ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not ids:
        return {}
    rows = (
        await ctx.session.execute(
            select(CollectionStudy.collection_id, func.count())
            .where(CollectionStudy.collection_id.in_(ids))
            .group_by(CollectionStudy.collection_id)
        )
    ).all()
    return {cid: n for cid, n in rows}


async def _owner_names(ctx: RequestContext, ids: list[uuid.UUID]) -> dict[uuid.UUID, str | None]:
    ids = [i for i in ids if i]
    if not ids:
        return {}
    rows = (
        await ctx.session.execute(
            select(User.id, User.display_name, User.email).where(User.id.in_(ids))
        )
    ).all()
    return {uid: (name or email) for uid, name, email in rows}


def _to_out(col: Collection, count: int, owner_name: str | None) -> CollectionOut:
    # Build explicitly: created_at is a datetime on the ORM row but a string on the wire.
    return CollectionOut(
        id=col.id,
        name=col.name,
        description=col.description,
        is_private=col.is_private,
        owner_user_id=col.owner_user_id,
        owner_name=owner_name,
        count=count,
        created_at=_iso(col.created_at),
    )


@router.get("", response_model=list[CollectionOut])
async def list_collections(ctx: RequestContext = Depends(get_context)) -> list[CollectionOut]:
    cols = (
        await ctx.session.execute(
            select(Collection)
            .where(Collection.org_id == ctx.user.org_id)
            .order_by(Collection.created_at.desc().nullslast())
        )
    ).scalars().all()
    counts = await _counts(ctx, [c.id for c in cols])
    owners = await _owner_names(ctx, [c.owner_user_id for c in cols if c.owner_user_id])
    return [_to_out(c, counts.get(c.id, 0), owners.get(c.owner_user_id)) for c in cols]


@router.post("", response_model=CollectionOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_min_role("surgeon"))])
async def create_collection(
    body: CollectionCreate, ctx: RequestContext = Depends(get_context)
) -> CollectionOut:
    col = Collection(org_id=ctx.user.org_id, owner_user_id=ctx.user.user_id, **body.model_dump())
    ctx.session.add(col)
    await ctx.session.flush()
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="collection.create", entity_type="collection", entity_id=col.id, ip=ctx.ip,
    )
    owners = await _owner_names(ctx, [col.owner_user_id] if col.owner_user_id else [])
    return _to_out(col, 0, owners.get(col.owner_user_id))


async def _get_owned(ctx: RequestContext, collection_id: uuid.UUID) -> Collection:
    col = await ctx.session.get(Collection, collection_id)
    if col is None or col.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found")
    return col


@router.get("/{collection_id}", response_model=CollectionDetail)
async def get_collection(
    collection_id: uuid.UUID, ctx: RequestContext = Depends(get_context)
) -> CollectionDetail:
    col = await _get_owned(ctx, collection_id)
    # Studies in the collection, joined to their patient.
    rows = (
        await ctx.session.execute(
            select(Study, Patient)
            .join(CollectionStudy, CollectionStudy.study_id == Study.id)
            .join(Patient, Patient.id == Study.patient_id)
            .where(CollectionStudy.collection_id == collection_id)
            .order_by(CollectionStudy.created_at.desc().nullslast())
        )
    ).all()
    studies = [
        CollectionStudyOut(
            study_id=study.id,
            patient_id=patient.id,
            name=f"{study.modality} · {patient.name}",
            patient=patient.name,
            sex=(f"{patient.age}{patient.gender}" if patient.age else patient.gender),
            date=study.acquisition_date or _iso(study.created_at),
            modality=study.modality,
        )
        for study, patient in rows
    ]
    owners = await _owner_names(ctx, [col.owner_user_id] if col.owner_user_id else [])
    base = _to_out(col, len(studies), owners.get(col.owner_user_id))
    return CollectionDetail(**base.model_dump(), studies=studies)


@router.patch("/{collection_id}", response_model=CollectionOut,
              dependencies=[Depends(require_min_role("surgeon"))])
async def update_collection(
    collection_id: uuid.UUID, body: CollectionUpdate, ctx: RequestContext = Depends(get_context)
) -> CollectionOut:
    col = await _get_owned(ctx, collection_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(col, key, value)
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="collection.update", entity_type="collection", entity_id=col.id, ip=ctx.ip,
    )
    counts = await _counts(ctx, [col.id])
    owners = await _owner_names(ctx, [col.owner_user_id] if col.owner_user_id else [])
    return _to_out(col, counts.get(col.id, 0), owners.get(col.owner_user_id))


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_min_role("surgeon"))])
async def delete_collection(
    collection_id: uuid.UUID, ctx: RequestContext = Depends(get_context)
) -> None:
    col = await _get_owned(ctx, collection_id)
    await ctx.session.delete(col)  # collection_studies cascade via FK
    await record_audit(
        ctx.session, org_id=ctx.user.org_id, user_id=ctx.user.user_id,
        action="collection.delete", entity_type="collection", entity_id=collection_id, ip=ctx.ip,
    )


@router.post("/{collection_id}/studies", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_min_role("surgeon"))])
async def add_study(
    collection_id: uuid.UUID, body: AddStudyRequest, ctx: RequestContext = Depends(get_context)
) -> dict[str, bool]:
    await _get_owned(ctx, collection_id)
    study = await ctx.session.get(Study, body.study_id)
    if study is None or study.org_id != ctx.user.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Study not found")
    # Idempotent: skip if already linked.
    existing = await ctx.session.get(CollectionStudy, (collection_id, body.study_id))
    if existing is None:
        ctx.session.add(
            CollectionStudy(
                collection_id=collection_id, study_id=body.study_id, org_id=ctx.user.org_id
            )
        )
    return {"success": True}


@router.delete("/{collection_id}/studies/{study_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_min_role("surgeon"))])
async def remove_study(
    collection_id: uuid.UUID, study_id: uuid.UUID, ctx: RequestContext = Depends(get_context)
) -> None:
    await _get_owned(ctx, collection_id)
    await ctx.session.execute(
        delete(CollectionStudy).where(
            CollectionStudy.collection_id == collection_id,
            CollectionStudy.study_id == study_id,
        )
    )
