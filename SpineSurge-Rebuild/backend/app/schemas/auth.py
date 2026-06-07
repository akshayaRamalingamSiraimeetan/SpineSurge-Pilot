"""Auth-related schemas: the stateless token principal, the resolved request context, and DTOs."""

from __future__ import annotations

import uuid

from pydantic import BaseModel


class Principal(BaseModel):
    """Identity as asserted by the verified token. External ids; no DB lookups yet."""

    subject: str  # IdP "sub"
    org_external: str  # IdP org id (mapped to an internal org UUID later)
    role: str
    email: str | None = None
    name: str | None = None
    org_name: str | None = None


class CurrentUser(BaseModel):
    """Identity after DB resolution: internal UUIDs the rest of the app uses."""

    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str
    subject: str
    email: str | None = None


class Me(BaseModel):
    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str
    email: str | None = None


class DevTokenRequest(BaseModel):
    subject: str = "dev-user"
    org_id: str = "dev-org"
    role: str = "surgeon"
    email: str | None = None  # derived per-subject in the dev-token route when omitted
    org_name: str | None = "Dev Hospital"


class DevTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
