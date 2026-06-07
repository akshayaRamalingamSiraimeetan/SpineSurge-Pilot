# SpineSurge Pro — BUILD ORDER

> The exact sequence to build the rebuild in. Each step lists **what**, **why it comes here**,
> **depends on**, and **done when**. Build top to bottom — later steps assume earlier ones exist.
>
> Companion to [`MASTER.md`](./MASTER.md). UI is built against [`./design/`](./design/).

---

## Current status — updated 2026-06-05

> **2026-06-05 — backend fix + mock-screen wiring (this session).** Fixed a **boot-blocking** backend
> defect: `Settings()` crashed on import because pydantic-settings v2.14 JSON-decodes `list[str]`
> fields at the DotEnv source layer before validators run, and `OIDC_ALGORITHMS=RS256` isn't JSON
> (every route + all backend tests were down). Fixed with `Annotated[list[str], NoDecode]` + a
> CSV/JSON-tolerant validator. Then wired the previously-mock screens to **real DB-backed endpoints**:
> **Dashboard** (`GET /dashboard` — recent studies / continue-working / unfinished / truthful task
> counts, aggregated over real patients/studies/contexts), **Library collections** (new
> `collections` + `collection_studies` tables w/ RLS, migration `0002`, full CRUD + add/remove study),
> **Settings** (`GET /org/members`, `/org/stats`, `/org/pacs` — real members, live counts, the
> actually-configured Orthanc), and **Reports PDF export** (`POST /reports/generate` → reportlab PDF
> from saved measurements → S3 → presigned download; reports re-anchored to a patient via migration
> `0003`, `visit_id` relaxed to nullable). FE: new TanStack hooks + types; Dashboard/Library/Settings
> consume live data with loading/empty states (design preserved); Report tab's Export/Preview wired.
> Gates: **backend 38 passed, ruff clean (39 routes); frontend 292 tests, lint/type/build green.**
> *Still mock (no endpoint yet): the Workspace Compare/Report-tab demo bodies and the Settings
> Workspace/Library preference panels.*
>
> **Step 9 — Collaboration (done, 2026-06-05).** Realized as an **in-process, JWT-scoped WebSocket
> relay** inside the FastAPI app (`WS /api/v1/ws/collab/{context_id}?token=`), not a separate
> ypy-websocket CRDT service — it integrates with the existing Zustand + REST-upsert design without
> rewriting the 292-test workspace store, and needs **no extra infra container**. Rooms are keyed
> `org_external:context_id` (cross-tenant observation is physically impossible). The relay carries
> presence (join/leave) + live document patches (measurement/annotation snapshots). FE: `useCollab`
> (socket + peers), `useCollabSync` (loop-free broadcast/apply via a JSON echo-guard, last-write-wins),
> and a `PresenceBar` of live collaborators in the workspace header. **Live-verified** over real
> uvicorn with two clients (presence, patch relay, leave, bad-token reject). Backend **41 passed**;
> 3 WS tests. *Scaling note: a Redis pub/sub fan-out behind the same room interface would make it
> multi-instance; room key + message shapes wouldn't change. Token-in-query is fine for the dev
> token; production should mint a short-lived WS ticket.*


| Step | State | Notes |
|---|---|---|
| 0–5 (contracts → DICOM backend) | ✅ done | FastAPI + Postgres/RLS + dev-token auth; runs locally (`AUTH_DEV_MODE=true`). **Audit 2026-06-04:** backend suite fully green (**32 passed**, ruff clean) after fixing two latent defects — dev-token per-subject email (was a shared default → `users.email` unique violation) and audit-log `ip` coercion (was raw `request.client.host` → `INET` crash on every audited mutation). |
| **6 — Frontend shell** | ✅ **done** | Vite 7 + React 19 + TS + Tailwind v4. Single icon-rail shell (one consistent nav everywhere), dev-token login + org switch, TanStack Query client. **Dashboard, Patients (live API), Workspace (all 4 tabs UI), Library, Settings modal** all built to the design. lint/type-check/build green. |
| **7a — Parity harness** | ✅ **done** | Golden-fixture harness in `frontend/test/golden/` (catalog + `deepCloseTo` tol 1e-9 + oracle). 18 fixtures, 51 cases green; wired into CI. Divergence registry at `frontend/test/divergences.md`. |
| **7b — Port 2D engine** | ✅ **done** (2026-06-02) | All 11 `lib/canvas/*` modules + 6 quick calculators copied into `src/lib/canvas/` + `src/features/measurements/quick/` unchanged (only mechanical `import type` / dead-code fixes for the stricter new tsconfig). `uuid` added. Parity test `src/lib/__parity__/golden.parity.test.ts` proves **new == old** on all 51 golden cases; 4 engine unit tests ported. Ported code's residual `any` quarantined via a scoped eslint override. lint/type-check/build/test all green (130 tests). |
| **7c — 2D refinements** | ✅ **done** (2026-06-02) | (1) **undo/redo** — collapsed `lastState`+`redoStack` → linear `history`/`future` (`UndoRedo.test.ts`); recorded as a *refinement*, not bug-fix (the redo test was already green — see divergence note). (2) **calibration** — numeric `Quantity`+unit, format at render, no regex round-trip (`features/measurements/calibration.ts` + test). (3) **`applyOperation` typing** — 15-arm discriminated union, `any` removed, compile-time contract test. All three in `frontend/test/divergences.md`. |
| **7d — Wire engine → 2D workspace** | ✅ **done** (2026-06-02) | Measurement **tool → store → panel** spine + **image + calibration + backend persistence**. `toolRegistry.ts` maps Assessment tools to their parity-locked calculators (+ a numeric `raw()` value+unit for persistence); `lib/store/workspace.ts` holds image, calibration, drafts, computed measurements. Viewer **loads a real 2D radiograph** (drop/pick), interactive SVG overlay, **two-point calibration tool** (`pixelToMm`). **Persistence:** backend `GET /studies/{id}`; FE `contextSerde.ts` (store ↔ backend `ContextState`, numeric result not display string) + `useStudy`/`useContexts`/`useSaveContext` + `useWorkspacePersistence` (resolve patient → hydrate once → debounced upsert). Real patient header + "Saving…" indicator. **Verified live end-to-end** against the running backend (save→reload preserves toolKey/result/studyIds). |
| **7e — Measurement coverage + undo/redo** | ✅ **done** (2026-06-02) | **Undo/redo** over measurements (linear past/future) wired to the viewer dock. **Tool coverage:** 11 tools now parity-locked + wired — Alignment (Cobb, SVA, PI-LL, Pelvis, TK, LL, CL — TK/LL/CL are Cobb on different levels) and **Pathology fully wired** (Spondylolisthesis 4-pt; **Canal Area** as a variable-vertex polygon, double-click/Finish to close). Pathology calculators ported + parity-locked (golden now **60 cases**). All gates green: **164 FE tests, golden 60, lint, type, build**; dev server boots. |
| **7 — Remaining sub-pieces** | ✅ **done** (2026-06-03) | **(a) Deformity sagittal/coronal suite** — 11 calcs ported + wired (TS, AVT, PO, RVAD coronal; TPA, SSA, SPA, T1SPi, T9SPi, ODHA, CBVA sagittal) via the established pattern (port verbatim → golden vectors → oracle+parity map → `toolRegistry` entry). Golden suite **60 → 85 cases**, parity green. **(b) Osteotomy interactive canvas** — `src/features/canvas/OsteotomyCanvas.tsx` wires the ported `CanvasManager` to a Canvas2D surface (cut / move-drag / rotate / wedge-osteotomy / delete + undo/redo), mounted in Planning → Simulation; pure coord mapping unit-tested (`fitTransform.test.ts`), rendering verified visually. **(c) Manual annotation tools** — line / pen / text / 2- & 3-pt angle / circle / ellipse / polygon (`AnnotationOverlay.tsx` + `annotationTools.ts`), persisted as `annot:<kind>` items on the contexts API (no backend change), shared undo/redo, right-panel list. **(d) Zoom/pan + native-pixel mapping** — `viewport.tsx` provides one image→screen transform shared by the radiograph + both overlays; points stored in native image px; wheel-zoom about cursor, hand-pan, fit/zoom controls. All gates green: **206 FE tests, golden 85, lint, type, build**. |
| **8a — Planning-geometry parity harness** | ✅ **done** (2026-06-04) | `planning/SurgicalGeometry.ts` (screw-trajectory / cylinder-plane intersection / angle↔vector / plane projection math) + `planning/ScrewDefaults.ts` (level→size lookup) ported **verbatim** into `frontend/src/features/measurements/planning/` and parity-locked. Golden suite **85 → 125 cases**; parity test extended (`golden.parity.test.ts`). No new heavy deps. Volume-probing math in `PedicleLogic.ts` (needs a live Cornerstone volume) deferred to 8b — see `divergences.md`. Gates: **246 FE tests, golden 125, lint/type/build all green.** |
| **8b (logic layer)** | ✅ **done** (2026-06-04) | Imaging deps installed (`@cornerstonejs/core` + `tools`, `dicom-parser`). Ported **verbatim** + locked: `maskUtils` (flood-fill island filter + 3D smoothing — **golden** 125→131), `PedicleLogic` (pure helpers + volume probing — synthetic-volume parity test), `DICOMParser` intensity transforms + `volumeEraser.getViewportOrientation` (value-pinned). Gates: **272 FE tests, golden 131, lint/type/build green.** App bundle unchanged (deps tree-shaken until the viewer imports them). |
| **8b (render pipeline)** | ✅ **done + verified** (2026-06-04) | Installed `@cornerstonejs/dicom-image-loader` + `@kitware/vtk.js` + `dcmjs`; copied WASM/worker/screw-`.vtk` assets to `public/`. Ported `lib/cornerstone/initCornerstone.ts` (metadata exact-match fix as a divergence; absolute worker URL). Restored the old `optimizeDeps`/`manualChunks`/COEP-safe Vite config. New `features/dicom/DicomVolumeViewer.tsx` builds a streaming volume → **4-quadrant Axial/Sagittal/Coronal MPR + bone-preset 3D**. **Verified visually**: stood up Orthanc (Docker) + a synthetic CT spine phantom; `/dicom-verify` renders correct MPR + 3D (Playwright screenshot). Gates: **272 FE tests, golden 131, lint/type/build green** (build splits vtk/cornerstone chunks). |
| **8b (workspace UI + tooling)** | 🟡 in progress (tooling layer built; live-volume tuning pending) | **WADO wiring done (2026-06-04):** the verified `DicomVolumeViewer` is now mounted in the **Planning** tab as a `3D` view option (shown only for CT studies with an `orthanc_study_uid`), loading the real volume from the tenant-scoped **WADO proxy** (`GET /dicom/wado`) instead of the dev file-load. New `lib/api/dicomWeb.ts` (binary-safe `multipart/related` splitter, boundary sniffed from the body since the proxy declares no boundary param) + `apiFetchRaw` transport + `useWadoStudy`/`useQidoStudies` hooks + `StudyVolumeViewer` lifecycle wrapper. Gates: **277 FE tests** (5 new parser tests), golden 131, lint/type/build green. **Chrome + HU threshold done (2026-06-04):** `DicomVolumeViewer` now renders the DESIGN §4.3 control bar (Volume Rendering vs Segmentation toggle + **HU-threshold histogram slider**); Volume mode drives the bone scalar-opacity curve live (the "spine extraction" effect) via the ported `boneOpacityPoints` (extracted as a pure, value-pinned fn — `volumePresets.ts`). Segmentation toggle is present but disabled with a tooltip (its mask/scissors pipeline lands with the tooling port — not faked). Gates: **280 FE tests** (3 new), golden 131, lint/type/build green. **Clinical tooling ported (2026-06-04):** new `features/dicom/planning/` module — a focused `planningStore` (pedicle workflow, screws/rods, segmentation controls, ROI), pure `screwTrajectory` helpers over the parity-locked geometry/catalog, the **5-step animated PedicleWizard** (Load→Crop→Points→Screws→Grade), **ImplantPropertiesPanel** (size from the level catalog, pitch/yaw/depth), the ported **ScrewOverlay** (axial ring + sagittal/coronal tulip-head silhouette with glow, rAF-tracked, drag-to-move), click-to-drop **point placement** on the MPR viewports, and a segmentation **labelmap + iso-threshold + scissors** layer (narrowly-typed helper, defensive). Planning's 3D view now lays out wizard ◂ 4-quadrant volume ▸ implant properties. Gates: **292 FE tests** (+12: screwTrajectory + planningStore), golden 131, lint/type/build green. **Live-verified end-to-end (2026-06-04)** against a real **185-slice lumbar CT** (full Docker stack — postgres/redis/minio/orthanc/api/web all containerized via `infra/docker-compose.yml`; frontend `Dockerfile`+nginx with COOP/COEP added). Confirmed working through the real UI: WADO load of 185 slices → 4-quadrant MPR (orientation correct) + slice scroll, HU-threshold volume rendering, pedicle wizard, click-to-place screws with **projection landing at the click point**, catalog sizing + pitch/yaw/depth live, 3D trackball. **Segmentation fixed during testing:** root-caused two bugs — (1) labelmap needed a data-changed event; (2) **CS v4 streaming volumes throw on `getScalarData()`** (no volume-level scalar array) → now thresholds **per-slice via image pixel data, rescaled to HU** (the old viewer's approach). Console spam gated behind `CS_DEBUG`. **Remaining:** final visual confirm of the segmentation mask + scissors carve; ROI volume clipping (sliders/state wired, clip not). See [`docs/3d-workspace-verification.md`](./docs/3d-workspace-verification.md). |
| **FE↔BE data wiring** | ✅ **done + smoke-verified** (2026-06-04) | Wired the frontend to the real API for every built backend feature. Added mutation hooks (`useCreatePatient`/`useUpdatePatient`/`useUpsertVisit`/`useCreateStudy`/`useUploadScan`/`useUploadDicom`). **Patients**: New Patient + Edit (real `POST`/`PATCH`), **Add Study** with either a 2D image (→ `POST /studies` + `POST /studies/{id}/scans` to S3) or a **DICOM series** (→ `POST /dicom/studies` STOW to Orthanc). **Workspace**: loads the X-ray from the study's stored scan (presigned S3 url), persists dropped images, real patient header (name/age/sex/MRN/diagnosis). Study cards show real scan thumbnails. Fixed COEP → `credentialless` so cross-origin S3/Orthanc media load (see `divergences.md`). **Verified end-to-end through the real UI** (Playwright): create patient → add study → upload X-ray → workspace renders it from S3. Gates: **272 tests, golden 131, lint/type/build green.** *Still mock (no backend endpoint yet): Dashboard feeds, Library collections, Compare, Report PDF export, Settings PACS/users panels.* **Contract audit 2026-06-04:** every FE call cross-checked against its route (path/method/params/multipart fields/shapes) + the contexts save↔hydrate round-trip — no functional mismatches; FE response types tightened to the backend's real nullability (`Visit.*`, `Study.acquisition_date`). |
| 9 — collab · 10 — reports/polish · 11 — hardening · 12 — cutover | ⬜ pending | |

> **2D workspace status:** Step 7 is **complete**. Alignment, Deformity, and Pathology measurement
> tabs are **fully functional and parity-locked** end-to-end (load X-ray → zoom/pan → calibrate →
> measure → auto-persist → reload), with manual annotations and an interactive osteotomy/fragment
> canvas (Planning → Simulation). Computed values render live above the design's demo groups (kept as
> visual reference). Next is **Step 8 (DICOM / 3D workspace)**. Library, Settings, and dashboard feeds
> still use mock data where the backend has no endpoint yet.

---

## Golden rule of ordering

**Contracts → Infrastructure → Backend → Frontend shell → Ported logic → Collaboration → Polish → Cutover.**

Build the *interface* (data model + API contract) before either side, so frontend and backend can
proceed in parallel against a fixed shape. Port the **proven logic** only after the shell exists to
host it. Delete the old project **last**.

---

## STEP 0 — Lock the contracts (before any code)

| | |
|---|---|
| **What** | Finalize the **domain data model** and the **OpenAPI contract**. Write ADRs for the locked decisions (auth provider, tenancy model, DICOM strategy). |
| **Why first** | Everything downstream is generated from or validated against these. Changing them later is the most expensive change. |
| **Depends on** | `MASTER.md` §6 (types), §10 (data model), `design/DESIGN.md`. |
| **Done when** | `docs/data-model.md` + `docs/openapi.yaml` (draft) + `docs/adr/*` committed; the TS domain types from old `lib/store/types.ts` are confirmed as the shared model. |

---

## STEP 1 — Repository & dev infrastructure

| | |
|---|---|
| **What** | Create the monorepo (`frontend/`, `backend/`, `infra/`, `docs/`). Write `infra/docker-compose.yml` with **Postgres, Redis, MinIO, Orthanc**. Add CI (lint, type-check, test) and `.env.example` for the web/server stack. |
| **Why here** | A running stack is the foundation; nothing can be integration-tested without it. |
| **Depends on** | Step 0. |
| **Done when** | `docker compose up` starts Postgres + Redis + MinIO + Orthanc healthy; CI green on an empty skeleton. |

---

## STEP 2 — Backend foundation (FastAPI)

| | |
|---|---|
| **What** | FastAPI skeleton, config, DB session, **SQLModel models** (orgs, users, memberships, patient, visit, study, scan, context, measurement, implant, report, audit), **Alembic** baseline migration. Structured **PHI-redacting logger**. |
| **Why here** | The persistence layer is the spine of the API; build it before any route logic. |
| **Depends on** | Step 1. |
| **Done when** | `alembic upgrade head` creates all tables in Postgres; models import cleanly; logger redacts PHI. |

---

## STEP 3 — Auth, tenancy & RBAC

| | |
|---|---|
| **What** | OIDC integration (Keycloak/Clerk). FastAPI deps: `get_current_user`, `require_role`, `get_org_db` (sets `app.current_org`). **Postgres RLS policies** on every table. **Audit log** middleware. |
| **Why here** | Security must be in place **before** any PHI route exists — never bolt it on later. |
| **Depends on** | Step 2. |
| **Done when** | A JWT yields a scoped DB session; cross-tenant reads are provably blocked by RLS (test); every mutation writes an audit row. |

---

## STEP 4 — Core REST API (CRUD)

| | |
|---|---|
| **What** | Routes for patients, visits, studies, scans, contexts, reports. **Paginated** list endpoints. Context save = **upsert/diff** (not delete-all-reinsert). Pydantic validation everywhere. |
| **Why here** | The frontend needs real data endpoints to build against; this realizes the Step 0 contract. |
| **Depends on** | Step 3. |
| **Done when** | OpenAPI docs live at `/docs`; all CRUD works authenticated + tenant-scoped; contract matches `docs/openapi.yaml`. |

---

## STEP 5 — DICOM backend (Orthanc + storage)

| | |
|---|---|
| **What** | Orthanc client service: **STOW** upload, **QIDO/WADO** proxy (signed, tenant-scoped). S3/MinIO service for reports/screenshots (presigned URLs). Background workers (ARQ/Celery) for ingest + thumbnails. |
| **Why here** | DICOM is a distinct subsystem; the imaging frontend (Step 8) depends on it being real. |
| **Depends on** | Step 4. |
| **Done when** | Upload a study → it is retrievable via DICOMweb, scoped to the org; reports round-trip through S3. |

---

## STEP 6 — Frontend foundation (Vite SPA shell)

| | |
|---|---|
| **What** | Vite + React 19 project. Providers (theme, **TanStack Query**, auth, router, error boundaries). **shadcn/ui + Tailwind v4** set up. Generated API client from OpenAPI. Build the **app shell** (top bar + collapsible rails) **to match `design/`**. Login + org switch. |
| **Why here** | The shell hosts every feature; auth + data client must work before features are wired. |
| **Depends on** | Steps 4 (API), `design/DESIGN.md`. |
| **Done when** | App boots, user logs in, switches org, and the shell renders to the design; patient list loads from the real API. |

---

## STEP 7 — Port the 2D workspace (logic + UI)

| | |
|---|---|
| **What** | Per `LOGIC_PORT_PLAN.md`: **7a** build the verification harness + extract golden fixtures from the old repo (oracle); **7b** port `lib/canvas/*` + `features/measurements/*` **unchanged** and prove numeric parity; **7c** apply refinements (**undo/redo fix**, **numeric calibration**, **type `applyOperation`**) as recorded divergences. Rebuild the 2D workspace UI to `design/`. |
| **Why here** | First clinical workspace; the canvas engine is the highest-value, self-contained logic. |
| **Depends on** | Step 6. |
| **Done when** | Parity tests green against the old-repo golden values; cut/rotate/osteotomy + all measurements work; the previously-failing `ResectionOperation` redo is fixed (logged as a divergence). |

---

## STEP 8 — Port the DICOM / 3D workspace

| | |
|---|---|
| **What** | Per `LOGIC_PORT_PLAN.md`: **8a** golden fixtures for planning geometry (screw trajectory, pedicle, grading) + DICOM coordinate transforms; **8b** port `lib/cornerstone/*`, `dicom-worker/*`, `features/dicom/*`, `planning/*` and prove parity for the math. Point Cornerstone at **Orthanc DICOMweb**. Rebuild viewer + pedicle wizard + implant properties UI to `design/`. Apply **exact-match metadata** fix (divergence). Carry over `public/` WASM + screw VTK models. Rendering verified visually via `/verify`. |
| **Why here** | Largest subsystem; depends on both the shell (Step 6) and the DICOM backend (Step 5). |
| **Depends on** | Steps 5, 6, 7. |
| **Done when** | DICOM volumes load + render; pedicle landmarking + screw/rod placement work; metadata maps correctly. |

---

## STEP 9 — Real-time collaboration

| | |
|---|---|
| **What** | **ypy-websocket** server. Rooms scoped `org_id:context_id`, **JWT-authorized** on join. Wire the cleaned `liveShare` slice (wss + dynamic host, efficient diffing). Presence UI. |
| **Why here** | Enhances existing features; only meaningful once contexts + workspaces exist. |
| **Depends on** | Steps 7, 8. |
| **Done when** | Two users co-edit one context live; presence shown; unauthorized room joins rejected. |

---

## STEP 10 — Reports & polish

| | |
|---|---|
| **What** | PDF report generation (worker → S3). Screenshots. Settings/profile. Remaining dialogs (import/share/reports) to `design/`. Empty/loading/error states, toasts, keyboard shortcuts, a11y pass. |
| **Why here** | Cross-cutting finish; needs all features present to be complete. |
| **Depends on** | Steps 7–9. |
| **Done when** | End-to-end clinical workflow works; UI matches design across all screens. |

---

## STEP 11 — Hardening & verification

| | |
|---|---|
| **What** | **Golden-value tests** for every clinical measurement (validated against known cases). Security review (no PHI in logs, RLS verified, SSRF closed). Load test. Helm/K8s charts. Optional importer for old SQLite data. |
| **Why here** | Quality gate before trusting it with real patients and before retiring the old code. |
| **Depends on** | Steps 0–10. |
| **Done when** | The [MASTER.md §13 Definition of Done](./MASTER.md#13-definition-of-done-before-deleting-the-old-project) checklist is fully green. |

---

## STEP 12 — Cutover (delete the old project)

| | |
|---|---|
| **What** | Verify feature + result parity with the old project. Migrate any production data. **Then delete the old project.** |
| **Why last** | The old project is the reference implementation until parity is proven. |
| **Depends on** | Step 11 (DoD green). |
| **Done when** | Parity confirmed, data migrated, old project removed, new build is the single source of truth. |

---

## Dependency graph (quick view)

```
0 Contracts
└─1 Infra
  └─2 Backend foundation
    └─3 Auth/Tenancy/RBAC
      └─4 Core REST API ──────────────┐
        └─5 DICOM backend             │
                                      ▼
                         6 Frontend shell (needs 4)
                           └─7 2D workspace (logic port + refine)
                             └─8 DICOM/3D workspace (needs 5,6,7)
                               └─9 Collaboration
                                 └─10 Reports & polish
                                   └─11 Hardening (DoD gate)
                                     └─12 Cutover → delete old project
```

## Parallelization notes
- After **Step 4**, frontend (Steps 6–7) and DICOM backend (Step 5) can run **in parallel**.
- Measurement golden-value tests (part of Step 11) can be **started during Step 7** as each tool is ported.
- `design/DESIGN.md` must be filled in **before Step 6** (shell) and kept current through Step 10.
