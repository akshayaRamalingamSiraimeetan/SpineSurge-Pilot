"""Library models: collections of studies (curated case sets).

Both tables are tenant-scoped (org_id + RLS). A collection groups studies the org owns; membership
is an M:N link table (collection_studies), mirroring context_studies.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

from app.db import columns as c


class Collection(SQLModel, table=True):
    __tablename__ = "collections"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    name: str
    description: str | None = None
    is_private: bool = True
    owner_user_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), nullable=True),  # users is global; no RLS-able FK
    )
    created_at: datetime | None = c.created_at()
    updated_at: datetime | None = c.updated_at()


class CollectionStudy(SQLModel, table=True):
    __tablename__ = "collection_studies"

    collection_id: uuid.UUID = c.fk("collections.id", primary_key=True)
    study_id: uuid.UUID = c.fk("studies.id", primary_key=True)
    org_id: uuid.UUID = c.org_fk()
    created_at: datetime | None = c.created_at()
