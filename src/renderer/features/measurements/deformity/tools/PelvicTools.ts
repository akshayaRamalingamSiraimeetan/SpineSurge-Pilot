import { Point, getMidpoint, getDistance } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel, drawPoint } from "@/lib/canvas/CanvasUtils";
import { drawAngleArc, getHipAxisCenter, drawFemoralHeads } from "./BaseTools";

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

export function drawTPA(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#10b981') {
    const data = calculateTPA(m.points);
    if (!data) return;
    const { angle, hipAxis, s1Mid, t1, a1, a2 } = data;

    drawFemoralHeads(ctx, m.points, k);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    ctx.beginPath(); ctx.moveTo(hipAxis.x, hipAxis.y); ctx.lineTo(t1.x, t1.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hipAxis.x, hipAxis.y); ctx.lineTo(s1Mid.x, s1Mid.y); ctx.stroke();

    drawAngleArc(ctx, hipAxis, 50 / k, a1, a2, k, color);

    ctx.fillStyle = color;
    [t1, hipAxis, s1Mid].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    m.result = `TPA: ${angle.toFixed(1)}°`;
    const labelPos = m.measurement?.labelPos || { x: hipAxis.x + 30 / k, y: hipAxis.y - 30 / k };
    drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    ctx.restore();
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

export function drawSPA(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#6366f1') {
    const data = calculateSPA(m.points);
    if (!data) return;
    const { angle, s1Mid, c7, hipAxis, a1, a2 } = data;

    drawFemoralHeads(ctx, m.points, k);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    ctx.beginPath(); ctx.moveTo(s1Mid.x, s1Mid.y); ctx.lineTo(c7.x, c7.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s1Mid.x, s1Mid.y); ctx.lineTo(hipAxis.x, hipAxis.y); ctx.stroke();

    drawAngleArc(ctx, s1Mid, 60 / k, a1, a2, k, color);

    ctx.fillStyle = color;
    [c7, s1Mid, hipAxis].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    m.result = `SPA: ${angle.toFixed(1)}°`;
    const labelPos = m.measurement?.labelPos || { x: s1Mid.x + 40 / k, y: s1Mid.y };
    drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    ctx.restore();
}
