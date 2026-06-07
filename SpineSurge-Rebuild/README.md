# SpineSurge Pro (Rebuild)

Multi-tenant SaaS for spine imaging & surgical planning. Browser SPA (Vite + React + shadcn/ui) +
FastAPI backend, with Orthanc DICOMweb for imaging. See [`MASTER.md`](./MASTER.md) for the full plan
and [`BUILD_ORDER.md`](./BUILD_ORDER.md) for the build sequence.

## Status
- ✅ **Step 0 — Contracts:** [`docs/data-model.md`](./docs/data-model.md),
  [`docs/openapi.yaml`](./docs/openapi.yaml), [`docs/adr/`](./docs/adr/)
- ✅ **Step 1 — Infra:** this README, [`infra/docker-compose.yml`](./infra/docker-compose.yml),
  [`.env.example`](./.env.example), CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml))
- ✅ **Step 2 — Backend foundation:** FastAPI app, SQLModel models (15 tables), Alembic baseline
  with RLS, PHI-redacting logging, health routes, tests → `backend/`
- ✅ **Step 3 — Auth, tenancy enforcement & RBAC:** OIDC/JWKS verification (provider-agnostic),
  stateless `Principal` + role hierarchy, JIT identity provisioning, org-scoped `get_context`
  (sets `app.current_org` → activates RLS), audit logging, gated local dev-token. Lint clean,
  14 tests pass.
- ✅ **Step 4 — Core REST API:** patients (paginated/filtered CRUD + archive), visits (upsert/delete),
  studies, contexts (**upsert/diff**, hydrated reads), reports (metadata). RBAC per route, audited,
  RLS-scoped. Lint clean, 23 tests pass (+4 live-DB tests skip without Postgres).
- ✅ **Step 5 — DICOM backend + storage:** Orthanc client (STOW ingest, QIDO search, WADO stream)
  and S3/MinIO storage (presigned URLs, per-tenant key prefixes). DICOM routes + scan/report binary
  uploads. Tenant isolation enforced from our DB (QIDO intersect, WADO ownership check). Lint clean,
  28 tests pass (+4 live-infra tests skip).
- ✅ **Step 6 — Frontend foundation:** Vite 7 + React 19 + Tailwind v4 SPA built to `design/`;
  icon-rail shell, dev-token login + org switch, TanStack Query; Dashboard, Patients (live API),
  Workspace, Library, Settings. Lint/type-check/build green → `frontend/`
- ✅ **Step 7a/7b — Parity harness + 2D engine port:** golden harness (`frontend/test/golden/`,
  **85 cases**, tol 1e-9); all `lib/canvas/*` + quick + pathology + deformity calculators ported with
  **new == old** parity proof. Engine unit tests ported.
- ✅ **Step 7c — Refinements:** undo/redo linear model, numeric calibration (no display-string
  round-trip), `applyOperation` discriminated union — recorded in
  [`frontend/test/divergences.md`](./frontend/test/divergences.md).
- ✅ **Step 7d/7e — 2D workspace wired:** load X-ray → zoom/pan → calibrate → measure → undo/redo →
  **auto-persist to the contexts API** → reload rehydrates. Verified live end-to-end.
- ✅ **Step 7 (complete, 2026-06-03):** **22 parity-locked clinical tools** across Alignment +
  Deformity + Pathology; **interactive osteotomy canvas** (cut/move/rotate/wedge over rendered image
  fragments, in Planning → Simulation); **manual annotations** (line/pen/text/angle/circle/ellipse/
  polygon, persisted via the contexts API); **zoom/pan with native-pixel coordinate mapping**.
  Unified measurement+annotation undo/redo. **206 FE tests, golden 85, lint/type/build green.**
  Next: **Step 8 — DICOM/3D workspace** (not yet started; no DICOM/Cornerstone code in the frontend yet).

### Auth (Step 3) — local usage without an IdP
```bash
# In backend/.env (or ../.env): AUTH_DEV_MODE=true
curl -s -X POST localhost:8000/api/v1/auth/dev-token \
  -H 'content-type: application/json' \
  -d '{"subject":"u1","org_id":"org-1","role":"surgeon"}'        # -> {access_token: ...}
curl -s localhost:8000/api/v1/auth/me -H "Authorization: Bearer <token>"
```
Production uses real OIDC: set `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` and leave
`AUTH_DEV_MODE=false` (the app refuses to boot if dev mode is on in production).

### Run the backend (Step 2)
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
# with the infra stack up (or any Postgres on DATABASE_URL):
alembic upgrade head          # creates all tables + RLS policies
uvicorn app.main:app --reload # http://localhost:8000/api/v1/docs
pytest                        # 5 pass; DB-schema tests run when a DB is reachable
```

## Layout
```
MASTER.md          Plan / source of truth
BUILD_ORDER.md     Ordered build steps
design/            UI design (image + DESIGN.md) — source of truth for UI
docs/              data-model, openapi contract, ADRs
infra/             docker-compose + service configs (postgres, redis, minio, orthanc)
frontend/          Vite SPA (Step 6+)
backend/           FastAPI (Step 2+)
```

## Run the dev infrastructure (Step 1)
```bash
cd SpineSurge-Rebuild
cp .env.example .env          # adjust if needed
docker compose -f infra/docker-compose.yml --env-file .env up -d
docker compose -f infra/docker-compose.yml ps   # all services should be "healthy"
```

### Service endpoints (defaults)
| Service | URL | Notes |
|---|---|---|
| Postgres | `localhost:5432` | user/pass/db = `spinesurge` |
| Redis | `localhost:6379` | jobs/queue |
| MinIO S3 | `http://localhost:9000` | bucket `spinesurge` auto-created |
| MinIO console | `http://localhost:9001` | `minioadmin` / `minioadmin` |
| Orthanc | `http://localhost:8042` | DICOMweb at `/dicom-web`, `spinesurge`/`spinesurge` |

Tear down (keep data): `docker compose -f infra/docker-compose.yml down`
Wipe data: add `-v`.

## Next
Proceed to **Step 8 — DICOM / 3D workspace** — see [`BUILD_ORDER.md`](./BUILD_ORDER.md) and
[`LOGIC_PORT_PLAN.md`](./LOGIC_PORT_PLAN.md) §8a. Start with the planning-geometry + DICOM-transform
golden harness (same parity pattern as the 2D port), then port `lib/cornerstone/*`, `dicom-worker/*`,
`features/dicom/*`, `planning/*` and point Cornerstone at Orthanc DICOMweb.

### Run the frontend
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173  (Workspace → load an X-ray)
npm test              # 206 unit + parity tests
npm run test:golden   # 85 golden oracle cases
```
