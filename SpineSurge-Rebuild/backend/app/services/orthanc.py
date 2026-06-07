"""Orthanc DICOMweb client.

The backend is the only thing that talks to Orthanc; the browser always goes through our proxy so we
can enforce tenant scope and sign requests. Upload uses Orthanc's REST `/instances`; search/retrieve
use DICOMweb QIDO-RS / WADO-RS.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import httpx

from app.core.config import settings

# DICOM tag keys used in QIDO-RS JSON.
TAG_STUDY_INSTANCE_UID = "0020000D"


@dataclass
class IngestResult:
    orthanc_study_uid: str
    series_uids: list[str] = field(default_factory=list)
    instance_count: int = 0


class OrthancClient:
    @property
    def _base(self) -> str:
        return settings.orthanc_url.rstrip("/")

    @property
    def _dicomweb(self) -> str:
        return f"{self._base}{settings.orthanc_dicomweb_root.rstrip('/')}"

    def _auth(self) -> httpx.BasicAuth:
        return httpx.BasicAuth(settings.orthanc_user, settings.orthanc_password)

    async def ingest(self, files: list[bytes]) -> IngestResult:
        """Upload DICOM instances; return the study UID and the series it contains."""
        study_orthanc_ids: set[str] = set()
        series_orthanc_ids: set[str] = set()
        async with httpx.AsyncClient(auth=self._auth(), timeout=120) as client:
            for data in files:
                resp = await client.post(
                    f"{self._base}/instances",
                    content=data,
                    headers={"Content-Type": "application/dicom"},
                )
                resp.raise_for_status()
                body = resp.json()
                if body.get("ParentStudy"):
                    study_orthanc_ids.add(body["ParentStudy"])
                if body.get("ParentSeries"):
                    series_orthanc_ids.add(body["ParentSeries"])

            if not study_orthanc_ids:
                raise ValueError("No DICOM instances were accepted by Orthanc")

            study_oid = next(iter(study_orthanc_ids))
            study = (await client.get(f"{self._base}/studies/{study_oid}")).json()
            study_uid = study["MainDicomTags"]["StudyInstanceUID"]

            series_uids: list[str] = []
            for sid in series_orthanc_ids:
                series = (await client.get(f"{self._base}/series/{sid}")).json()
                series_uids.append(series["MainDicomTags"]["SeriesInstanceUID"])

        return IngestResult(
            orthanc_study_uid=study_uid,
            series_uids=series_uids,
            instance_count=len(files),
        )

    async def qido_studies(self, params: dict[str, str]) -> list[dict]:
        async with httpx.AsyncClient(auth=self._auth(), timeout=30) as client:
            resp = await client.get(
                f"{self._dicomweb}/studies",
                params=params,
                headers={"Accept": "application/dicom+json"},
            )
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []

    async def wado_stream(self, study_uid: str) -> AsyncIterator[bytes]:
        """Stream a study's DICOM bytes (WADO-RS retrieve) without buffering it all in memory."""
        async with httpx.AsyncClient(auth=self._auth(), timeout=300) as client:
            async with client.stream(
                "GET",
                f"{self._dicomweb}/studies/{study_uid}",
                headers={"Accept": "multipart/related; type=application/dicom"},
            ) as resp:
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes():
                    yield chunk


orthanc = OrthancClient()
