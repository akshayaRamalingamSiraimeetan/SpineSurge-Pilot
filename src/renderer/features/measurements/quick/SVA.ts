import { Point } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";

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
    if (points.length < 1) return;

    const color = '#3b82f6'; // Blue for SVA
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;
    ctx.fillStyle = color;

    // Draw first point
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, 4 / k, 0, Math.PI * 2);
    ctx.fill();

    if (points.length < 2) return;

    // Draw second point
    ctx.beginPath();
    ctx.arc(points[1].x, points[1].y, 4 / k, 0, Math.PI * 2);
    ctx.fill();

    const p1 = points[0];
    const p2 = points[1];

    ctx.setLineDash([5 / k, 5 / k]);

    // Vertical line through p2 (Reference Plumb Line)
    ctx.beginPath();
    ctx.moveTo(p2.x, p1.y - 100 / k);
    ctx.lineTo(p2.x, p1.y + 100 / k);
    ctx.stroke();

    // Line from p1 to the plumb line
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p1.y);
    ctx.stroke();

    // Arrows at ends of horizontal line
    const arrowSize = 6 / k;
    const drawArrow = (x: number, y: number, angle: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-arrowSize, -arrowSize / 1.5);
        ctx.lineTo(0, 0);
        ctx.lineTo(-arrowSize, arrowSize / 1.5);
        ctx.stroke();
        ctx.restore();
    };

    drawArrow(p1.x, p1.y, p1.x > p2.x ? 0 : Math.PI);
    drawArrow(p2.x, p1.y, p1.x > p2.x ? Math.PI : 0);

    const distancePx = Math.abs(p1.x - p2.x);
    const labelText = m.result || (ratio
        ? `SVA: ${(distancePx * ratio).toFixed(1)} mm`
        : `SVA: ${distancePx.toFixed(1)} px`);

    const labelPos = m.measurement?.labelPos || {
        x: (p1.x + p2.x) / 2,
        y: p1.y - 20 / k
    };

    const levelText = m.measurement?.level ? `\n${m.measurement.level}` : '';
    const finalText = labelText + levelText;

    drawMeasurementLabel(ctx, finalText, labelPos, k, '#60a5fa');
}
