import type { Measurement, Point } from '@/lib/canvas/CanvasManager';
import { drawMeasurementLabel } from '@/lib/canvas/CanvasUtils';
import { drawAngleArc } from '../deformity/DeformityTools';

export function drawWedgeOsteotomy(
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    color: string = "#f472b6"
) {
    const typeMap: Record<string, string> = {
        'ost-spo': 'SPO',
        'ost-pso': 'PSO',
        'ost-open': 'OPEN',
        'ost-resect': 'RESECT'
    };
    const type = typeMap[m.toolKey] || 'SPO';

    if (type === 'RESECT') {
        drawResection(ctx, m, k);
        return;
    }

    if (type === 'PSO' && m.points.length < 3) return;
    if (type === 'OPEN' && m.points.length < 2) return;
    if (type === 'SPO' && m.points.length < 2) return;

    const isClosingWedge = type === 'PSO' || type === 'SPO';
    if (isClosingWedge && m.points.length < 3) return;

    const hinge = isClosingWedge ? m.points[1] : (m.measurement?.hingePoint || { x: m.points[0].x + 200 / k, y: m.points[0].y });
    const P = m.points[0];
    const A = isClosingWedge ? m.points[2] : m.points[1];

    if (!m.measurement) m.measurement = {};
    m.measurement.type = type;
    m.measurement.hingePoint = hinge;

    const angMoving = Math.atan2(P.y - hinge.y, P.x - hinge.x);
    const angFixed = Math.atan2(A.y - hinge.y, A.x - hinge.x);

    let theta = ((angFixed - angMoving + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    m.measurement.rotationAngleRad = theta;

    if (isClosingWedge) {
        m.measurement.cutRays = [
            { origin: { ...hinge }, angle: angFixed },
            { origin: { ...hinge }, angle: angMoving }
        ];
    } else {
        m.measurement.cutRays = [{ origin: { ...hinge }, angle: angMoving }];
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 / k;

    const L_line = 10000;

    if (type === 'OPEN') {
        const [ptA, ptB, ptC, ptD, ptE, ptF] = m.points;

        ctx.lineWidth = 3 / k;

        if (ptA && ptB) {
            ctx.strokeStyle = '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(ptA.x, ptA.y);
            ctx.lineTo(ptB.x, ptB.y);
            ctx.stroke();
        }

        if (ptC && ptD) {
            ctx.strokeStyle = '#ef4444';
            const angCD = Math.atan2(ptD.y - ptC.y, ptD.x - ptC.x);
            ctx.beginPath();
            ctx.moveTo(ptC.x - Math.cos(angCD) * L_line, ptC.y - Math.sin(angCD) * L_line);
            ctx.lineTo(ptC.x + Math.cos(angCD) * L_line, ptC.y + Math.sin(angCD) * L_line);
            ctx.stroke();
        }

        if (ptE && ptF) {
            ctx.strokeStyle = '#10b981';
            ctx.beginPath();
            ctx.moveTo(ptE.x, ptE.y);
            ctx.lineTo(ptF.x, ptF.y);
            ctx.stroke();
        }

        m.points.forEach((p, i) => {
            if (i < 2) ctx.fillStyle = '#3b82f6';
            else if (i < 4) ctx.fillStyle = '#ef4444';
            else ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6 / k, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = `${12 / k}px Inter`;
            ctx.fillText(String.fromCharCode(65 + i), p.x + 8 / k, p.y + 8 / k);
        });

        if (m.points.length >= 6) {
            const { phi, hinge: h, normal } = calculateOpenOsteotomyPrimitives(m.points);
            m.measurement.rotationAngleRad = phi;
            m.measurement.hingePoint = h;
            m.measurement.cutRays = [{ origin: h, angle: Math.atan2(m.points[3].y - m.points[2].y, m.points[3].x - m.points[2].x) }];
            m.measurement.normal = normal;
            const labelPos = { x: h.x + 20 / k, y: h.y - 40 / k };
            drawMeasurementLabel(ctx, `Opening: ${Math.abs(phi * 180 / Math.PI).toFixed(1)}°`, labelPos, k, '#ef4444');
        }

        ctx.restore();
        return;
    }

    m.measurement.cutRays.forEach((ray: any) => {
        ctx.beginPath();
        ctx.moveTo(ray.origin.x - Math.cos(ray.angle) * L_line, ray.origin.y - Math.sin(ray.angle) * L_line);
        ctx.lineTo(ray.origin.x + Math.cos(ray.angle) * L_line, ray.origin.y + Math.sin(ray.angle) * L_line);
        ctx.stroke();
    });

    if (isClosingWedge && m.measurement.cutRays.length === 2) {
        ctx.save();
        ctx.fillStyle = `${color}33`;
        ctx.beginPath();
        ctx.moveTo(hinge.x, hinge.y);
        const r1 = m.measurement.cutRays[0];
        const r2 = m.measurement.cutRays[1];
        const rad = 1000 / k;
        ctx.lineTo(hinge.x + Math.cos(r1.angle) * rad, hinge.y + Math.sin(r1.angle) * rad);
        ctx.lineTo(hinge.x + Math.cos(r2.angle) * rad, hinge.y + Math.sin(r2.angle) * rad);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(hinge.x, hinge.y, 6 / k, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1 / k;
    ctx.stroke();

    drawAngleArc(ctx, hinge, 150 / k, angMoving, angMoving + theta, k, color);

    const labelPrefix = type === 'OPEN' ? 'Opening' : 'Correction';
    const labelPos = m.measurement.labelPos || { x: P.x + 20 / k, y: P.y - 40 / k };
    drawMeasurementLabel(ctx, `${labelPrefix}: ${Math.abs(theta * 180 / Math.PI).toFixed(1)}°`, labelPos, k, color);

    ctx.restore();
}

export function drawBaseImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement) {
    ctx.drawImage(image, 0, 0);
}

export function drawDeformedSuperiorSegment(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    m: Measurement,
    frag?: any,
    opacity: number = 1.0
) {
    if (!m.measurement?.hingePoint || !m.measurement?.cutRays) return;

    const type = m.measurement.type;
    const hinge = m.measurement.hingePoint;
    const cutRays = m.measurement.cutRays;
    const theta = m.measurement.rotationAngleRad ?? 0;

    if (theta === 0) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(hinge.x, hinge.y);
    ctx.rotate(theta);
    ctx.translate(-hinge.x, -hinge.y);

    const isClosingWedge = type === 'PSO' || type === 'SPO';
    const isResect = type === 'RESECT';
    const clipRay = (isClosingWedge && cutRays.length > 1) ? cutRays[1] : (isResect && cutRays.length > 1 ? cutRays[1] : cutRays[0]);
    const L = 20000;
    const ca = clipRay.angle;

    const rotRad = (frag?.rotation || 0) * Math.PI / 180;
    const headwardVector = { x: Math.sin(rotRad), y: -Math.cos(rotRad) };
    const n1 = ca + Math.PI / 2;
    const n2 = ca - Math.PI / 2;
    const dot1 = Math.cos(n1) * headwardVector.x + Math.sin(n1) * headwardVector.y;
    const dot2 = Math.cos(n2) * headwardVector.x + Math.sin(n2) * headwardVector.y;
    const n = dot1 > dot2 ? n1 : n2;

    const p1c = { x: clipRay.origin.x - Math.cos(ca) * L, y: clipRay.origin.y - Math.sin(ca) * L };
    const p2c = { x: clipRay.origin.x + Math.cos(ca) * L, y: clipRay.origin.y + Math.sin(ca) * L };

    ctx.beginPath();
    ctx.moveTo(p1c.x, p1c.y);
    ctx.lineTo(p2c.x, p2c.y);
    ctx.lineTo(p2c.x + Math.cos(n) * L, p2c.y + Math.sin(n) * L);
    ctx.lineTo(p1c.x + Math.cos(n) * L, p1c.y + Math.sin(n) * L);
    ctx.closePath();
    ctx.clip();

    if (frag) {
        ctx.drawImage(image, frag.imageX, frag.imageY, frag.imageWidth, frag.imageHeight);
    } else {
        ctx.drawImage(image, 0, 0);
    }

    ctx.restore();
}

export function drawDeformedInferiorSegment(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    m: Measurement,
    frag?: any,
    opacity: number = 1.0
) {
    if (!m.measurement?.hingePoint || !m.measurement?.cutRays) return;

    const hinge = m.measurement.hingePoint;
    const theta = m.measurement.rotationAngleRad ?? 0;

    if (theta === 0) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(hinge.x, hinge.y);
    ctx.rotate(theta);
    ctx.translate(-hinge.x, -hinge.y);

    const n = m.measurement.normal || { x: 0, y: -1 };
    const L = 20000;
    const ca = Math.atan2(n.y, n.x) - Math.PI / 2;

    const p1c = { x: hinge.x - Math.cos(ca) * L, y: hinge.y - Math.sin(ca) * L };
    const p2c = { x: hinge.x + Math.cos(ca) * L, y: hinge.y + Math.sin(ca) * L };

    ctx.beginPath();
    ctx.moveTo(p1c.x, p1c.y);
    ctx.lineTo(p2c.x, p2c.y);
    ctx.lineTo(p2c.x + n.x * L, p2c.y + n.y * L);
    ctx.lineTo(p1c.x + n.x * L, p1c.y + n.y * L);
    ctx.closePath();
    ctx.clip();

    if (frag) {
        ctx.drawImage(image, frag.imageX, frag.imageY, frag.imageWidth, frag.imageHeight);
    } else {
        ctx.drawImage(image, 0, 0);
    }

    ctx.restore();
}

export function calculateOpenOsteotomyPrimitives(points: Point[]) {
    const [A, B, C, D, E, F] = points;

    const getAngle = (s: Point, e: Point) => Math.atan2(e.y - s.y, e.x - s.x);
    let phi = getAngle(A, B) - getAngle(E, F);

    while (phi > Math.PI) phi -= 2 * Math.PI;
    while (phi < -Math.PI) phi += 2 * Math.PI;

    const dx = D.x - C.x;
    const dy = D.y - C.y;
    let nx = -dy;
    let ny = dx;

    if (nx * (E.x - C.x) + ny * (E.y - C.y) < 0) {
        nx = -nx;
        ny = -ny;
    }

    const mag = Math.hypot(nx, ny);
    const n = { x: nx / mag, y: ny / mag };

    const checkOpening = (p: Point, currentPhi: number) => {
        const c = Math.cos(currentPhi);
        const s = Math.sin(currentPhi);
        const pPrimeX = C.x + (p.x - C.x) * c - (p.y - C.y) * s;
        const pPrimeY = C.y + (p.x - C.x) * s + (p.y - C.y) * c;
        const dispDot = (pPrimeX - p.x) * n.x + (pPrimeY - p.y) * n.y;
        return dispDot >= -1e-4;
    };

    if (!checkOpening(E, phi) || !checkOpening(F, phi)) {
        phi = -phi;
    }

    return { phi, hinge: C, normal: n };
}

export function calculateResectionPrimitives(points: Point[]) {
    if (points.length < 4) return null;

    const [p1, p2, p3, p4] = points;

    const r1Angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const r2Angle = Math.atan2(p4.y - p3.y, p4.x - p3.x);

    let mid1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    let mid2 = { x: (p3.x + p4.x) / 2, y: (p3.y + p4.y) / 2 };

    let rTarget = { origin: mid1, angle: r1Angle };
    let rMoving = { origin: mid2, angle: r2Angle };

    if (mid1.y < mid2.y) {
        rTarget = { origin: mid2, angle: r2Angle };
        rMoving = { origin: mid1, angle: r1Angle };
    }

    const dTheta = rTarget.angle - rMoving.angle;
    const trans = { x: rTarget.origin.x - rMoving.origin.x, y: rTarget.origin.y - rMoving.origin.y };

    return {
        rotationAngleRad: dTheta,
        translation: trans,
        hingePoint: rMoving.origin,
        cutRays: [rTarget, rMoving],
        targetRay: rTarget,
        movingRay: rMoving,
    };
}

export function drawResection(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    const primitives = calculateResectionPrimitives(m.points);
    if (!primitives) return;

    const [p1, p2, p3, p4] = m.points;
    const { rotationAngleRad: dTheta, translation: trans, hingePoint, cutRays } = primitives;
    const rTarget = cutRays[0];
    const rMoving = cutRays[1];
    const mid1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    if (!m.measurement) m.measurement = {};
    m.measurement.type = 'RESECT';
    m.result = `Resection: ${Math.abs(dTheta * 180 / Math.PI).toFixed(1)}°`;
    m.measurement.cutRays = [rTarget, rMoving];
    m.measurement.rotationAngleRad = dTheta;
    m.measurement.translation = trans;
    m.measurement.hingePoint = hingePoint;

    ctx.save();
    ctx.lineWidth = 2.5 / k;
    const L = 10000;

    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 4 / k;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(rTarget.origin.x - Math.cos(rTarget.angle) * L, rTarget.origin.y - Math.sin(rTarget.angle) * L);
    ctx.lineTo(rTarget.origin.x + Math.cos(rTarget.angle) * L, rTarget.origin.y + Math.sin(rTarget.angle) * L);
    ctx.stroke();
    ctx.setLineDash([]);

    drawAngleArc(ctx, rMoving.origin, 150 / k, rMoving.angle, rMoving.angle + dTheta, k, '#f472b6');

    ctx.fillStyle = '#ffffff';
    [p1, p2, p3, p4].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });

    drawMeasurementLabel(ctx, `Resection: ${Math.abs(dTheta * 180 / Math.PI).toFixed(1)}°`, { x: mid1.x, y: mid1.y - 40 / k }, k, '#f472b6');
    ctx.restore();
}

export function drawDeformedResection() {
    // NO-OP: image pixels do not move for RESECT
}
