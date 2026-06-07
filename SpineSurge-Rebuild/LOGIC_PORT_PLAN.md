# Logic & Geometry Port Plan — When & How

> How we move the **validated** tools/logic/geometry from the old repo into the new build without
> losing accuracy, and how we **enhance** them safely on top. Supplements `BUILD_ORDER.md`
> (Steps 7–8) and `MASTER.md` §6/§8.

> **Parity status (2026-06-04, 8b logic layer):** golden suite = **131 cases** green (oracle + ported
> both pass), **272 FE tests** total. Beyond the 8a planning math, now locked: **`maskUtils`**
> (3D flood-fill island filter + smoothing — golden) and the DICOM/3D *logic* layer —
> **`PedicleLogic`** volume probing (synthetic-volume parity test) + **DICOMParser** intensity
> transforms / **viewport orientation** (value-pinned verbatim ports). **Still pending (8b render+UI):**
> `initCornerstone` metadata/coords, `parseDicomFiles`, and the Cornerstone/VTK rendering pipeline —
> rendering is verified visually (`/verify`), not by golden JSON (§2). Older snapshot follows.
>
> **Parity status (2026-06-04, 8a):** golden suite = **125 cases** green (oracle + ported both pass).
> Locked: `GeometryUtils.*`, the 6 quick calculators (Cobb, SVA, PI_LL, PelvicParams,
> SpinalCurvatures, VBM), **pathology** (Stenosis area, Spondylolisthesis), the **deformity
> sagittal/coronal suite** (`deformity/tools/*` — PO, TS/AVT, SSA, SPi for T1SPi/T9SPi/ODHA, CBVA,
> RVAD, TPA, SPA), and now the **3D planning geometry** (`planning/SurgicalGeometry.*` — screw
> trajectory, cylinder↔plane intersection, angle↔vector, plane projection; `planning/ScrewDefaults`
> level→size lookup) — **Step 8a done**. The canvas engine (`CanvasManager`, osteotomy ops) is ported
> with its own unit tests and is wired to the interactive osteotomy canvas. **Not yet parity-locked:**
> the volume-probing half of planning (`PedicleLogic` — needs a live Cornerstone volume, deferred to
> 8b) and DICOM coordinate transforms (8b). Each lands via the same pattern: add catalog vectors →
> regenerate the oracle fixture → assert the ported fn.

---

## 0. Governing principle

The old repo is the **validated oracle.** Its measurement and geometry outputs are treated as
ground truth. Therefore:

1. **Port = preserve.** Ported code must reproduce the old repo's results **exactly** (numeric
   parity), proven by tests — not assumed.
2. **Enhance = add.** Every improvement is **additive and separately tested**. We never silently
   change a validated result; any intentional change is recorded as a **declared divergence**.
3. **No tool is "ported" until its parity tests are green.** Logic lands with its proof in the same
   commit.

This converts "is it accurate?" into a mechanical check: *does new == old on the golden vectors?*

---

## 1. The parity-lock method (the core mechanism)

Both old and new code are TypeScript, so the old modules can be executed to **generate golden
fixtures**, which the new (ported) modules are then asserted against.

```
┌─────────────────────────────────────────────────────────────────────┐
│ A. EXTRACT (run the OLD repo as oracle)                               │
│    fixture-gen script imports ../src/renderer/... modules,            │
│    runs them over representative input vectors,                       │
│    writes golden JSON  ->  fixtures/<tool>.golden.json                │
├─────────────────────────────────────────────────────────────────────┤
│ B. PORT (copy module into new repo, unchanged behavior)               │
├─────────────────────────────────────────────────────────────────────┤
│ C. PROVE PARITY (new repo test)                                       │
│    import ported module, run same vectors,                            │
│    assert deepEqual / closeTo(golden, tol=1e-9)   ->  must be GREEN    │
├─────────────────────────────────────────────────────────────────────┤
│ D. ENHANCE (additive)                                                 │
│    new behavior behind a flag or new code path,                       │
│    its own tests; if it changes a golden value, record a DIVERGENCE   │
└─────────────────────────────────────────────────────────────────────┘
```

**Golden fixtures are committed** so CI re-proves parity forever, and so we can see exactly what
changed if a value ever moves.

---

## 2. What gets parity-locked (by domain)

| Domain | Modules (old paths) | Nature | Proof |
|---|---|---|---|
| **Canvas engine** | `lib/canvas/CanvasManager`, `GeometryUtils`, `GeometryEngine`, `CurveUtils`, `TransformationCalculator`, `OpenOsteotomyOperation`, `FragmentSplitter`, `SurgicalOperations`, `ValidationEngine` | Deterministic geometry | Known-input→known-output golden vectors, tol 1e-9 |
| **2D measurements** | `features/measurements/quick/*` (Cobb, PI_LL, SVA, VBM, PelvicParams, SpinalCurvatures), `deformity/*`, `pathology/*`, `MeasurementSystem` | Pure clinical math | Golden vectors + clinical-range sanity + edge cases |
| **3D planning geometry** | `planning/SurgicalGeometry`, `PedicleLogic`, `ScrewDefaults`, `VtkHighFidelityScrew` (math parts) | Pure vector math | Golden vectors for trajectories/sizing/grading |
| **DICOM transforms** | `lib/cornerstone/initCornerstone` (metadata/coords), DICOM coordinate mapping | Coord-system correctness | Transform unit tests (pixel↔mm↔world); rendering verified visually |

> Rendering (Cornerstone/VTK draw output) is **not** golden-JSON testable — it's verified visually
> via the `/verify` run step. Only the **math feeding** the render is parity-locked.

---

## 3. WHEN — schedule (sub-steps inserted into Steps 7–8)

| Sub-step | When | Work |
|---|---|---|
| **7a — Verification harness** | **Before any 2D porting begins** | Build the fixture-gen script (imports old modules) + vitest golden-compare helper + the input-vector catalog for the canvas engine & 2D measurements. Generate & commit `*.golden.json`. |
| **7b — Port 2D engine + measurements** | Step 7 body | Port modules unchanged; parity tests must go green before UI wiring. |
| **7c — Apply 2D refinements as divergences** | End of Step 7 | undo/redo fix, numeric calibration, `applyOperation` typing — each with new tests + a divergence entry. |
| **8a — 3D/geometry harness** | Start of Step 8 | Fixture-gen + golden vectors for planning geometry (screw trajectory, pedicle, grading) and DICOM coordinate transforms. |
| **8b — Port DICOM/3D** | Step 8 body | Port unchanged; parity green for the math; metadata exact-match fix as a divergence; rendering visually verified. |
| **11 — Clinical validation pass** | Step 11 | Cross-check measurement outputs against clinical literature ranges + expert spot-check of the golden values themselves. |

**Net effect:** accuracy is locked the moment each tool is ported (7b/8b), not deferred. Step 11
becomes *external/clinical* validation rather than first-time testing.

---

## 4. HOW — enhancements without breaking validation

Three categories, each handled differently:

### 4a. Bug fixes (old behavior was wrong)
e.g. the **undo/redo** defect (failing `ResectionOperation` test).
- Fix it, write the correct-behavior test, and **record a divergence** (old result was a bug).
- The golden fixture for that case is regenerated **from the corrected logic** and annotated.

### 4b. Refinements (same result, better implementation)
e.g. **numeric calibration** (stop round-tripping through display strings), **typing
`applyOperation`**, **exact-match metadata**.
- Must **not** change golden values. Parity tests are the guardrail — if a value moves, it's a bug
  in the refinement, not an enhancement.

### 4c. Add-ons (new capability)
e.g. a new measurement tool, a new osteotomy type, richer grading.
- New code path, **its own** golden vectors and edge-case tests.
- If clinical, flagged for **expert review** before it's trusted.
- Existing tools' golden values stay untouched.

### Divergence registry
A single file `frontend/test/divergences.md` lists every intentional difference from the oracle:
`tool · case · old value · new value · reason · approver`. Nothing changes a validated number
without an entry here. This is the audit trail for accuracy.

---

## 5. Input-vector catalog (what we test each tool against)

For every tool, the golden set includes:
- **Typical** clinical cases (normal anatomy, representative angles/positions).
- **Boundary** cases (0°, 90°, straight spine, max curvature).
- **Degenerate** cases (collinear/coincident points, zero-length, single fragment).
- **Numerical stress** (very large/small coords, repeated transform chains for drift).
- **Unit/calibration** cases (px-only, calibrated mm, post-recalibration).

These vectors are authored once in 7a/8a and reused for parity, refinements, and enhancements.

---

## 6. Tooling

- **Runner:** vitest (already used by the old repo).
- **Fixture-gen:** `frontend/scripts/gen-golden.ts` — imports old modules via a path alias to
  `../../src/renderer`, runs the vector catalog, writes `frontend/test/fixtures/*.golden.json`.
  Run once per tool at port time; re-run only when a divergence is intentionally accepted.
- **Compare helper:** `expectMatchesGolden(actual, name, tol)` — deep-equal for structures,
  `closeTo` for floats.
- **CI gate:** parity tests run on every PR; a moved golden value fails CI unless the divergence
  registry change is in the same PR.

---

## 7. Definition of done (per tool)

- [ ] Module ported into `frontend/src/lib/...` unchanged in behavior.
- [ ] Golden fixtures generated from the old repo and committed.
- [ ] Parity test green (new == old on all vectors, tol 1e-9).
- [ ] Edge/degenerate/units cases covered.
- [ ] Any intentional change has a divergence-registry entry + its own test.
- [ ] (Clinical tools) outputs sanity-checked against literature ranges; flagged items reviewed.

A tool that fails any box is not ported — it's in progress.

---

## 8. Summary

- **When:** verification harness + golden extraction happen *first* in each port sub-step (7a, 8a);
  porting + parity proof happen in 7b/8b; clinical validation in Step 11.
- **How:** old repo is the oracle → extract golden values → port unchanged → prove parity →
  enhance additively, recording every intentional divergence.
- **Result:** the validated accuracy you already have is *carried forward provably*, and every
  enhancement is layered on without putting that accuracy at risk.
