import { Point, getMidpoint, getLineLinesIntersection } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawArc, drawLabel, drawPoints, drawReferenceLine, strokeLine, toolColor } from "@/lib/canvas/annotationStyle";
import { calculatePO, drawTiltLine } from "./CoronalTools";

export function calculateSlope(points: Point[]) {
    return calculatePO(points);
}

export function drawSlope(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    if (m.points.length < 2) return;
    drawTiltLine(ctx, m, k, 'Slope');
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

export function drawCMC(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    const points = m.points;
    if (points.length < 2) return;
    const color = toolColor(m.toolKey);
    for (let i = 0; i + 1 < points.length; i += 2) strokeLine(ctx, points[i], points[i + 1], k, color);
    drawPoints(ctx, points, k, color);

    const angles = calculateCMC(points);
    if (!angles || angles.length === 0) return;
    m.result = angles.map((a, i) => `Cobb ${i + 1}: ${a.toFixed(1)}°`).join('\n');
    if (m.measurement?.labelPos) {
        drawLabel(ctx, m.result, m.measurement.labelPos, k, color);
    } else {
        angles.forEach((a, i) => {
            const p2 = points[i * 2 + 1];
            const p3 = points[(i + 1) * 2];
            drawLabel(ctx, `Cobb ${i + 1}: ${a.toFixed(1)}°`, { x: (p2.x + p3.x) / 2 + 20 / k, y: (p2.y + p3.y) / 2 }, k, color);
        });
    }
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

export function drawCBVA(ctx: CanvasRenderingContext2D, m: Measurement, k: number, bounds?: { minY: number, maxY: number }) {
    const points = m.points;
    if (points.length < 2) return;
    const color = toolColor(m.toolKey);
    const { angle, chin, brow, a1, aVert } = calculateCBVA(points)!;
    const top = Math.max(bounds?.minY ?? -Infinity, Math.min(brow.y, chin.y - 120 / k));
    drawReferenceLine(ctx, chin, { x: chin.x, y: top }, k, 'Vertical', { at: 0.75 });
    strokeLine(ctx, chin, brow, k, color);
    drawArc(ctx, chin, 40 / k, aVert, a1, k, color);
    drawPoints(ctx, points, k, color);
    m.result = `CBVA: ${angle.toFixed(1)}°`;
    drawLabel(ctx, m.result, m.measurement?.labelPos || { x: chin.x + 30 / k, y: chin.y - 30 / k }, k, color);
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

export function drawRVAD(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    const data = calculateRVAD(m.points);
    if (!data) return;
    const color = toolColor(m.toolKey);
    const { rvad, rvaR, rvaL, avMid, aRef, aRight, aLeft, r1, r2, l1, l2, av1, av2 } = data;

    const refExt1 = { x: avMid.x + Math.cos(aRef) * 1000, y: avMid.y + Math.sin(aRef) * 1000 };
    const refExt2 = { x: avMid.x - Math.cos(aRef) * 1000, y: avMid.y - Math.sin(aRef) * 1000 };
    const intR = getLineLinesIntersection(r1, r2, refExt1, refExt2);
    const intL = getLineLinesIntersection(l1, l2, refExt1, refExt2);

    // Apical endplate, its perpendicular (dashed reference) and both rib lines.
    strokeLine(ctx, av1, av2, k, color);
    const reach = Math.max(
        intR ? Math.hypot(intR.x - avMid.x, intR.y - avMid.y) : 0,
        intL ? Math.hypot(intL.x - avMid.x, intL.y - avMid.y) : 0,
        120 / k,
    ) + 30 / k;
    drawReferenceLine(ctx,
        { x: avMid.x + Math.cos(aRef) * reach, y: avMid.y + Math.sin(aRef) * reach },
        { x: avMid.x - Math.cos(aRef) * reach, y: avMid.y - Math.sin(aRef) * reach }, k, 'Apical ⊥', { at: 0.82 });
    strokeLine(ctx, r1, r2, k, color);
    strokeLine(ctx, l1, l2, k, color);
    if (intR) { strokeLine(ctx, r1, intR, k, color, true); drawArc(ctx, intR, 40 / k, aRef, aRight, k, color); }
    if (intL) { strokeLine(ctx, l1, intL, k, color, true); drawArc(ctx, intL, 40 / k, aRef, aLeft, k, color); }
    drawPoints(ctx, m.points, k, color);

    m.result = `Rib Angle R: ${rvaR.toFixed(1)}°\nRib Angle L: ${rvaL.toFixed(1)}°\nRVAD: ${rvad.toFixed(1)}°`;
    drawLabel(ctx, m.result, m.measurement?.labelPos || { x: avMid.x + 50 / k, y: avMid.y + 50 / k }, k, color);
}

export function calculateITilt(points: Point[]) {
    return calculatePO(points);
}

export function drawITilt(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    if (m.points.length < 2) return;
    // Use stored mode or infer from the existing result
    const mode = (m.measurement as any)?.tiltMode;
    let prefix = 'iTilt';
    if (mode === 'UIV' || (!mode && String(m.result).includes('UIV'))) prefix = 'UIV Tilt';
    else if (mode === 'LIV' || (!mode && String(m.result).includes('LIV'))) prefix = 'LIV Tilt';
    drawTiltLine(ctx, m, k, prefix);
}
