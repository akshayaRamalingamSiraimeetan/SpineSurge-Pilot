# SpineSurge Pro — MASTER BUILD DOCUMENT

> **Purpose:** Single source of truth for rebuilding SpineSurge Pro on a new stack with a new UI,
> while preserving the existing domain logic (canvas engine, measurement math, DICOM/3D pipeline).
>
> **Status (2026-06-03):** Build in progress. Backend (Steps 0–5) ✅. Frontend shell (Step 6) ✅.
> **Step 7 (2D workspace) is COMPLETE** ✅ — 2D engine ported + parity-locked (7a/7b), refinements
> (undo/redo, calibration, applyOperation typing) (7c), workspace wired (7d/7e), and the remaining
> sub-pieces done: the full **Deformity** sagittal/coronal suite (22 clinical tools now parity-locked,
> golden suite **85 cases**), the **interactive osteotomy canvas** (cut/move/rotate/wedge over rendered
> image fragments, in Planning → Simulation), **manual annotation tools** (line/pen/text/angle/
> circle/ellipse/polygon, persisted on the contexts API), and **zoom/pan with native-pixel coordinate
> mapping**. Assessment (Alignment + Deformity + Pathology) is functional end-to-end (load X-ray →
> zoom/pan → calibrate → measure with parity-locked math → auto-persist → reload) with unified
> undo/redo. **Steps 8a + the 8b logic layer** are also **done** — `SurgicalGeometry`, `ScrewDefaults`,
> `maskUtils`, `PedicleLogic`, and the DICOM intensity/viewport transforms ported verbatim and
> parity-locked (golden **131 cases**, **272 FE tests green**). Imaging deps (`@cornerstonejs/core` +
> `tools`, `dicom-parser`) installed. The **8b render pipeline** is also done + **verified**:
> `initCornerstone` ported (metadata exact-match fix), WASM/worker/VTK assets carried over, a new
> `DicomVolumeViewer` builds a streaming volume → 4-quadrant MPR + bone-preset 3D — confirmed live
> against a synthetic CT phantom served from a Docker Orthanc (`/dicom-verify`). The **frontend↔backend
> data plane is now fully wired + smoke-verified** (2026-06-04): create/edit patient, add study, upload
> 2D X-ray (→S3) or DICOM series (→Orthanc STOW), workspace loads the stored scan + persists
> measurements — proven end-to-end through the real UI. (Dashboard/Library/Compare/Report/Settings-admin
> panels stay mock until their backend endpoints exist.) **Next: the 8b design-matched 3D workspace
> UI** (pedicle wizard, implant properties, HU-threshold, WADO-proxy). See
> [`BUILD_ORDER.md`](./BUILD_ORDER.md#current-status--updated-2026-06-03) for the live step tracker.
> The **current/old project will be deleted ONLY after** this new build is complete, verified, and the
> logic has been fully ported. Until then, the old project at `../` (repo root) is the **reference
> implementation** for all tools and logic.
>
> **Audit + hardening (2026-06-04):** Full FE↔BE wiring audit — every frontend call verified against
> its backend route (path / method / query params / multipart field names / request+response shapes)
> plus the contexts save↔hydrate round-trip; **no functional mismatches.** Two latent backend defects
> fixed: (1) the dev-token minted a shared default email for every subject, colliding on the unique
> `users.email` constraint (now derived per-subject); (2) the audit log wrote `request.client.host`
> raw into a Postgres `INET` column, which crashed **every** audited mutation when the host wasn't a
> literal IP (now coerced via `ipaddress`, invalid → NULL). FE response types aligned to the backend's
> real nullability (`Visit.*`, `Study.acquisition_date`). **Backend suite now fully green — 32 passed,
> ruff clean; frontend 272 tests + golden 131, lint/type/build green.**

---

## 0. Guiding principles

1. **The tools, logic, and math in the old project are correct — they need refinement, not redesign.**
   We **port** them; we do not rewrite their behavior.
2. **Rebuild only the scaffolding** that was weak: UI, auth, persistence, multi-tenancy, PACS, logging.
3. **The new UI is design-driven.** A UI design (image + written description) is provided by the
   product owner and lives in [`./design/`](./design/). The built UI **must match that design.**
   See [Section 7 — UI Design Source of Truth](#7-ui-design-source-of-truth).
4. Nothing in the old project is deleted until the equivalent feature works in the new build.

---

## 1. What we are building

A browser-based, **multi-tenant SaaS** medical imaging + spine surgical-planning application.

Two clinical workspaces share one application shell:
- **2D Radiograph Workspace** — fragment cut/rotate/osteotomy engine + clinical measurement tools
  (Cobb, PI/LL, SVA, pelvic params, deformity, pathology).
- **3D / DICOM Workspace** — Cornerstone3D + VTK.js volume rendering, pedicle landmarking, and
  screw/rod planning.

Plus patient/visit/study management, real-time collaboration, and PDF report export.

### Confirmed decisions (locked)
| Decision | Choice |
|---|---|
| Deployment target | **Web app (browser)** |
| Scale & security | **SaaS, multi-tenant, HIPAA-grade** (RBAC, audit, PHI encryption) |
| Frontend | **Vite SPA + React 19 + shadcn/ui + Tailwind v4** |
| Backend | **Python — FastAPI** |

---

## 2. The core insight

Almost all logic worth keeping is **browser-side TypeScript** (canvas engine, geometry, measurement
math, Cornerstone/VTK pipeline). The weak parts (auth, persistence, PACS, multi-tenancy, logging) are
**exactly the parts being replaced** by the new FastAPI backend.

**Therefore this is a low-risk port, not a risky rewrite:** move the logic core into a clean new
shell and rebuild the scaffolding properly.

```
KEEP & REFINE (port ~as-is)        REBUILD (new)
─────────────────────────────     ──────────────────────────────
lib/canvas/*  (engine, geometry)   UI layer (new design + shadcn/ui)
features/measurements/* (all math) Zustand store wiring (cleaned)
lib/cornerstone/* + dicom-worker   Backend → FastAPI (multi-tenant)
features/dicom/* (viewer pipeline) Auth + RBAC + audit (SaaS)
features/.../planning (screws)     Persistence → Postgres + RLS
                                   DICOM storage → Orthanc + S3/MinIO
                                   Collaboration → Python Yjs server
```

---

## 3. Target architecture

```
                         ┌─────────────────────────────────────────┐
  Browser (Vite SPA)     │  React 19 + shadcn/ui + Tailwind         │
                         │  Zustand (clean slices) + TanStack Query │
                         │  ┌──────────────┐  ┌──────────────────┐  │
                         │  │ Canvas engine │  │ Cornerstone3D /   │  │
                         │  │ + measurements│  │ VTK.js pipeline   │  │ ← PORTED LOGIC
                         │  └──────────────┘  └──────────────────┘  │
                         └───────┬───────────────┬──────────────┬────┘
                  HTTPS (JWT)    │      WSS       │   DICOMweb    │
                                 ▼               ▼   (QIDO/WADO)  ▼
                    ┌────────────────────┐  ┌──────────┐  ┌──────────────┐
                    │ FastAPI (Python)   │  │ Yjs WS   │  │ Orthanc      │
                    │  REST API + auth   │  │ (ypy)    │  │ DICOMweb     │
                    │  RBAC + audit      │  └──────────┘  │ (per-tenant) │
                    └─────┬──────────┬───┘                └──────┬───────┘
                          ▼          ▼                           ▼
                  ┌──────────────┐ ┌──────────────┐      ┌──────────────┐
                  │ Postgres     │ │ S3 / MinIO   │      │ Object store │
                  │ (RLS, tenant)│ │ (reports/img)│      │ (DICOM blobs)│
                  └──────────────┘ └──────────────┘      └──────────────┘
```

**Why Orthanc:** Do not re-implement PACS. Orthanc provides real QIDO-RS / WADO-RS / STOW-RS,
full-resolution DICOM, and the ported Cornerstone loader already speaks DICOMweb. The old project's
PNG-preview "PACS import" becomes a real volume pipeline for free.

---

## 4. Technology stack (precise)

| Layer | Choice | Notes |
|---|---|---|
| Build | **Vite 7** (keep) | The old WASM/worker/COOP-COEP config is already tuned — reuse it. |
| UI | **React 19 + shadcn/ui + Tailwind v4** | Full UI rebuild to match `./design/`. |
| State | **Zustand** (keep, refactor) | Same model; cleaned slices; managers move out of the store. |
| Data fetching | **TanStack Query** | Replaces hand-rolled `api.ts` + manual store sync. |
| Forms | **react-hook-form + zod** | Typed validation; shape shared with backend schemas. |
| Imaging | **Cornerstone3D + VTK.js** (keep) | Ported verbatim, pointed at Orthanc DICOMweb. |
| Backend | **FastAPI + Pydantic v2** | Async, typed, auto OpenAPI (generates FE types). |
| ORM | **SQLModel / SQLAlchemy 2.0 + Alembic** | Replaces Drizzle + drizzle-kit migrations. |
| DB | **Postgres 16 + Row-Level Security** | Tenant isolation enforced at the DB, not just app code. |
| DICOM | **Orthanc** (DICOMweb plugin) | STOW upload, QIDO/WADO read; tenant-scoped. |
| Object storage | **S3 / MinIO** | Reports, screenshots, non-DICOM images; presigned URLs. |
| Auth | **Keycloak or Clerk (OIDC)** | Org/tenant first-class. Do not hand-roll auth. |
| Realtime | **ypy-websocket** | Python Yjs server; rooms scoped + authorized by JWT. |
| Background jobs | **Celery / ARQ + Redis** | DICOM ingest, thumbnails, PDF reports. |
| Infra | **Docker Compose → Kubernetes (Helm)** | Compose for dev, Helm for prod. |

---

## 5. Multi-tenant SaaS design

**Model:** shared DB + shared schema + `org_id` on every row + **Postgres Row-Level Security**.

- **Identity:** OIDC. JWT carries `sub` (user), `org_id` (tenant), `role`.
- **Isolation:** every table has `org_id`. A FastAPI dependency runs `SET app.current_org = :org_id`
  per request; an RLS policy (`org_id = current_setting('app.current_org')`) makes cross-tenant reads
  physically impossible even if app code has a bug.
- **DICOM isolation:** Orthanc tenant labels (or per-tenant instance); WADO URLs signed + scoped.
- **Object storage:** keys prefixed `org/{org_id}/...`; short-lived presigned URLs only.
- **RBAC roles:** `owner / admin / surgeon / viewer`, enforced in FastAPI deps and reflected in UI.
- **Audit log:** append-only `(who, org, action, entity, timestamp, ip)` on every PHI access/mutation.
- **Collaboration rooms:** `org_id:context_id`; the Yjs server validates JWT + membership before join.

---

## 6. Logic to PORT (the "tools and logic are fine" inventory)

These modules carry over from the old project with **behavior unchanged**. Paths are relative to the
old repo root (`../`). During the port, apply the refinements in [Section 8](#8-refinements-applied-during-the-port).

### 6.1 2D canvas engine — `lib/canvas/`
- `CanvasManager.ts` — state-tree, operations (CUT, ROTATE, MOVE, WEDGE_OSTEOTOMY, implants…), undo/redo
- `GeometryUtils.ts`, `GeometryEngine.ts`, `CurveUtils.ts`, `TransformationCalculator.ts`
- `OpenOsteotomyOperation.ts`, `FragmentSplitter.ts`, `SurgicalOperations.ts`
- `ValidationEngine.ts`, `GapRenderer.ts`, `CanvasUtils.ts`
- Existing tests: `OpenOsteotomyOperation.*.test.ts`, `ResectionOperation.test.ts`

### 6.2 Clinical measurement math — `features/measurements/`
- `quick/`: `CobbAngle.ts`, `PI_LL.ts`, `SVA.ts`, `VBM.ts`, `PelvicParams.ts`, `SpinalCurvatures.ts`
- `deformity/` (+ `tools/`: Coronal, Pelvic, Vertebral, Spinopelvic, Base)
- `pathology/`: `Stenosis.ts`, `Spondylolisthesis.ts`
- `utilities/UtilitiesTools.ts`, `MeasurementSystem.ts`

### 6.3 Surgical planning — `features/measurements/planning/`
- `PedicleLogic.ts`, `ScrewDefaults.ts`, `SurgicalGeometry.ts`, `PlanningTools.ts`
- `ImplantRenderer.ts`, `VtkHighFidelityScrew.ts`

### 6.4 DICOM / 3D pipeline
- `lib/cornerstone/initCornerstone.ts` (Cornerstone3D + tools setup, metadata provider)
- `features/dicom/CornerstoneViewer.tsx` (split during rebuild; logic preserved)
- `features/dicom/DICOMParser.ts`, `volumeEraser.ts`, `maskUtils.ts`
- `features/dicom/components/` (`ScrewOverlay2D`, `SpinePedicleWizard`, `CropOverlay2D`, help)
- `dicom-worker/` (WASM decoders + web workers) + `public/` WASM blobs + `public/models/screws/*.vtk`

### 6.5 Domain types
- `lib/store/types.ts` (Patient, Visit, Study, Scan, Context, Measurement, ThreeDImplant,
  PedicleSimulation, PedicleLandmark) — port as the shared TS domain model.

---

## 7. UI Design Source of Truth

> **A new UI design is provided by the product owner as an image + written description.**
> It is the authoritative reference for the rebuilt interface.

- **Location:** [`./design/`](./design/)
  - Place the design **image(s)** here (e.g. `design/ui-main.png`, `design/ui-3d.png`).
  - Place the **written description** in [`./design/DESIGN.md`](./design/DESIGN.md).
- **Rule:** the rebuilt UI **must match the provided design** — layout, hierarchy, color, typography,
  spacing, and interaction patterns — implemented with shadcn/ui + Tailwind.
- **Process:** before building each screen, the design image + `DESIGN.md` are the spec. Components
  are composed to match the design; the **ported logic** (Section 6) is wired underneath unchanged.
- If the design and a ported tool's UX conflict, the **design wins for presentation**; the
  **logic/result wins for correctness** — reconcile, don't silently drop either.

UI scope to redesign (presentation only — logic stays in `lib/`):
- Application shell (top bar + collapsible left/right rails) — unify the old project's 3 divergent layouts.
- Patient/Cases dashboard.
- 2D workspace (toolbar, measurement panels, properties).
- 3D/DICOM workspace (viewport layouts, pedicle wizard, implant properties).
- Dialogs (import, share, reports, settings, profile).
- Auth / org-switch screens.

---

## 8. Refinements applied during the port

The logic is correct; these are the agreed *refinements* (no behavior change to clinical results):

1. **Undo/redo bug** in `CanvasManager` — collapse the `lastState` + `redoStack` duality into one
   linear `{ past[], present, future[] }` model. (Fixes the failing `ResectionOperation` redo test.)
2. **Calibration** — store numeric value + unit and format at render; remove the regex-on-display-
   string round-trip in `canvasSlice`.
3. **Metadata provider** (`initCornerstone`) — exact normalized-key match instead of two-way
   `endsWith` (prevents wrong spacing/orientation being attached to an image).
4. **Type the engine** — `applyOperation(params)` becomes a discriminated union (remove `any`).
5. **Delete dead code** — `DICOMViewer.legacy.tsx`, Dexie `lib/db.ts`, the `getManager` stub.
6. **Move `managers`** out of the Zustand store into a ref/context (non-serializable state).
7. **Logging** — no PHI in logs; structured, redacting logger, off by default in prod.

---

## 9. Backend (FastAPI) structure

```
backend/
  app/
    main.py
    core/         # config, security (JWT verify), rls, logging (PHI-redacting)
    db/           # session, base, alembic migrations
    models/       # SQLModel: org, user, membership, patient, visit, study,
                  #           scan, context, measurement, implant, report, audit
    schemas/      # Pydantic request/response (source of FE types)
    api/v1/
      auth.py patients.py visits.py studies.py contexts.py reports.py dicom.py
    deps/         # get_current_user, require_role, get_org_db (sets RLS)
    services/     # orthanc_client, storage(s3), audit, context_diff
    workers/      # celery/arq: dicom ingest, thumbnails, pdf reports
```

Backend behaviors that fix the old issues:
- Context save = **upsert/diff**, not delete-all-reinsert; client debounces + optimistic mutations.
- `/patients` is **paginated + filtered**; no full-graph reload after every mutation.
- All input **validated by Pydantic**; **no** server filesystem `folderPath` walk; PACS endpoints
  **allowlisted server-side** (no SSRF).
- **Authenticated** routes + WS upgrade; CORS locked to known origins.

---

## 10. Data model migration

Old Drizzle/SQLite → SQLModel/Postgres:
- Add `org_id` (FK → orgs) to **every** table + RLS policies.
- New tables: `orgs`, `users`, `memberships(org_id, user_id, role)`, `audit_log` (append-only).
- DICOM rows reference **Orthanc study/series/SOP UIDs**, not local PNG paths.
- Drop client-generated `Date.now()+random` IDs → server-side UUID defaults.
- JSON blobs (`points`, `properties`, `toolState`) → Postgres `jsonb` (queryable, indexed).
- Alembic baseline migration; optional one-off importer for existing SQLite data into a default org.

---

## 11. Proposed repository layout (new build)

```
SpineSurge-Rebuild/
  MASTER.md                 # this document
  design/                   # UI design image(s) + DESIGN.md  (source of truth)
  frontend/                 # Vite SPA (React 19 + shadcn/ui)
    src/
      app/                  # router, providers, error boundaries
      features/             # canvas, dicom, measurements, patients, planning (UI)
      lib/
        canvas/             # ★ PORTED engine + geometry
        cornerstone/        # ★ PORTED init + providers
        measurements/       # ★ PORTED clinical math
        api/                # generated client + TanStack hooks
        store/              # cleaned Zustand slices
      components/ui/         # shadcn
      dicom-worker/          # ★ PORTED workers/decoders
    public/                  # ★ PORTED WASM + screw VTK models
  backend/                  # FastAPI (see Section 9)
  infra/
    docker-compose.yml      # postgres, redis, minio, orthanc, api, yjs, web
    helm/                   # production charts
  docs/                     # ADRs, API contract, runbooks
```

---

## 12. Phased roadmap

| Phase | Goal | Deliverable |
|---|---|---|
| **0. Foundations** | Monorepo + Docker Compose (Postgres, Redis, MinIO, Orthanc) + CI | `docker compose up` brings the stack live |
| **1. Backend core** | FastAPI skeleton, models, Alembic, OIDC auth, RBAC, RLS, audit | Authenticated, tenant-isolated CRUD; OpenAPI docs |
| **2. DICOM backend** | Orthanc: STOW upload, QIDO/WADO proxy, S3 for reports | Upload → retrievable via DICOMweb, tenant-scoped |
| **3. FE shell + auth** | New Vite SPA, providers, **shell built to `./design/`**, login/org switch | App boots, logs in, lists patients from new API |
| **4. Port 2D workspace** | Move `lib/canvas` + measurement math; rebuild UI to design; **fix undo/redo + calibration** | 2D measuring/osteotomy on new stack, tests green |
| **5. Port DICOM/3D** | Cornerstone/VTK pipeline; viewer + planning UI to design; metadata fix | DICOM viewing, pedicle landmarks, screw placement |
| **6. Collaboration** | ypy-websocket server, JWT-scoped rooms, presence UI | Two surgeons co-editing a context live |
| **7. Reports + polish** | PDF report worker, screenshots to S3, settings | End-to-end clinical workflow |
| **8. Hardening** | Measurement golden-value tests, security review, load test, Helm | Production-ready multi-tenant deploy |
| **9. Cutover** | Verify parity with old project, migrate data | **Delete the old project** |

*~12 weeks for one focused engineer; compresses with parallel FE/BE work.*

---

## 13. Definition of done (before deleting the old project)

- [ ] Every ported tool produces results identical to the old project (golden-value tests).
- [ ] All clinical measurements covered by unit tests against known cases.
- [ ] Undo/redo test suite green; no regressions in osteotomy/fragment ops.
- [ ] DICOM load, pedicle landmarking, and screw planning verified on real studies.
- [ ] Auth, RBAC, RLS, and audit logging verified; cross-tenant access provably impossible.
- [ ] UI matches `./design/` across all screens.
- [ ] Reports export correctly; collaboration verified with 2+ users.
- [ ] Security review passed; no PHI in logs.
- [ ] Data migration from old SQLite verified (if needed).

Only when this checklist is fully green is the old project removed.

---

## 14. Open decisions (do not block Phase 0)

1. **Auth provider** — Keycloak (self-hosted, BAA-friendly) vs Clerk (fastest, managed).
2. **DICOM at scale** — shared Orthanc + tenant labels vs Orthanc-per-tenant (start shared).
3. **Cloud/hosting** — affects S3 flavor, K8s, and BAA.

---

## 15. Reference

- Old project (reference implementation): `../` (repo root)
- Prior architecture review: `../review.md`
- UI design spec: [`./design/DESIGN.md`](./design/DESIGN.md) + design image(s)
