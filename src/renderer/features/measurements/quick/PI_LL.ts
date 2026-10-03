import { Point, getMidpoint } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawLabel, drawPoints, strokeLine, toolColor } from "@/lib/canvas/annotationStyle";
import { drawFemoralHeads } from "../deformity/tools/BaseTools";
import { calculatePelvicParameters, drawSacralGeometry } from "./PelvicParams";
import { calculateCobbAngle } from "./CobbAngle";

export function calculatePILL(points: Point[]) {
    // We need 8 points:
    // 0-1: FH1
    // 2-3: FH2
    // 4-5: S1
    // 6-7: L1
    if (points.length < 8) return null;

    // 1. Calculate PI
    // We pass the first 6 points to pelvic calcs
    const pelvicPoints = points.slice(0, 6);
    const pelvicData = calculatePelvicParameters(pelvicPoints);
    if (!pelvicData) return null;

    const { pi } = pelvicData;

    // 2. Calculate LL (Cobb Angle between L1 and S1)
    // L1 is points 6-7. S1 is points 4-5.
    // Cobb calculator expects [p1, p2, p3, p4] for two lines.
    const cobbPoints = [points[6], points[7], points[4], points[5]];
    const cobbData = calculateCobbAngle(cobbPoints);

    const ll = cobbData.angle;
    const mismatch = pi - ll;

    return {
        pi,
        ll,
        mismatch,
        pelvicData,
        cobbData
    };
}

export function drawPILL(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    const points = m.points;
    if (points.length < 2) return;
    const color = toolColor(m.toolKey);

    drawFemoralHeads(ctx, points, k, color);
    if (points.length >= 6) drawSacralGeometry(ctx, points.slice(0, 6), k, color);
    if (points.length >= 8) strokeLine(ctx, points[6], points[7], k, color);

    const data = calculatePILL(points);
    if (data?.cobbData.intersection) {
        const x = data.cobbData.intersection;
        strokeLine(ctx, getMidpoint(points[4], points[5]), x, k, color, true);
        strokeLine(ctx, getMidpoint(points[6], points[7]), x, k, color, true);
    }
    drawPoints(ctx, points, k, color);
    if (!data) return;

    const levelPrefix = m.measurement?.level ? `${m.measurement.level}
---
` : '';
    m.result = `PI: ${data.pi.toFixed(1)}°
LL: ${data.ll.toFixed(1)}°
PI-LL: ${data.mismatch.toFixed(1)}°`;
    const s1 = data.pelvicData.s1_center;
    const labelPos = m.measurement?.labelPos || { x: s1.x + 80 / k, y: s1.y - 50 / k };
    drawLabel(ctx, levelPrefix + m.result, labelPos, k, color);
}
