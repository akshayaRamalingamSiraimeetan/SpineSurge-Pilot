# ADR 0003 — DICOM storage & retrieval strategy

- **Status:** Accepted (Step 0)
- **Date:** 2026-06-01

## Context
The old app stored lossy 8-bit PNG "previews" and capped PACS import at 15 slices — not diagnostic.
The ported Cornerstone3D viewer already speaks DICOMweb. We need real, full-resolution DICOM with
tenant isolation, without re-implementing a PACS.

## Decision
**Use Orthanc with the DICOMweb plugin as the imaging store.**

- **Upload:** browser/STOW-RS → FastAPI `/dicom/studies` → Orthanc STOW. Ingest + thumbnailing run
  in a background worker.
- **Read:** the viewer uses QIDO-RS (search) and WADO-RS (retrieve) **proxied through FastAPI**,
  which signs/authorizes requests and scopes them to the caller's `org_id`.
- **Isolation:** start with a single shared Orthanc using **tenant labels**; revisit
  Orthanc-per-tenant if isolation/perf demands (tracked as an open decision in MASTER.md §14).
- **Records:** `studies.orthanc_study_uid` / `scans.orthanc_series_uid` reference Orthanc; non-DICOM
  images and reports live in S3/MinIO with `org/{org_id}/...` key prefixes and presigned URLs.

## Consequences
- **Pro:** real diagnostic-quality volumes; standards-based; the Cornerstone loader works unchanged;
  free QIDO/WADO/STOW.
- **Con:** another service to operate; the FastAPI proxy must enforce tenant scoping carefully
  (no direct browser→Orthanc access).
- The old `pacsService` mock becomes a thin Orthanc client; external PACS endpoints are
  **allowlisted server-side** (no client-controlled URLs → no SSRF).
