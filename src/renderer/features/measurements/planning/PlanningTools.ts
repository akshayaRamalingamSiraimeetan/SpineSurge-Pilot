import { Measurement, Point } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";
import { drawAngleArc } from "../deformity/DeformityTools";

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
     * DRAWING
     * ------------------------------------------------- */
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 / k;

    const L_line = 10000;

    if (type === 'OPEN') {
        const [A, B, C, D, E, F] = m.points;

        // Render only completed line segments (no auxiliary geometry)
        ctx.lineWidth = 3 / k;

        // 1. Upper Reference Line (A-B) - Blue (finite segment, not extrapolated)
        // Requirements: 2.1, 3.4
        if (A && B) {
            ctx.strokeStyle = '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(B.x, B.y);
            ctx.stroke();
        }

        // 2. Cut Line (C-D) - Red (extrapolated to image bounds)
        // Requirements: 2.2, 3.1, 3.2, 3.3
        if (C && D) {
            ctx.strokeStyle = '#ef4444';
            const angCD = Math.atan2(D.y - C.y, D.x - C.x);
            ctx.beginPath();
            ctx.moveTo(C.x - Math.cos(angCD) * L_line, C.y - Math.sin(angCD) * L_line);
            ctx.lineTo(C.x + Math.cos(angCD) * L_line, C.y + Math.sin(angCD) * L_line);
            ctx.stroke();
        }

        // 3. Lower Reference Line (E-F) - Green (finite segment, not extrapolated)
        // Requirements: 2.3, 3.5
        if (E && F) {
            ctx.strokeStyle = '#10b981';
            ctx.beginPath();
            ctx.moveTo(E.x, E.y);
            ctx.lineTo(F.x, F.y);
            ctx.stroke();
        }

        // Render Point Markers
        // Requirements: 2.4 (visual feedback for each completed pair)
        m.points.forEach((p, i) => {
            if (i < 2) ctx.fillStyle = '#3b82f6'; // A,B
            else if (i < 4) ctx.fillStyle = '#ef4444'; // C,D
            else ctx.fillStyle = '#10b981'; // E,F

            ctx.beginPath();
            ctx.arc(p.x, p.y, 6 / k, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = `${12 / k}px Inter`;
            ctx.fillText(String.fromCharCode(65 + i), p.x + 8 / k, p.y + 8 / k);
        });

        // Dashboard/Labels for Completed Osteotomy
        if (m.points.length >= 6) {
            const { phi, hinge, normal } = calculateOpenOsteotomyPrimitives(m.points);

            m.measurement.rotationAngleRad = phi;
            m.measurement.hingePoint = hinge;
            m.measurement.cutRays = [{ origin: hinge, angle: Math.atan2(m.points[3].y - m.points[2].y, m.points[3].x - m.points[2].x) }];
            m.measurement.normal = normal;

            const labelPos = { x: hinge.x + 20 / k, y: hinge.y - 40 / k };
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

    // Shade Wedge for Closing Wedge (PSO/SPO)
    if (isClosingWedge && m.measurement.cutRays.length === 2) {
        ctx.save();
        ctx.fillStyle = `${color}33`; // Semi-transparent pink
        ctx.beginPath();
        ctx.moveTo(hinge.x, hinge.y);

        const r1 = m.measurement.cutRays[0];
        const r2 = m.measurement.cutRays[1];
        const rad = 1000 / k; // Limit wedge shading to a reasonable distance

        ctx.lineTo(hinge.x + Math.cos(r1.angle) * rad, hinge.y + Math.sin(r1.angle) * rad);
        ctx.lineTo(hinge.x + Math.cos(r2.angle) * rad, hinge.y + Math.sin(r2.angle) * rad);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // Hinge point
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(hinge.x, hinge.y, 6 / k, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1 / k;
    ctx.stroke();

    // Rotation arc
    drawAngleArc(ctx, hinge, 150 / k, angMoving, angMoving + theta, k, color);

    // Label
    const labelPrefix = type === 'OPEN' ? 'Opening' : 'Correction';
    // Position label near the moving segment's posterior side
    const labelPos = m.measurement.labelPos || { x: P.x + 20 / k, y: P.y - 40 / k };
    drawMeasurementLabel(ctx, `${labelPrefix}: ${Math.abs(theta * 180 / Math.PI).toFixed(1)}°`, labelPos, k, color);

    ctx.restore();
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
    
    // Normalize angle to [-π, π]
    while (phi > Math.PI) phi -= 2 * Math.PI;
    while (phi < -Math.PI) phi += 2 * Math.PI;

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

    // 3. VISUALIZATION
    ctx.save();
    ctx.lineWidth = 2.5 / k;
    const L = 10000;

    // 2. Draw Seam Line (at Lower Line position, where they join)
    // Indicates the surgical cut / fusion line.
    ctx.strokeStyle = '#f472b6'; // Pink
    ctx.lineWidth = 4 / k; // Thicker line for the seam
    ctx.setLineDash([10, 5]); // Dashed
    ctx.moveTo(rTarget.origin.x - Math.cos(rTarget.angle) * L, rTarget.origin.y - Math.sin(rTarget.angle) * L);
    ctx.lineTo(rTarget.origin.x + Math.cos(rTarget.angle) * L, rTarget.origin.y + Math.sin(rTarget.angle) * L);
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    drawAngleArc(ctx, rMoving.origin, 150 / k, rMoving.angle, rMoving.angle + dTheta, k, '#f472b6');

    // Cut Rays loop removed to clear solid lines. 
    // Only the Seam Line (dashed) is drawn now.

    // Points
    ctx.fillStyle = '#ffffff';
    [p1, p2, p3, p4].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });

    // Label
    drawMeasurementLabel(ctx, `Resection: ${Math.abs(dTheta * 180 / Math.PI).toFixed(1)}°`, { x: mid1.x, y: mid1.y - 40 / k }, k, '#f472b6');
    ctx.restore();
}

// REMOVED drawDeformedResection as per "Forbidden operation: image pixels do not move"
export function drawDeformedResection() {
    // NO-OP for RESECT tool in new model
    return;
}
