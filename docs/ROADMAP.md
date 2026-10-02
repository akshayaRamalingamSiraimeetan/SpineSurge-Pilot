# Roadmap / next sessions (owner's stated order, 2026-10-02)

Read first: `docs/ARCHITECTURE_NOTES.md` → `docs/BUGS.md` → this file.

1. **Hosted demo** (in progress) — stage set (Dockerfile, render.yaml, SERVE_CLIENT, DEMO_MODE,
   demo seed, docs/DEPLOYMENT.md, docs/DEMO_GUIDE.md). Next: owner picks host + account, deploy,
   smoke test, put link into DEMO_GUIDE.md. Consider a `seed-demo-data` script (anonymised X-ray + CT).
2. **Mobile app — planning only** (do alongside the demo, no code yet). Questions to settle:
   target (tablet-first? iPad for surgeons), scope (view/report/measure vs. full planning),
   approach (responsive PWA of the same React app vs. React Native/Capacitor wrapper reusing
   `lib/` + store), offline needs, DICOM/3D on mobile GPUs, auth/token storage.
3. **Workflow improvements in the main app** — owner says "a lot of changes need to be made";
   collect them as a new batch in BUGS.md (UI4-*) before coding.
4. Open decisions still pending: tenancy model (SRV-02/04/10/11), signed upload URLs (SRV-08),
   osteotomy geometry checks on screen (CV-05/06/15/22), 3D verification with a real CT (3D-*).

## Working conventions (from the owner)
- Fix major issues before minor ones; batch requests, log each batch in BUGS.md with IDs.
- Ask for on-screen review only when the code can't answer it.
- Keep the workflow simple and free of navigation dead-ends.
- Dev backend now auto-reloads (`npm run start:server` = `tsx watch`); after pulling backend changes
  an old running server must be restarted once.
