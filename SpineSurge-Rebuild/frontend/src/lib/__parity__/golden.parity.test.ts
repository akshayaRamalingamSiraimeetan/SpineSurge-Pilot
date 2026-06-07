/* Step 7b parity proof — the new==old lock.
 *
 * The oracle (test/golden/oracle.gen.test.ts) ran the SAME input-vector catalog through the OLD
 * repo's validated modules and committed the results as fixtures/*.golden.json. This test runs the
 * identical catalog through the PORTED modules (imported via `@` → new src/, per vitest.config.ts)
 * and asserts they reproduce those fixtures within tol 1e-9. A moved value fails here unless a
 * matching entry lands in test/divergences.md (LOGIC_PORT_PLAN §4).
 *
 * It reuses test/golden/vectors.ts (data-only) and test/golden/helper.ts verbatim, so the only thing
 * that can differ between this and the oracle is the implementation under test. Fixtures are NEVER
 * written here — this file only reads + asserts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import { catalog } from '../../../test/golden/vectors';
import { deepCloseTo, parseGolden } from '../../../test/golden/helper';

import * as Geo from '@/lib/canvas/GeometryUtils';
import { calculateCobbAngle } from '@/features/measurements/quick/CobbAngle';
import { calculatePILL } from '@/features/measurements/quick/PI_LL';
import { calculateSVA } from '@/features/measurements/quick/SVA';
import { calculatePelvicParameters } from '@/features/measurements/quick/PelvicParams';
import { calculateSpinalCurvature } from '@/features/measurements/quick/SpinalCurvatures';
import { calculateVBM } from '@/features/measurements/quick/VBM';
import { calculateStenosisArea } from '@/features/measurements/pathology/Stenosis';
import { calculateSpondylolisthesis } from '@/features/measurements/pathology/Spondylolisthesis';
import { calculatePO, calculateTS } from '@/features/measurements/deformity/tools/CoronalTools';
import { calculateRVAD, calculateCBVA } from '@/features/measurements/deformity/tools/VertebralTools';
import { calculateSSA, calculateSPi } from '@/features/measurements/deformity/tools/SpinopelvicTools';
import { calculateTPA, calculateSPA } from '@/features/measurements/deformity/tools/PelvicTools';
import * as SurgGeo from '@/features/measurements/planning/SurgicalGeometry';
import { getLevelDefaults } from '@/features/measurements/planning/ScrewDefaults';
import * as Mask from '@/features/dicom/maskUtils';

type Calc = (...args: readonly unknown[]) => unknown;
type Dims = [number, number, number];

/* filterIslands mutates its input; clone → run → return the mutated array as the comparable result. */
const maskFilterIslands: Calc = (...a) => {
  const [data, dims, opts] = a as [number[], Dims, Mask.IslandFilterOptions];
  const arr = Uint8Array.from(data);
  Mask.filterIslands(arr, dims, opts);
  return Array.from(arr);
};
const maskSmoothMask: Calc = (...a) => {
  const [data, dims, passes] = a as [number[], Dims, number];
  return Array.from(Mask.smoothMask(Uint8Array.from(data), dims, passes));
};

/** Catalog tool key → the PORTED function under test (mirror of the oracle map). */
const ported: Record<string, Calc> = {
  'geometry.calculateAngle': Geo.calculateAngle as Calc,
  'geometry.getDistance': Geo.getDistance as Calc,
  'geometry.getMidpoint': Geo.getMidpoint as Calc,
  'geometry.getHipAxisCenter': Geo.getHipAxisCenter as Calc,
  'geometry.getLineLinesIntersection': Geo.getLineLinesIntersection as Calc,
  'geometry.getPolygonCenter': Geo.getPolygonCenter as Calc,
  'geometry.getPolylineLength': Geo.getPolylineLength as Calc,
  'geometry.getPolygonArea': Geo.getPolygonArea as Calc,
  'geometry.getPolygonPerimeter': Geo.getPolygonPerimeter as Calc,
  'geometry.extrapolateLine': Geo.extrapolateLine as Calc,
  'geometry.isPointInPolygon': Geo.isPointInPolygon as Calc,
  'geometry.splitPolygonByLine': Geo.splitPolygonByLine as Calc,
  cobb: calculateCobbAngle as Calc,
  spinalCurvature: calculateSpinalCurvature as Calc,
  sva: calculateSVA as Calc,
  pelvic: calculatePelvicParameters as Calc,
  pill: calculatePILL as Calc,
  vbm: calculateVBM as Calc,
  stenosis: calculateStenosisArea as Calc,
  spondylolisthesis: calculateSpondylolisthesis as Calc,
  'deformity.po': calculatePO as Calc,
  'deformity.ts': calculateTS as Calc,
  'deformity.ssa': calculateSSA as Calc,
  'deformity.spi': calculateSPi as Calc,
  'deformity.cbva': calculateCBVA as Calc,
  'deformity.rvad': calculateRVAD as Calc,
  'deformity.tpa': calculateTPA as Calc,
  'deformity.spa': calculateSPA as Calc,
  'planning.mag': SurgGeo.mag as Calc,
  'planning.normalize': SurgGeo.normalize as Calc,
  'planning.distToPlane': SurgGeo.distToPlane as Calc,
  'planning.projectPointToPlane': SurgGeo.projectPointToPlane as Calc,
  'planning.getScrewTip': SurgGeo.getScrewTip as Calc,
  'planning.intersectCylinderWithPlane': SurgGeo.intersectCylinderWithPlane as Calc,
  'planning.vectorFromAngles': SurgGeo.vectorFromAngles as Calc,
  'planning.anglesFromVector': SurgGeo.anglesFromVector as Calc,
  'planning.getTransformedScrewTrajectory': SurgGeo.getTransformedScrewTrajectory as Calc,
  'screwDefaults.getLevelDefaults': getLevelDefaults as Calc,
  'maskUtils.filterIslands': maskFilterIslands,
  'maskUtils.smoothMask': maskSmoothMask,
};

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../../test/golden/fixtures');

for (const tool of catalog) {
  describe(`parity · ${tool.tool}`, () => {
    const fn = ported[tool.tool];
    if (!fn) throw new Error(`No ported function registered for tool "${tool.tool}"`);

    const golden = parseGolden(
      readFileSync(join(FIXTURES, `${tool.tool}.golden.json`), 'utf8'),
    ) as Record<string, unknown>;

    for (const c of tool.cases) {
      it(c.name, () => deepCloseTo(fn(...c.args), golden[c.name]));
    }
  });
}
