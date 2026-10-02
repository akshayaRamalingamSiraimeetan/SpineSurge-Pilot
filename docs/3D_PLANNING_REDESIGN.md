# 3D Surgical Planning — Redesign

Goal: CORI/StealthStation-style planning. 4-up view (axial / sagittal / coronal MPR + 3D), screws/rods/cages
in true 3D (LPS mm), adjustable by dragging in any MPR view and in 3D, all views synced from one store,
working threshold bone segmentation and crop. Minimal, correct, no gimmicks.

Versions: @cornerstonejs/core/tools/dicom-image-loader 4.22.9, @kitware/vtk.js 34.15.1. App runs in StrictMode.

## Why the current module fails (see BUGS.md 3D-*)
- Segmentation: `ImageVolume.getScalarData` doesn't exist in v4 → mask never filled; labelmap bound to
  VOLUME_3D (unsupported); segmentation mode swaps CT for empty mask in 3D.
- `setVolumes` re-run on every layout/colour change → `removeAllActors()` wipes screws.
- Screws: default direction `[0,0,1]` (cranio-caudal!), click point = tip, angles about world axes,
  head drag jumps by full length, 3D model ~1.5d longer than 2D.
- 3D picking uses vtkCellPicker on v4 volumes (no scalars) → throws.
- Crop code commented out. Screw overlay polls at 30Hz. Effects early-return when engine null and never rerun.
- `CornerstoneViewer.tsx` is a 1737-line god component. Large dead code: DICOMViewer.legacy.tsx,
  SpinePedicleWizard, CropOverlay2D, volumeEraser, PedicleLogic (mostly), ImplantPropertiesPanel.

## Target architecture — `src/renderer/features/planning3d/`
| file | role |
|---|---|
| `loadSeries.ts` | group files by SeriesInstanceUID, pick largest, `createAndCacheVolume` + `load()`; return volumeId + FoR UID |
| `PlanningViewer.tsx` | 2×2 layout, fixed viewport ids, ONE `setVolumesForViewports`, 3D preset `CT-Bone`; abort-token lifecycle; ResizeObserver after engine exists |
| `implantMath.ts` | pure vec3 helpers, screw/rod/cage geometry, ray/plane/segment math, slab clipping |
| `actors3D.ts` | vtk actors: screw (cylinder+cone, total length L, origin at tip), rod (polyline→tube), cage (box); add/remove via `viewport.addActors/removeActors`; full resync from store |
| `Overlay2D.tsx` | one SVG per MPR; recompute on CAMERA_MODIFIED / VOLUME_NEW_IMAGE + store; slab-clipped outline (bold in slab, faint outside); handles: head / tip / body; drag via `viewport.canvasToWorld` (always in-plane) |
| `interaction3D.ts` | 3D pointer: ray from `canvasToWorld` + `directionOfProjection`; analytic hit test on implants; drag on camera-facing plane through hit; place on bone by ray-marching HU ≥ threshold (`transformWorldToIndex` + `voxelManager.getAtIJKPoint`) |
| `segmentation.ts` | `createAndCacheDerivedLabelmapVolume` → `addSegmentations` → labelmap repr on MPR only → `thresholdVolumeByRange` → `triggerSegmentationDataModified`; 3D bone surface via `vtkImageMarchingCubes` from labelmap (or CT-Bone TF fallback) |
| `crop` | `mapper.addClippingPlane` × 6 on the 3D volume driven by ROI box (store `roiCrop`) |

### Data model (LPS mm, stored in context `threeDImplants`)
```ts
Screw { id, type:'screw', entry: Vec3, tip: Vec3, diameter, level?, side?, color? }   // length = |tip-entry|
Rod   { id, type:'rod',   points: Vec3[], diameter }
Cage  { id, type:'cage',  center: Vec3, axisX: Vec3, axisY: Vec3, size: [w, d, h] }
```
Legacy screws (`position`+`direction`+angles) migrate: tip = transformed tip, entry = tip − dir·length.

### Interaction rules
- Place: choose tool (screw / rod / cage) → click in any MPR → screw entry at click, tip = entry + default
  dir·length where default dir = **posterior→anterior** (`[0,-1,0]` in LPS) projected into the clicked plane.
- Edit in MPR: drag **head** (moves entry, tip fixed → changes trajectory), **tip** (moves tip), **body**
  (translates both). All in-plane, so axial edits medial angle, sagittal edits caudal angle.
- Edit in 3D: click implant → selected; drag body moves it parallel to screen; handles same semantics.
- Side panel: selected implant → diameter / length numeric inputs, level, side, delete.
- Persist on pointer-up only (no saves during drag).

## Progress (2026-10-02)
- [x] planning3d module: vec3.ts, implantModel.ts (+ legacy migration), loadSeries.ts, actors3D.ts,
      Overlay2D.tsx, interaction3D.ts, volumeDisplay.ts, PlanningViewer.tsx, PlanPanel.tsx
- [x] viewer lifecycle (cancel flag, unique ids per mount, tool groups/engine/volume destroyed, memory released)
- [x] 3D actors synced from store (screw = shaft+cone+tulip, rod = tube, cage = box)
- [x] 2D overlay: slab-clipped white silhouettes; head/tip/body/rotate handles; in-plane drags
- [x] 3D: click-select, screen-parallel drag, place screw on bone (HU ray-march) along view ray
- [x] selecting an implant moves all MPR slices to it
- [x] bone segmentation: MPR labelmap (thresholdVolumeByRange) + 3D opaque bone transfer function
- [x] crop: 6 clipping planes on the 3D volume, sliders in left sidebar
- [x] rods (multi-click, dbl-click/Enter/right-click to finish), cages (click; rotate knob; size in panel)
- [x] persistence: drags don't save until release; plan stored in context toolState + migrated on load
- [x] legacy files deleted (CornerstoneViewer, DICOMViewer.legacy, ScrewOverlay2D, CropOverlay2D,
      SpinePedicleWizard, volumeEraser, maskUtils, VtkHighFidelityScrew, PedicleLogic, SurgicalGeometry…)
- [ ] verify with real CT data on screen (user)
- [ ] optional later: marching-cubes bone mesh in 3D, oblique "screw-aligned" reslice views, undo for 3D edits

## Controls
- MPR: left = window/level, middle = pan, right = zoom, wheel = scroll slices.
- 3D: left = rotate (or drag an implant), middle = pan, wheel = zoom.
- Place: pick Screw / Rod / Cage in the left sidebar → click in a view. Esc cancels.
- Edit: select (click implant or list) → drag handles; Delete removes; panel edits length/diameter/level/side.
