import { Point } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawLabel, drawPoints, strokeLine, toolColor } from "@/lib/canvas/annotationStyle";

export function calculateSVA(points: Point[]) {
    if (points.length < 2) return { distance: 0, labelPos: null };

    const p1 = points[0]; // C7 Plumb line start
    const p2 = points[1]; // S1 corner

    const distance = p1.x - p2.x; // Positive if C7 is anterior to S1 (assuming facing right)

    return {
        distance,
        labelPos: {
            x: (p1.x + p2.x) / 2,
            y: p1.y
        }
    };
}

export function drawSVA(ctx: CanvasRenderingContext2D, m: Measurement, k: number, ratio: number | null) {
    const points = m.points;
    if (points.length < 2) { drawPoints(ctx, points, k, toolColor(m.toolKey)); return; }
    const color = toolColor(m.toolKey);
    const [p1, p2] = points;

    // Plumb line through the S1 corner, horizontal offset from C7.
    const span = Math.max(Math.abs(p1.y - p2.y), 60 / k);
    strokeLine(ctx, { x: p2.x, y: Math.min(p1.y, p2.y) - 40 / k }, { x: p2.x, y: Math.max(p1.y, p2.y) + Math.min(span * 0.1, 40 / k) }, k, color, true);
    strokeLine(ctx, p1, { x: p2.x, y: p1.y }, k, color);

    const distancePx = Math.abs(p1.x - p2.x);
    const labelText = m.result || (ratio
        ? `SVA: ${(distancePx * ratio).toFixed(1)} mm`
        : `SVA: ${distancePx.toFixed(1)} px`);
    const labelPos = m.measurement?.labelPos || { x: (p1.x + p2.x) / 2, y: p1.y - 20 / k };
    const levelText = m.measurement?.level ? `
${m.measurement.level}` : '';
    drawLabel(ctx, labelText + levelText, labelPos, k, color);
    drawPoints(ctx, points, k, color);
}
