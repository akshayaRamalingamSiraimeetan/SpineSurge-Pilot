"""Context (planning session) schemas.

The workspace state (measurements, implants, 3D implants, pedicle simulations) is serialized
browser-side and loosely shaped, so it is carried as open dicts and mapped to columns in the
context service. Persisting uses upsert/diff — never delete-all-reinsert.
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

Mode = Literal["view", "plan", "compare"]


class ContextState(BaseModel):
    model_config = ConfigDict(extra="ignore")
    measurements: list[dict[str, Any]] = []
    implants: list[dict[str, Any]] = []
    three_d_implants: list[dict[str, Any]] = []
    pedicle_simulations: list[dict[str, Any]] = []
    annotations: list[Any] = []
    tool_state: dict[str, Any] = {}


class ContextSave(BaseModel):
    id: uuid.UUID | None = None
    patient_id: uuid.UUID
    visit_id: uuid.UUID | None = None
    study_ids: list[uuid.UUID] = []
    mode: Mode = "plan"
    name: str | None = None
    state: ContextState = ContextState()
