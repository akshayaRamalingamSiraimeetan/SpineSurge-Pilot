# SpineSurge — Start the App

Two parts: **Backend** (FastAPI in Docker) and **Frontend** (Vite dev server on your host).

---

## Prerequisites

- Docker Desktop running
- Node.js ≥ 18 + npm
- PostgreSQL 18 running on your host (port 5432)
- The `spinesurge` database already exists and is migrated (see step 2 below)

---

## 1. Environment file

Copy the example file and adjust if needed (defaults work for local dev):

```powershell
copy .env.example .env
```

Key values already set correctly for local dev:

| Variable | Default |
|----------|---------|
| `DATABASE_URL` | `postgresql+psycopg://postgres:nyx@host.docker.internal:5432/spinesurge` |
| `AUTH_DEV_MODE` | `true` |
| `VITE_API_URL` | `http://localhost:8000/api/v1` |

> If your Postgres password is not `nyx`, update `DATABASE_URL` in `.env` and in the docker run commands below.

---

## 2. Backend

### 2a. Build the image

Run from the `backend/` folder:

```powershell
cd backend
docker build -t spinesurge-api .
```

### 2b. Run database migrations (first time, or after pulling new migrations)

```powershell
docker run --rm `
  -e DATABASE_URL="postgresql+psycopg://postgres:nyx@host.docker.internal:5432/spinesurge" `
  -e AUTH_DEV_MODE=true `
  spinesurge-api `
  alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 0001_baseline
INFO  [alembic.runtime.migration] Running upgrade 0001_baseline -> 0002_collections
INFO  [alembic.runtime.migration] Running upgrade 0002_collections -> 0003_report_patient
```

If there is no output, migrations were already up to date — that is fine.

### 2c. Start the API container

If a previous container is still around (you'll get a "Conflict" error otherwise), remove it first:

```powershell
docker stop spinesurge-api; docker rm spinesurge-api
```

Then start:

```powershell
docker run -d `
  --name spinesurge-api `
  -p 8000:8000 `
  -e DATABASE_URL="postgresql+psycopg://postgres:nyx@host.docker.internal:5432/spinesurge" `
  -e AUTH_DEV_MODE=true `
  -e CORS_ORIGINS="http://localhost:5173" `
  spinesurge-api
```

> `CORS_ORIGINS` must be passed explicitly. Without it the backend uses the default value from config which can be overridden by a stale `.env` file inside the image, causing the browser's CORS preflight (OPTIONS) to return 400 and the frontend to show "Could not reach the API: Failed to fetch".

API is now available at **http://localhost:8000**

- Swagger UI: http://localhost:8000/api/v1/docs
- Health check: http://localhost:8000/api/v1/health

### 2d. Stop / restart the backend

```powershell
# Stop
docker stop spinesurge-api

# Start again (image already built, no code changes)
docker start spinesurge-api

# Rebuild after code changes
docker stop spinesurge-api
docker rm spinesurge-api
cd backend
docker build -t spinesurge-api .
# then run step 2c again (including -e CORS_ORIGINS)
```

---

## 3. Frontend

### 3a. Install dependencies (first time only)

```powershell
cd frontend
npm install
```

### 3b. Start the dev server

```powershell
npm run dev
```

Frontend is now available at **http://localhost:5173**

The dev server hot-reloads on file changes. Keep this terminal open while developing.

---

## 4. Verify everything is working

### Get a dev auth token

```powershell
$token = (Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8000/api/v1/auth/dev-token" `
  -ContentType "application/json" `
  -Body '{"subject":"dev-user-1","org_id":"dev-org-1","role":"owner","email":"dev@example.com"}').access_token
```

### Call /auth/me

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:8000/api/v1/auth/me" `
  -Headers @{ Authorization = "Bearer $token" }
```

Expected response:
```
user_id   : <uuid>
org_id    : <uuid>
role      : owner
email     : dev@example.com
```

### Open the app in the browser

Navigate to **http://localhost:5173** — you should see the SpineSurge login/dashboard screen.

---

## 5. Useful commands

### Check backend logs

```powershell
docker logs spinesurge-api
docker logs -f spinesurge-api   # follow / live tail
```

### Check what tables are in the database

```powershell
$env:PGPASSWORD="nyx"
psql -U postgres -d spinesurge -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
```

### Check current migration version

```powershell
psql -U postgres -d spinesurge -t -c "SELECT version_num FROM alembic_version;"
```

### Run frontend tests

```powershell
cd frontend
npm test                   # single run
npm run test:watch         # watch mode
npm run test:golden        # parity / golden fixture tests
```

### Type-check the frontend

```powershell
cd frontend
npm run type-check
```

### Lint the frontend

```powershell
cd frontend
npm run lint
```

---

## 6. Ports at a glance

| Service | URL |
|---------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend (FastAPI) | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/api/v1/docs |
| PostgreSQL | localhost:5432 |

---

## 7. Resetting the database (nuclear option)

Only needed if the schema is in a broken state:

```powershell
$env:PGPASSWORD="nyx"
psql -U postgres -c "DROP DATABASE spinesurge;"
psql -U postgres -c "CREATE DATABASE spinesurge;"
```

Then re-run step 2b to apply migrations from scratch.
