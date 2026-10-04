import { getDistance, getPolygonArea, getPolygonPerimeter, lineAngleDeg, type Point } from "@/lib/canvas/GeometryUtils";
import { calculateCobbAngle } from "./quick/CobbAngle";
import { calculateVBM, type VBMMode } from "./quick/VBM";
import { calculateSpinalCurvature } from "./quick/SpinalCurvatures";
import { calculatePelvicParameters } from "./quick/PelvicParams";
import { calculatePILL } from "./quick/PI_LL";
import { calculateSpondylolisthesis, formatSpondylolisthesisResult } from "./pathology/Spondylolisthesis";
import { calculateStenosisArea } from "./pathology/Stenosis";
import {
    calculatePO, calculateTS, calculateAVT, calculateSlope, calculateCMC,
    calculateTPA, calculateSPA, calculateSSA, calculateSPi, calculateCBVA, calculateRVAD, calculateITilt
} from "./deformity/DeformityTools";
import { calculateOpenOsteotomyPrimitives, calculateResectionPrimitives } from "./planning/PlanningTools";

const deg = (v: number) => `${v.toFixed(1)}°`;
const angle3 = (p: Point[]) => {
    const a1 = Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x);
    const a2 = Math.atan2(p[2].y - p[1].y, p[2].x - p[1].x);
    let d = Math.abs(a1 - a2) * (180 / Math.PI);
    if (d > 180) d = 360 - d;
    return d;
};
const closingWedge = (p: Point[]) => {
    const [a, h, c] = p;
    const mov = Math.atan2(a.y - h.y, a.x - h.x);
    const fix = Math.atan2(c.y - h.y, c.x - h.x);
    return ((fix - mov + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
};

/**
 * Result text for a measurement from its points (pixel units; the panel and
 * canvas convert px → mm when calibrated). Used when a measurement is created,
 * auto-completed from landmarks, or edited by dragging. Returns undefined when
 * the tool has no point-derived result (keep the previous one).
 */
export function computeMeasurementResult(
    toolKey: string,
    pts: Point[],
    prev?: { result?: unknown; measurement?: { vbmMode?: VBMMode; tiltMode?: string } },
): string | undefined {
    const n = pts.length;
    switch (toolKey) {
        case 'cobb':
            return n >= 4 ? `Cobb: ${deg(calculateCobbAngle(pts).angle)}` : undefined;
        case 'angle-4pt':
            return n >= 4 ? `4 pt angle: ${deg(lineAngleDeg(pts[0], pts[1], pts[2], pts[3]))}` : undefined;
        case 'cl': case 'tk': case 'll': case 'sc':
            return n >= 4 ? `${toolKey === 'sc' ? 'Angle' : toolKey.toUpperCase()}: ${deg(calculateSpinalCurvature(pts).angle)}` : undefined;
        case 'angle-2pt': {
            if (n < 2) return undefined;
            const a = Math.atan2(Math.abs(pts[1].y - pts[0].y), Math.abs(pts[1].x - pts[0].x)) * (180 / Math.PI);
            return `2 pt angle: ${deg(a)}`;
        }
        case 'angle-3pt':
            return n >= 3 ? `3 pt angle: ${deg(angle3(pts))}` : undefined;
        case 'sva':
            return n >= 2 ? `SVA: ${Math.abs(pts[0].x - pts[1].x).toFixed(1)} px` : undefined;
        case 'line':
            return n >= 2 ? `distance: ${getDistance(pts[0], pts[1]).toFixed(1)} px` : undefined;
        case 'vbm':
            return n >= 4 ? calculateVBM(pts, prev?.measurement?.vbmMode || 'lateral', null) || '' : undefined;
        case 'pelvis': {
            const p = n >= 6 ? calculatePelvicParameters(pts) : null;
            return p ? `PI: ${deg(p.pi)}\nPT: ${deg(p.pt)}\nSS: ${deg(p.ss)}` : undefined;
        }
        case 'pi_ll': {
            const p = n >= 8 ? calculatePILL(pts) : null;
            return p ? `PI: ${deg(p.pi)}\nLL: ${deg(p.ll)}\nPI - LL: ${deg(p.mismatch)}` : undefined;
        }
        case 'spondy': {
            const r = n >= 4 ? calculateSpondylolisthesis(pts, null) : null;
            return r ? formatSpondylolisthesisResult(r, null) : undefined;
        }
        case 'stenosis': {
            const c = n >= 3 ? calculateStenosisArea(pts, null) : null;
            return c ? `Area: ${c.resultString}` : undefined;
        }
        case 'po': { const d = n >= 2 ? calculatePO(pts) : null; return d ? `PO: ${deg(d.angle)}` : undefined; }
        case 'slope': { const d = n >= 2 ? calculateSlope(pts) : null; return d ? `Slope: ${deg(d.angle)}` : undefined; }
        case 'itilt': {
            const d = n >= 2 ? calculateITilt(pts) : null;
            if (!d) return undefined;
            const mode = prev?.measurement?.tiltMode;
            const prevText = String(prev?.result ?? '');
            const prefix = mode === 'UIV' || (!mode && prevText.includes('UIV')) ? 'UIV Tilt'
                : mode === 'LIV' || (!mode && prevText.includes('LIV')) ? 'LIV Tilt' : 'Tilt';
            return `${prefix}: ${deg(d.angle)}`;
        }
        case 'csvl': return n >= 2 ? 'CSVL is displayed' : undefined;
        case 'c7pl': return n >= 1 ? 'C7PL is displayed' : undefined;
        case 'ts': return n >= 3 ? calculateTS(pts, null)?.resultString : undefined;
        case 'avt': return n >= 3 ? calculateAVT(pts, null)?.resultString : undefined;
        case 'cmc': {
            const a = n >= 4 ? calculateCMC(pts) : null;
            return a ? a.map((v: number, i: number) => `Cobb ${i + 1}: ${deg(v)}`).join('\n') : undefined;
        }
        case 'tpa': { const d = n >= 7 ? calculateTPA(pts) : null; return d ? `TPA: ${deg(d.angle)}` : undefined; }
        case 'spa': { const d = n >= 7 ? calculateSPA(pts) : null; return d ? `SPA: ${deg(d.angle)}` : undefined; }
        case 'ssa': { const d = n >= 3 ? calculateSSA(pts) : null; return d ? `SSA: ${deg(d.angle)}` : undefined; }
        case 't1spi': case 't9spi': case 'odha': {
            const d = n >= 5 ? calculateSPi(pts) : null;
            const prefix = toolKey === 't1spi' ? 'T1SPi' : toolKey === 't9spi' ? 'T9SPi' : 'ODHA';
            return d ? `${prefix}: ${deg(Math.abs(d.angle))}` : undefined;
        }
        case 'cbva': { const d = n >= 2 ? calculateCBVA(pts) : null; return d ? `CBVA: ${deg(d.angle)}` : undefined; }
        case 'rvad': {
            const d = n >= 6 ? calculateRVAD(pts) : null;
            return d ? `Rib Angle R: ${deg(d.rvaR)}\nRib Angle L: ${deg(d.rvaL)}\nRVAD: ${deg(d.rvad)}` : undefined;
        }
        case 'pencil': {
            if (n < 2) return undefined;
            let len = 0;
            for (let i = 0; i < n - 1; i++) len += getDistance(pts[i], pts[i + 1]);
            return `Length: ${len.toFixed(1)} px`;
        }
        case 'circle': {
            if (n < 2) return undefined;
            const r = getDistance(pts[0], pts[1]) / 2;
            return `Area: ${(Math.PI * r * r).toFixed(1)} px²\nPerimeter: ${(2 * Math.PI * r).toFixed(1)} px\nDiameter: ${(r * 2).toFixed(1)} px`;
        }
        case 'ellipse': {
            if (n < 2) return undefined;
            const rx = Math.abs(pts[0].x - pts[1].x) / 2, ry = Math.abs(pts[0].y - pts[1].y) / 2;
            const h = Math.pow(rx - ry, 2) / Math.pow(rx + ry || 1, 2);
            const per = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
            return `Area: ${(Math.PI * rx * ry).toFixed(1)} px²\nPerimeter: ${per.toFixed(1)} px`;
        }
        case 'polygon':
            return n >= 3 ? `Area: ${getPolygonArea(pts).toFixed(1)} px²\nPerimeter: ${getPolygonPerimeter(pts).toFixed(1)} px` : undefined;
        case 'ost-pso': case 'ost-spo':
            return n >= 3 ? `Correction: ${deg(Math.abs(closingWedge(pts) * 180 / Math.PI))}` : undefined;
        case 'ost-open': {
            // keeps the stored "Opening" in step after point drags (UI11-34)
            if (n < 6) return undefined;
            return `Opening: ${deg(Math.abs(calculateOpenOsteotomyPrimitives(pts).phi * 180 / Math.PI))}`;
        }
        case 'ost-resect': {
            const r = n >= 4 ? calculateResectionPrimitives(pts) : null;
            return r ? `Resection: ${deg(Math.abs(r.rotationAngleRad * 180 / Math.PI))}` : undefined;
        }
        default:
            return undefined;
    }
}
