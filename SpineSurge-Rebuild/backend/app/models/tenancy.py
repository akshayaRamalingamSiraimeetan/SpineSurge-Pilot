"""Tenancy & identity models: orgs, users, memberships, audit_log.

orgs and users are global (no org_id). memberships and audit_log are tenant-scoped (RLS).
See docs/data-model.md and ADR 0001.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Column, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

from app.db import columns as c


class Org(SQLModel, table=True):
    __tablename__ = "orgs"

    id: uuid.UUID = c.uuid_pk()  # internal UUID (RLS compares against this)
    # External tenant id from the IdP (e.g. Clerk "org_xxx", Keycloak uuid). Mapped to id.
    external_id: str | None = Field(
        default=None, sa_column=Column(String, unique=True, index=True)
    )
    name: str
    slug: str | None = Field(default=None, sa_column=Column(String, unique=True))
    created_at: datetime | None = c.created_at()


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = c.uuid_pk()  # internal UUID
    # External IdP subject ("sub"). Provider-agnostic (may be non-UUID, e.g. Clerk).
    subject: str | None = Field(
        default=None, sa_column=Column(String, unique=True, index=True)
    )
    email: str | None = Field(default=None, sa_column=Column(String, unique=True))
    display_name: str | None = None
    title: str | None = None
    created_at: datetime | None = c.created_at()


class Membership(SQLModel, table=True):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("org_id", "user_id", name="uq_membership_org_user"),)

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    user_id: uuid.UUID = c.fk("users.id")
    role: str  # owner | admin | surgeon | viewer (validated in schemas, Step 4)


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    user_id: uuid.UUID | None = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")),
    )
    action: str
    entity_type: str | None = None
    entity_id: uuid.UUID | None = Field(
        default=None, sa_column=Column(PGUUID(as_uuid=True), nullable=True)
    )
    ip: str | None = Field(default=None, sa_column=Column(INET, nullable=True))
    # Attribute is `meta` because `metadata` is reserved by SQLAlchemy declarative base.
    # The DB column is still named "metadata".
    meta: dict | None = Field(default=None, sa_column=Column("metadata", JSONB, nullable=True))
    created_at: datetime | None = c.created_at()
