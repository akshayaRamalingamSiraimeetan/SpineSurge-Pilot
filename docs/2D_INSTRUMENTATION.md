# 2D Instrumentation Redesign (screws / rods / cages on X-ray canvas)

Goal: replace the coloured gradient implants with clean **white silhouettes** (screw, rod, cage) that are
easy to place, select, move, rotate and resize. Status tracked in docs/BUGS.md (CV-*) and below.

## Current state (as audited 2026-10-02)
- Data model `Implant` — `lib/canvas/CanvasManager.ts:37-45`:
  `{id, type:'screw'|'rod'|'cage'|'plate'|'spacer', fragmentId, position:Point|null, angle(deg), properties:any, timestamp}`.
  All sizes in **image px**. screw: `position`=head, tip=`position+length·(cos,sin)`, `{length, diameter, color}`.
  cage: `position`=centre, `{width, height, wedgeAngle, ...}`. rod: `position=null`, `{points[], diameter}`.
- Rendering: `features/measurements/planning/ImplantRenderer.ts` — drawScrew(13-65), drawCage(215-261),
  drawRod(263-297, screen-constant width), drawPlate, getImplantHandles(346-388), drawImplantHandles(390-416).
  Only consumer: `features/canvas/CanvasWorkspace.tsx` render block ~573-591, previews ~794-804.
- Placement: CanvasWorkspace ~1551-1613 (2 clicks screw/cage/plate; rod multi-click + right-click).
- Hit/drag: body hit ~1616-1632, handle hit ~1742-1757, drag ~1806-1892.
- `ImplantPropertiesPanel.tsx` (mm controls) is dead code — not mounted.

## Target design
1. **Units**: store mm (`lengthMm`, `diameterMm`, `widthMm`, `heightMm`, `lordosisDeg`); convert with
   `px = mm / pixelToMm` at render; fallback default scale when uncalibrated. Legacy px implants keep working.
2. **Geometry** (`planning/ImplantSilhouettes.ts`, pure, returns `Path2D` in local coords, x along axis):
   - screw: tulip head (U-shaped rounded rect) + neck + threaded shank (sawtooth, pitch ~2.75mm,
     core ≈0.6d) tapering to a rounded tip exactly at x=L.
   - cage: trapezoid (posterior h, anterior h + w·tan(lordosis)), rounded corners, serrated top/bottom,
     graft window (evenodd).
   - rod: smooth Catmull-Rom spline through points, stroked with world width d, round caps.
3. **Style**: dark outline pass, then fill `rgba(255,255,255,0.95)`; selected = cyan outline. No gradients.
4. **Hit-testing**: `isPointInPath` in local coords; rods by segment distance. Order: selected implant
   handles → implant bodies (top first) → measurements. Use manager implants, not store.
5. **Handles**: screw = head(move) / tip(length+angle) / rotate knob; cage = centre(move) / rotate knob /
   width / height; rod = vertices + body drag moves all.
6. **Interaction**: wrap drags in history transactions; persist on mouseup only; keep selection after
   mouseup, clear on empty click; deep-copy `properties.points` in CanvasManager clone.

## Progress (2026-10-02)
- [x] Silhouette geometry (screw tulip+threads+rounded tip, lordotic serrated cage with graft window, plate, smooth rod)
- [x] White fill + dark outline + cyan selection; previews semi-transparent
- [x] Exact hit-testing via Path2D; selected implant's handles tested first
- [x] One undo step per drag (history transaction); store/context persisted on mouseup
- [x] Selection kept after drag; empty click deselects and pans; Delete removes selected implant
- [x] Default sizes in mm (6.5 mm screw, 10 mm cage height, 5.5 mm rod) via calibration (fallback ≈300 mm FOV)
- [ ] Units still stored in px (labels convert with calibration) — mm storage is a later migration
- [ ] Separate rotate knob for cage (currently: front handle sets width + angle)
