import { Point, getMidpoint } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawArc, drawLabel, drawPoints, strokeLine, toolColor } from "@/lib/canvas/annotationStyle";
import { getHipAxisCenter, drawFemoralHeads } from "./BaseTools";

export function calculateTPA(points: Point[]) {
    if (points.length < 7) return null;
    const hipAxis = getHipAxisCenter(points);
    if (!hipAxis) return null;
    const t1 = points[4];
    const s1Mid = getMidpoint(points[5], points[6]);

    const a1 = Math.atan2(t1.y - hipAxis.y, t1.x - hipAxis.x);
    const a2 = Math.atan2(s1Mid.y - hipAxis.y, s1Mid.x - hipAxis.x);
    let diff = Math.abs(a1 - a2) * (180 / Math.PI);
    if (diff > 180) diff = 360 - diff;
    return { angle: diff, hipAxis, s1Mid, t1, a1, a2 };
}

export function drawTPA(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    const color = toolColor(m.toolKey);
    drawFemoralHeads(ctx, m.points, k, color);
    const data = calculateTPA(m.points);
    if (!data) return;
    const { angle, hipAxis, s1Mid, t1, a1, a2 } = data;
    strokeLine(ctx, m.points[5], m.points[6], k, color);
    strokeLine(ctx, hipAxis, t1, k, color);
    strokeLine(ctx, hipAxis, s1Mid, k, color);
    drawArc(ctx, hipAxis, 50 / k, a1, a2, k, color);
    drawPoints(ctx, [...m.points, s1Mid], k, color);
    m.result = `TPA: ${angle.toFixed(1)}°`;
    drawLabel(ctx, m.result, m.measurement?.labelPos || { x: hipAxis.x + 30 / k, y: hipAxis.y - 30 / k }, k, color);
}

export function calculateSPA(points: Point[]) {
    if (points.length < 7) return null;
    const hipAxis = getHipAxisCenter(points);
    if (!hipAxis) return null;
    const c7 = points[4];
    const s1Mid = getMidpoint(points[5], points[6]);

    const a1 = Math.atan2(c7.y - s1Mid.y, c7.x - s1Mid.x);
    const a2 = Math.atan2(hipAxis.y - s1Mid.y, hipAxis.x - s1Mid.x);
    let diff = Math.abs(a1 - a2) * (180 / Math.PI);
    if (diff > 180) diff = 360 - diff;
    return { angle: diff, s1Mid, c7, hipAxis, a1, a2 };
}

export function drawSPA(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    const color = toolColor(m.toolKey);
    drawFemoralHeads(ctx, m.points, k, color);
    const data = calculateSPA(m.points);
    if (!data) return;
    const { angle, s1Mid, c7, hipAxis, a1, a2 } = data;
    strokeLine(ctx, m.points[5], m.points[6], k, color);
    strokeLine(ctx, s1Mid, c7, k, color);
    strokeLine(ctx, s1Mid, hipAxis, k, color);
    drawArc(ctx, s1Mid, 60 / k, a1, a2, k, color);
    drawPoints(ctx, [...m.points, s1Mid], k, color);
    m.result = `SPA: ${angle.toFixed(1)}°`;
    drawLabel(ctx, m.result, m.measurement?.labelPos || { x: s1Mid.x + 40 / k, y: s1Mid.y }, k, color);
}
