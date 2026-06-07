# 3D Planning Workspace — Core Verification Checklist

> Manual, deep-dive verification of the Step 8b DICOM/3D workspace against **real CT data**.
> Focused on what couldn't be unit-tested: the live WebGL render path, coordinate projection, and
> the Cornerstone segmentation pipeline. Work top to bottom — each section gates the next.
>
> Highest-risk items (need a GPU to prove): **§2 orientation, §5 overlay projection, §7 segmentation.**

## Running the stack

All commands run from the `SpineSurge-Rebuild/` directory.

```bash
# START everything (build first time, then reuse). Data persists in named volumes.
docker compose -f infra/docker-compose.yml --env-file .env up -d

# STOP (keeps data + containers; fast to restart)
docker compose -f infra/docker-compose.yml --env-file .env stop

# START again after a stop
docker compose -f infra/docker-compose.yml --env-file .env up -d

# Status / health
docker compose -f infra/docker-compose.yml --env-file .env ps

# WIPE all data (patients, studies, DICOM) for a clean slate — destructive
docker compose -f infra/docker-compose.yml --env-file .env down -v
```

App: **http://localhost:5173**.  Quitting **Docker Desktop** stops all containers (data safe); reopening
it auto-restarts them (every service has `restart: unless-stopped`). Either method works — explicit
`stop`/`up -d` is the most predictable. Only `down -v` deletes data.

## Verification status — 2026-06-04 (real 185-slice lumbar CT, patient TestPat-01)

| § | Area | Result |
|---|---|---|
| 1 | WADO load (185 slices via proxy) | ✅ verified |
| 2 | Volume render + MPR orientation (axial/sagittal/coronal) + slice scroll | ✅ verified |
| 3 | HU-threshold volume rendering ("spine extraction") | ✅ verified |
| 4 | Pedicle wizard (Load→Crop→Points), level select, click-to-place | ✅ verified |
| 5 | Screw overlays (silhouettes) + projection lands at click point | ✅ verified |
| 6 | Implant properties: catalog sizing + pitch/yaw/depth live + 3D trackball | ✅ verified |
| 7 | Segmentation labelmap (threshold) | 🟡 fix deployed — see note; final visual confirm pending |
| 8 | Stability (view/tab switches) | ☐ not yet run |

**§7 note:** first attempt didn't paint — root-caused via console to two bugs, both fixed: (1) the
labelmap needed a "data changed" nudge; (2) **CS v4 streaming volumes have no volume-level scalar
array — `getScalarData()` throws "No scalar data available"**. Now thresholds **per-slice** via each
image's pixel data (the old viewer's approach), rescaled to true **HU**. Diagnostic logging is on
(`SEG_DEBUG = true` in `features/dicom/planning/segmentation.ts`) — turn it off once §7 is confirmed.

**Console cleanup:** the noisy per-slice `[Cornerstone] Returning imagePixelModule …` logging is now
gated behind `CS_DEBUG` (off) in `lib/cornerstone/initCornerstone.ts`.

## 0. Pre-flight (data in)
- [ ] **Login** (dev) → dashboard loads.
- [ ] **Create a patient** (New Patient) → appears in the **Patients** page (real API list).
- [ ] **Add a study → DICOM series**; upload a **real CT series** (axial, ideally with
      `RescaleSlope`/`RescaleIntercept` so HU is true). Upload succeeds; study card shows modality **CT**.
- [ ] Study has an `orthanc_study_uid` set (required for 3D to unlock).

## 1. WADO load (data path)
- [ ] Study → **Workspace → Planning tab**.
- [ ] View selector (bottom-left) offers a **3D** option. *(Absent ⇒ study has no Orthanc UID / not CT.)*
- [ ] Switch to **3D** → "Loading CT series…" then resolves. **No "Failed to load study"**.
- [ ] Console: no CORS errors on `/dicom/wado`, no multipart parse warnings, `crossOriginIsolated === true`.

## 2. Volume render & MPR  ⚠️ high-risk
- [ ] **4 quadrants** populate: Axial / Sagittal / Coronal slices + a 3D bone surface.
- [ ] **Orientation correct per quadrant** (axial transverse, sagittal spine profile, coronal front-on).
- [ ] **Scroll** on an MPR pane steps slices smoothly.
- [ ] Slices in correct order (no reversed/shuffled stack — checks the sliceLocation sort).

## 3. HU threshold / Volume rendering
- [ ] Volume Rendering mode: dragging **HU Threshold** hides soft tissue at high HU ("spine extraction"),
      live. At ~300 HU vertebrae are cleanly isolated.

## 4. Pedicle wizard (left panel)
- [ ] Stepper animates; **Begin Workflow** → Crop. Slice count correct.
- [ ] **Crop:** ROI sliders move; min cannot cross max.
- [ ] **Points:** pick a **Level**; cursor → crosshair over MPR.
- [ ] **Click a pedicle** on an MPR → point added to list **and** a screw appears (auto-selected).
- [ ] **Screws:** screw listed; click selects (highlight).

## 5. Screw overlays (coordinate accuracy)  ⚠️ high-risk
- [ ] Screw silhouette renders: ring+tick on Axial; tulip-head + bullet-tip on Sagittal/Coronal, in the
      level color.
- [ ] **Overlay sits exactly where you clicked** (entry at click point) — verifies `worldToCanvas`.
- [ ] **Pan / zoom / scroll** → overlay tracks the anatomy (no drift).
- [ ] **Drag the entry handle** → screw moves and holds; trajectory follows.

## 6. Implant properties (right panel)
- [ ] Selected screw shows level, region badge, color.
- [ ] **Ø Diameter** lists only catalog sizes for the region; changing it re-snaps **Length** to a valid value.
- [ ] **Pitch / Yaw** rotate the trajectory live; **Insertion depth** lengthens/shortens along the axis.

## 7. Segmentation & scissors  ⚠️ high-risk (defensively wired)
- [ ] Control bar → **Segmentation** → Threshold/Scissors sub-toggle appears.
- [ ] **Threshold** + Mask Threshold slider → labelmap overlays bone on the MPRs.
- [ ] **Scissors** → primary-drag carves the mask (and primary stops doing window/level).
- [ ] Back to **Volume Rendering** restores the 3D bone view. *(If segmentation errors, the volume must
      still render — guard logs a console warning.)*

## 8. Stability / regressions
- [ ] Switch view **3D → Lateral → 3D** repeatedly: no crash, no leaked WebGL context.
- [ ] Switch tab **Assessment ↔ Planning**: viewer rebuilds cleanly.
- [ ] Leave + re-enter the workspace: same study reloads.

---

## Known mock vs. real (so empty-DB states read correctly)
Per `BUILD_ORDER.md`, these screens still use **hardcoded mock data** (no backend endpoint yet) — they
will show sample patients even when the database is empty:
- **Dashboard** (Continue Working / Recent Studies / Unfinished Studies feeds)
- **Library** collections, **Compare**, **Report** PDF export, **Settings** PACS/users panels

**Real, API-backed (reflect the actual DB):** the **Patients** page, patient create/edit, **Add Study**,
scan/DICOM upload, the **workspace** (loads the real scan + persists measurements), study WADO/QIDO.

> To verify against real data, drive everything from the **Patients** page and the workspace — not the
> dashboard cards.
