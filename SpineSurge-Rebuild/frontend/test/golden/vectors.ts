/* Input-vector catalog (LOGIC_PORT_PLAN §5) — the fixed inputs every ported tool is proven against.
   Each tool lists cases spanning typical / boundary / degenerate / numerical-stress / calibration.
   This file holds ONLY data (no oracle imports), so it is shared verbatim by the oracle generator
   (test/golden/oracle.gen.test.ts) and, in Step 7b, by the ported-module parity tests. */

export interface Point {
  x: number;
  y: number;
}

export interface Vector {
  name: string;
  /** Positional args spread into the tool function. */
  args: unknown[];
}

export interface ToolVectors {
  /** Stable key — matches a function in the oracle map and names the fixture file. */
  tool: string;
  cases: Vector[];
}

const p = (x: number, y: number): Point => ({ x, y });

/* ---- 3D planning helpers (Step 8a) ---- */
type Vec3 = [number, number, number];
const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];
/** 1/√2 — used to author pre-normalized oblique screw axes. */
const SQ = Math.SQRT1_2;
/** A PedicleScrewParams with sensible defaults; override per case. */
const screw = (o: Partial<{ entry: Vec3; axis: Vec3; length: number; coreDiameter: number; headDiameter: number }> = {}) => ({
  id: 's',
  entry: o.entry ?? v3(0, 0, 0),
  axis: o.axis ?? v3(0, 0, 1),
  length: o.length ?? 40,
  coreDiameter: o.coreDiameter ?? 6,
  headDiameter: o.headDiameter ?? 8,
  color: '#fff',
});

export const catalog: ToolVectors[] = [
  /* ---------------- GeometryUtils (foundational pure geometry) ---------------- */
  {
    tool: 'geometry.calculateAngle',
    cases: [
      { name: 'right-angle', args: [p(0, 0), p(1, 0), p(0, 1)] },
      { name: 'straight', args: [p(0, 0), p(1, 0), p(-1, 0)] },
      { name: 'reflex-clamped', args: [p(0, 0), p(1, 0), p(0, -1)] },
      { name: 'oblique', args: [p(2, 2), p(5, 2), p(2, 7)] },
      { name: 'degenerate-coincident', args: [p(0, 0), p(0, 0), p(1, 0)] },
    ],
  },
  {
    tool: 'geometry.getDistance',
    cases: [
      { name: '3-4-5', args: [p(0, 0), p(3, 4)] },
      { name: 'zero-length', args: [p(1, 1), p(1, 1)] },
      { name: 'negative-coords', args: [p(-2, -3), p(4, 5)] },
      { name: 'large-coords', args: [p(1e7, 0), p(0, 1e7)] },
    ],
  },
  {
    tool: 'geometry.getMidpoint',
    cases: [
      { name: 'origin-to-10-20', args: [p(0, 0), p(10, 20)] },
      { name: 'negatives', args: [p(-4, -8), p(4, 8)] },
    ],
  },
  {
    tool: 'geometry.getHipAxisCenter',
    cases: [
      { name: 'typical', args: [[p(0, 0), p(2, 0), p(10, 0), p(12, 0)]] },
      { name: 'too-few-points', args: [[p(0, 0), p(2, 0)]] },
    ],
  },
  {
    tool: 'geometry.getLineLinesIntersection',
    cases: [
      { name: 'cross-at-5-5', args: [p(0, 0), p(10, 10), p(0, 10), p(10, 0)] },
      { name: 'parallel-null', args: [p(0, 0), p(10, 0), p(0, 5), p(10, 5)] },
      { name: 'oblique', args: [p(0, 0), p(4, 8), p(0, 6), p(6, 0)] },
    ],
  },
  {
    tool: 'geometry.getPolygonCenter',
    cases: [
      { name: 'unit-square', args: [[p(0, 0), p(10, 0), p(10, 10), p(0, 10)]] },
      { name: 'triangle', args: [[p(0, 0), p(6, 0), p(3, 9)]] },
    ],
  },
  {
    tool: 'geometry.getPolylineLength',
    cases: [
      { name: 'L-shape', args: [[p(0, 0), p(3, 0), p(3, 4)]] },
      { name: 'single-point', args: [[p(5, 5)]] },
    ],
  },
  {
    tool: 'geometry.getPolygonArea',
    cases: [
      { name: '10x10-square', args: [[p(0, 0), p(10, 0), p(10, 10), p(0, 10)]] },
      { name: 'triangle', args: [[p(0, 0), p(4, 0), p(0, 3)]] },
      { name: 'degenerate-collinear', args: [[p(0, 0), p(1, 1), p(2, 2)]] },
    ],
  },
  {
    tool: 'geometry.getPolygonPerimeter',
    cases: [{ name: '10x10-square', args: [[p(0, 0), p(10, 0), p(10, 10), p(0, 10)]] }],
  },
  {
    tool: 'geometry.extrapolateLine',
    cases: [
      { name: 'horizontal-len-10', args: [p(0, 0), p(1, 0), 10] },
      { name: 'diagonal', args: [p(2, 2), p(5, 6), 5] },
      { name: 'zero-length-line', args: [p(3, 3), p(3, 3), 10] },
    ],
  },
  {
    tool: 'geometry.isPointInPolygon',
    cases: [
      { name: 'inside', args: [p(5, 5), [p(0, 0), p(10, 0), p(10, 10), p(0, 10)]] },
      { name: 'outside', args: [p(15, 5), [p(0, 0), p(10, 0), p(10, 10), p(0, 10)]] },
      { name: 'far-corner', args: [p(-1, -1), [p(0, 0), p(10, 0), p(10, 10), p(0, 10)]] },
    ],
  },
  {
    tool: 'geometry.splitPolygonByLine',
    cases: [
      { name: 'vertical-split', args: [[p(0, 0), p(10, 0), p(10, 10), p(0, 10)], p(5, -1), p(5, 11)] },
      { name: 'miss-returns-original', args: [[p(0, 0), p(10, 0), p(10, 10), p(0, 10)], p(20, -1), p(20, 11)] },
    ],
  },

  /* ---------------- Quick clinical measurements ---------------- */
  {
    tool: 'cobb',
    cases: [
      // Two endplate lines tilted ±10° → ~20° Cobb.
      { name: 'tilt-20deg', args: [[p(0, 0), p(100, -17.6327), p(0, 100), p(100, 117.6327)]] },
      { name: 'parallel-zero', args: [[p(0, 0), p(100, 0), p(0, 50), p(100, 50)]] },
      { name: 'steep', args: [[p(0, 0), p(50, 80), p(0, 100), p(80, 40)]] },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0)]] },
    ],
  },
  {
    tool: 'spinalCurvature',
    cases: [
      { name: 'tilt-20deg', args: [[p(0, 0), p(100, -17.6327), p(0, 100), p(100, 117.6327)]] },
      { name: 'parallel-zero', args: [[p(0, 0), p(100, 0), p(0, 50), p(100, 50)]] },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0), p(2, 0)]] },
    ],
  },
  {
    tool: 'sva',
    cases: [
      { name: 'anterior-10', args: [[p(110, 50), p(100, 300)]] },
      { name: 'posterior-neg', args: [[p(90, 50), p(100, 300)]] },
      { name: 'aligned-zero', args: [[p(100, 50), p(100, 300)]] },
      { name: 'too-few-points', args: [[p(100, 50)]] },
    ],
  },
  {
    tool: 'pelvic',
    cases: [
      // FH1(0,1) FH2(2,3) S1(4,5): two femoral heads + sacral endplate, hips anterior (right) of S1.
      {
        name: 'typical-right-facing',
        args: [[p(300, 400), p(320, 400), p(360, 400), p(380, 400), p(250, 360), p(290, 380)]],
      },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0), p(2, 0)]] },
    ],
  },
  {
    tool: 'pill',
    cases: [
      // 8 points: FH1 0-1, FH2 2-3, S1 4-5, L1 6-7.
      {
        name: 'typical',
        args: [
          [p(300, 400), p(320, 400), p(360, 400), p(380, 400), p(250, 360), p(290, 380), p(255, 150), p(300, 160)],
        ],
      },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0), p(2, 0), p(3, 0)]] },
    ],
  },
  {
    tool: 'vbm',
    cases: [
      // 4 corners: sup-post, sup-ant, inf-ant, inf-post.
      { name: 'lateral-px', args: [[p(0, 0), p(40, 2), p(42, 35), p(2, 33)], 'lateral', null] },
      { name: 'lateral-mm', args: [[p(0, 0), p(40, 2), p(42, 35), p(2, 33)], 'lateral', 0.5] },
      { name: 'ap-mm', args: [[p(0, 0), p(38, 0), p(38, 34), p(0, 34)], 'ap', 0.25] },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0), p(2, 0)], 'lateral', null] },
    ],
  },

  /* ---------------- Pathology ---------------- */
  {
    tool: 'stenosis',
    cases: [
      { name: 'square-px', args: [[p(0, 0), p(10, 0), p(10, 10), p(0, 10)], null] },
      { name: 'square-mm', args: [[p(0, 0), p(10, 0), p(10, 10), p(0, 10)], 0.5] },
      { name: 'large-cm2', args: [[p(0, 0), p(200, 0), p(200, 200), p(0, 200)], 0.5] },
      { name: 'triangle-px', args: [[p(0, 0), p(8, 0), p(0, 6)], null] },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0)], null] },
    ],
  },
  {
    tool: 'spondylolisthesis',
    cases: [
      // A,B = superior vertebra posterior wall; C,D = inferior vertebra posterior wall (anteriorly slipped).
      { name: 'typical-px', args: [[p(100, 100), p(100, 200), p(110, 205), p(112, 305)], null] },
      { name: 'typical-mm', args: [[p(100, 100), p(100, 200), p(110, 205), p(112, 305)], 0.5] },
      { name: 'high-grade', args: [[p(100, 100), p(100, 200), p(160, 205), p(162, 305)], null] },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0), p(2, 0)], null] },
    ],
  },

  /* ---------------- Deformity — coronal/sagittal suite ---------------- */
  {
    // calculatePO(points) — angle from horizontal between 2 points. Slope/iTilt share this math.
    tool: 'deformity.po',
    cases: [
      { name: 'level-zero', args: [[p(100, 200), p(300, 200)]] },
      { name: 'tilt-up-right', args: [[p(100, 200), p(300, 100)]] }, // |dy|/|dx| = 100/200 → 26.565°
      { name: 'tilt-down-right', args: [[p(100, 100), p(300, 200)]] },
      { name: 'vertical', args: [[p(150, 100), p(150, 300)]] }, // dx=0 → 90°
      { name: 'too-few-points', args: [[p(0, 0)]] },
    ],
  },
  {
    // calculateTS(points, pixelToMm) — C7 to S1-midpoint horizontal offset. AVT shares this math.
    tool: 'deformity.ts',
    cases: [
      { name: 'offset-px', args: [[p(120, 60), p(180, 400), p(220, 400)], null] }, // s1Mid.x=200, dx=80
      { name: 'offset-mm', args: [[p(120, 60), p(180, 400), p(220, 400)], 0.5] },
      { name: 'aligned-zero', args: [[p(200, 60), p(180, 400), p(220, 400)], null] },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0)], null] },
    ],
  },
  {
    // calculateSSA(points) — spinosacral angle (C7, S1-posterior, S1-anterior).
    tool: 'deformity.ssa',
    cases: [
      { name: 'typical', args: [[p(300, 100), p(260, 400), p(360, 405)]] },
      { name: 'steep', args: [[p(280, 120), p(250, 420), p(420, 430)]] },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0)]] },
    ],
  },
  {
    // calculateSPi(points) — T1SPi/T9SPi/ODHA: 4 femoral-head pts + vertebra centroid (index 4).
    tool: 'deformity.spi',
    cases: [
      { name: 'typical', args: [[p(280, 400), p(300, 400), p(360, 400), p(380, 400), p(330, 120)]] },
      { name: 'anterior-lean', args: [[p(280, 400), p(300, 400), p(360, 400), p(380, 400), p(420, 130)]] },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0), p(2, 0), p(3, 0)]] },
    ],
  },
  {
    // calculateCBVA(points) — chin→brow line vs vertical (2 points).
    tool: 'deformity.cbva',
    cases: [
      { name: 'forward-gaze', args: [[p(200, 200), p(210, 120)]] },
      { name: 'downward-gaze', args: [[p(200, 200), p(170, 130)]] },
      { name: 'too-few-points', args: [[p(0, 0)]] },
    ],
  },
  {
    // calculateRVAD(points) — right rib(2), left rib(2), apical vertebra endplate(2).
    tool: 'deformity.rvad',
    cases: [
      {
        name: 'typical',
        args: [[p(360, 200), p(420, 230), p(240, 200), p(180, 235), p(280, 210), p(340, 215)]],
      },
      {
        name: 'symmetric-zero',
        args: [[p(360, 200), p(420, 230), p(240, 200), p(180, 170), p(280, 200), p(340, 200)]],
      },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0), p(2, 0), p(3, 0), p(4, 0)]] },
    ],
  },
  {
    // calculateTPA(points) — 4 femoral-head pts, T1 centroid(4), S1 endplate(5,6).
    tool: 'deformity.tpa',
    cases: [
      {
        name: 'typical',
        args: [[p(280, 400), p(300, 400), p(360, 400), p(380, 400), p(330, 120), p(300, 380), p(360, 385)]],
      },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0), p(2, 0), p(3, 0), p(4, 0), p(5, 0)]] },
    ],
  },
  {
    // calculateSPA(points) — 4 femoral-head pts, C7 centroid(4), S1 endplate(5,6).
    tool: 'deformity.spa',
    cases: [
      {
        name: 'typical',
        args: [[p(280, 400), p(300, 400), p(360, 400), p(380, 400), p(330, 120), p(300, 380), p(360, 385)]],
      },
      { name: 'too-few-points', args: [[p(0, 0), p(1, 0), p(2, 0), p(3, 0), p(4, 0), p(5, 0)]] },
    ],
  },

  /* ---------------- 3D surgical planning geometry (Step 8a) ----------------
     Pure vector math from planning/SurgicalGeometry + level lookup from ScrewDefaults. Vec3 is
     [x,y,z] in patient space (mm, LPS). The volume-probing functions in PedicleLogic need a live
     Cornerstone volume and are deferred to Step 8b. */
  {
    tool: 'planning.mag',
    cases: [
      { name: 'unit-x', args: [v3(1, 0, 0)] },
      { name: '3-4-0', args: [v3(3, 4, 0)] },
      { name: '2-3-6', args: [v3(2, 3, 6)] }, // → 7
      { name: 'zero', args: [v3(0, 0, 0)] },
      { name: 'large', args: [v3(1e6, 0, 0)] },
    ],
  },
  {
    tool: 'planning.normalize',
    cases: [
      { name: '3-4-0', args: [v3(3, 4, 0)] },
      { name: 'y-axis', args: [v3(0, 5, 0)] },
      { name: 'zero-stays-zero', args: [v3(0, 0, 0)] },
      { name: 'negative-diagonal', args: [v3(-1, -1, -1)] },
    ],
  },
  {
    tool: 'planning.distToPlane',
    cases: [
      { name: 'above-z-plane', args: [v3(0, 0, 5), v3(0, 0, 0), v3(0, 0, 1)] }, // → 5
      { name: 'on-plane', args: [v3(3, 4, 0), v3(0, 0, 0), v3(0, 0, 1)] }, // → 0
      { name: 'oblique-point', args: [v3(1, 1, 1), v3(0, 0, 0), v3(0, 0, 1)] }, // → 1
    ],
  },
  {
    tool: 'planning.projectPointToPlane',
    cases: [
      { name: 'drop-to-z0', args: [v3(3, 4, 5), v3(0, 0, 0), v3(0, 0, 1)] }, // → [3,4,0]
      { name: 'already-on-plane', args: [v3(3, 4, 0), v3(0, 0, 0), v3(0, 0, 1)] },
    ],
  },
  {
    tool: 'planning.getScrewTip',
    cases: [
      { name: 'z-axis-40', args: [screw({ entry: v3(0, 0, 0), axis: v3(0, 0, 1), length: 40 })] },
      { name: 'anterior-45', args: [screw({ entry: v3(10, 10, 10), axis: v3(0, -1, 0), length: 45 })] },
    ],
  },
  {
    // intersectCylinderWithPlane(params, planePoint, planeNormal) → ellipse params | null
    tool: 'planning.intersectCylinderWithPlane',
    cases: [
      {
        name: 'oblique-hit',
        args: [screw({ axis: v3(SQ, 0, SQ), coreDiameter: 6, headDiameter: 8 }), v3(2, 0, 0), v3(1, 0, 0)],
      },
      {
        name: 'head-side-hit', // negative t, within head clip
        args: [screw({ axis: v3(SQ, 0, SQ), coreDiameter: 6, headDiameter: 8 }), v3(-1, 0, 0), v3(1, 0, 0)],
      },
      {
        name: 'far-miss', // |d0| > radius/sinTheta
        args: [screw({ axis: v3(SQ, 0, SQ), coreDiameter: 6, headDiameter: 8 }), v3(10, 0, 0), v3(1, 0, 0)],
      },
      {
        name: 'perpendicular-null', // axis ∥ normal → parallel branch returns null (preserved)
        args: [screw({ axis: v3(0, 0, 1), coreDiameter: 6, headDiameter: 8 }), v3(0, 0, 20), v3(0, 0, 1)],
      },
    ],
  },
  {
    tool: 'planning.vectorFromAngles',
    cases: [
      { name: 'zero-zero', args: [0, 0] }, // → [0,0,1]
      { name: 'pitch-90', args: [90, 0] }, // → [0,1,0]
      { name: 'yaw-90', args: [0, 90] }, // → [1,0,0]
      { name: 'pitch45-yaw45', args: [45, 45] },
      { name: 'neg-pitch-yaw', args: [-30, 60] },
    ],
  },
  {
    tool: 'planning.anglesFromVector',
    cases: [
      { name: 'z-axis', args: [v3(0, 0, 1)] }, // → pitch 0, yaw 0
      { name: 'y-axis', args: [v3(0, 1, 0)] }, // → pitch 90, yaw 0
      { name: 'x-axis', args: [v3(1, 0, 0)] }, // → pitch 0, yaw 90
      { name: 'oblique', args: [v3(0.5, 0.5, SQ)] },
    ],
  },
  {
    // getTransformedScrewTrajectory(position, direction, properties) → { entry, tip }
    tool: 'planning.getTransformedScrewTrajectory',
    cases: [
      { name: 'baseline-no-depth', args: [v3(0, 0, 0), v3(0, -1, 0), { length: 40 }] },
      { name: 'with-depth', args: [v3(0, 0, 0), v3(0, -1, 0), { length: 40, depth: 10 }] },
      { name: 'caudal-rotation', args: [v3(0, 0, 0), v3(0, -1, 0), { length: 40, caudalAngle: 30 }] },
      { name: 'medial-rotation', args: [v3(5, 5, 5), v3(0, -1, 0), { length: 45, medialAngle: 20, depth: 5 }] },
      { name: 'combined', args: [v3(10, 0, -3), v3(0, -1, 0), { length: 50, caudalAngle: 15, medialAngle: -10, depth: 8 }] },
    ],
  },
  {
    tool: 'screwDefaults.getLevelDefaults',
    cases: [
      { name: 'cervical-C2', args: ['C2'] },
      { name: 'upper-thoracic-T3', args: ['T3'] },
      { name: 'lower-thoracic-T9', args: ['T9'] },
      { name: 'lumbar-L4', args: ['L4'] },
      { name: 'sacral-S1', args: ['S1'] },
      { name: 'unknown-fallback', args: ['ZZ9'] },
    ],
  },
  /* ---------------- Segmentation mask processing (Step 8b, maskUtils) ----------------
     filterIslands/smoothMask are pure typed-array algorithms with zero imports, so they parity-lock
     cleanly here in the node golden suite. The DICOM intensity transforms and PedicleLogic live in
     modules that import dicom-parser / @cornerstonejs/core, so they are parity-proven in dedicated
     jsdom tests instead (src/features/dicom/dicomTransforms.test.ts,
     src/features/measurements/planning/PedicleLogic.probe.test.ts).
     filterIslands mutates in place → the oracle/parity wrappers clone the input, run, and return the
     mutated array (see the adapter in oracle.gen.test.ts / golden.parity.test.ts). data is a flat
     number[] in [x + y*nx + z*nx*ny] order; dims = [nx, ny, nz]. */
  {
    tool: 'maskUtils.filterIslands',
    cases: [
      {
        // 4×4×1: a 2×2 block (idx 0,1,4,5) + an isolated voxel (idx 15) → only the block survives.
        name: 'drop-isolated',
        args: [
          [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
          [4, 4, 1],
          { keepSingleLargest: true },
        ],
      },
      {
        // 3×3×1 fully filled → single component, unchanged.
        name: 'single-component',
        args: [[1, 1, 1, 1, 1, 1, 1, 1, 1], [3, 3, 1], { keepSingleLargest: true }],
      },
      {
        // minPixelCount mode: keep components ≥3 → 2×2 block kept, 2-voxel pair dropped.
        name: 'min-pixel-count',
        args: [
          [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
          [4, 4, 1],
          { keepSingleLargest: false, minPixelCount: 3 },
        ],
      },
      { name: 'all-empty', args: [[0, 0, 0, 0], [2, 2, 1], { keepSingleLargest: true }] },
    ],
  },
  {
    tool: 'maskUtils.smoothMask',
    cases: [
      { name: 'center-voxel-1pass', args: [[0, 0, 0, 0, 1, 0, 0, 0, 0], [3, 3, 1], 1] },
      { name: 'corner-2x2x2-2pass', args: [[1, 0, 0, 0, 0, 0, 0, 0], [2, 2, 2], 2] },
    ],
  },
];
