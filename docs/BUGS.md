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
