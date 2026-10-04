# SpineSurge Bug Tracker

Single source of truth for known bugs. Each entry: `ID [SEV] [status] file:line — title. problem → fix`.
Status: `[ ]` open · `[x]` fixed · `[~]` partial · `[?]` needs user to verify on screen.
Severity: **C** critical (crash / loop / data loss / leak) · **M** major (broken flow / wrong data) · **m** minor.
Work order: C → M → redesigns (3D, 2D implants) → m. Keep this file updated after every fix batch.

Baseline (2026-10-02): `tsc` 97 errors, `eslint` 445 problems (4 rules-of-hooks violations).
Tests: `npm test` — vitest discovery was broken (root=src/renderer); fixed in vite.config.ts. Store invariants: lib/store/patientSlice.test.ts; angle math: features/measurements/quick/angles.test.ts.

### Fix log
- Batch 1 (2026-10-02): case-state invariant (lib/store/caseState.ts), sequenced patient loads, per-context save queue,
  logout/login/workspace reset, bootstrapSession, deep-link once, DICOM detect once, ImportDialog transactional,
  compare seeding, API_BASE everywhere, server: /api auth, upload hardening, json limit, ctx-save lock, error handler,
  Cobb/curvature/VBM/PI math, inverse view transform, canvas init race, resilient render loop, keyboard handling.
  Partial notes: NAV-07 — 401 → clearAuth only on boot (/auth/me); per-request 401 handler still TODO.
  NAV-22 — app-level boundary added; per-layout boundaries TODO. SRV-03/06/07 — import stamps owner; PACS no redirects;
  uploads nosniff+attachment+CSP; full tenant scoping of patients/contexts needs a tenancy decision (see SRV-02/04).
- Batch 2: reports (see RPT section). Batch 3: 3D planning rewrite (see 3D section). Batch 4: 2D silhouettes (CV).
- Batch 5: OrgMembers fetch guard, removed members can rejoin, live-share writes to context + token auth on WS,
  profile PATCH /auth/profile, case-insensitive email, OTP attempt counted before check, curvature handle,
  3-pt angle guide, calibration dialog reset, HiDPI canvas.

### Needs a decision from the user (blocking)
- SRV-02/04/10/11 tenancy: patients/visits/contexts have no owner/org columns, so one org can see/overwrite
  another's patients and archive/delete is global. Proposal: add owner_user_id + organization_id to patients
  (backfill from their studies), filter every query by workspace, and reject cross-tenant upserts.
- SRV-08 /uploads is public by URL. Proposal: short-lived signed image URLs (HMAC token in query).

### Needs on-screen verification (user)
- 3D-* (new planning viewer with a real CT), CV-22 (PSO/SPO double image), CV-05/06/15 (osteotomy geometry).

---

## NAV — Routing, auth, pages, workspace entry

- NAV-01 C [x] MemberWorkspacePage.tsx:225-238 — `clearImage()` after `setInspectionMode` wipes inspection mode → admin edits save into member's data. Fix: clearImage first / don't clear inspectionMode in clearImage.
- NAV-02 C [x] authSlice.ts:186-197, App.tsx:26, LoginPage.tsx:35 — logout keeps previous user's patients/contexts/canvas in memory; login never reloads (PHI leak + empty dashboard). Fix: reset all slices on logout; initializeStore after login.
- NAV-03 C [x] patientSlice.ts:75-92,333-341 — setActivePatient doesn't clear measurements/implants; addContext infers "untitled session" and copies patient A's measurements into patient B's new context. Fix: reset in setActivePatient; explicit fromUntitled flag.
- NAV-04 C [x] patientSlice.ts:94-141 — setActivePatient async race; A's contexts land under B. Fix: request-id guard.
- NAV-05 M [x] TopMenuBar.tsx:166-175 + MainPage.tsx:60-81 — tab switch keeps patientId/contextId params → deep-link effect re-runs setActivePatient, reloading canvas. Fix: consume params once, strip with replace; act only if changed.
- NAV-06 M [x] MainPage.tsx:115-146 — DICOM auto-detect effect depends on isDicomMode → can't exit DICOM, failing load loops. Fix: run only on activeContextId change (ref).
- NAV-07 M [x] api.ts + authSlice + guards — no 401/expired-token handling. Fix: fetch wrapper → clearAuth + /login on 401; validate token on boot.
- NAV-08 M [x] RegisterPage.tsx:74-83 — validateStatus<600 treats 400/409 as success. Fix: check status.
- NAV-09 M [x] LoginPage.tsx:99 + VerifyEmailPage.tsx:35-49 — "verify email" link has no email → bounce to /register + back-button trap. Fix: pass email; replace navigation.
- NAV-10 M [x] authSlice.ts:167-181 — /auth/me failure marks verified user unverified. Fix: use flags from login response.
- NAV-11 M [x] store/index.ts:29-35 — user/orgs not restored after refresh (header "Doctor", isAdmin false). Fix: /auth/me + fetchOrgLists on boot.
- NAV-12 M [x] auth.ts:222 vs UI — server returns fullName, UI reads user.name/avatarUrl. Fix: map in store.
- NAV-13 M [x] authSlice, VerifyEmail, Register, CompleteProfile, CreateOrg, PendingInvitations, WorkspaceSwitcher, DashboardSidebar — hardcoded http://localhost:3001. Fix: use API_BASE.
- NAV-14 M [x] DashboardSidebar.tsx:7-13 + App.tsx — links to /studies /resources /settings that don't exist; no `*` route → blank screen. Fix: remove/route + catch-all.
- NAV-15 M [x] RecentStudiesSection.tsx:72 — card navigates to /workspace without selecting patient/context. Fix: deep link.
- NAV-16 M [x] UnfinishedStudiesSection.tsx:24-31 — built from active patient's contexts only → empty after refresh. Fix: server endpoint for open contexts.
- NAV-17 M [x] authSlice.ts:110-118 + patientSlice.ts:52-72 — workspace switch/initializeStore race; errors keep stale patients. Fix: seq id, clear on switch, error state.
- NAV-18 M [x] store/index.ts:34 — persisted activeWorkspace not validated vs memberships. Fix: fallback to personal.
- NAV-19 M [x] PatientCasesPage.tsx:328-391,419-436 — Add Study / New Session double-submit; errors swallowed. Fix: isSubmitting + try/catch.
- NAV-20 M [x] OrgMembersPage.tsx:182-230 — no cancel/reset/error on members fetch; PATCH errors silent. Fix.
- NAV-21 M [x] MainPage.tsx:20-36, PatientCasesPage.tsx:99,204, useAutosave.ts:5 — `useAppStore()` without selector → re-render storms; console.log in render. Fix: selectors/useShallow.
- NAV-22 M [x] MainLayout.tsx:128-151 / DashboardLayout — chrome outside error boundary → whole app blanks. Fix: wrap layouts.
- NAV-23 M [x] invitations.ts:74-90 + PendingInvitationsPage.tsx:86 — removed members can't rejoin; error field mismatch (code/message vs error).
- NAV-24 m [x] useAutosave.ts:46-74 — fires on context switch; cleanup cancels pending save; concurrent unordered saves. Fix: skip load-triggered, flush on unmount, serialize.
- NAV-25 m [x] PatientCasesPage.tsx:297-303 — expanded groups reset on any patient update.
- NAV-26 m [ ] MemberWorkspacePage.tsx:175-207 — no stale guard / reset on userId change.
- NAV-27 m [x] CompleteProfilePage.tsx:89 — avatar relative URL resolves against Vite origin.
- NAV-28 m [ ] PendingInvitationsPage, CreateOrgPage — no back/cancel; inconsistent guards.
- NAV-29 m [ ] WorkspaceSwitcher.tsx:100-109 — confirm modal outside panelRef closes panel.
- NAV-30 m [x] TopMenuBar.tsx:166 — tab clicks push history; use replace.
- NAV-31 m [x] RecentStudiesSection.tsx:34 — string date sort.
- NAV-32 m [x] App.tsx:26 — initializeStore without token.
- NAV-33 m [x] MainPage.tsx:149-176 — dead ESC handler swallows Escape globally.

## WS — Workspace shell & global state
(Overlaps: NAV-03/04 = setActivePatient reset/race; NAV-05/06 = deep-link & DICOM effect; SRV-15 = 3D not persisted; SRV-14 = save race.)

- WS-01 C [x] patientSlice.ts:463-476 + MainPage.tsx:84-92 + useAutosave.ts:21 — setActiveContextId keeps old currentImage/threeDImplants when target lacks them → context X's screws/image saved into Y. Fix: always set every per-context field (null/[]).
- WS-02 C [x] CanvasWorkspace.tsx:169 + useAutosave.ts:60 + MainPage.tsx:89 + ImportDialog.tsx:154 — many concurrent POST /api/contexts per edit → PK violations, older data wins. Fix: client per-context save queue (latest-wins, serialized) + server row lock.
- WS-03 C [x] useAutosave.ts:38-42 — infinite 5s retry, survives unmount, saves into whatever context is active later. Fix: bounded backoff, stop on 4xx, abort ref.
- WS-04 C [x] authSlice.ts:92 (TopMenuBar.tsx:570) — `logout` keeps persisted token → reload logs back in; data stays. Fix: clearAuth + resetWorkspace + disconnect live room. (with NAV-02)
- WS-05 C [x] TopMenuBar.tsx:505 — "View Report" calls undefined `setWsTab` → ReferenceError, dead button.
- WS-06 M [x] patientSlice.ts:59-69,187-195,250-263 — addVisit/addStudy call initializeStore → setActivePatient wipes open workspace (Quick Use image lost, ImportDialog clears canvas). Fix: merge locally.
- WS-07 M [x] patientSlice.ts:65-68 — initializeStore leaves dangling activeContextId; updateContextState returns true when context missing → false "Saved".
- WS-08 M [x] canvasSlice.ts:154-165 — calibration (pixelToMm) carries over to new images/contexts. Fix: reset or per-context.
- WS-09 M [x] patientSlice.ts:478-517 — resetWorkspace incomplete (threeDImplants, pedicleSimulations, pendingImageFile, activeTool, selection, dicom3D, syncStatus).
- WS-10 M [x] TopMenuBar.tsx:179-210 — closing workspace keeps active context; later Quick Use overwrites closed study's image; pending autosave dropped. Fix: flush + resetWorkspace on close.
- WS-11 M [x] ImportDialog.tsx:276 — resetOnOpen wipes workspace even if user cancels.
- WS-12 M [x] ImportDialog.tsx:182-229 — wizard steps not awaited; errors swallowed; mixes new patient with old context.
- WS-13 M [x] MainPage.tsx:115-146 + ImportDialog.tsx:168 — importing DICOM folder while X-ray study open is immediately exited (same root as NAV-06).
- WS-14 M [x] ComparePage.tsx:338-345 — comparisonMode never turned off on leaving /compare → edits on /workspace go to comparison[side], not autosaved.
- WS-15 M [x] liveShareSlice.ts:47-118 + MainPage.tsx:48 — remote updates write top-level not contextStates; initial push sends previous context's data; every peer autosaves.
- WS-16 M [x] liveShareSlice.ts:29 — hardcoded ws://localhost:3001.
- WS-17 M [x] patientSlice.ts:227-244 — visit reorder saves un-renumbered array.
- WS-18 M [x] RightSidebar.tsx:782-793 — height/weight edit with no visit creates orphan visits each edit.
- WS-19 M [x] CanvasWorkspace.tsx:895-946 — keydown not ignoring inputs (Ctrl+Z in notes undoes canvas); Escape returns before cancelling tool.
- WS-20 M [x] TopMenuBar.tsx:161 / dicomSlice.ts:288 / canvasSlice.ts:154 — activeTool/selection/interactionMode not reset on view/tab/context switch.
- WS-21 M [x] dicomSlice.ts:205,230,239,295,302,309 — updateContextState (side effects) called inside set() updater.
- WS-22 M [x] ProfileDialog.tsx:53 — profile save local only.
- WS-23 m [ ] shareSlice.ts:34 — share link with HashRouter produces `?tab=..?patientId=`.
- WS-24 m [x] patientSlice.ts:214 — deleteVisit API in set updater, unhandled rejection; PatientCasesPage.tsx:397 setActivePatient('') no-op.
- WS-25 m [x] server/index.ts:520 — measurement selected/orphaned not persisted → all selected on reload.
- WS-26 m [x] TopMenuBar.tsx:581 — orphan `<ImportDialog />` mounted.
- WS-27 m [x] useAutosave.ts:46 — StrictMode initial-mount skip fails.
- WS-28 m [~] NewContextDialog.tsx:70 — not reset on cancel; `Date.now()` ids everywhere → use crypto.randomUUID.
- WS-29 m [ ] ShareDialog.tsx:23 — clipboard promise not awaited.
- WS-30 m [ ] LeftSidebar.tsx:684 — checked list reads top-level measurements (wrong in comparison).
- WS-31 M [x] NewPatientDialog.tsx:96 — `PAT-${Date.now().slice(-6)}` id collides every ~16min; POST /api/patients upserts → overwrites another patient.

## RPT — Reports & comparison
**Batch 2 (done):** lib/report/reportModel.ts (single model) + lib/report/renderCaseImage.ts (offscreen, awaited decode,
native res) + lib/canvas/renderScene.ts (shared with live canvas) → preview (ReportBuilderWorkspace) and PDF
(lib/pdf/generateReportPDF.ts) render the same model. Legacy ReportDialog unmounted (file now dead code).
Remaining: RPT-22 (comparison dates for blob images).
Root cause: images scraped from on-screen canvases after 300ms timeout; two PDF generators; preview/PDF use different data. Target design: one `ReportModel` built from active context → awaited offscreen render (`CanvasManager.renderToDataURL`) → shared by preview + PDF; server atomic versioning.

- RPT-01 C [x] ReportBuilderWorkspace.tsx:29-35, generateReportPDF.ts:221, ReportDialog.tsx:275 — images = `querySelectorAll('canvas').toDataURL` on timer; blank if image not loaded. Fix: awaited offscreen render.
- RPT-02 C [x] CanvasWorkspace.tsx:356-410 — async CanvasManager init no cancel guard → image A with study B measurements. Fix: cancelled flag.
- RPT-03 C [x] ComparePage.tsx:322-340 — left pane copies previous patient's image/measurements; comparison never reset. Fix: reset on patient change; await setActivePatient.
- RPT-04 M [x] ComparePage.tsx:338 — deep link setActivePatient without contextId → empty measurements.
- RPT-05 M [x] generateReportPDF.ts:221-277 — canvas choice by DOM order/width>300; no data-side. Fix: explicit by model.
- RPT-06 M [x] generateReportPDF.ts:36 vs ReportBuilderWorkspace.tsx:80,188 vs ReportDialog.tsx:39 — three different measurement sets. Fix: shared selector.
- RPT-07 M [x] generateReportPDF.ts:357, ReportBuilderWorkspace.tsx:162 — comparison pairs by first toolKey; right-only dropped; unit always px.
- RPT-08 M [x] generateReportPDF.ts:462-481, ReportDialog.tsx:584 — study/visit guessed by currentImage URL; fallback visits[0]. Fix: from active context.
- RPT-09 M [x] TopMenuBar.tsx:457 + server/index.ts:590 — export double-click; non-atomic version; Date.now id.
- RPT-10 M [x] ReportBuilderWorkspace.tsx:22-36 — unstable effect deps, timers not cleared, StrictMode double save.
- RPT-11 M [x] ReportBuilderWorkspace.tsx:23,38 — "Initializing Report..." forever without context.
- RPT-12 M [x] generateReportPDF.ts — ignores reportConfig sections & clinical notes.
- RPT-13 M [x] TopMenuBar.tsx:505,580, RightSidebar.tsx:1548 — two generators live (View Report opens both). Fix: remove ReportDialog generator.
- RPT-14 M [x] TopMenuBar.tsx:445 — window.open after await → popup blocked (unverified). Fix: in-app iframe preview.
- RPT-15 M [x] CanvasWorkspace.tsx:512,873 — broken image drawImage throws → render loop dies. Fix: naturalWidth check + try/catch.
- RPT-16 m [x] generateReportPDF.ts:229 — captured image depends on viewport zoom/DPR/overlays.
- RPT-17 m [x] generateReportPDF.ts:454 — blob URL never revoked; save-before-upload error message.
- RPT-18 m [x] ReportsListDialog.tsx:59 — created_at vs createdAt (date blank).
- RPT-19 m [x] ReportsListDialog.tsx:21 — no stale guard.
- RPT-20 m [x] ReportBuilderWorkspace.tsx:66, generateReportPDF.ts:105 — random REF per render.
- RPT-21 m [x] ReportBuilderWorkspace.tsx:233 — notes textarea defaultValue misses late load.
- RPT-22 m [ ] generateReportPDF.ts:117 — comparison dates fall back to today.
- RPT-23 m [x] ReportDialog.tsx:104 — `setStrokeColor` not on jsPDF (tsc error).

## SRV — Backend / security
Summary: single Express app in server/index.ts; only studies carry tenancy; most /api routes unauthenticated.

- SRV-01 C [x] server/index.ts (many) — most /api endpoints lack `authenticate`. Fix: `app.use('/api', authenticate)` + ownership checks.
- SRV-02 C [ ] index.ts:175-260 — GET /api/patients loads whole DB, leaks across tenants. Fix: SQL filter by workspace.
- SRV-03 C [~] index.ts:216,727; pacsService.ts:105 — null-owner studies visible to all; import/PACS never set owner.
- SRV-04 C [ ] index.ts:357-533 — upserts by client ids overwrite others' rows; scan id = Date.now(). Fix: owner check on conflict; uuid ids.
- SRV-05 C [x] index.ts:666-757 — /api/import reads arbitrary server folder, no auth, sync fs in tx. Fix: auth + allow-list root / remove.
- SRV-06 C [~] pacsService.ts:64,129 + index.ts:768 — unauthenticated SSRF via client PACS url.
- SRV-07 C [~] index.ts:61-74, auth.ts:31 — stored XSS via uploaded html/svg served statically. Fix: whitelist ext, nosniff, attachment.
- SRV-08 M [ ] index.ts:61 — /uploads public.
- SRV-09 M [x] y-websocket.ts:95 — no auth, no maxPayload.
- SRV-10 M [ ] index.ts:340 — DELETE visit cascades other orgs' studies.
- SRV-11 M [ ] index.ts:303 — archive is global flag.
- SRV-12 M [x] index.ts:74 — no multer size limit.
- SRV-13 M [x] index.ts:42 — express.json 100kb default → large context saves 413.
- SRV-14 M [x] index.ts:528-568 — concurrent context saves race → unique violation, lost save. Fix: row lock.
- SRV-15 M [x] index.ts:448-470 vs patientSlice.ts:427 — threeDImplants & pedicleSimulations not persisted. **Blocks 3D planning persistence.**
- SRV-16 M [x] auth.ts:111,175 vs invitations.ts — email case mismatch.
- SRV-17 M [x] auth.ts:259-309 — OTP lockout check-then-act brute-force.
- SRV-18 m [ ] auth.ts:163 — no rate limiting.
- SRV-19 m [x] index.ts:575 — err.stack returned; no global error handler.
- SRV-20 m [x] index.ts:271.. — `req.body` undefined in Express 5 → TypeError.
- SRV-21 m [x] index.ts:591 — report version race (dup of RPT-09 server side).
- SRV-22 m [ ] index.ts:175 — perf: whole DB per load, missing FK indexes.
- SRV-23 m [ ] index.ts:39,141 — trust proxy true; Host header.
- SRV-24 m [~] index.ts:41-56 — CORS `*` + duplicate manual headers.
- SRV-25 m [ ] index.ts:654 — local-file startsWith guard without separator.
- SRV-26 m [ ] index.ts:415 — orphaned upload files never deleted.
- SRV-27 m [ ] invitations.ts:197,254 — role not validated; dup invites; double-accept 500.
- SRV-28 m [ ] orgs.ts:376-430 — review copy doesn't copy scans/context.
- SRV-29 m [ ] migrate.ts:58-79 — migration+record not in one tx; no advisory lock.
- SRV-30 m [ ] drizzle journal stale vs hand migrations.
- SRV-31 m [ ] seed-dev-user.ts — no prod guard; db.ts hardcoded fallback DSN.
- SRV-32 m [ ] server/package.json — stale manifest (express 4).
- SRV-33 m [x] y-websocket.ts:84 — send() missing return after close.
- SRV-34 m [ ] .env.example:26 — placeholder JWT secret passes guard.

## CV — 2D canvas, measurements, instrumentation
**Batch 4 (done):** white-silhouette implants (ImplantRenderer.ts: screwPath/cagePath/platePath/rodPath + exact
hitTestImplant), selected-implant handles first, one undo step per drag, persist on mouseup, selection kept after drag,
empty click deselects + pans, Delete key, mm-based default sizes, deep-copied rod points.
(Implant redesign plan: docs/2D_INSTRUMENTATION.md. Paths relative to src/renderer/.)

- CV-01 C [x] quick/CobbAngle.ts:22, SpinalCurvatures.ts:16, VBM.ts:44 — line-angle diff not folded → "COBB: -160°" for 20° when clicked opposite directions. Fix: `d=|a1-a2| % PI; min(d, PI-d)` (CMC already correct).
- CV-02 C [x] quick/PelvicParams.ts:65-73 — PI = 180−PI for right-facing films. Fix: normal pointing toward hips.
- CV-03 C [x] canvasSlice.ts loadImage — calibration carried to new image (= WS-08).
- CV-04 M [x] CanvasWorkspace.tsx:288-297, 2192-2200 — screen→world inverse un-flips before un-rotating → clicks misplaced with flip+rotation. Fix: single DOMMatrix inverse.
- CV-05 M [ ] CanvasWorkspace.tsx:504 + CanvasManager.ts:226 — fragment image rotates around centroid not hinge (pivot never set). Fix: per-fragment affine.
- CV-06 M [ ] SurgicalOperations.ts:173,46 — resection angle not folded; CUT hits all fragments.
- CV-07 M [x] CanvasWorkspace.tsx:1806-2066 + CanvasManager.ts:737 — every mousemove = undo step. Fix: begin/commitHistoryTransaction.
- CV-08 M [x] CanvasWorkspace.tsx:162,2030 — every drag mousemove saves to server + JSON.stringify log. Fix: persist on mouseup.
- CV-09 M [x] CanvasWorkspace.tsx:1810-1886 — implant move/resize not written to contextStates → lost.
- CV-10 M [x] canvasSlice.ts deleteImplant — doesn't update contextStates/manager.
- CV-11 M [x] CanvasManager.ts:218,717,266,416,623 — shallow copy of implant.properties.points → undo corrupt.
- CV-12 M [x] CanvasWorkspace.tsx:1759,2149 — selection cleared on mouseup / sticky after placement blocks panning.
- CV-13 M [x] CanvasWorkspace.tsx:1616-1632,1742 — implant hit-test: global store implants, handles after labels, body circle wins over tip.
- CV-14 M [x] SpinalCurvatures.ts:140 + MeasurementSystem.ts:58 — curvature handle never draggable.
- CV-15 M [ ] CanvasWorkspace.tsx:2019 — SPO/open-ost drag recompute with fake hinge.
- CV-16 M [x] CanvasWorkspace.tsx:2369 vs 1522 — 3-pt angle guide says vertex=1st, math uses 2nd.
- CV-17 M [x] CobbAngle.ts:23 — angles >90° reported as 180−θ.
- CV-18 M [x] CanvasWorkspace.tsx:1034,2626 — calibration dialog dismiss leaves tempPoints → tool stuck.
- CV-19 M [x] ImportDialog.tsx:153 — importing new image into open context keeps old annotations.
- CV-20 M [x] CanvasWorkspace.tsx:465,539 — rAF loop 60fps idle, createElement + console.log per frame.
- CV-21 M [x] CanvasWorkspace.tsx:313,886 — no devicePixelRatio → blurry.
- CV-22 M [?] CanvasWorkspace.tsx:497 — PSO/SPO double image (verify on screen).
- CV-23 m [x] CanvasWorkspace.tsx:902 — Escape dead (`return` first) (= WS-19).
- CV-24 m [ ] CanvasWorkspace.tsx:968 — 2px offset (border); use canvas rect.
- CV-25 m [ ] CanvasWorkspace.tsx:2165 — wheel zoom stale zoom in closure.
- CV-26 m [x] CanvasWorkspace.tsx:1784 — implant jumps on first drag (lastWorldPosRef).
- CV-27 m [x] ImplantRenderer.ts:348 — rods no handles/whole move; right-click opens browser menu.
- CV-28 m [ ] CanvasWorkspace.tsx:2840 — text dialog cancel leaves preview.
- CV-29 m [ ] CanvasWorkspace.tsx:447 — labels mirrored/rotated with image.
- CV-30 m [ ] CanvasWorkspace.tsx:1021,1915 — SVA abs() loses sign.
- CV-31 m [ ] Spondylolisthesis.ts:53 — slip % divides by wrong length.
- CV-32 m [ ] CanvasWorkspace.tsx:1002 vs 1902 — label text changes after drag (COBB/Cobb).
- CV-33 m [x] CanvasWorkspace.tsx:356 — init race (= RPT-02).
- CV-34 m [ ] CanvasWorkspace.tsx:345 — bulk implant delete removes one.
- CV-35 m [ ] measurementSync.ts:8 — mutates history node in place.
- CV-36 m [ ] BottomToolbar Reset — doesn't recentre.
- CV-37 m [ ] CanvasWorkspace.tsx:211,393 — image cache never pruned, blob URLs never revoked, window.canvasManager.

## 3D — DICOM / 3D planning (resolved by redesign: docs/3D_PLANNING_REDESIGN.md)
**Batch 3 (done in code, needs on-screen check → `[?]`):** legacy CornerstoneViewer + helpers deleted; new
`features/planning3d/` module replaces it. All 3D-* items below are addressed by the rewrite; verify with a real CT.
- 3D-01 C [?] CornerstoneViewer.tsx:1095 — threshold mask never written (`getScalarData` gone in v4).
- 3D-02 C [?] CornerstoneViewer.tsx:1052 — labelmap bound to VOLUME_3D (can't render).
- 3D-03 C [?] CornerstoneViewer.tsx:1271 — segmentation mode swaps CT for empty mask in 3D.
- 3D-04 C [?] CornerstoneViewer.tsx:629 + SurgicalGeometry.ts:168 — default screw dir head→feet; medial angle no-op; click = tip.
- 3D-05 C [?] CornerstoneViewer.tsx:576 — 3D placement throws (vtkCellPicker on v4 volume).
- 3D-06 M [?] CornerstoneViewer.tsx:1186-1349 — setVolumes re-run wipes screw actors.
- 3D-07 M [?] initCornerstone.ts:74 — fuzzy metadata match returns CT metadata for derived images.
- 3D-08 M [?] volumeEraser.ts — eraser never runs; dead.
- 3D-09 M [?] CornerstoneViewer.tsx:113-513 — unmount during load leaks engine/listeners.
- 3D-10 M [?] initCornerstone.ts:484 — wadouri fileManager/dataSetCache never purged (RAM).
- 3D-11 M [?] CornerstoneViewer.tsx:696 — ResizeObserver never attached.
- 3D-12 M [?] CornerstoneViewer.tsx:842 — existing screws not shown in 3D after (re)load.
- 3D-13 M [?] ScrewOverlay2D.tsx:58 — 30Hz polling ×3.
- 3D-14 M [?] CornerstoneViewer.tsx:1585 — landmark overlays don't follow camera.
- 3D-15 M [?] ScrewOverlay2D.tsx:115 — head drag jumps by length.
- 3D-16 M [?] ScrewOverlay2D.tsx:24 — every screw drawn on every slice (no slab clip).
- 3D-17 M [?] VtkHighFidelityScrew.ts:61 — 3D screw ~1.5d longer than 2D.
- 3D-18 M [x] dicomSlice.ts:300 — every drag move saves to server.
- 3D-19 M [?] ImportDialog.tsx:168 — no SeriesInstanceUID grouping.
- 3D-20 M [?] crop does nothing (commented out).
- 3D-21 m [?] initCornerstone.ts:405 — providers pile up; StrictMode double init.
- 3D-22 m [?] slice slider not updated on wheel; maximize resets cameras; actor cache keyed by id only.

## LINT/TSC
- TS-01 C [x] BottomToolbar.tsx:232,266,271,296 — hooks called after early return (rules-of-hooks) → "Rendered more hooks" crash.
- TS-02 m [x] PelvicTools/SpinopelvicTools/Spondylolisthesis/Stenosis — import nonexistent `drawPoint`.
- TS-03 m [ ] 97 tsc errors mostly unused imports; DICOMViewer.legacy.tsx likely dead.

## UI — Workspace UI/UX batch (user request 2026-10-02) — all done in code, needs on-screen review
- UI-01 [x] Dashboard rail removed from workspace (MainLayout); logo + Back are the only exits.
- UI-02 [x] Image toolbar is positioned inside the canvas (absolute), default right-centre, drag clamped to canvas.
- UI-03 [x] VBM: Sagittal/Coronal picker inline under the tool (store `vbmMode`); dialog removed.
- UI-04 [x] Case Summary rows are click-to-edit on the whole row ("Add …" placeholder); section open by default.
- UI-05 [x] Header: no profile, ⋮, import, share, report, View Report.
- UI-06 [x] Tabs always enabled. Report = live summary of Assessment + Planning + Compare; empty sections hidden.
- UI-07 [x] One case image: Assessment = Planning = Compare Image A (left pane IS the case; canvasSlice `isPaneB`).
       Import only when no image (empty states). Image B saved in context toolState.comparisonB.
- UI-08 [x] Light/dark toggle rightmost in header.
- UI-09 [x] Header/sidebar gap closed (54px offset); sidebars open by default; rounded edge tabs in MainLayout.
- UI-10 [x] Pencil emoji removed.
- UI-11 [x] Calibration onboarding card on the canvas until calibrated (skip remembered in toolState.calibrationSkipped).
- UI-12 [x] Report tab replaces the view in 2D and 3D (3D viewer kept mounted hidden); left = contents
       (sections), right = ReportDocumentPanel (title/institution/department, A4/Letter, orientation, accent,
       text size, footer, page numbers, preview/export/save). Settings stored in reportConfig.document.
- UI-13 [x] Header = logo · back · patient/study · 4 tabs · save status · theme. 3D layout buttons moved into viewer.
- UI-14 [x] Untitled flow: status "Not saved — add patient details"; leaving asks Discard/Keep editing; saving
       updates context lastModified and marks Draft studies In Progress; Patients page refreshes on open.

## UI batch 2 (2026-10-02)
- UI2-01 [x] C "Could not save this session as a study": api.ts authedFetch called itself (bulk replace) → every
        API call overflowed the stack. Fixed + regression test lib/api.test.ts.
- UI2-02 [x] Planning tab "Target Correction" → "Targets"; 🎯 removed.
- UI2-03 [x] Screenshot dialog uses app accent.
- UI2-04 [x] 2D implants: no dark outline; implant annotations (selection, handles, drag label) cyan
        (IMPLANT_ANNOTATION); fine-tune inputs in the implant card (screw length/diameter, cage length/height/
        lordosis angle/rotation, rod diameter) via UPDATE_IMPLANT; card auto-expands when implant selected.
- UI2-05 [x] UIV/LIV → tool "Instr. Level" with inline UIV/LIV picker (store tiltMode); dialog removed.
- UI2-06 [x] Report contents sidebar 340px.
- UI2-07 [x] Compare: "Replace image" on Image B with confirm.
- UI2-08 [x] Image B measurements: list shown in Compare (per active image) with delete; B deletions persisted.
- UI2-09 [x] Measurement list redesigned as cards (16px checkbox = in report, name + level chip, normal range,
        large value, visible delete). Level edit no longer depends on removed window.canvasManager.
- UI2-10 [x] Patients page: no greeting/bell/New Study/⋮ header; list and studies scroll independently;
        search fixed at top.

## UI batch 3 (2026-10-02)
- UI3-01 [x] Theme toggle (components/ThemeToggle.tsx) in dashboard rail (home, patients, members) + workspace header.
- UI3-02 [x] Measurement panel clipped on the right: Radix ScrollArea `display:table` grew past panel → forced block;
        long values wrap.
- UI3-03 [x] 3D planning light mode: text-white/* in DICOM sidebar + PlanPanel → theme vars; tints readable in both.
- UI3-04 [x] Light/dark consistency: ~800 hardcoded dark hex classes → CSS vars (pages, dashboard, dialogs);
        dropdown/select/card components restyled (were blue #0F2A44); `dark:` now follows the in-app toggle
        (`@custom-variant dark` in index.css; Tailwind v4 ignored tailwind.config darkMode).
- UI3-05 [x] Study card: icon buttons (open, reports/download); menu = Rename, Share, Status (4, inline), Delete.
        Patient list menu = Share, Archive/Restore, Delete. Header ⋮ and bell removed; "Archived" toggle in list header.
- UI3-06 [x] "Add New Study" opens the same Import dialog as Home, preset to the patient (presetPatientId).
- UI3-07 [x] Study names: default "Pre-op · 2 Oct 2026" / "Study · <date>"; modality only as badge; click title to rename.
- UI3-08 [x] Delete patient / study: DELETE /api/patients/:id, /api/studies/:id (owner-checked, removes files),
        store actions + confirm dialogs (components/ConfirmDialog.tsx).

## UI batch 4 (2026-10-02)
- UI4-01 [x] "Can't delete patient/study": running dev server predated the new DELETE routes (no auto-reload).
        Verified routes on a fresh server; `npm run start:server` now uses `tsx watch`. **Restart once.**
- UI4-02 [x] Study card: patient name → "Study #N · <custom name> · date" (date once) → modality/status/images.
        New studies no longer embed the date in their name.
- UI4-03 [x] Uniform dialogs: base dialog themed (surface, border, subtle shadow, light backdrop); colour/shadow
        overrides stripped from all dialogs; light-mode gray/slate branches mapped to theme vars.
- DEPLOY-01 [~] Hosted demo stage: Dockerfile, .dockerignore, render.yaml, SERVE_CLIENT static serving + /healthz,
        UPLOADS_DIR, DB TLS, DEMO_MODE sign-up, demo seed (prod-guarded), JWT secret guard, login pre-fill via
        VITE_DEMO_*. Verified locally (production build served by API on one port). Not deployed yet.

## UI batch 5 (2026-10-03) — tools, toolbar, compare, performance
- UI5-01 [?] Case Summary collapsed by default once the patient details are filled.
- UI5-02 [?] Image toolbar docks to the canvas edges (right edge = next to the measurement panel) and stays docked
        when panels open/close. Compare: fixed in a gutter between Image A and Image B (not draggable).
- UI5-03 [?] 2D instruments: placing a screw/cage/rod ends the tool (no accidental second implant).
- UI5-04 [?] Latency between clicks: every drag move saved to the server + re-rendered the whole app; canvas
        redrawn at 60 fps while idle; console.log in the canvas manager hot path.
- UI5-05 [?] 2D instruments: edit length / diameter / angle / cage height+lordosis on the image (handles + live
        label); fine-tune inputs removed from the measurement panel.
- UI5-06 [?] Compare: small import icon top-right of each pane → dialog (existing study / local image).
- UI5-07 [?] Tool colour families + uniform lines, points and labels: generic white, alignment orange-red,
        extended lime, morphology cyan, planning yellow. Lines clipped to the image.
- UI5-08 [?] Landmark reuse: shared anatomical points (femoral heads, S1 endplate, C7/T1 centroid, …) are
        pre-filled from earlier measurements; clicks snap to existing points; dragging a shared point moves it
        in every measurement.
- UI5-09 [ ] (later, not now — landmark table in features/measurements/landmarks.ts is its basis) Skeleton overlay: drag a full landmark template into place.
- UI5-10 [?] Measurement panel categories = sidebar tabs: Alignment (incl. pelvic), Coronal Deformity,
        Sagittal Deformity, Morphology, Planning, Instruments, Others (generic), Reference Lines.
- UI5-11 [?] Osteotomy (planning) colours/lines uniform, finite cut lines kept inside the image.
  Notes (2026-10-03): all [?] items done in code; tsc errors 83→80, tests 101/101, vite build OK; not yet checked on
  screen. Style: lib/canvas/annotationStyle.ts (colours, lines, points, labels, label hit boxes); landmarks:
  features/measurements/landmarks.ts; results: features/measurements/results.ts. Latency causes fixed: per-move
  server saves, whole-store subscriptions (canvas, sidebars, toolbar), idle 60 fps redraw, manager console.log,
  every drag state retained in memory.

## UI batch 6 (2026-10-03) — undo, osteotomy cuts, report logo, settings
- UI6-01 [?] Undo/redo consistent for every tool (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, toolbar). Causes: osteotomies were
        several history steps + unsaved fragments; Ctrl+Z blocked by a stale `activeDialog` flag (now checks the DOM
        for an open modal); store→canvas syncs mutated the current history node in place (now replace it); side-panel
        deletes are undoable steps.
- UI6-02 [x] Cobb removed from Extended → Coronal → Curvature (it is in Alignment).
- UI6-03 [?] Labels may sit outside the image (drawn after the clip, on top); lines/points stay clipped.
- UI6-04 [?] Osteotomy cuts rendered from the measurement (lib/canvas/osteotomyPieces.ts): PSO/SPO wedge removed, the
        piece beyond BA rotates onto BC, the lower piece (beyond BC) is cut and stays; resection slab removed; opening
        wedge opens about C. Image pieces form one layer, all annotations above. Saved with the case, undoable.
        Legacy fragment ops (SurgicalOperations / OpenOsteotomyOperation) are no longer called by the canvas.
- UI6-05 [?] Compare dark mode white pane outline: `border-border`/`border-primary` generate no CSS under Tailwind v4
        (tailwind.config.js is never loaded) → border fell back to currentColor. Now explicit vars.
        FOLLOW-UP: all shadcn token classes (bg-primary, border-border, bg-card, text-muted-foreground…, ~57+ uses)
        are no-ops app-wide; fix with an `@theme inline` block — owner to decide (changes visuals broadly).
- UI6-06 [?] Middle-button (wheel) drag pans while placing points (browser autoscroll suppressed).
- UI6-07 [?] Header uses var(--surface), same as the side panels.
- UI6-08 [?] Diagnosis field inside Study Notes; saves to the case's visit → header/dashboard/report update.
- UI6-09 [?] Dashboard recent-study cards match the Patients page: thumbnail, name, date, diagnosis + modality.
- UI6-10 [?] Report: Image B only while the Comparison section is on; hospital logo upload (Report panel) shown at
        the left of the header (preview + PDF); default logo/institution from Settings.
- UI6-11 [?] Settings (gear above the profile in the dashboard rail): theme, default report logo + institution,
        snap to points, reuse landmarks, reset toolbar position (lib/settings.ts, stored per browser).
- UI6-12 [x] SpineSurge logo (public/spinesurge.png) in the header, dashboard rail and favicon.

## UI batch 7 (2026-10-03)
- UI7-01 [?] Open osteotomy restored to the original model (OpenOsteotomyOperation): CD extended to the image edges,
        upper half aligned to AB and lower half to EF via TransformationCalculator (both halves move, gap opens).
        Still rendered from the measurement (osteotomyPieces.ts), so undo/reload keep working.
- UI7-02 [?] Patients page "Add New Study" opens the workspace directly with a new empty study (no dialogs); the
        image is imported there and attaches to that study. (A dated visit is still created silently — data model.)
- UI7-03 [?] New/Edit Patient dialog: name, ID, age, sex, DOB, contact only; filled fields without outlines;
        New Patient button in the page's accent-soft style.
- UI7-04 [x] Login/register page logo → new SpineSurge icon + name.

## UI batch 8 (2026-10-03)
- UI8-01 [?] Mouse: left = all actions; right-drag (or middle-drag) = pan, always; wheel = zoom. A right *click*
        (moved < 5 px) still finishes polygon / canal area / CMC / rod. Touchpad: two-finger swipe pans, pinch zooms
        (heuristic: ctrl+wheel = pinch; fractional / small / horizontal deltas = touchpad). Live zoom read from
        the store (fixes CV-25 stale zoom).
- UI8-02 [?] Measurement eye toggle (replaces the checkbox): off hides lines/labels on the canvas AND drops it from the
        report; hidden measurements can't be grabbed or snapped to. Osteotomy cuts stay on the image.
- UI8-03 [x] Compare: pane border removed (inactive pane stays dimmed).
- UI8-04 [?] Open osteotomy flipped when a reference line pointed the "other way": rotation now wrapped to ±90°
        (lines are undirected); "Opening" angle wrapped the same way.
- UI8-05 [?] Clinical colours (features/measurements/clinicalRanges.ts): green healthy / yellow borderline / red
        abnormal / normal text = not judged. Owner's tables (fixed + age-corrected). Signs: facing inferred from
        Pelvis/PI-LL/TPA/SPA/SSA; T1SPi/ODHA positive = anterior (not judged until facing is known); symmetric
        criteria use magnitudes. mm values only when calibrated; age bands need patient age; LL vs PI on the case.
        Panel "Normal …" text now age-aware. Not yet on canvas labels or in the report.

## UI batch 9 (2026-10-03) — plans, study list sync, reports
- UI9-01 [?] Home "Recent Studies" + "Unfinished" use the Patients page list (lib/studies.ts: no archived / quick-analysis
        patients) and the same StudyCard (components/StudyCard.tsx).
- UI9-02 [?] "Open in workspace" always continues the study's latest session (store.openStudy); Session Manager dialog
        and "new session from existing study" removed. New work = Add New Study.
- UI9-03 [?] Reports button: live preview of the study's current report (built from its latest saved session without
        loading it — lib/report/studyReport.ts) + saved copies + Download.
- UI9-04 [x] Study status: Draft / In Progress / Completed (old 'Archived' studies read as Completed). Patient
        archiving unchanged.
- UI9-05 [?] 2D plans (features/planning2d): Assessment = preop only (no cuts/implants/plan items). Planning = cut image
        with preop landmarks registered to the moved bone (mapPointThroughOsteotomies) and re-measured. Targets: TK, LL,
        SVA only, when measured (toolState.targets). Right panel in Planning: Plan (save as Plan N / update / new / load /
        delete — toolState.plans, activePlanId), Targets table (Measured·Target·Diff·Plan), Preop vs Plan table.
        Report: preop image + every saved plan (image, targets, preop vs plan, implants); unsaved work not reported.
        Not yet: Compare between plans; dragging preop points in Planning (they are derived, read-only there).
- UI9-06 [?] Eye toggle now reaches the canvas (store toggle never synced the canvas manager).
- UI9-07 [x] Report contents: explanation text removed; borderless section rows.

## UI batch 10 (2026-10-03) — targets, DICOM storage, 3D interaction
- UI10-01 [?] Preop vs plan: named measurements once (features/planning2d/metrics.ts — PI from Pelvis or PI-LL, LL from LL
        or PI-LL, latest wins); targets excluded; repeatable tools (Cobb per level, VBM…) per instance.
- UI10-02 [?] Settings → Planning → Target measurements (dropdown with checkboxes, Alignment + Extended); default TK/LL/SVA.
- UI10-03 [?] Add New Study opens the same import dialog as Home (workspace empty state = shared EmptyImport, autoOpen).
- UI10-04 [x] 3D: screw settings removed from the left panel (right panel only).
- UI10-05 [?] 3D crop: Slicer-style ROI box in the 3D view, drag face handles (CropBox3D.tsx); sliders removed.
- UI10-06 [?] Slice slider on top of each MPR view (SliceSlider.tsx).
- UI10-07 [?] CT/MR studies: only Planning + Report tabs (auto-redirect). Report: 4-up screenshot with implant overlays
        + 3D view (planning3d/capture.ts), full width.
- UI10-08 [?] DICOM storage: series were only loaded in memory (never uploaded, detached from the study, study saved as
        X-Ray). Now uploaded as the study's scans (4 parallel, progress in header), study modality from the headers
        (CT / MRI / …), empty patient fields autofilled (name, age, sex, DOB, hospital ID → MRN). DICOM detection on
        reopen accepts MRI/PET; a study still uploading no longer drops the viewer.
        Not done: calibration from 2D DICOM X-rays (the 2D canvas doesn't decode DICOM files).
- UI10-09 [?] 3D mouse: right-drag pans (MPR: left W/L, right pan, middle zoom, wheel slices; 3D: left rotate, right pan, wheel zoom).
- UI10-10 [?] 3D implants editable on the views: screw diameter diamond (+ entry/tip for trajectory & length), cage
        width/depth/height diamonds + rotate knob + size label, rod: drag points to bend, drag "+" to add a bend point,
        double-click a point to remove it; rods drawn as smooth curves in 2D and 3D.

## UI batch 11 (2026-10-03)
- UI11-01 [?] 3D crop vanished on rotate: Cornerstone re-aims the first two mapper clipping planes as its camera slab
        (Viewport.updateClippingPlanesForActors). applyCrop now adds two Cornerstone-owned planes with slabThickness 1e7
        before the six crop planes.
- UI11-02 [?] CT/MR study thumbnails: 3D view saved as scan type 'Thumbnail' (fixed id thumb-<studyId>) after load if
        missing and ~6 s after plan edits; cards use it (lib/studies.ts studyThumbnail / imageScans exclude it from series).
- UI11-03 [x] Menus/selects inside dialogs were hidden (z-50 vs dialog z-130) → z-[150].
- UI11-04 [?] Study-card report for CT/MR: virtual case is marked DICOM (no 2D decode of .dcm files); live viewer captured
        only if it shows that study, else the saved 3D thumbnail.
- UI11-05 [x] Home header: New Study and "more" buttons removed (notifications kept).

### UI11 audit (full sweep after the batch) — fixed
Store / server
- UI11-06 [x] Live share: remote edits applied (and autosaved) into whatever case was open → only while the room's case is open.
- UI11-07 [x] openStudy: a slow earlier patient load could win and create a duplicate session → setActivePatient returns loaded/superseded/failed.
- UI11-08 [x] addContext: saving an untitled case activated it even if the user had opened another patient meanwhile.
- UI11-09 [x] Compare: clearing Image B wasn't saved (came back on reload).
- UI11-10 [x] loadPlan could write one session's plan into another if the case changed during the request.
- UI11-11 [x] Settings (report logo/institution, targets) carried over between users on the same browser → per-user.
- UI11-12 [x] Patient edit / archive / visit edits / reorder failed silently → errors shown, reorder rolled back.
- UI11-13 [x] Age → DOB keeps the existing birthday instead of resetting it.
- UI11-14 [!] Server: one shared uploads folder (UPLOADS_DIR), TLS for DATABASE_URL in migrate, reset refuses production
        unless ALLOW_RESET=yes, PACS imports owned by the importer. Backend needs one restart.
UI
- UI11-15 [x] Admin inspection mode leaked into the admin's own studies after leaving the workspace.
- UI11-16 [x] Patients without studies disappeared from the Patients list.
- UI11-17 [x] Study rename: field blurred/saved immediately; prefill uses the custom name.
- UI11-39 [x] Share links could carry another patient's session → link opens that study's latest session.
- UI11-40 [x] Compare Image A picker opened the study's latest session instead of the picked image's session.
- UI11-41 [x] Report notes fall back to the Study Notes from the side panel.
- UI11-42 [x] Member workspace "Open": skips the 3D thumbnail scan, never stays spinning, shows load errors.
- UI11-43 [x] Unfinished Studies: releases the CT/MR viewer before opening another study; column renamed "Study Date".
- UI11-44 [x] Patient timeline: newest group expands also when visits arrive after selection (refresh).
- UI11-45 [x] Report table header "Target | … | Target" → "Parameter"; Share dialog primary button visible (no-op token classes).
- UI11-46 [x] Dead buttons: Configure PACS / Hospital SSO / Forgot password say "coming soon".
3D / DICOM
- UI11-18 [x] Untitled CT/MR series (+ 3D plan) is now saved when the case is promoted.
- UI11-19 [x] Crash on leaving the 3D viewer ("Rendering engine has been destroyed").
- UI11-20 [x] Implant placement hit bone hidden by the crop box.
- UI11-21 [x] Clicks on cell buttons/crop handles placed implants; a rotate after placement was swallowed.
- UI11-22 [x] Keyboard shortcuts fired while typing, in dialogs/menus, or on the Report tab.
- UI11-23 [x] Thumbnail/report capture saved black panels when a view was maximised.
- UI11-24 [x] DICOM upload: non-DICOM extras (DICOMDIR, CD files) rejected the batch → filtered by DICM magic; retries, 4 parallel.
- UI11-25 [x] A single .dcm (2D X-ray) switched to the 3D viewer; untitled CT/MR series counts as unsaved work.
- UI11-26 [x] Series load continued after leaving the viewer; duplicate slices (same SOP UID) removed.
- UI11-27 [x] Upload failures shown, leaving the page while uploading warns.
2D canvas
- UI11-28 [x] Right-click repeated the last tool for every tool (drag stuck to cursor) → only multi-click tools.
- UI11-29 [x] Generic 4-point angle showed 169° instead of 11° for lines drawn opposite ways.
- UI11-30 [x] Circle/ellipse click without drag made a zero-size shape (NaN perimeter).
- UI11-31 [x] Touchpad vs mouse-wheel detection unreliable at non-100% zoom.
- UI11-32 [x] 2D screw could be shortened below its drawn silhouette.
- UI11-33 [x] Trunk shift / AVT drawn in px while the panel showed mm.
- UI11-34 [x] Open osteotomy "Opening" value not updated after point drags.
- UI11-35 [x] Bent rod hit-test used straight chords (clicks on the curve missed).
- UI11-36 [x] Redo lost after a no-op click; redo after an eye toggle reverted it.
- UI11-37 [x] Landmark reuse mixed AP and lateral points; S1 anterior/posterior taken from click order.
- UI11-38 [x] Zoom slider zoomed around the image corner instead of the view centre.
Open (owner decision): server-side ownership checks on contexts/patients and WebSocket room auth (SRV-02/04/07);
global theme-token fix for shadcn classes. Deferred: signed T1SPi/T9SPi/ODHA.

## UI batch 12 (2026-10-03)
- UI12-01 [?] Settings → Target measurements: round red indicators (filled with a white check when selected, outlined ring
        when not), whole row clickable; label no longer overlaps the old tiny check.
- UI12-02 [?] Compare: pick a study image AND a version — No plan, a saved plan (Plan 1, 2 …) or the current working plan.
        Image A = the case session of that image (quick version dropdown on the pane); Image B = any study/version (a copy
        of that session's measurements, saved with the case) or a new import. Identical A/B selections are blocked. A pane
        showing a plan is drawn in planning view and is read-only ("No plan" needed for assessment); saved plans are never
        modified by viewing. (ComparePage, comparisonSlice setComparisonPlanA/setComparisonB, caseState, CanvasWorkspace.)
- UI12-03 [?] Extended reference lines (CSVL, C7PL, horizontals of PO/slope/tilt, SPi/CBVA verticals, RVAD apical
        perpendicular) drawn pink (#FF5FA2) with their name written on the line, not as a floating label.
- UI12-10 [x] Ownership & sharing (server-enforced). Migration 013: patients.owner_user_id (backfilled from study owners),
        study_shares (view|edit). server/access.ts computes owner/edit/view per study, session and patient; every patient,
        visit, study, scan, session, report route and the live-share WebSocket check it (view-only sockets can't write).
        GET /api/patients returns own studies (workspace-filtered) + shared (via=share, any workspace) + team (org admin in
        that org's workspace, via=team, view). Verified end-to-end with 20 API checks on a spare server.
- UI12-11 [?] Share dialog: add people by username (login email) with View/Edit, change/revoke, org-member suggestions.
        Recipient: Patients → "Shared with me"; "Remove from my list" deletes only the share. Edit = same session, live sync.
- UI12-12 [?] View-only cases (shared view, admin viewing a member): banner, tools panel replaced, canvas/3D edits blocked,
        no autosave/thumbnail/status writes; measurements and plan visible. Shared-edit cases show a "Shared with you" banner.
- UI12-13 [?] Admin tunnel: Members → eye → member's studies in this org (view only, opens in workspace, "Back to member").
        Members page explains Admin vs Member; stored role 'viewer' shown as "Member"; review-copy button removed.
- UI12-14 [x] Members don't get Configure PACS (dashboard card + PACS dialog Configure hidden for org members).
- UI12-15 [x] Data cleanup: orgs SRIHER, Acme Healthcare, Fortis removed (8 studies kept as their owner's personal studies;
        backup JSON in the session scratchpad). Left for the owner: 38 ownerless patients (no studies; 30+ old Quick
        Analysis), 25 visits without studies, 18 near-empty studies of accomplices12d7@gmail.com.
- UI12-20 [?] Compare: Image A's measurement list and the comparison table follow the chosen version — No plan = preop;
        Plan N / working plan = preop carried through that plan's osteotomies (recomputed) + plan items, same as the report
        (plan.ts compareVersionMeasurements).
- UI12-21 [x] Personal and organization workspaces no longer mix: patients.organization_id (migration 014, backfilled from
        their studies), set at creation from the active workspace (only orgs the user belongs to). Verified via API.

## Deployment (2026-10-04)
- DEPLOY-02 [x] Rehearsal on a fresh database in production mode: migrations 0000–014 apply cleanly; sign up (no email
        code, DEMO_MODE) → login → profile → create org → patient/study → image upload + serving → session save →
        privacy between users → share by username: all pass. Auth rate limit added (20 / IP / 15 min). Container no
        longer needs a shared demo login (seeded only if DEMO_USER_EMAIL is set); render.yaml disk 10 GB.
- DEPLOY-03 [ ] Owner: hosting account (Render blueprint recommended) + push to branch demo-deploy → deploy → smoke test
        → put the link in docs/DEMO_GUIDE.md.
- DEPLOY-04 [x] Sign-up codes by email: SMTP (Gmail app password, port 587) or Resend; startup verifies SMTP login;
        send failures reported to the user; DEMO_MODE skips the code only while no email provider is configured.
        Verified sending through a real SMTP test server (Ethereal). Port 465 was blocked from the dev machine → 587.
- DEPLOY-05 [x] Private uploads: /uploads requires sign-in + access to the study (scan/report/session lookup);
        HttpOnly ss_media cookie set at login and on every authenticated API call, cleared at sign-out.
- DEPLOY-06 [x] Usage dashboard for PLATFORM_ADMIN_EMAILS (sidebar → Usage, /platform): totals, sign-ups chart,
        per-user sign-ins/patients/studies/sessions/measurements/reports/shares/last work, tool usage, activity feed.
        Second production rehearsal on a fresh DB: 12/12 checks (image privacy, sharing, stats access, logout).
- DEPLOY-07 [x] Free, no-card hosting: uploads to any S3-compatible bucket (Supabase Storage) via server/storage.ts
        (scans, reports, avatars, PACS, folder import; served through the access guard; deleted with their study);
        Brevo HTTP email provider (free hosts block SMTP); render.yaml = free blueprint; docs/FREE_DEPLOY.md guide.
        Verified with a local S3 server: upload → bucket (no local copy) → served byte-identical → blocked
        without sign-in → removed on study delete.
- DEPLOY-08 [x] LIVE 2026-10-04: https://spinesurge-demo.onrender.com (Render free + Supabase + Brevo). Fixed on the
        way: runtime image skipped devDependencies (tsx/pg/drizzle) → npm ci --include=dev; Supabase direct URL is
        IPv6-only → Session pooler URL (FREE_DEPLOY.md A3). External smoke test: app/assets served, /api,
        /uploads, /api/platform refuse anonymous requests, auth validation OK. Email + storage confirmed by the
        owner's first sign-up/upload.

## Pilot monitoring (2026-10-04)
- MON-01 [x] Live pilot monitor for PLATFORM_ADMIN_EMAILS (sidebar → Monitor, /platform; replaces the counts-only Usage page).
        Migration 015 usage_events; server/activity.ts records on the server: patient/study create, image upload (DICOM
        series grouped into one event with a count), session start, each NEW measurement (tool + value) and implant,
        saved plans, Compare Image B, report export, shares, study delete; client (lib/activity.ts) adds page/tab views,
        tool picks, 3D viewer, calibration, report preview + a 30 s presence heartbeat. Live over SSE (GET
        /api/platform/stream via authenticated fetch, auto-reconnect). Tabs: Live overview (feed with filters, online
        now, active users/day) · Users · Tools · Images (gallery) · Reports. /platform/users/:id = everything one user
        did (images, sessions with measurements/implants/plans/Image B, PDFs, shares, live timeline) + "Open view-only"
        in the real workspace (platform admins get view access to every study in access.ts; GET /api/patients?inspect=).
        Opening a user is written to audit_log (PLATFORM_VIEW_USER). Verified 30/30 API checks on a fresh DB (spare
        port): autosave doesn't duplicate events, non-admins get 403, admin can't write, other users still can't open files.
        Not checked on screen (Chrome extension not connected) — owner to look at /platform after deploy.
- MON-02 [x] docs/USER_MANUAL.md — user-friendly manual for pilot users (incl. a pilot-monitoring disclosure).
- MON-03 [ ] Owner: tell pilot users that usage is monitored (manual §13) before relying on the monitor; consider an
        events retention rule (Supabase free DB = 500 MB; events are small, heartbeats are not stored).
- MON-04 [x] The monitor ignores the platform admins themselves: nothing is recorded for PLATFORM_ADMIN_EMAILS accounts
        (server record/presence/audit push + client tracker), they're left out of users, totals, feed, tools, images,
        reports; old admin events are deleted at server start (purgeAdminEvents). Audit rows are kept, only hidden.
- MON-05 [x] Block / Unblock accounts from the monitor (Users table "Access" column and the user page). Sets
        users.is_active=false: old tokens get 401 on every API call, /uploads cookie and live-share sockets refused
        (isActiveUser, 30 s cache cleared on change), dropped from "online now", sign-in says "This account has been
        blocked" (only after a correct password). Data kept; unblock restores it. Admins can't be blocked. Audit:
        PLATFORM_BLOCK_USER / PLATFORM_UNBLOCK_USER. Verified 17/17 + purge check on a fresh DB (spare port).

## Pilot batch 2 (2026-10-04)
- HELP-01 [x] Help & feedback chat: "?" (sidebar above the theme switch, and workspace header) opens a corner chat;
        topics question/stuck/bug/like/dislike/idea; page, case and tool attached automatically. Migration 016
        support_messages; server/routes/support.ts. Each message is emailed to PLATFORM_ADMIN_EMAILS (Brevo, one mail
        per admin) and pushed live (SSE 'support'). Monitor → Feedback tab: counts per topic (click = filter),
        conversations, reply box; also on each user's monitor page. Replies are emailed to the user (link opens the
        chat: /#/dashboard?help=1). Bell = unread replies (users, opens the chat) / unread feedback (admins → Feedback).
- AUTH-01 [x] Forgot password: /forgot-password → emailed 6-digit code (10 min, max 5/hour, generic answer so it
        never reveals accounts) → new password. Lockout shared with email verification; code single-use; older
        sessions rejected via users.password_changed_at (authenticate). Rate limit covers both routes.
- UI13-01 [x] App opens in light mode for new visitors (ThemeProvider default); a chosen theme is remembered.
- CAL-01 [x] Calibration kept: (a) calibrating an untitled image before the study existed was dropped by the first
        save (addContext wrote toolState without it) — now saved; (b) a session without its own calibration reuses
        the calibration of the same image from another session or Compare Image B (caseState.calibrationFor, tests).
- CMP-01 [x] Compare: Image A has no import/existing-study button any more (always the case image; version dropdown
        only). Image B: existing study or import, plus a version dropdown (No plan / Plan N / working plan) for an
        image from a study; switching warns before replacing measurements added on B.
        Verified: 26/26 API checks (chat + reset) on a fresh DB, 123 unit tests, build. Not checked on screen.
- HELP-02 [x] Owner: feedback chat is in-app only — no email to the team for new messages and none to users for
        replies (Monitor → Feedback + bell, user's ? panel + bell). Email is used only for sign-up and password codes.
