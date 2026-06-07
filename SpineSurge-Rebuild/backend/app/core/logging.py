"""Structured, PHI-redacting logging.

Two protections:
  1. JsonFormatter emits one JSON object per line (parseable, no accidental multiline PHI dumps).
  2. RedactionFilter scrubs known PHI field names from any structured extra/args before emit.

This is best-effort defense-in-depth — code must still avoid logging raw PHI. No patient names,
DOB, contact, or email should ever be passed to the logger.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

# Field names that must never appear in logs.
_PHI_KEYS = {
    "name", "patient_name", "patientname", "dob", "date_of_birth",
    "contact", "phone", "email", "address", "ssn", "mrn",
}
_REDACTED = "***REDACTED***"


class RedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(record.__dict__.keys()):
            if key.lower() in _PHI_KEYS:
                record.__dict__[key] = _REDACTED
        return True


class JsonFormatter(logging.Formatter):
    _RESERVED = set(vars(logging.makeLogRecord({})).keys()) | {"message", "asctime"}

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        # Include structured extras (already redacted by the filter).
        for key, value in record.__dict__.items():
            if key not in self._RESERVED and not key.startswith("_"):
                payload.setdefault(key, value)
        return json.dumps(payload, default=str)


def configure_logging(level: str = "info") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactionFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
