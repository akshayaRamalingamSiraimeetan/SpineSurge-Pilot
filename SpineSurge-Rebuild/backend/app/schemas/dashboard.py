"""Dashboard feed schemas.

The dashboard is a read-only aggregate over real tenant data (patients, visits, studies,
contexts). Timestamps are emitted as ISO-8601 strings; the frontend formats them for display
(absolute date or relative "2 hours ago"). Nothing here is fabricated — every field is derived
from rows the org actually owns.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class ContinueWorking(BaseModel):
    patient_id: uuid.UUID
    context_id: uuid.UUID | None = None
    study_id: uuid.UUID | None = None  # patient's latest study, for workspace navigation
    name: str
    stage: str
    date: str | None = None  # acquisition/visit date text, if any
    tag: str | None = None  # diagnosis
    last_opened: str | None = None  # ISO-8601
    studies: int = 0
    status: str = "In Progress"
    modality: str | None = None


class RecentStudy(BaseModel):
    patient_id: uuid.UUID
    study_id: uuid.UUID
    name: str
    dx: str | None = None
    date: str | None = None  # ISO-8601 (created_at) or acquisition text
    studies: int = 0
    modality: str | None = None


class UnfinishedStudy(BaseModel):
    patient_id: uuid.UUID
    context_id: uuid.UUID
    study_id: uuid.UUID | None = None  # patient's latest study, for workspace navigation
    name: str
    modality: str | None = None
    date: str | None = None
    dx: str | None = None
    edited: str | None = None  # ISO-8601 (last_modified)


class TaskRow(BaseModel):
    group: str
    icon: str
    title: str
    sub: str
    meta: str
    tone: str  # accent | danger


class DashboardFeed(BaseModel):
    continue_working: ContinueWorking | None = None
    recent_studies: list[RecentStudy] = []
    unfinished: list[UnfinishedStudy] = []
    tasks: list[TaskRow] = []
