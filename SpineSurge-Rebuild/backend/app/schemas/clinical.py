"""Request/response schemas for the clinical resources (mirror docs/openapi.yaml)."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Gender = Literal["M", "F", "O"]


# ── Patients ────────────────────────────────────────────────────────────────
class PatientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    age: int | None = Field(default=None, ge=0, le=150)
    gender: Gender = "O"
    dob: str | None = None
    contact: str | None = None


class PatientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    age: int | None = Field(default=None, ge=0, le=150)
    gender: Gender | None = None
    dob: str | None = None
    contact: str | None = None


class ArchiveRequest(BaseModel):
    archived: bool = True


class ScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    study_id: uuid.UUID
    type: str
    date: str | None = None
    storage_key: str | None = None
    orthanc_series_uid: str | None = None
    url: str | None = None  # presigned download (filled for non-DICOM images)


class StudyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    patient_id: uuid.UUID
    visit_id: uuid.UUID | None = None
    modality: str
    source: str
    acquisition_date: str | None = None
    orthanc_study_uid: str | None = None
    scans: list[ScanOut] = []


class VisitCreate(BaseModel):
    id: uuid.UUID | None = None
    visit_number: str | None = None
    date: str | None = None
    time: str | None = None
    diagnosis: str | None = None
    comments: str | None = None
    height: str | None = None
    weight: str | None = None
    consultants: str | None = None
    surgery_date: str | None = None


class VisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    visit_number: str | None = None
    date: str | None = None
    time: str | None = None
    diagnosis: str | None = None
    comments: str | None = None
    height: str | None = None
    weight: str | None = None
    consultants: str | None = None
    surgery_date: str | None = None


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    age: int | None = None
    gender: Gender
    dob: str | None = None
    contact: str | None = None
    last_visit: str | None = None
    has_alert: bool
    is_archived: bool


class PatientDetail(PatientOut):
    visits: list[VisitOut] = []
    studies: list[StudyOut] = []


# ── Studies ─────────────────────────────────────────────────────────────────
class StudyCreate(BaseModel):
    id: uuid.UUID | None = None
    patient_id: uuid.UUID
    visit_id: uuid.UUID | None = None
    modality: str = "X-Ray"
    source: Literal["import", "pacs", "upload"] = "upload"
    acquisition_date: str | None = None


# ── Reports (metadata; binary upload arrives in Step 5) ─────────────────────
class ReportCreate(BaseModel):
    visit_id: uuid.UUID
    title: str | None = None
    storage_key: str | None = None


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    patient_id: uuid.UUID | None = None
    visit_id: uuid.UUID | None = None
    title: str | None = None
    storage_key: str | None = None
    created_at: object | None = None
    url: str | None = None  # presigned download


class ReportGenerateRequest(BaseModel):
    """Generate a PDF report from a patient's saved workspace context (measurements)."""

    patient_id: uuid.UUID
    context_id: uuid.UUID | None = None  # defaults to the patient's most-recent context
    title: str | None = None
