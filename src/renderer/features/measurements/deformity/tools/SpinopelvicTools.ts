import { Point, getMidpoint } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel, drawPoint } from "@/lib/canvas/CanvasUtils";
import { drawAngleArc, getHipAxisCenter, drawFemoralHeads } from "./BaseTools";

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

export function drawSSA(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#f43f5e') {
    const data = calculateSSA(m.points);
    if (!data) return;
    const { angle, s1Mid, c7, s1a, a1, a2 } = data;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    ctx.beginPath(); ctx.moveTo(s1Mid.x, s1Mid.y); ctx.lineTo(c7.x, c7.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s1Mid.x, s1Mid.y); ctx.lineTo(s1a.x, s1a.y); ctx.stroke();

    drawAngleArc(ctx, s1Mid, 50 / k, a1, a2, k, color);

    ctx.fillStyle = color;
    [c7, s1Mid, s1a].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    m.result = `SSA: ${angle.toFixed(1)}°`;
    const labelPos = m.measurement?.labelPos || { x: s1Mid.x + 30 / k, y: s1Mid.y - 20 / k };
    drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    ctx.restore();
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

export function drawSPi(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#0ea5e9', bounds?: { minY: number, maxY: number }) {
    const data = calculateSPi(m.points);
    if (!data) return;
    const { angle, hipAxis, centroid, a1, aVert } = data;

    drawFemoralHeads(ctx, m.points, k);

    const minY = bounds?.minY ?? (hipAxis.y - 150 / k);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    ctx.beginPath(); ctx.moveTo(hipAxis.x, hipAxis.y); ctx.lineTo(centroid.x, centroid.y); ctx.stroke();

    ctx.setLineDash([5 / k, 5 / k]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath(); ctx.moveTo(hipAxis.x, hipAxis.y); ctx.lineTo(hipAxis.x, minY); ctx.stroke();
    ctx.setLineDash([]);

    drawAngleArc(ctx, hipAxis, 40 / k, aVert, a1, k, color);

    ctx.fillStyle = color;
    [hipAxis, centroid].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    const prefix = m.toolKey === 't1spi' ? 'T1SPi' : m.toolKey === 't9spi' ? 'T9SPi' : 'ODHA';
    m.result = `${prefix}: ${Math.abs(angle).toFixed(1)}°`;
    const labelPos = m.measurement?.labelPos || { x: hipAxis.x + 20 / k, y: (hipAxis.y + centroid.y) / 2 };
    drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    ctx.restore();
}
