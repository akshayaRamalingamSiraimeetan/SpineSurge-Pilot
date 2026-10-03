import { Point, getMidpoint, getLineLinesIntersection, endplateAngleDeg } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawLabel, drawPoints, strokeLine, toolColor } from "@/lib/canvas/annotationStyle";

export interface CobbAngleData {
    angle: number;
    intersection: Point | null;
    labelPos: Point | null;
}

export function calculateCobbAngle(points: Point[]): CobbAngleData {
    if (points.length < 4) return { angle: 0, intersection: null, labelPos: null };

    const p1 = points[0];
    const p2 = points[1];
    const p3 = points[2];
    const p4 = points[3];

    const diff = endplateAngleDeg(p1, p2, p3, p4);

    const m1 = getMidpoint(p1, p2);
    const m2 = getMidpoint(p3, p4);

    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const perp1 = { x: -dy1, y: dx1 };
    const p1_perp_end = { x: m1.x + perp1.x, y: m1.y + perp1.y };

    const dx2 = p4.x - p3.x;
    const dy2 = p4.y - p3.y;
    const perp2 = { x: -dy2, y: dx2 };
    const p2_perp_end = { x: m2.x + perp2.x, y: m2.y + perp2.y };

    const intersection = getLineLinesIntersection(m1, p1_perp_end, m2, p2_perp_end);

    return {
        angle: diff,
        intersection,
        labelPos: intersection
    };
}

export function drawCobbAngle(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    const points = m.points;
    if (points.length < 2) return;
    const color = toolColor(m.toolKey);

    strokeLine(ctx, points[0], points[1], k, color);
    if (points.length >= 4) strokeLine(ctx, points[2], points[3], k, color);

    if (points.length >= 4) {
        const { angle, intersection } = calculateCobbAngle(points);
        const prefix = m.toolKey === 'cobb' ? 'Cobb' : '4 pt angle';
        m.result = `${prefix}: ${angle.toFixed(1)}°`;

        if (intersection) {
            const mid1 = getMidpoint(points[0], points[1]);
            const mid2 = getMidpoint(points[2], points[3]);
            strokeLine(ctx, mid1, intersection, k, color, true);
            strokeLine(ctx, mid2, intersection, k, color, true);
        }
        const anchor = intersection ?? getMidpoint(getMidpoint(points[0], points[1]), getMidpoint(points[2], points[3]));
        const labelPos = m.measurement?.labelPos || { x: anchor.x + 20 / k, y: anchor.y + 20 / k };
        const levelText = m.measurement?.level ? `
${m.measurement.level}` : '';
        drawLabel(ctx, m.result + levelText, labelPos, k, color);
    }
    drawPoints(ctx, points.slice(0, 4), k, color);
}
