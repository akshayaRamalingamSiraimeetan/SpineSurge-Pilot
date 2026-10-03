import { Point, getMidpoint } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawArc, drawLabel, drawPoints, strokeLine, toolColor } from "@/lib/canvas/annotationStyle";
import { getHipAxisCenter, drawFemoralHeads } from "./BaseTools";

export function calculateSSA(points: Point[]) {
    if (points.length < 3) return null;
    const c7 = points[0];
    const s1p = points[1];
    const s1a = points[2];
    const s1Mid = getMidpoint(s1p, s1a);

    const a1 = Math.atan2(c7.y - s1Mid.y, c7.x - s1Mid.x);
    const a2 = Math.atan2(s1a.y - s1Mid.y, s1a.x - s1Mid.x);
    let diff = Math.abs(a1 - a2) * (180 / Math.PI);
    if (diff > 180) diff = 360 - diff;
    return { angle: diff, s1Mid, c7, s1a, a1, a2 };
}

export function drawSSA(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    const data = calculateSSA(m.points);
    if (!data) return;
    const color = toolColor(m.toolKey);
    const { angle, s1Mid, c7, s1a, a1, a2 } = data;
    strokeLine(ctx, m.points[1], m.points[2], k, color);
    strokeLine(ctx, s1Mid, c7, k, color);
    drawArc(ctx, s1Mid, 50 / k, a1, a2, k, color);
    drawPoints(ctx, [c7, m.points[1], s1a, s1Mid], k, color);
    m.result = `SSA: ${angle.toFixed(1)}°`;
    drawLabel(ctx, m.result, m.measurement?.labelPos || { x: s1Mid.x + 30 / k, y: s1Mid.y - 20 / k }, k, color);
}

export function calculateSPi(points: Point[]) {
    if (points.length < 5) return null;
    const hipAxis = getHipAxisCenter(points);
    if (!hipAxis) return null;
    const centroid = points[4];

    const a1 = Math.atan2(centroid.y - hipAxis.y, centroid.x - hipAxis.x);
    const aVert = -Math.PI / 2;
    let diff = (a1 - aVert) * (180 / Math.PI);
    return { angle: diff, hipAxis, centroid, a1, aVert };
}

export function drawSPi(ctx: CanvasRenderingContext2D, m: Measurement, k: number, bounds?: { minY: number, maxY: number }) {
    const color = toolColor(m.toolKey);
    drawFemoralHeads(ctx, m.points, k, color);
    const data = calculateSPi(m.points);
    if (!data) return;
    const { angle, hipAxis, centroid, a1, aVert } = data;
    const top = Math.max(bounds?.minY ?? -Infinity, Math.min(centroid.y, hipAxis.y - 150 / k));
    strokeLine(ctx, hipAxis, { x: hipAxis.x, y: top }, k, color, true);
    strokeLine(ctx, hipAxis, centroid, k, color);
    drawArc(ctx, hipAxis, 40 / k, aVert, a1, k, color);
    drawPoints(ctx, m.points, k, color);
    const prefix = m.toolKey === 't1spi' ? 'T1SPi' : m.toolKey === 't9spi' ? 'T9SPi' : 'ODHA';
    m.result = `${prefix}: ${Math.abs(angle).toFixed(1)}°`;
    drawLabel(ctx, m.result, m.measurement?.labelPos || { x: hipAxis.x + 20 / k, y: (hipAxis.y + centroid.y) / 2 }, k, color);
}
