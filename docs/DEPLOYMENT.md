# Hosted Demo Deployment — runbook

> **Free, no-card setup (current): see docs/FREE_DEPLOY.md** (Render free + Supabase + Brevo).
> `render.yaml` is the free blueprint; this file describes the paid always-on variant and the
> environment reference. Storage: `S3_*` vars → any S3-compatible bucket (DEPLOY-07); without them
> uploads go to `UPLOADS_DIR` (needs a persistent disk).

Goal: a public link anyone can open, **sign up with their own details** and start working (no laptop
running, no tunnel). Status 2026-10-04: **rehearsed, not deployed** — a fresh database migrated cleanly
and the full journey (sign up without email code → profile → organization → upload → save session →
privacy between users → share by username) passed against a production-mode server. Waiting for the
owner's hosting account + a push of the code to GitHub (branch `demo-deploy`, see below).

Needs internet: it is a hosted web app. Offline use would need a separately installed desktop build
with its own local database (not part of the demo).

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
| `DEMO_MODE` | demo | `true`: sign-up skips the email code (self sign-up without an email service) |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` / `DEMO_USER_NAME` | optional | shared tester login, seeded only if set |
| `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` | optional | **build args**: pre-fill the sign-in form |
| `UPLOADS_DIR` | yes | persistent disk path (`/data/uploads`) |
| `EMAIL_PROVIDER` | yes for real codes | `smtp` (or `resend`); `mock` = codes only in the server log. When set, sign-up always requires the emailed code (DEMO_MODE no longer skips it) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | with smtp | Gmail: `smtp.gmail.com`, **587**, the Gmail address, a 16-char **app password** (Google account → Security → 2-Step Verification → App passwords). Startup log shows `[email] SMTP ready` or the login error. Render blocks SMTP only on free instances |
| `EMAIL_API_KEY` | with resend | Resend key; `EMAIL_FROM` must be on a domain verified in Resend |
| `PLATFORM_ADMIN_EMAILS` | optional | login emails that see the live **Monitor** (sidebar → /platform, MON-01): every user's activity, uploaded images, sessions, plans, comparisons, reports; view-only access to all studies; Block/Unblock accounts. Admins' own activity is not monitored |

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

## Git: deploy from branch `demo-deploy`
`origin/postgres-migration` has 32 older teammate commits (Jul–Aug) that were never merged into the
local Run 1–6 work; pushing over it would discard them. Deploy from a new branch instead and merge
later deliberately.

## Known gaps before sharing widely (track in BUGS.md)
- Tenancy: done (UI12-10 — studies private to their owner, sharing, org admin view-only).
- Private uploads (DEPLOY-05): images, DICOM files and report PDFs are served only to signed-in users
  with access to that study (HttpOnly cookie set on sign-in/API calls; enforced when SERVE_CLIENT=true).
  With HTTPS (Render default), encrypted DB/disk at rest and per-user access, identifiable data is
  technically protected — whether real patient data may be used is a consent/compliance decision
  (hospital policy, India DPDP Act; data region = Singapore in render.yaml).
- Auth rate limit: 20 attempts / IP / 15 min on login, register, verify (DEPLOY-02).
- No password reset yet ("Forgot password" says coming soon); no email verification in DEMO_MODE.
- Sample data: no seeded sample patient/X-ray yet — testers import their own files (or we add a
  `seed-demo-data` script with an anonymised spine X-ray + small CT).
