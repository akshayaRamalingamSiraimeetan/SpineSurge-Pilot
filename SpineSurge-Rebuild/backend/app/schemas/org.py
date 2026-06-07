"""Organisation/admin settings schemas (members, usage stats, PACS connections)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class OrgMember(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str | None = None
    role: str
    status: str = "Active"


class OrgStats(BaseModel):
    patients: int
    studies: int
    reports: int
    collections: int


class PacsConnection(BaseModel):
    server: str
    ae: str
    host: str
    port: str
    status: str  # Configured | Not configured (we report the real configured Orthanc, no fakes)
