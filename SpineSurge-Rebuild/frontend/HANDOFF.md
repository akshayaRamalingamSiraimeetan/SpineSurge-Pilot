# Frontend Handoff — for the next build agent

You are continuing a multi-tenant SaaS rebuild of **SpineSurge Pro** (spine imaging + surgical
planning). The **backend is complete and tested** (Steps 0–5). The **design is finalized**. Your job
is the **frontend (Steps 6–8)**: scaffold the Vite SPA base, build the UI to the design, and port the
validated clinical logic from the old repo.

Read these first (all in `SpineSurge-Rebuild/`), in order:
1. `MASTER.md` — the plan & decisions (web SaaS, Vite + React 19 + shadcn/ui, FastAPI backend).
2. `BUILD_ORDER.md` — step sequence (you own Steps 6, 7, 8).
3. `design/DESIGN.md` — **the UI source of truth** (tokens, all 28 screens, component map).
4. `LOGIC_PORT_PLAN.md` — how to port the old repo's tools with parity (Steps 7a–7c, 8a–8b).
5. `docs/data-model.md` + `docs/openapi.yaml` — the backend contract you call.

The old repo (reference/oracle for ported logic) is at the workspace root `../../` (one level above
`SpineSurge-Rebuild/`): `src/renderer/lib/canvas/*`, `src/renderer/features/measurements/*`,
`src/renderer/lib/cornerstone/*`, `dicom-worker/*`, `public/` (WASM + screw `.vtk` models). Its
Vite config (WASM/worker/COOP-COEP) is tuned — reuse it.

---

## Current state
- `backend/` — FastAPI, Postgres+RLS, OIDC/JWT auth (dev-token mode for local), full REST API,
  Orthanc DICOMweb + S3 storage. Runs at `http://localhost:8000`, docs at `/api/v1/docs`.
  Lint-clean, 32 tests pass. (Docker is off on the owner's machine — backend runs but live infra
  like Postgres/Orthanc may not be up; use the dev-token + handle empty data gracefully.)
- `frontend/` — **Steps 6, 7, 8a, 8b-logic + 8b-render-pipeline complete; FE↔BE data plane wired (2026-06-04).**
  Vite 7 + React 19 + TS + Tailwind v4. Single icon-rail shell, dev-token login + org switch, typed
  API client + TanStack Query. The **2D workspace is fully wired**: 22 parity-locked clinical tools
  (Alignment + Deformity + Pathology), interactive osteotomy canvas, manual annotations, zoom/pan,
  unified undo/redo, auto-persist to the contexts API. **Step 8**: planning + DICOM math parity-locked
  (`SurgicalGeometry`, `ScrewDefaults`, `PedicleLogic`, `maskUtils`, DICOM transforms); the
  **Cornerstone3D/VTK render pipeline is ported + visually verified** (`initCornerstone`,
  `DicomVolumeViewer` 4-quadrant MPR+3D) at the dev route `/dicom-verify` against a Docker Orthanc + a
  synthetic CT phantom. **Data wiring**: every built backend feature is now called from the UI —
  create/edit patient, add study (2D image → S3 scan, or DICOM series → Orthanc STOW), workspace loads
  the stored scan + persists measurements; smoke-verified end-to-end through the real UI (Playwright).
  Parity harness in `test/golden/` (oracle + ported, **131 cases**, in CI).
  **272 unit/parity tests, golden 131, lint/type/build green.**
  **Next: the 8b design-matched 3D workspace UI** (wire `DicomVolumeViewer` into Planning → 3D via the
  WADO proxy; pedicle wizard, implant properties, HU-threshold). *Still mock (no backend endpoint):
  Dashboard feeds, Library collections, Compare, Report PDF export, Settings PACS/users.* See
  [`README.md`](./README.md) and [`../BUILD_ORDER.md`](../BUILD_ORDER.md).
- `design/` — `DESIGN.md` + the design PDF context. The **dashboard** was produced by Claude Design
  as an HTML handoff; it (and the rest of `SS/`) was ported into React.

---

## STEP 6 — scaffold the base (do this first)
Create the Vite SPA in `frontend/` per `MASTER.md §11`:

```
src/
  app/            providers (theme, TanStack Query, auth, router), error boundaries, routes
  features/       dashboard, patients, library, workspace (assessment/planning/compare/report), settings
  lib/
    api/          typed client generated/derived from ../docs/openapi.yaml + TanStack Query hooks
    auth/         token storage, dev-token login, org context, role guard
    canvas/       (Step 7) ported engine
    cornerstone/  (Step 8) ported init
    measurements/ (Step 7) ported math
    store/        Zustand slices (cleaned; managers OUT of store)
    theme/        design tokens (CSS vars from DESIGN.md §2), light+dark
  components/ui/  shadcn components
  dicom-worker/   (Step 8) ported workers
public/           (Step 8) ported WASM + screw .vtk
```

Foundation requirements:
- **Vite 7 + React 19 + TypeScript + Tailwind v4 + shadcn/ui.** Install the tokens from
  `design/DESIGN.md §2` as CSS variables; wire light/dark via a theme provider.
- **TanStack Query** for all server state; **react-hook-form + zod** for forms.
- **Auth:** call `POST /api/v1/auth/dev-token` (dev) to get a JWT, store it, attach `Authorization:
  Bearer` to every request, call `GET /api/v1/auth/me` on load. Build a login + org-switch screen.
  Production OIDC config is env-driven — keep the token flow abstracted.
- **API base** from `VITE_API_URL` (default `http://localhost:8000/api/v1`).
- Build the **two nav shells** (icon rail + labeled sidebar) and routing for: `/dashboard`,
  `/patients`, `/library`, `/workspace/:studyId` (tabs assessment/planning/compare/report), `/settings`.
- **Done when:** app boots, logs in (dev-token), lists patients from the real API, renders the
  dashboard shell to the design.

**Port the Claude Design dashboard HTML into React/shadcn as the first screen** — it establishes the
visual language; match its tokens exactly, then reuse them everywhere.

## STEP 7 — port 2D workspace (Assessment) — follow `LOGIC_PORT_PLAN.md`
- **7a:** build the verification harness; generate golden fixtures from the OLD repo's
  `lib/canvas/*` + `features/measurements/*` (the validated oracle).
- **7b:** copy those modules into `lib/canvas` / `lib/measurements` **unchanged**; prove numeric
  parity (vitest, tol 1e-9) before wiring UI.
- **7c:** apply refinements as recorded divergences: fix undo/redo (failing `ResectionOperation`
  redo), make calibration numeric (no display-string round-trip), type `applyOperation`.
- Build the Assessment UI (tool panel A/D/P/M, black canvas + floating toolbar, measurement panel,
  case summary, calibration, reference lines, coachmark) to `design/DESIGN.md §4.3`.
- **Honor the core principle:** *a tool outputs a measurement object → Zustand stores it → canvas /
  panel / report / autosave all render from state.* Tools never poke the UI directly.
- Wire autosave to `POST /api/v1/contexts` (debounced; the backend does upsert/diff).

## STEP 8 — port DICOM/3D (Planning · Compare · 3D)
- **8a/8b:** golden fixtures + parity for planning geometry (`planning/*`) and DICOM coordinate
  transforms; port `lib/cornerstone/*`, `dicom-worker/*`, `features/dicom/*`. Point Cornerstone at
  the backend DICOM proxy: `GET /api/v1/dicom/qido/studies`, `GET /api/v1/dicom/wado?studyUID=…`
  (tenant-scoped). Apply the exact-match metadata fix. Rendering verified visually via `/verify`.
- Build Planning (Target Correction + Simulation + 3D/CT quadrants), Compare (dual viewport +
  comparison table), Report (builder + TipTap + dnd-kit + PDF export) to the design.

---

## Conventions & guardrails
- **UI = the design.** Match `design/DESIGN.md` (layout, tokens, components). shadcn primitives;
  TipTap for the report editor; dnd-kit for report-section reorder.
- **Logic = unchanged + proven.** Never hand-rewrite the validated math; port it and prove parity.
  Every intentional change goes in `frontend/test/divergences.md`.
- **No managers/refs in the Zustand store** (old anti-pattern); keep store serializable.
- **RBAC in UI is cosmetic** — the server enforces; reflect roles, don't trust them.
- **Tenant/PHI:** never log PHI; presigned image URLs come from the API; respect org scope.
- **Test as you go:** parity tests (Step 7/8), component sanity, and keep `npm run lint`/`type-check`
  green. Adding `frontend/package.json` auto-activates the CI `frontend` job.

## Backend quick reference (all under `/api/v1`, Bearer JWT)
`auth/dev-token` `auth/me` · `patients` (list paginated `?page&q&archived`, create, `/{id}`,
PATCH, `/{id}/archive`) · `patients/{id}/visits` · `visits/{id}` (DELETE) · `studies` ·
`studies/{id}/scans` (upload) · `contexts` (GET `?patientId`, POST upsert/diff) · `reports/{visitId}`,
`reports/upload` · `dicom/studies` (STOW), `dicom/qido/studies`, `dicom/wado`. Roles:
`owner>admin>surgeon>viewer` (writes need surgeon+, archive/delete admin+).

## Open items to confirm with the owner
- OIDC provider (Keycloak vs Clerk) for production auth — dev-token covers local for now.
- A few PDF annotations are future scope: measurement trend graphs, study intelligence over time,
  collaboration model, scalable N-study comparison.

Start with **Step 6**. Build the base clean; the design and the validated logic do the rest.
