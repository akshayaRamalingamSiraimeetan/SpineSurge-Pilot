/* Tool registry — the bridge from a workspace tool to its parity-locked calculator (Step 7 UI wiring).
 *
 * This is the "tools output measurements → state → panels render" spine: each entry declares how many
 * points the tool needs and how to turn those points (+ the current calibration) into the display
 * rows shown in the right panel. The calculators here are the SAME parity-locked functions proven in
 * `src/lib/__parity__/golden.parity.test.ts`; this module only formats their numeric output for
 * presentation (angles in degrees; lengths through the numeric calibration model). No clinical math
 * lives here — it delegates entirely. */
import type { Point } from '@/lib/canvas/GeometryUtils';
import { type Calibration, formatQuantity } from './calibration';
import { calculateCobbAngle } from './quick/CobbAngle';
import { calculateSVA } from './quick/SVA';
import { calculatePILL } from './quick/PI_LL';
import { calculatePelvicParameters } from './quick/PelvicParams';
import { calculateSpinalCurvature } from './quick/SpinalCurvatures';
import { calculateVBM } from './quick/VBM';
import { calculateStenosisArea } from './pathology/Stenosis';
import { calculateSpondylolisthesis } from './pathology/Spondylolisthesis';
import { calculatePO, calculateTS, calculateAVT } from './deformity/tools/CoronalTools';
import { calculateRVAD, calculateCBVA } from './deformity/tools/VertebralTools';
import { calculateSSA, calculateSPi } from './deformity/tools/SpinopelvicTools';
import { calculateTPA, calculateSPA } from './deformity/tools/PelvicTools';

/** One line in the right-panel measurement list. */
export interface ComputedRow {
  label: string;
  display: string;
}

/** Numeric quantity stored as the persisted `result` (value + unit, never a display string).
 *  `unit` is an open string: angle 'deg', length 'px'/'mm', area 'px²', percentage '%', etc. */
export interface ResultQuantity {
  value: number;
  unit: string;
}

export interface ToolSpec {
  /** Tool abbreviation — matches the `abbr` in the Assessment tool catalog (workspace/data.ts). */
  abbr: string;
  name: string;
  /** Points the user must place before the measurement computes (minimum, for variable tools). */
  pointsNeeded: number;
  /** Variable-vertex tool (e.g. a polygon): collect ≥pointsNeeded, commit on an explicit finish. */
  variable?: boolean;
  /** Short instruction shown while placing points. */
  hint: string;
  compute: (points: Point[], calibration: Calibration) => ComputedRow[];
  /** Structured numeric output for persistence (backend `result` jsonb — value+unit, not a string).
   *  Calibration-invariant: lengths are stored in raw pixels; calibration is applied at render. */
  raw: (points: Point[]) => Record<string, ResultQuantity>;
}

const deg = (value: number): string => formatQuantity({ value, dimension: 'angle' }, undefined, 1);
const len = (value: number, cal: Calibration): string =>
  formatQuantity({ value, dimension: 'length' }, cal, 1);

/** Tools wired to a parity-locked calculator. Keyed by tool abbreviation. */
export const TOOL_SPECS: Record<string, ToolSpec> = {
  Cobb: {
    abbr: 'Cobb',
    name: 'Cobb Angle',
    pointsNeeded: 4,
    hint: 'Place 4 points: two on the upper endplate, two on the lower endplate.',
    compute: (p) => [{ label: 'Cobb Angle', display: deg(calculateCobbAngle(p).angle) }],
    raw: (p) => ({ angle: { value: calculateCobbAngle(p).angle, unit: 'deg' } }),
  },
  SVA: {
    abbr: 'SVA',
    name: 'Sagittal Vertical Axis',
    pointsNeeded: 2,
    hint: 'Place 2 points: C7 plumb origin, then the posterior-superior corner of S1.',
    compute: (p, cal) => [{ label: 'SVA', display: len(calculateSVA(p).distance, cal) }],
    raw: (p) => ({ sva: { value: calculateSVA(p).distance, unit: 'px' } }),
  },
  'PI-LL': {
    abbr: 'PI-LL',
    name: 'Pelvic Incidence – Lumbar Lordosis',
    pointsNeeded: 8,
    hint: 'Place 8 points: 2 per femoral head, 2 on the S1 endplate, 2 on the L1 endplate.',
    compute: (p) => {
      const r = calculatePILL(p);
      if (!r) return [{ label: 'PI – LL', display: '—' }];
      return [
        { label: 'Pelvic Incidence (PI)', display: deg(r.pi) },
        { label: 'Lumbar Lordosis (LL)', display: deg(r.ll) },
        { label: 'PI – LL Mismatch', display: deg(r.mismatch) },
      ];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculatePILL(p);
      if (!r) return {};
      return {
        pi: { value: r.pi, unit: 'deg' },
        ll: { value: r.ll, unit: 'deg' },
        mismatch: { value: r.mismatch, unit: 'deg' },
      };
    },
  },
  Pelvis: {
    abbr: 'Pelvis',
    name: 'Pelvic Parameters',
    pointsNeeded: 6,
    hint: 'Place 6 points: 2 per femoral head, then 2 on the S1 endplate.',
    compute: (p) => {
      const r = calculatePelvicParameters(p);
      if (!r) return [{ label: 'Pelvic Parameters', display: '—' }];
      return [
        { label: 'Pelvic Incidence (PI)', display: deg(r.pi) },
        { label: 'Pelvic Tilt (PT)', display: deg(r.pt) },
        { label: 'Sacral Slope (SS)', display: deg(r.ss) },
      ];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculatePelvicParameters(p);
      if (!r) return {};
      return {
        pi: { value: r.pi, unit: 'deg' },
        pt: { value: r.pt, unit: 'deg' },
        ss: { value: r.ss, unit: 'deg' },
      };
    },
  },
  // Regional sagittal Cobb angles — same 4-point Cobb computation on different vertebral levels.
  TK: {
    abbr: 'TK',
    name: 'Thoracic Kyphosis',
    pointsNeeded: 4,
    hint: 'Place 4 points: T4 superior endplate (2) and T12 inferior endplate (2).',
    compute: (p) => [{ label: 'Thoracic Kyphosis (TK)', display: deg(calculateCobbAngle(p).angle) }],
    raw: (p) => ({ angle: { value: calculateCobbAngle(p).angle, unit: 'deg' } }),
  },
  LL: {
    abbr: 'LL',
    name: 'Lumbar Lordosis',
    pointsNeeded: 4,
    hint: 'Place 4 points: L1 superior endplate (2) and S1 superior endplate (2).',
    compute: (p) => [{ label: 'Lumbar Lordosis (LL)', display: deg(calculateCobbAngle(p).angle) }],
    raw: (p) => ({ angle: { value: calculateCobbAngle(p).angle, unit: 'deg' } }),
  },
  CL: {
    abbr: 'CL',
    name: 'Cervical Lordosis',
    pointsNeeded: 4,
    hint: 'Place 4 points: C2 inferior endplate (2) and C7 inferior endplate (2).',
    compute: (p) => [{ label: 'Cervical Lordosis (CL)', display: deg(calculateCobbAngle(p).angle) }],
    raw: (p) => ({ angle: { value: calculateCobbAngle(p).angle, unit: 'deg' } }),
  },
  CMC: {
    abbr: 'CMC',
    name: 'Cobb Multi-Curve',
    pointsNeeded: 4,
    hint: 'Place 4 points across the two end vertebrae of the curve.',
    compute: (p) => [{ label: 'Cobb Multi-Curve (CMC)', display: deg(calculateSpinalCurvature(p).angle) }],
    raw: (p) => ({ angle: { value: calculateSpinalCurvature(p).angle, unit: 'deg' } }),
  },
  VBM: {
    abbr: 'VBM',
    name: 'Vertebral Body Metrics',
    pointsNeeded: 4,
    hint: 'Place 4 corners: superior-posterior, superior-anterior, inferior-anterior, inferior-posterior.',
    compute: (p, cal) => {
      const text = calculateVBM(p, 'lateral', cal.pixelToMm);
      if (!text) return [{ label: 'VBM', display: '—' }];
      return text.split('\n').map((line) => {
        const [label, value] = line.split(':');
        return { label: label.trim(), display: (value ?? '').trim() };
      });
    },
    // VBM is a composite string tool; its rows re-derive from the points on load, so no scalar raw.
    raw: () => ({}),
  },
  Spondylolisthesis: {
    abbr: 'Spondylolisthesis',
    name: 'Spondylolisthesis',
    pointsNeeded: 4,
    hint: 'Place 4 points: posterior wall of the upper vertebra (2), then the lower vertebra (2).',
    compute: (p, cal) => {
      const r = calculateSpondylolisthesis(p, cal.pixelToMm);
      if (!r) return [{ label: 'Spondylolisthesis', display: '—' }];
      return [
        { label: 'Slip Distance', display: len(r.slipDistance, cal) },
        { label: 'Slip Percentage', display: `${r.slipPercentage.toFixed(1)}%` },
        { label: 'Slip Angle', display: deg(r.slipAngle) },
        { label: 'Meyerding Grade', display: r.grade },
      ];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateSpondylolisthesis(p, null);
      if (!r) return {};
      return {
        slipDistance: { value: r.slipDistance, unit: 'px' },
        slipPercentage: { value: r.slipPercentage, unit: '%' },
        slipAngle: { value: r.slipAngle, unit: 'deg' },
      };
    },
  },
  /* ---------------- Deformity — coronal ---------------- */
  TS: {
    abbr: 'TS',
    name: 'Trunk Shift',
    pointsNeeded: 3,
    hint: 'Place 3 points: C7 centroid, then the two corners of the S1 endplate.',
    compute: (p, cal) => {
      const r = calculateTS(p, cal.pixelToMm);
      return [{ label: 'Trunk Shift (TS)', display: r ? len(r.dx, cal) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateTS(p, null);
      return r ? { ts: { value: r.dx, unit: 'px' } } : {};
    },
  },
  AVT: {
    abbr: 'AVT',
    name: 'Apical Vertebral Translation',
    pointsNeeded: 3,
    hint: 'Place 3 points: apical vertebra centroid, then the two corners of the S1 endplate.',
    compute: (p, cal) => {
      const r = calculateAVT(p, cal.pixelToMm);
      return [{ label: 'Apical Vertebral Translation (AVT)', display: r ? len(r.dx, cal) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateAVT(p, null);
      return r ? { avt: { value: r.dx, unit: 'px' } } : {};
    },
  },
  PO: {
    abbr: 'PO',
    name: 'Pelvic Obliquity',
    pointsNeeded: 2,
    hint: 'Place 2 points: the left and right iliac crest references.',
    compute: (p) => {
      const r = calculatePO(p);
      return [{ label: 'Pelvic Obliquity (PO)', display: r ? deg(r.angle) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculatePO(p);
      return r ? { angle: { value: r.angle, unit: 'deg' } } : {};
    },
  },
  RVAD: {
    abbr: 'RVAD',
    name: 'Rib Vertebral Angle Difference',
    pointsNeeded: 6,
    hint: 'Place 6 points: right rib (2), left rib (2), apical vertebra endplate (2).',
    compute: (p) => {
      const r = calculateRVAD(p);
      if (!r) return [{ label: 'RVAD', display: '—' }];
      return [
        { label: 'Rib Angle (Right)', display: deg(r.rvaR) },
        { label: 'Rib Angle (Left)', display: deg(r.rvaL) },
        { label: 'RVAD', display: deg(r.rvad) },
      ];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateRVAD(p);
      if (!r) return {};
      return {
        rvad: { value: r.rvad, unit: 'deg' },
        rvaR: { value: r.rvaR, unit: 'deg' },
        rvaL: { value: r.rvaL, unit: 'deg' },
      };
    },
  },
  /* ---------------- Deformity — sagittal ---------------- */
  TPA: {
    abbr: 'TPA',
    name: 'T1 Pelvic Angle',
    pointsNeeded: 7,
    hint: 'Place 7 points: 2 per femoral head, T1 centroid, then 2 on the S1 endplate.',
    compute: (p) => {
      const r = calculateTPA(p);
      return [{ label: 'T1 Pelvic Angle (TPA)', display: r ? deg(r.angle) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateTPA(p);
      return r ? { angle: { value: r.angle, unit: 'deg' } } : {};
    },
  },
  SSA: {
    abbr: 'SSA',
    name: 'Spinosacral Angle',
    pointsNeeded: 3,
    hint: 'Place 3 points: C7 centroid, then the posterior and anterior corners of the S1 endplate.',
    compute: (p) => {
      const r = calculateSSA(p);
      return [{ label: 'Spinosacral Angle (SSA)', display: r ? deg(r.angle) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateSSA(p);
      return r ? { angle: { value: r.angle, unit: 'deg' } } : {};
    },
  },
  SPA: {
    abbr: 'SPA',
    name: 'Spinopelvic Angle',
    pointsNeeded: 7,
    hint: 'Place 7 points: 2 per femoral head, C7 centroid, then 2 on the S1 endplate.',
    compute: (p) => {
      const r = calculateSPA(p);
      return [{ label: 'Spinopelvic Angle (SPA)', display: r ? deg(r.angle) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateSPA(p);
      return r ? { angle: { value: r.angle, unit: 'deg' } } : {};
    },
  },
  T1SPi: {
    abbr: 'T1SPi',
    name: 'T1 Spinopelvic Inclination',
    pointsNeeded: 5,
    hint: 'Place 5 points: 2 per femoral head, then the T1 centroid.',
    compute: (p) => {
      const r = calculateSPi(p);
      return [{ label: 'T1 Spinopelvic Inclination (T1SPi)', display: r ? deg(Math.abs(r.angle)) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateSPi(p);
      return r ? { angle: { value: Math.abs(r.angle), unit: 'deg' } } : {};
    },
  },
  T9SPi: {
    abbr: 'T9SPi',
    name: 'T9 Spinopelvic Inclination',
    pointsNeeded: 5,
    hint: 'Place 5 points: 2 per femoral head, then the T9 centroid.',
    compute: (p) => {
      const r = calculateSPi(p);
      return [{ label: 'T9 Spinopelvic Inclination (T9SPi)', display: r ? deg(Math.abs(r.angle)) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateSPi(p);
      return r ? { angle: { value: Math.abs(r.angle), unit: 'deg' } } : {};
    },
  },
  ODHA: {
    abbr: 'ODHA',
    name: 'Odontoid Hip Axis Angle',
    pointsNeeded: 5,
    hint: 'Place 5 points: 2 per femoral head, then the odontoid (dens) tip.',
    compute: (p) => {
      const r = calculateSPi(p);
      return [{ label: 'Odontoid Hip Axis Angle (ODHA)', display: r ? deg(Math.abs(r.angle)) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateSPi(p);
      return r ? { angle: { value: Math.abs(r.angle), unit: 'deg' } } : {};
    },
  },
  CBVA: {
    abbr: 'CBVA',
    name: 'Chin-Brow Vertical Angle',
    pointsNeeded: 2,
    hint: 'Place 2 points: the chin, then the brow.',
    compute: (p) => {
      const r = calculateCBVA(p);
      return [{ label: 'Chin-Brow Vertical Angle (CBVA)', display: r ? deg(r.angle) : '—' }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateCBVA(p);
      return r ? { angle: { value: r.angle, unit: 'deg' } } : {};
    },
  },
  'Canal Area': {
    abbr: 'Canal Area',
    name: 'Spinal Canal Area',
    pointsNeeded: 3,
    variable: true,
    hint: 'Trace the canal: click to add vertices, double-click to close the polygon.',
    compute: (p, cal) => {
      const r = calculateStenosisArea(p, cal.pixelToMm);
      if (!r) return [{ label: 'Canal Area', display: '—' }];
      return [{ label: 'Canal Area', display: r.resultString }];
    },
    raw: (p): Record<string, ResultQuantity> => {
      const r = calculateStenosisArea(p, null);
      return r ? { area: { value: r.area, unit: 'px²' } } : {};
    },
  },
};

/** True when a tool abbreviation is wired to a calculator. */
export function isWiredTool(abbr: string | null | undefined): abbr is string {
  return !!abbr && abbr in TOOL_SPECS;
}
