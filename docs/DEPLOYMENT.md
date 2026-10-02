# Hosted Demo Deployment — runbook

Goal: a public link testers can open and use on their own (no laptop running), plus a short guide
(docs/DEMO_GUIDE.md). Status as of 2026-10-02: **stage set, not deployed yet** (needs the owner's
hosting account). Next session: pick a host, deploy, smoke-test, fill the link into DEMO_GUIDE.md.

## Architecture of the deployment
One container = web app + API on one port (same origin → no CORS / API URL config):
- `Dockerfile`: stage 1 `vite build` → `dist/`; stage 2 runs `server/index.ts` with `tsx`,
  `SERVE_CLIENT=true` serves `dist/` with a HashRouter fallback (`server/index.ts`, end of file).
- Start command: `server/migrate.ts` (idempotent SQL migrations) → if `DEMO_MODE=true`,
  `server/seed-dev-user.ts` (creates/resets the shared demo login) → `server/index.ts`.
- Postgres: managed (Render / Neon / Railway / Supabase). `server/db.ts` uses TLS automatically for
  non-localhost hosts (`DATABASE_SSL` overrides).
- Uploads (scans, report PDFs, avatars): disk at `UPLOADS_DIR` (default `/data/uploads`) — must be a
  **persistent volume**, otherwise images vanish on every redeploy.
- Health check: `GET /healthz`.
- Live share (Yjs WebSocket) runs on the same port; requires `?token=` (handled by the client).

## Environment variables
| var | required | notes |
|---|---|---|
| `DATABASE_URL` | yes | managed Postgres connection string |
| `JWT_SECRET` | yes | ≥ 32 random chars in production (startup refuses placeholders) |
| `DEMO_MODE` | demo | `true`: sign-up skips the email code; enables demo seed in production |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` / `DEMO_USER_NAME` | demo | shared tester login (seeded on every start) |
| `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` | optional | **build args**: pre-fill the sign-in form |
| `UPLOADS_DIR` | yes | persistent disk path (`/data/uploads`) |
| `RESEND_API_KEY` etc. | no | only for real email verification (not needed with `DEMO_MODE`) |

## Option A — Render (blueprint in repo: `render.yaml`) — recommended
1. Push the branch to GitHub. Render → New → **Blueprint** → select repo → it creates
   `spinesurge-demo` (Docker web service, 2 GB disk at `/data`) + `spinesurge-db` (Postgres).
2. Fill the `sync: false` vars (demo email/password; optional VITE_DEMO_*). `JWT_SECRET` is generated.
3. Deploy; open `https://spinesurge-demo.onrender.com/healthz` → `{"ok":true}`; then the root URL.
Cost: web `starter` (disk needs a paid instance) + `basic-256mb` Postgres ≈ low monthly cost.
Free tiers sleep after inactivity and free Postgres expires — fine for a 1-day try, not for a demo link.

## Option B — Railway / Fly.io
Same image: create a service from the Dockerfile, add Postgres plugin, add a volume mounted at
`/data`, set the env vars above. Fly: `fly launch` (detects Dockerfile), `fly volumes create data`.

## Smoke test after deploy (do every deploy)
1. `/healthz` ok. 2. Sign in with the demo login. 3. Dashboard → New Study → import an X-ray →
Assessment: calibrate, Cobb angle. 4. Planning: place a screw. 5. Compare: load Image B.
6. Report: preview + export PDF. 7. Reload page → everything still there (DB + disk persist).
8. Import a small CT folder → 3D view loads (needs browser with WebGL2).

## Known gaps before sharing widely (track in BUGS.md)
- Tenancy (SRV-02/04/10/11): any signed-in user can see all patients — **use only anonymised
  sample data in the demo**, or decide the tenancy model first.
- `/uploads` is public-by-URL (SRV-08).
- No rate limiting on auth (SRV-18).
- Sample data: no seeded sample patient/X-ray yet — testers import their own files (or we add a
  `seed-demo-data` script with an anonymised spine X-ray + small CT).
