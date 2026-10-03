import { Measurement, Point } from "@/lib/canvas/CanvasManager";
import { drawArc, drawLabel, drawPoint, drawPoints, drawPointTag, strokeLine, toolColor, withAlpha, STYLE } from "@/lib/canvas/annotationStyle";

/** Segment a→b extended by `before`/`after` fractions of its length (finite cut lines, UI5-11). */
const extend = (a: Point, b: Point, before: number, after: number): [Point, Point] => {
    const dx = b.x - a.x, dy = b.y - a.y;
    return [{ x: a.x - dx * before, y: a.y - dy * before }, { x: b.x + dx * after, y: b.y + dy * after }];
};

/**
 * SHARED DATA STRUCTURE
 * Osteotomy {
 *   type: 'SPO' | 'PSO' | 'RESECT' | 'OPEN'
 *   posteriorPoint: Point
 *   hingePoint: Point
 *   cutRays: Ray[]
 *   rotationAngleRad: number
 * }
 */

/**
 * Universal Osteotomy/Resection Logic
 */
export function drawWedgeOsteotomy(
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
) {
    const color = toolColor(m.toolKey);
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
    if (type === 'OPEN' && m.points.length < 2) return; // Keep minimal sanity check
    if (type === 'SPO' && m.points.length < 2) return;

    // 1. Identify Points based on Tool Type
    // PSO/SPO: 0=posterior1(A), 1=hinge(B), 2=posterior2(C)
    // Others: 0=posterior, 1=handle (hinge is auto-derived or existing)
    const isClosingWedge = type === 'PSO' || type === 'SPO';

    // SAFETY: Ensure we have enough points for Closing Wedge logic
    if (isClosingWedge && m.points.length < 3) return;

    const hinge = isClosingWedge ? m.points[1] : (m.measurement?.hingePoint || { x: m.points[0].x + 200 / k, y: m.points[0].y });
    const P = m.points[0];
    const A = isClosingWedge ? m.points[2] : m.points[1];

    if (!m.measurement) m.measurement = {};
    m.measurement.type = type;
    m.measurement.hingePoint = hinge;

    // 2. Base Angles
    const angMoving = Math.atan2(P.y - hinge.y, P.x - hinge.x); // BA (First click)
    const angFixed = Math.atan2(A.y - hinge.y, A.x - hinge.x);  // BC (Third click)

    // 3. Rotation Logic
    // Closing Wedge (PSO/SPO) closes BA to BC.
    let theta = ((angFixed - angMoving + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    m.measurement.rotationAngleRad = theta;

    // 4. Derive Cut Rays
    if (isClosingWedge) {
        // Ray 0 = Fixed (BC), Ray 1 = Moving (BA)
        m.measurement.cutRays = [
            { origin: { ...hinge }, angle: angFixed },
            { origin: { ...hinge }, angle: angMoving }
        ];
    } else {
        // OPEN: Ray 0 is the single cut ray
        const baseRay = { origin: { ...hinge }, angle: angMoving };
        m.measurement.cutRays = [baseRay];
    }

    /* -------------------------------------------------
     * DRAWING — planning yellow, finite lines (UI5-11)
     * ------------------------------------------------- */
    if (type === 'OPEN') {
        const [A, B, C, D, E, F] = m.points;
        if (A && B) strokeLine(ctx, A, B, k, color, true);          // upper reference
        if (C && D) { const [c0, c1] = extend(C, D, 0.2, 0.2); strokeLine(ctx, c0, c1, k, color); } // cut
        if (E && F) strokeLine(ctx, E, F, k, color, true);          // lower reference
        drawPoints(ctx, m.points, k, color);
        m.points.forEach((pt, i) => drawPointTag(ctx, String.fromCharCode(65 + i), pt, k));

        if (m.points.length >= 6) {
            const { phi, hinge, normal } = calculateOpenOsteotomyPrimitives(m.points);
            m.measurement.rotationAngleRad = phi;
            m.measurement.hingePoint = hinge;
            m.measurement.cutRays = [{ origin: hinge, angle: Math.atan2(m.points[3].y - m.points[2].y, m.points[3].x - m.points[2].x) }];
            m.measurement.normal = normal;
            const labelPos = m.measurement.labelPos || { x: hinge.x + 20 / k, y: hinge.y - 40 / k };
            drawLabel(ctx, `Opening: ${Math.abs(phi * 180 / Math.PI).toFixed(1)}°`, labelPos, k, color);
        }
        return;
    }

    // Closing wedge (PSO / SPO): two cuts meeting at the anterior hinge,
    // drawn from just behind the hinge to a little past each posterior point.
    const [m0, m1] = extend(hinge, P, 0.12, 0.15);
    const [f0, f1] = extend(hinge, A, 0.12, 0.15);
    ctx.save();
    ctx.fillStyle = withAlpha(color, STYLE.fillAlpha * 1.5);
    ctx.beginPath();
    ctx.moveTo(hinge.x, hinge.y);
    ctx.lineTo(P.x, P.y);
    ctx.lineTo(A.x, A.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    strokeLine(ctx, m0, m1, k, color);
    strokeLine(ctx, f0, f1, k, color);
    strokeLine(ctx, P, A, k, color, true);

    const r = Math.min(Math.hypot(P.x - hinge.x, P.y - hinge.y), Math.hypot(A.x - hinge.x, A.y - hinge.y)) * 0.35;
    drawArc(ctx, hinge, r, angMoving, angMoving + theta, k, color);
    drawPoints(ctx, [P, A], k, color);
    drawPoint(ctx, hinge, k, color, 1.3);

    const labelPos = m.measurement.labelPos || { x: P.x + 20 / k, y: P.y - 40 / k };
    drawLabel(ctx, `Correction: ${Math.abs(theta * 180 / Math.PI).toFixed(1)}°`, labelPos, k, color);
}

/**
 * 1. DRAW BASE IMAGE (NO ROTATION)
 */
export function drawBaseImage(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement
) {
    ctx.drawImage(image, 0, 0);
}

/**
 * 2. DRAW DEFORMED SUPERIOR SEGMENT (OBLIQUE CLIPPING)
 */
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

    /* ---------------------------------------------
     * 1. ROTATE ABOUT HINGE
     * --------------------------------------------- */
    ctx.translate(hinge.x, hinge.y);
    ctx.rotate(theta); // Snap BA (Moving) to BC (Fixed)
    ctx.translate(-hinge.x, -hinge.y);

    /* ---------------------------------------------
     * 2. CREATE OBLIQUE HALF-PLANE CLIP (SUPERIOR)
     * --------------------------------------------- */
    /* ---------------------------------------------
     * 2. CREATE OBLIQUE HALF-PLANE CLIP (SUPERIOR)
     * --------------------------------------------- */
    // Superior segment originates at the Moving Ray (Ray 1 in PSO/SPO, or 0 in others)
    // For RESECT, the moving ray is Ray 1 (Upper Line)
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

    /* ---------------------------------------------
     * 4. DRAW IMAGE AGAIN
     * --------------------------------------------- */
    if (frag) {
        ctx.drawImage(image, frag.imageX, frag.imageY, frag.imageWidth, frag.imageHeight);
    } else {
        ctx.drawImage(image, 0, 0);
    }

    ctx.restore();
}

/**
 * 3. DRAW DEFORMED INFERIOR SEGMENT (OBLIQUE CLIPPING)
 */
export function drawDeformedInferiorSegment(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    m: Measurement,
    frag?: any,
    opacity: number = 1.0
) {
    if (!m.measurement?.hingePoint || !m.measurement?.cutRays) return;

    const hinge = m.measurement.hingePoint;
    const cutRays = m.measurement.cutRays;
    const theta = m.measurement.rotationAngleRad ?? 0;

    if (theta === 0) return;

    ctx.save();
    ctx.globalAlpha = opacity;

    // 1. ROTATE ABOUT HINGE
    ctx.translate(hinge.x, hinge.y);
    ctx.rotate(theta);
    ctx.translate(-hinge.x, -hinge.y);

    // 2. CREATE OBLIQUE HALF-PLANE CLIP (USING NORMAL N)
    const n = m.measurement.normal || { x: 0, y: -1 };
    const L = 20000;

    // Perpendicular to n is the clip line
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

/**
 * CALCULATE PRIMITIVES (Geometric Baseline)
 * Shared between preview and execution.
 * 
 * This function computes the geometric primitives for open osteotomy based on
 * the six reference points (A, B, C, D, E, F):
 * - AB: Upper reference line
 * - CD: Middle cut line
 * - EF: Lower reference line
 * 
 * The function calculates:
 * 1. phi: The opening angle (angular difference between AB and EF)
 * 2. hinge: The hinge point (C, the start of the cut line)
 * 3. normal: The normal vector pointing toward the mobile side (E)
 * 
 * Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3
 */
export function calculateOpenOsteotomyPrimitives(points: Point[]) {
    const [A, B, C, D, E, F] = points;

    // 1. Calculate opening angle phi (delta between AB and EF)
    // This represents the angular correction achieved by the osteotomy
    const getAngle = (s: Point, e: Point) => Math.atan2(e.y - s.y, e.x - s.x);
    let phi = getAngle(A, B) - getAngle(E, F);
    
    // Lines are undirected: keep the smallest angle between them (−90°…90°),
    // otherwise drawing AB and EF in opposite directions reads as ~180°.
    while (phi > Math.PI / 2) phi -= Math.PI;
    while (phi <= -Math.PI / 2) phi += Math.PI;

    // 2. Calculate normal vector n perpendicular to cut line CD
    // The normal points toward the mobile side (E)
    const dx = D.x - C.x;
    const dy = D.y - C.y;
    let nx = -dy;
    let ny = dx;
    
    // Ensure normal points toward E (mobile side)
    if (nx * (E.x - C.x) + ny * (E.y - C.y) < 0) {
        nx = -nx;
        ny = -ny;
    }
    
    const mag = Math.hypot(nx, ny);
    const n = { x: nx / mag, y: ny / mag };

    // 3. Verify opening constraint: (p' - p) • n >= 0
    // The transformed points should move away from the cut line
    const checkOpening = (p: Point, currentPhi: number) => {
        const c = Math.cos(currentPhi);
        const s = Math.sin(currentPhi);
        const pPrimeX = C.x + (p.x - C.x) * c - (p.y - C.y) * s;
        const pPrimeY = C.y + (p.x - C.x) * s + (p.y - C.y) * c;
        const dispDot = (pPrimeX - p.x) * n.x + (pPrimeY - p.y) * n.y;
        return dispDot >= -1e-4;
    };

    // If opening constraint is violated, flip the sign of phi
    if (!checkOpening(E, phi) || !checkOpening(F, phi)) {
        phi = -phi;
    }

    // 4. Return primitives
    // - phi: opening angle in radians
    // - hinge: point C (start of cut line)
    // - normal: unit normal vector pointing toward mobile side
    return { phi, hinge: C, normal: n };
}

export function calculateResectionPrimitives(points: Point[]) {
    if (points.length < 4) return null;

    const p1 = points[0];
    const p2 = points[1];
    const p3 = points[2];
    const p4 = points[3];

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

    // Lines are undirected: use the smallest rotation that lays one on the other.
    let dTheta = rTarget.angle - rMoving.angle;
    while (dTheta > Math.PI / 2) dTheta -= Math.PI;
    while (dTheta <= -Math.PI / 2) dTheta += Math.PI;
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

/**
 * Vertebral Resection (RESECT)
 * NO MOVEMENT. ONLY ANNOTATION.
 * Visualizes the finite resection slab defined by the intersection of two half-planes.
 */
export function drawResection(
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number
) {
    const primitives = calculateResectionPrimitives(m.points);
    if (!primitives) return;

    const p1 = m.points[0];
    const p2 = m.points[1];
    const p3 = m.points[2];
    const p4 = m.points[3];
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
    m.measurement.hingePoint = hingePoint; // Move Ray 1 to Ray 0

    // Visualisation (annotation only): both endplate lines dashed, the fusion
    // seam solid and finite, correction arc at the moving line.
    const color = toolColor(m.toolKey);
    const target = mid1.y < (p3.y + p4.y) / 2 ? [p3, p4] : [p1, p2];
    strokeLine(ctx, p1, p2, k, color, true);
    strokeLine(ctx, p3, p4, k, color, true);
    const [s0, s1] = extend(target[0], target[1], 0.2, 0.2);
    strokeLine(ctx, s0, s1, k, color);
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    drawArc(ctx, rMoving.origin, Math.max(segLen * 0.4, 20 / k), rMoving.angle, rMoving.angle + dTheta, k, color);
    drawPoints(ctx, [p1, p2, p3, p4], k, color);

    const labelPos = m.measurement.labelPos || { x: mid1.x, y: mid1.y - 40 / k };
    drawLabel(ctx, m.result, labelPos, k, color);
}

// REMOVED drawDeformedResection as per "Forbidden operation: image pixels do not move"
export function drawDeformedResection() {
    // NO-OP for RESECT tool in new model
    return;
}
