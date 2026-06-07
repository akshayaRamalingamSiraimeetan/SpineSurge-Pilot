"""FastAPI application factory.

Step 2 wires: config, PHI-safe logging, CORS (locked to known origins), and health routes.
Auth, business routes, and DICOM/storage services arrive in Steps 3–5.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    auth,
    collab,
    collections,
    contexts,
    dashboard,
    dicom,
    health,
    org,
    patients,
    reports,
    scans,
    studies,
    visits,
)
from app.core.config import settings
from app.core.logging import configure_logging

API_V1 = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.log_level)
    # Fail fast: insecure local auth must never run in production.
    if settings.is_production and settings.auth_dev_mode:
        raise RuntimeError("AUTH_DEV_MODE must be disabled in production")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="SpineSurge Pro API",
        version="0.1.0",
        openapi_url=f"{API_V1}/openapi.json",
        docs_url=f"{API_V1}/docs",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,  # explicit origins, never "*"
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix=API_V1)
    app.include_router(auth.router, prefix=API_V1)
    app.include_router(patients.router, prefix=API_V1)
    app.include_router(dashboard.router, prefix=API_V1)
    app.include_router(visits.router, prefix=API_V1)
    app.include_router(studies.router, prefix=API_V1)
    app.include_router(scans.router, prefix=API_V1)
    app.include_router(contexts.router, prefix=API_V1)
    app.include_router(collections.router, prefix=API_V1)
    app.include_router(org.router, prefix=API_V1)
    app.include_router(reports.router, prefix=API_V1)
    app.include_router(dicom.router, prefix=API_V1)
    app.include_router(collab.router, prefix=API_V1)
    return app


app = create_app()
