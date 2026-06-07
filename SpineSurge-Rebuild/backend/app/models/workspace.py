"""Workspace / planning state models.

contexts, context_studies (M:N), measurements, implants (2D), three_d_implants,
pedicle_simulations. All tenant-scoped (org_id + RLS). Geometric/clinical blobs are JSONB.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Column, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.db import columns as c


class Context(SQLModel, table=True):
    __tablename__ = "contexts"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    patient_id: uuid.UUID = c.fk("patients.id")
    visit_id: uuid.UUID | None = c.fk("visits.id", nullable=True, ondelete="SET NULL")
    mode: str  # view | plan | compare
    name: str | None = None
    annotations: list | None = c.jsonb()
    tool_state: dict | None = c.jsonb()
    last_modified: datetime | None = c.updated_at()
    created_at: datetime | None = c.created_at()


class ContextStudy(SQLModel, table=True):
    __tablename__ = "context_studies"

    context_id: uuid.UUID = c.fk("contexts.id", primary_key=True)
    study_id: uuid.UUID = c.fk("studies.id", primary_key=True)
    org_id: uuid.UUID = c.org_fk()


class Measurement(SQLModel, table=True):
    __tablename__ = "measurements"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    context_id: uuid.UUID = c.fk("contexts.id")
    tool_key: str
    fragment_id: str | None = None
    points: list | None = c.jsonb()
    result: dict | None = c.jsonb()  # numeric value + unit (not display string)
    # DB column is "metadata"; attribute is `meta` (SQLAlchemy reserves `metadata`).
    meta: dict | None = Field(
        default=None, sa_column=Column("metadata", JSONB, nullable=True)
    )
    timestamp: int | None = Field(default=None, sa_column=Column(BigInteger, nullable=True))


class Implant(SQLModel, table=True):
    __tablename__ = "implants"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    context_id: uuid.UUID = c.fk("contexts.id")
    type: str  # screw | rod | cage | plate | spacer
    fragment_id: str | None = None
    position: dict | None = c.jsonb()
    angle: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    properties: dict | None = c.jsonb()
    timestamp: int | None = Field(default=None, sa_column=Column(BigInteger, nullable=True))


class ThreeDImplant(SQLModel, table=True):
    __tablename__ = "three_d_implants"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    context_id: uuid.UUID = c.fk("contexts.id")
    type: str  # screw | rod
    position: list | None = c.jsonb()
    direction: list | None = c.jsonb()
    properties: dict | None = c.jsonb()
    level: str | None = None
    side: str | None = None  # L | R
    simulation_id: uuid.UUID | None = c.fk(
        "pedicle_simulations.id", nullable=True, ondelete="SET NULL"
    )
    created_at: datetime | None = c.created_at()


class PedicleSimulation(SQLModel, table=True):
    __tablename__ = "pedicle_simulations"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    context_id: uuid.UUID = c.fk("contexts.id")
    label: str
    landmarks: dict | None = c.jsonb()
    suggested_screw_l: dict | None = c.jsonb()
    suggested_screw_r: dict | None = c.jsonb()
    grading: dict | None = c.jsonb()
    created_at: datetime | None = c.created_at()
