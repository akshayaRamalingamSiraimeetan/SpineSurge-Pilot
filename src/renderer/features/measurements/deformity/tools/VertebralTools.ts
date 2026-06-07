import { Point, getMidpoint, getLineLinesIntersection } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";
import { calculatePO } from "./CoronalTools";
import { drawAngleArc } from "./BaseTools";

export function calculateSlope(points: Point[]) {
    return calculatePO(points);
}

export function drawSlope(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#ec4899') {
    const points = m.points;
    if (points.length < 2) return;
    const [p1, p2] = points;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    const leftPoint = p1.x < p2.x ? p1 : p2;
    const rightPoint = p1.x < p2.x ? p2 : p1;

    ctx.setLineDash([5 / k, 5 / k]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.moveTo(leftPoint.x, leftPoint.y);
    ctx.lineTo(rightPoint.x, leftPoint.y);
    ctx.stroke();

    ctx.fillStyle = color;
    points.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    const data = calculateSlope(points);
    if (data) {
        const levelPrefix = m.measurement?.level ? `${m.measurement.level}\n---\n` : '';
        m.result = `${levelPrefix}Slope: ${data.angle.toFixed(1)}°`;
        const labelPos = m.measurement?.labelPos || getMidpoint(p1, p2);
        drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    }
    ctx.restore();
}

export function calculateCMC(points: Point[]) {
    if (points.length < 4) return null;
    const angles: number[] = [];
    const numLines = Math.floor(points.length / 2);

    for (let i = 0; i < numLines - 1; i++) {
        const p1 = points[i * 2];
        const p2 = points[i * 2 + 1];
        const p3 = points[(i + 1) * 2];
        const p4 = points[(i + 1) * 2 + 1];

        const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const angle2 = Math.atan2(p4.y - p3.y, p4.x - p3.x);

        let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
        if (diff > 180) diff = 360 - diff;
        if (diff > 90) diff = 180 - diff;
        angles.push(diff);
    }

    return angles;
}

export function drawCMC(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#f43f5e') {
    const points = m.points;
    if (points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    const numLines = Math.floor(points.length / 2);
    for (let i = 0; i < numLines; i++) {
        const p1 = points[i * 2];
        const p2 = points[i * 2 + 1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }

    ctx.fillStyle = '#dc2626';
    points.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    const angles = calculateCMC(points);
    if (angles && angles.length > 0) {
        m.result = angles.map((a, i) => `Cobb ${i + 1}: ${a.toFixed(1)}°`).join('\n');

        if (m.measurement?.labelPos) {
            drawMeasurementLabel(ctx, m.result, m.measurement.labelPos, k, color);
        } else {
            angles.forEach((_, i) => {
                const p2 = points[i * 2 + 1];
                const p3 = points[(i + 1) * 2];
                const lp = { x: (p2.x + p3.x) / 2 + 20 / k, y: (p2.y + p3.y) / 2 };
                drawMeasurementLabel(ctx, `Cobb ${i + 1}: ${angles[i].toFixed(1)}°`, lp, k, '#dc2626');
            });
        }
    }
    ctx.restore();
}

export function calculateCBVA(points: Point[]) {
    if (points.length < 2) return null;
    const chin = points[0];
    const brow = points[1];

    const a1 = Math.atan2(brow.y - chin.y, brow.x - chin.x);
    const aVert = -Math.PI / 2;
    let diff = (a1 - aVert) * (180 / Math.PI);
    return { angle: diff, chin, brow, a1, aVert };
}

export function drawCBVA(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#f97316', bounds?: { minY: number, maxY: number }) {
    const points = m.points;
    if (points.length < 2) return;
    const { angle, chin, brow, a1, aVert } = calculateCBVA(points)!;

    const minY = bounds?.minY ?? (chin.y - 120 / k);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    ctx.beginPath(); ctx.moveTo(chin.x, chin.y); ctx.lineTo(brow.x, brow.y); ctx.stroke();

    ctx.setLineDash([5 / k, 5 / k]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath(); ctx.moveTo(chin.x, chin.y); ctx.lineTo(chin.x, minY); ctx.stroke();
    ctx.setLineDash([]);

    drawAngleArc(ctx, chin, 40 / k, aVert, a1, k, color);

    ctx.fillStyle = color;
    points.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    m.result = `CBVA: ${angle.toFixed(1)}°`;
    const labelPos = m.measurement?.labelPos || { x: chin.x + 30 / k, y: chin.y - 30 / k };
    drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    ctx.restore();
}

export function calculateRVAD(points: Point[]) {
    if (points.length < 6) return null;
    const r1 = points[0], r2 = points[1];
    const l1 = points[2], l2 = points[3];
    const av1 = points[4], av2 = points[5];

    const avMid = getMidpoint(av1, av2);
    const avAngle = Math.atan2(av2.y - av1.y, av2.x - av1.x);
    const aRef = avAngle - Math.PI / 2;

    const aRight = Math.atan2(r2.y - r1.y, r2.x - r1.x);
    const aLeft = Math.atan2(l2.y - l1.y, l2.x - l1.x);

    let rvaR = Math.abs((aRight - aRef) * (180 / Math.PI));
    if (rvaR > 180) rvaR = 360 - rvaR;
    if (rvaR > 90) rvaR = 180 - rvaR;

    let rvaL = Math.abs((aLeft - aRef) * (180 / Math.PI));
    if (rvaL > 180) rvaL = 360 - rvaL;
    if (rvaL > 90) rvaL = 180 - rvaL;

    const rvad = Math.abs(rvaR - rvaL);
    return { rvad, rvaR, rvaL, avMid, aRef, aRight, aLeft, r1, r2, l1, l2, av1, av2 };
}

export function drawRVAD(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#f59e0b') {
    const data = calculateRVAD(m.points);
    if (!data) return;
    const { rvad, rvaR, rvaL, avMid, aRef, aRight, aLeft, r1, r2, l1, l2, av1, av2 } = data;

    const refExt1 = { x: avMid.x + Math.cos(aRef) * 1000, y: avMid.y + Math.sin(aRef) * 1000 };
    const refExt2 = { x: avMid.x - Math.cos(aRef) * 1000, y: avMid.y - Math.sin(aRef) * 1000 };
    const intR = getLineLinesIntersection(r1, r2, refExt1, refExt2);
    const intL = getLineLinesIntersection(l1, l2, refExt1, refExt2);

    ctx.save();
    ctx.lineWidth = 2 / k;

    ctx.strokeStyle = '#22c55e';
    ctx.beginPath(); ctx.moveTo(av1.x, av1.y); ctx.lineTo(av2.x, av2.y); ctx.stroke();

    ctx.strokeStyle = '#d946ef';
    ctx.setLineDash([5 / k, 5 / k]);
    const pRef1 = { x: avMid.x + Math.cos(aRef) * 400 / k, y: avMid.y + Math.sin(aRef) * 400 / k };
    const pRef2 = { x: avMid.x - Math.cos(aRef) * 600 / k, y: avMid.y - Math.sin(aRef) * 600 / k };
    ctx.beginPath(); ctx.moveTo(pRef1.x, pRef1.y); ctx.lineTo(pRef2.x, pRef2.y); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#3b82f6';
    // Draw Right Rib Line
    ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.stroke();
    if (intR) {
        ctx.beginPath(); ctx.moveTo(r1.x, r1.y); ctx.lineTo(intR.x, intR.y); ctx.stroke();
        drawAngleArc(ctx, intR, 40 / k, aRef, aRight, k, '#eab308');
    }

    ctx.strokeStyle = color;
    // Draw Left Rib Line
    ctx.beginPath(); ctx.moveTo(l1.x, l1.y); ctx.lineTo(l2.x, l2.y); ctx.stroke();
    if (intL) {
        ctx.beginPath(); ctx.moveTo(l1.x, l1.y); ctx.lineTo(intL.x, intL.y); ctx.stroke();
        drawAngleArc(ctx, intL, 40 / k, aRef, aLeft, k, '#eab308');
    }

    ctx.fillStyle = '#fff';
    m.points.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    m.result = `Rib Angle R: ${rvaR.toFixed(1)}°\nRib Angle L: ${rvaL.toFixed(1)}°\nRVAD: ${rvad.toFixed(1)}°`;
    const labelPos = m.measurement?.labelPos || { x: avMid.x + 50 / k, y: avMid.y + 50 / k };
    drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    ctx.restore();
}

export function calculateITilt(points: Point[]) {
    return calculatePO(points);
}

export function drawITilt(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#8b5cf6') {
    const points = m.points;
    if (points.length < 2) return;
    const [p1, p2] = points;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    const leftPoint = p1.x < p2.x ? p1 : p2;
    const rightPoint = p1.x < p2.x ? p2 : p1;

    ctx.setLineDash([5 / k, 5 / k]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.moveTo(leftPoint.x, leftPoint.y);
    ctx.lineTo(rightPoint.x, leftPoint.y);
    ctx.stroke();

    ctx.fillStyle = color;
    points.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    const data = calculateITilt(points);
    if (data) {
        // Use stored mode or infer from existing result if possible
        const mode = (m.measurement as any)?.tiltMode;
        let prefix = 'iTilt';
        if (mode === 'UIV') prefix = 'UIV Tilt';
        else if (mode === 'LIV') prefix = 'LIV Tilt';
        else if (m.result.includes('UIV')) prefix = 'UIV Tilt';
        else if (m.result.includes('LIV')) prefix = 'LIV Tilt';

        m.result = `${prefix}: ${data.angle.toFixed(1)}°`;
        const labelPos = m.measurement?.labelPos || getMidpoint(p1, p2);
        drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    }
    ctx.restore();
}
