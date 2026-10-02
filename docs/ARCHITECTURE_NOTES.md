# Architecture Notes (quick map — read this before touching state/navigation)

Docs index: `docs/BUGS.md` (tracker) · `docs/3D_PLANNING_REDESIGN.md` · `docs/2D_INSTRUMENTATION.md`.
Active app = `src/renderer` (Vite/React 19) + `server/` (Express 5 + Postgres). `SpineSurge-Rebuild/` is a separate, unused project.

## Routing
- `App.tsx`: HashRouter, guards `RequireAuth → RequireVerified → RequireProfile` read persisted flags.
- Layouts: `DashboardLayout` (/dashboard, /patients, /members…) and `MainLayout` (/workspace = MainPage, /compare).
- Workspace tabs are `?tab=` query params on /workspace (TopMenuBar `handleWsTab`).
- Deep link: `/workspace?patientId=&contextId=` handled in MainPage (applied once, then stripped).

## Store (zustand, `lib/store/`)
Slices: auth, patient, canvas, dicom, comparison, share, liveShare. Only auth fields persist (localStorage `spinesurge-auth`).

**Case state invariant** (`lib/store/caseState.ts`): the loaded case = one context of one patient.
Per-case fields: `currentImage, pendingImageFile, measurements, implants, threeDImplants, pedicleSimulations,
isDicomMode, dicomSeries, activeTool, selection, canvas (incl. calibration), comparison, dicom3D runtime fields`.
They are ALWAYS replaced together via `emptyCaseState()` / `caseStateFromContext()` — never patched piecemeal.
- `setActivePatient(id, ctx?)` → clears case, loads contexts (sequence-guarded), applies ctx if given.
- `setActiveContextId(id)` → applies that context's full state.
- `addContext` → carries canvas over ONLY from an untitled session (no active context, patient has none).
- `resetWorkspace()` → clears patient + context + case. Called on logout, workspace switch, closing workspace.

**Persistence**: `updateContextState(ctxId, partial)` merges into `contextStates`, mirrors to top-level if active,
and enqueues a save. Saves per context are serialized + coalesced (latest wins) in patientSlice's save queue.
Calibration lives in `toolState.calibration`; 3D plan also mirrored into `toolState.threeDImplants/pedicleSimulations`.
`useAutosave` (MainPage) is a debounced backstop; it skips context switches.

`refreshPatients()` re-fetches the list only. `initializeStore()` = refreshPatients + drop active patient if no longer visible.
Never call initializeStore to "refresh" after add visit/study — it used to wipe the workspace.

## Server
`server/index.ts` single app; routers `routes/auth|orgs|invitations`; migrations `server/migrations/*` via `npm run db:migrate`.
Contexts: `POST /api/contexts` deletes+reinserts measurement/implant rows; context row keeps annotations, tool_state (json), current_image.
