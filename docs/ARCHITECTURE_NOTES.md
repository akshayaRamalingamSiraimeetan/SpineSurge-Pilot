# Architecture Notes (quick map — read this before touching state/navigation)

Docs index: `docs/BUGS.md` (tracker) · `docs/ROADMAP.md` (what's next) · `docs/DEPLOYMENT.md` · `docs/DEMO_GUIDE.md` ·
`docs/3D_PLANNING_REDESIGN.md` · `docs/2D_INSTRUMENTATION.md`.
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

## Workspace model (since UI batches 1–4)
- Header (`features/navigation/TopMenuBar.tsx`): logo · back · patient/study · Assessment|Planning|Compare|Report · save status · theme.
- One case image: Assessment = Planning = Compare **Image A** (canvas `side` undefined/'left' = main case).
  Only **Image B** (`side='right'`) has separate state: `comparison.right`, persisted in context `toolState.comparisonB`
  (`persistImageB` in comparisonSlice; `isPaneB` in canvasSlice decides which state an action edits).
- Report tab: `ReportBuilderWorkspace` (preview) + left `ReportLeftSidebar` (sections) + right `ReportDocumentPanel`
  (document settings in `reportConfig.document`). Model: `lib/report/reportModel.ts`; PDF: `lib/pdf/generateReportPDF.ts`;
  config hook `lib/report/useReportConfig.ts` (draft when no context).
- 3D: `features/planning3d/*` (viewer, overlays, actors, picking, segmentation, PlanPanel).
- Theming: colours come from CSS vars in `index.css` (`.dark` / `.light` on <html>); never hard-code hex for
  neutrals — use `bg-[var(--surface)]`, `text-[var(--text-2)]`, `border-[var(--border)]` etc. `dark:` follows the
  in-app toggle (`@custom-variant dark`). Dialogs: use `components/ui/dialog` as-is (no colour/shadow overrides);
  confirms: `components/ConfirmDialog.tsx`; theme switch: `components/ThemeToggle.tsx`.

## Server notes
- `server/index.ts`: all `/api/*` behind `authenticate`; DELETE `/api/patients/:id`, `/api/studies/:id` (owner-checked).
- Hosting: `SERVE_CLIENT=true` serves `dist/`; `UPLOADS_DIR`; `/healthz`; `DEMO_MODE` (auto-verify sign-ups);
  see `docs/DEPLOYMENT.md`.
