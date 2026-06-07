"""DICOM ingest/response schemas."""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class DicomIngestResult(BaseModel):
    study_id: uuid.UUID
    orthanc_study_uid: str
    series_count: int
    instance_count: int
