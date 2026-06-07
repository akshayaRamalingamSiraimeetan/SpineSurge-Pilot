"""Typed application settings, loaded from environment / .env (see ../.env.example)."""

from __future__ import annotations

import json
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # App
    app_env: str = "development"
    log_level: str = "info"

    # Database (psycopg3 driver works for both sync Alembic and async app engine)
    database_url: str = "postgresql+psycopg://spinesurge:spinesurge@localhost:5432/spinesurge"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # S3 / MinIO
    s3_endpoint: str = "http://localhost:9000"
    # Browser-reachable endpoint used ONLY to sign presigned GET URLs. In Docker the API talks to
    # MinIO at the internal hostname (`http://minio:9000`) but the browser must hit the published
    # host (`http://localhost:9000`); the presign signature is host-specific, so they differ. Empty
    # → fall back to s3_endpoint (correct for non-Docker / single-host setups).
    s3_public_endpoint: str = ""
    s3_bucket: str = "spinesurge"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"

    # Orthanc / DICOMweb
    orthanc_url: str = "http://localhost:8042"
    orthanc_dicomweb_root: str = "/dicom-web"
    orthanc_user: str = "spinesurge"
    orthanc_password: str = "spinesurge"

    # Auth / OIDC
    oidc_issuer: str = ""
    oidc_audience: str = ""
    oidc_jwks_url: str = ""
    # NoDecode: keep pydantic-settings from JSON-decoding these list fields at the
    # source layer (it raises on a bare `RS256`). Our validator below accepts both
    # CSV (`RS256`) and JSON-array (`["RS256"]`) forms from the environment / .env.
    oidc_algorithms: Annotated[list[str], NoDecode] = ["RS256"]
    # Claim names carrying the active org id and role (provider-dependent).
    oidc_org_claim: str = "org_id"
    oidc_org_name_claim: str = "org_name"
    oidc_role_claim: str = "role"

    # Local dev auth: mint + verify HS256 tokens WITHOUT an external IdP.
    # MUST be false in production — enforced at startup (see main.py).
    auth_dev_mode: bool = False
    auth_dev_secret: str = "dev-insecure-secret-change-me-0123456789ab"  # >=32 bytes (HS256)

    # CORS — comma-separated origins (never "*")
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    @field_validator("cors_origins", "oidc_algorithms", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        """Accept either a CSV string (`a,b`) or a JSON array (`["a","b"]`).

        Tolerating both keeps existing `.env` files working regardless of which
        style they use; pydantic-settings no longer pre-decodes these (NoDecode).
        """
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("[") and s.endswith("]"):
                try:
                    parsed = json.loads(s)
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, list):
                    return [str(o).strip() for o in parsed if str(o).strip()]
            return [o.strip() for o in s.split(",") if o.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}


settings = Settings()
