"""Clinical domain models: patients, visits, studies, scans, reports.

All are tenant-scoped (org_id + RLS). Loose date/time fields are stored as text to match the
existing domain model (see old lib/store/types.ts); typed dates are introduced where the old model
already used real dates (surgery handled as text for now, normalized in Step 4 if needed).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlmodel import SQLModel

from app.db import columns as c


class Patient(SQLModel, table=True):
    __tablename__ = "patients"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    name: str
    age: int | None = None
    gender: str = "O"  # M | F | O
    dob: str | None = None
    contact: str | None = None
    last_visit: str | None = None
    has_alert: bool = False
    is_archived: bool = False
    created_at: datetime | None = c.created_at()
    updated_at: datetime | None = c.updated_at()


class Visit(SQLModel, table=True):
    __tablename__ = "visits"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    patient_id: uuid.UUID = c.fk("patients.id")
    visit_number: str | None = None
    date: str | None = None
    time: str | None = None
    diagnosis: str | None = None
    comments: str | None = None
    height: str | None = None
    weight: str | None = None
    consultants: str | None = None
    surgery_date: str | None = None
    created_at: datetime | None = c.created_at()
    updated_at: datetime | None = c.updated_at()


class Study(SQLModel, table=True):
    __tablename__ = "studies"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    patient_id: uuid.UUID = c.fk("patients.id")
    visit_id: uuid.UUID | None = c.fk("visits.id", nullable=True, ondelete="SET NULL")
    modality: str = "X-Ray"
    source: str = "upload"  # import | pacs | upload
    acquisition_date: str | None = None
    orthanc_study_uid: str | None = None
    created_at: datetime | None = c.created_at()


class Scan(SQLModel, table=True):
    __tablename__ = "scans"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    study_id: uuid.UUID = c.fk("studies.id")
    type: str = "Imported"  # Pre-op | Post-op | Imported
    date: str | None = None
    storage_key: str | None = None  # S3/MinIO key for non-DICOM images
    orthanc_series_uid: str | None = None
    created_at: datetime | None = c.created_at()


class Report(SQLModel, table=True):
    __tablename__ = "reports"

    id: uuid.UUID = c.uuid_pk()
    org_id: uuid.UUID = c.org_fk()
    # A report is anchored to a patient; the visit link is optional (a generated workspace report
    # may not correspond to a recorded encounter).
    patient_id: uuid.UUID | None = c.fk("patients.id", nullable=True)
    visit_id: uuid.UUID | None = c.fk("visits.id", nullable=True, ondelete="SET NULL")
    title: str | None = None
    storage_key: str | None = None  # S3/MinIO key (PDF)
    created_at: datetime | None = c.created_at()
