"""Reusable column factories.

Each factory returns a *fresh* SQLModel Field wrapping a *new* SQLAlchemy Column, so the same
definition can be used across many models without sharing Column instances (which SQLAlchemy
forbids). Postgres-specific types live here so models stay declarative and consistent.
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field


def uuid_pk() -> object:
    """UUID primary key, server-generated via gen_random_uuid() (pgcrypto)."""
    return Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True),
            primary_key=True,
            server_default=text("gen_random_uuid()"),
        ),
    )


def org_fk(*, primary_key: bool = False) -> object:
    """Tenant scope column: org_id FK → orgs.id, indexed. Present on every scoped table (RLS)."""
    return Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("orgs.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
            primary_key=primary_key,
        ),
    )


def fk(
    target: str,
    *,
    nullable: bool = False,
    ondelete: str = "CASCADE",
    index: bool = True,
    primary_key: bool = False,
) -> object:
    """Generic UUID foreign key."""
    return Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey(target, ondelete=ondelete),
            nullable=nullable,
            index=index,
            primary_key=primary_key,
        ),
    )


def jsonb(*, nullable: bool = True) -> object:
    """JSONB column for geometric / clinical blobs."""
    return Field(default=None, sa_column=Column(JSONB, nullable=nullable))


def created_at() -> object:
    return Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), nullable=False),
    )


def updated_at() -> object:
    return Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        ),
    )
