import { Point, getMidpoint, getLineLinesIntersection, getDistance, endplateAngleDeg } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawLabel, drawPoint, drawPoints, strokeLine, toolColor, STYLE } from "@/lib/canvas/annotationStyle";

export function calculateSpinalCurvature(points: Point[]) {
    if (points.length < 4) return { angle: 0, intersection: null };

    const p1 = points[0];
    const p2 = points[1];
    const p3 = points[2];
    const p4 = points[3];

    const diff = endplateAngleDeg(p1, p2, p3, p4);

    // To find the intersection of the endplate lines (not their perpendiculars)
    const intersection = getLineLinesIntersection(p1, p2, p3, p4);

    return {
        angle: diff,
        intersection
    };
}

export function drawSpinalCurvature(ctx: CanvasRenderingContext2D, m: Measurement, k: number, labelPrefix: string) {
    const points = m.points;
    if (points.length < 2) return;
    const color = toolColor(m.toolKey);

    strokeLine(ctx, points[0], points[1], k, color);
    if (points.length < 4) { drawPoints(ctx, points, k, color); return; }
    strokeLine(ctx, points[2], points[3], k, color);

    const { angle } = calculateSpinalCurvature(points);
    m.result = `${labelPrefix}: ${angle.toFixed(1)}°`;

    // Dashed curve between the endplate midpoints; its control point is the
    // draggable "curvature handle".
    const mid1 = getMidpoint(points[0], points[1]);
    const mid2 = getMidpoint(points[2], points[3]);
    const chordMid = getMidpoint(mid1, mid2);
    const dist = getDistance(mid1, mid2) || 1;
    const curveOffset = (m.measurement as any)?.curveOffset ?? 20 / k;
    const cp = {
        x: chordMid.x + (-(mid2.y - mid1.y) / dist) * curveOffset,
        y: chordMid.y + ((mid2.x - mid1.x) / dist) * curveOffset,
    };

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = STYLE.dashedLine / k;
    ctx.setLineDash(STYLE.dash.map((d) => d / k));
    ctx.beginPath();
    ctx.moveTo(mid1.x, mid1.y);
    ctx.quadraticCurveTo(cp.x, cp.y, mid2.x, mid2.y);
    ctx.stroke();
    ctx.restore();
    drawPoint(ctx, cp, k, '#ffffff', 1.15);

    const labelPos = m.measurement?.labelPos || { x: cp.x + 30 / k, y: cp.y };
    const levelText = m.measurement?.level ? `
${m.measurement.level}` : '';
    drawLabel(ctx, m.result + levelText, labelPos, k, color);
    drawPoints(ctx, points.slice(0, 4), k, color);

    // Store handle position for interaction detection
    if (!m.measurement) m.measurement = {};
    (m.measurement as any).handlePos = cp;
}
