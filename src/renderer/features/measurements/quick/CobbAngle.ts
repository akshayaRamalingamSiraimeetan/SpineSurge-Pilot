import { Point, getMidpoint, getLineLinesIntersection } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";

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

    const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const angle2 = Math.atan2(p4.y - p3.y, p4.x - p3.x);

    let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
    if (diff > 90) diff = 180 - diff;

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

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2 / k;
    ctx.fillStyle = '#3b82f6';

    // Line 1
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();

    points.slice(0, 2).forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
    });

    if (points.length < 4) return;

    // Line 2
    ctx.beginPath();
    ctx.moveTo(points[2].x, points[2].y);
    ctx.lineTo(points[3].x, points[3].y);
    ctx.stroke();

    points.slice(2, 4).forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
    });

    const { angle, intersection } = calculateCobbAngle(points);
    const prefix = m.toolKey === 'cobb' ? 'Cobb' : '4 pt angle';
    m.result = `${prefix}: ${angle.toFixed(1)}°`;

    if (intersection) {
        const mid1 = getMidpoint(points[0], points[1]);
        const mid2 = getMidpoint(points[2], points[3]);

        ctx.setLineDash([5 / k, 5 / k]);
        ctx.beginPath();
        ctx.moveTo(mid1.x, mid1.y);
        ctx.lineTo(intersection.x, intersection.y);
        ctx.moveTo(mid2.x, mid2.y);
        ctx.lineTo(intersection.x, intersection.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        const labelPos = m.measurement?.labelPos || {
            x: intersection.x + 20 / k,
            y: intersection.y + 20 / k
        };

        const levelText = m.measurement?.level ? `\n${m.measurement.level}` : '';
        const finalText = m.result + levelText;

        drawMeasurementLabel(ctx, finalText, labelPos, k, '#3b82f6');
    }
}
