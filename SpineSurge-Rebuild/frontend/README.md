# frontend/ — Vite SPA (SpineSurge Pro)

React 19 + TypeScript + Vite 7 + Tailwind v4 + shadcn-style primitives + TanStack Query + Zustand.
Built to match [`../design/DESIGN.md`](../design/DESIGN.md). Backend contract:
[`../docs/openapi.yaml`](../docs/openapi.yaml).

## Status (2026-06-03) — Steps 6 & 7 complete; next is Step 8 (DICOM/3D)

> **Step 7 (2D workspace) is fully done.** 22 parity-locked clinical tools across Alignment +
> Deformity + Pathology; interactive osteotomy canvas (Planning → Simulation); manual annotations;
> zoom/pan with native-pixel mapping; unified undo/redo; auto-persist to the contexts API.
> **206 unit/parity tests, golden 85, lint/type/build green.** The DICOM/3D viewer is still a
> placeholder — that is **Step 8** (no Cornerstone/DICOM code in `src/` yet). Sections below describe
> the Step 6/7a baseline and remain accurate for the shell; treat the parity-harness wording as the
> historical starting point (the suite is now 85 cases, not 51).


- **Providers**: theme (light/dark, persisted), TanStack Query (server state), Auth (dev-token →
  `/auth/me`, org context), React Router, top-level error boundary.
- **Auth**: dev-token login + org switch (`AuthProvider.login/switchOrg/logout`). The token flow is
  abstracted so production OIDC swaps in without touching consumers. The API client attaches
  `Authorization: Bearer` to every request.
- **One shell** (`components/shells/AppShell.tsx`): a single icon rail used by every authenticated
  route, so navigation is identical across screens (DESIGN.md §3). Settings is a modal; the rail
  avatar opens a profile/org popover. Screens needing a second list column (Patients, Library) render
  it as their own content.
- **Routes**: `/login`, `/dashboard`, `/workspace/:studyId`, `/patients`, `/library` (Settings is a
  modal, not a route).
- **Screens built to the design**:
  - **Dashboard** — ported from the Claude Design build (hero, recent, unfinished, tasks, new-study modal).
  - **Patients** — list + detail wired to the real API (`/patients`, `/patients/{id}` → visit timeline + study cards); paginated, searchable, full empty/loading/error states.
  - **Workspace** — all four tabs (Assessment / Planning / Compare / Report) built. UI renders from
    state; computed clinical values arrive when the engine is ported (Step 7b). DICOM viewer is a
    placeholder until Step 8.
  - **Library / Settings** — built to the design; mock data where the backend has no endpoint yet
    (collections, PACS, org users).
- **Step 7a — parity harness** (`test/golden/`): golden fixtures locking the old repo's clinical math
  as ground truth. See [`test/golden/README.md`](./test/golden/README.md) and the divergence registry
  [`test/divergences.md`](./test/divergences.md). **51 cases green, in CI.**

**Next: Step 8 (DICOM / 3D workspace)** — start with the planning-geometry + DICOM-transform golden
harness (`LOGIC_PORT_PLAN.md` §8a), then port `lib/cornerstone/*`, `dicom-worker/*`, `features/dicom/*`,
`planning/*` and point Cornerstone at Orthanc DICOMweb. The 2D port (Step 7) is the template to follow.

## Run

```bash
npm install
cp .env.example .env        # default VITE_API_URL=http://localhost:8000/api/v1
npm run dev                 # http://localhost:5173
```

### Backend for local dev (dev-token mode)

The SPA needs the FastAPI backend with `auth_dev_mode` on and CORS allowing the dev origin:

```bash
cd ../backend
# Postgres must be reachable at the configured DATABASE_URL with the `spinesurge` role/db.
.venv/bin/alembic upgrade head
AUTH_DEV_MODE=true CORS_ORIGINS='["http://localhost:5173"]' \
  .venv/bin/python -m uvicorn app.main:app --port 8000
```

Then sign in on `/login` (default identity `dev@spine.local`, role `surgeon`, org `Spine Center`).
Org switch / sign-out live in the labeled-sidebar user menu. Dev orgs are seeded in
`src/lib/auth/devOrgs.ts`; the backend JIT-provisions an org per external id.

## Scripts

| | |
|---|---|
| `npm run dev` | Vite dev server (COOP/COEP headers on, ready for Step 8 WASM) |
| `npm run build` | type-check (project refs) + production build |
| `npm run lint` | ESLint (flat config) |
| `npm run type-check` | `tsc --noEmit` |
| `npm run test` | Vitest (parity tests land in Step 7) |

## Layout

```
src/
  app/            providers, router, error boundary
  components/     Icon/Logo (ported), ImageSlot, Stub, ui/ (shadcn-style), shells/ (the two navs)
  features/       dashboard, auth (login), patients  (workspace/library/settings arrive later)
  lib/
    api/          typed fetch client + domain types (from openapi) + TanStack hooks
    auth/         token/session storage, AuthProvider (dev-token), RequireAuth guard, devOrgs
    store/        Zustand UI slice (serializable; managers stay OUT, per MASTER.md §8.6)
    theme/        useTheme (data-theme on <html>)
    utils.ts      cn()
  styles/         tokens.css + screens.css (ported verbatim) + app.css (added screens) + index.css
public/           favicon  (WASM + screw VTK models arrive in Step 8)
```

Vite config carries over the old repo's tuned COOP/COEP + ES-worker + custom-asset settings so the
Cornerstone/VTK pipeline (Step 8) drops in without re-tuning.
