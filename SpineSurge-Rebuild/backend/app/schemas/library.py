"""Library (collections) request/response schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    is_private: bool = True


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    is_private: bool | None = None


class CollectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None
    is_private: bool
    owner_user_id: uuid.UUID | None = None
    owner_name: str | None = None  # resolved display name
    count: int = 0  # number of studies in the collection
    created_at: str | None = None


class CollectionStudyOut(BaseModel):
    """A study row as shown inside a collection (joined to its patient)."""

    study_id: uuid.UUID
    patient_id: uuid.UUID
    name: str  # study label (modality + patient) — kept simple
    patient: str
    sex: str
    date: str | None = None
    modality: str


class CollectionDetail(CollectionOut):
    studies: list[CollectionStudyOut] = []


class AddStudyRequest(BaseModel):
    study_id: uuid.UUID
