import { Point, getMidpoint, getDistance } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";

export function calculatePelvicParameters(points: Point[]) {
    if (points.length < 6) return null;

    // 1. Femoral Heads
    const fh1_p1 = points[0];
    const fh1_p2 = points[1];
    const fh1_center = getMidpoint(fh1_p1, fh1_p2);
    const fh1_radius = getDistance(fh1_p1, fh1_p2) / 2;

    const fh2_p1 = points[2];
    const fh2_p2 = points[3];
    const fh2_center = getMidpoint(fh2_p1, fh2_p2);
    const fh2_radius = getDistance(fh2_p1, fh2_p2) / 2;

    // Hip Axis
    const hipAxisCenter = getMidpoint(fh1_center, fh2_center);

    // 2. S1 Endplate
    // Determine Facing to correctly identify Anterior/Posterior
    // Hips are usually Anterior to Sacrum.
    const raw_s1_1 = points[4];
    const raw_s1_2 = points[5];
    const s1_center = getMidpoint(raw_s1_1, raw_s1_2);

    const isFacingRight = hipAxisCenter.x > s1_center.x;

    // Sort S1 points based on facing:
    // If Facing Right: Anterior is Right (Larger X).
    // If Facing Left: Anterior is Left (Smaller X).
    let s1_anterior, s1_posterior;

    if (isFacingRight) {
        if (raw_s1_1.x > raw_s1_2.x) { s1_anterior = raw_s1_1; s1_posterior = raw_s1_2; }
        else { s1_anterior = raw_s1_2; s1_posterior = raw_s1_1; }
    } else {
        if (raw_s1_1.x < raw_s1_2.x) { s1_anterior = raw_s1_1; s1_posterior = raw_s1_2; }
        else { s1_anterior = raw_s1_2; s1_posterior = raw_s1_1; }
    }

    // Geometry Calculations

    // 1. Sacral Slope (SS)
    // Angle of S1 Endplate relative to Horizontal
    // Vector: Posterior -> Anterior
    const vec_plate = { x: s1_anterior.x - s1_posterior.x, y: s1_anterior.y - s1_posterior.y };
    // Angle of plate vector (radians)
    const angle_plate = Math.atan2(vec_plate.y, vec_plate.x);
    // SS is angle against horizontal (0). 
    const angle_SS = Math.abs(Math.atan(vec_plate.y / vec_plate.x) * (180 / Math.PI));

    // 2. Pelvic Tilt (PT)
    // Angle between Hip-S1 Axis and Vertical.
    // Line: Hip Axis -> S1 Center (This vector points Posteriorly/Upward usually)
    const vec_HS_Axis = { x: s1_center.x - hipAxisCenter.x, y: s1_center.y - hipAxisCenter.y };
    const angle_Axis = Math.atan2(vec_HS_Axis.y, vec_HS_Axis.x) * (180 / Math.PI);
    // Vertical is -90.
    const pt_angle = Math.abs(90 - Math.abs(angle_Axis));

    // 3. Pelvic Incidence (PI)
    // Calculate PI = PT + SS (or geometrically strictly).
    // Angle between Perpendicular to Plate and Hip-S1 Axis.

    const angle_plate_deg = angle_plate * (180 / Math.PI);
    // Perpendicular angle: Plate angle + 90
    // If plate is Down-Right (+45), Perp is Down-Left (+135) [Anterior-Inferior]
    const angle_normal = angle_plate_deg + 90;

    let pi_angle = Math.abs(angle_Axis - angle_normal);
    if (pi_angle > 180) pi_angle = 360 - pi_angle;

    return {
        ss: angle_SS,
        pt: pt_angle,
        pi: pi_angle,
        hipAxisCenter,
        s1_center,
        s1_anterior,
        s1_posterior,
        angle_plate, // radians for drawing
        fh1_center,
        fh2_center
    };
}

export function drawPelvicParameters(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#10b981') {
    const points = m.points;
    if (points.length < 2) return;

    const circleColor = '#06b6d4';

    const drawCircle = (p1: Point, p2: Point) => {
        const center = getMidpoint(p1, p2);
        const radius = getDistance(p1, p2) / 2;
        ctx.save();
        ctx.strokeStyle = circleColor;
        ctx.lineWidth = 1.5 / k;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = circleColor;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 3 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return { center, radius };
    };

    const drawAcuteArc = (center: Point, radius: number, angleStart: number, angleEnd: number, color: string) => {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 / k;
        let diff = angleEnd - angleStart;
        while (diff <= -Math.PI) diff += 2 * Math.PI;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        const counterClockwise = diff < 0;
        ctx.arc(center.x, center.y, radius, angleStart, angleEnd, counterClockwise);
        ctx.stroke();
        ctx.restore();
    };

    const c1 = drawCircle(points[0], points[1]);
    if (points.length < 4) return;
    const c2 = drawCircle(points[2], points[3]);

    ctx.save();
    ctx.strokeStyle = circleColor;
    ctx.setLineDash([4 / k, 4 / k]);
    ctx.lineWidth = 1.5 / k;
    ctx.beginPath();
    ctx.moveTo(c1.center.x, c1.center.y);
    ctx.lineTo(c2.center.x, c2.center.y);
    ctx.stroke();
    ctx.restore();

    if (points.length < 6) return;

    // Use Calculated Data for Consistent Drawing with Auto-Facing logic
    const data = calculatePelvicParameters(points);
    if (!data) return;

    const { ss, pt, pi, hipAxisCenter, s1_center, s1_anterior, s1_posterior, angle_plate } = data;

    // Draw S1 Line
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5 / k;
    ctx.beginPath();
    ctx.moveTo(s1_posterior.x, s1_posterior.y);
    ctx.lineTo(s1_anterior.x, s1_anterior.y);
    ctx.stroke();

    [s1_posterior, s1_anterior].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
    });

    // REF LINES & ARCS =======================

    // 1. HS Line (Hip Axis -> S1 Center)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 / k;
    ctx.beginPath();
    ctx.moveTo(hipAxisCenter.x, hipAxisCenter.y);
    ctx.lineTo(s1_center.x, s1_center.y);
    ctx.stroke();

    // 2. Vertical from Hip Center (PT)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.setLineDash([4 / k, 4 / k]);
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    ctx.moveTo(hipAxisCenter.x, hipAxisCenter.y);
    ctx.lineTo(hipAxisCenter.x, hipAxisCenter.y - 120 / k);
    ctx.stroke();
    ctx.restore();

    // PT Arc (Vertical to HS)
    const angleHS = Math.atan2(s1_center.y - hipAxisCenter.y, s1_center.x - hipAxisCenter.x);
    drawAcuteArc(hipAxisCenter, 40 / k, -Math.PI / 2, angleHS, '#f59e0b');

    // 3. Horizontal from S1 Center (SS)
    // Draw towards Anterior for clarity (Direction of plate vector x component)
    const signX = Math.sign(Math.cos(angle_plate));
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.setLineDash([4 / k, 4 / k]);
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    ctx.moveTo(s1_center.x, s1_center.y);
    ctx.lineTo(s1_center.x + 100 / k * signX, s1_center.y);
    ctx.stroke();
    ctx.restore();

    // SS Arc (Horizontal to Plate)
    // Angle plate is Post->Ant. 
    // Horizontal is 0 (or PI if pointing Left, use signX logic)
    const angleHoriz = signX >= 0 ? 0 : Math.PI;
    drawAcuteArc(s1_center, 30 / k, angleHoriz, angle_plate, color);

    // 4. Perpendicular to S1 Plate (PI)
    // Perpendicular vector should be Anterior-Inferior.
    // Plate vector (dx, dy). Post->Ant.
    const dx = Math.cos(angle_plate);
    const dy = Math.sin(angle_plate);

    // We want perp that points towards the Hip Axis side of the plate roughly.
    // Or strictly: Rotate 90 deg such that it points generally Anterior.
    // If facing Right (Post->Ant is +X, +Y). Anterior is +X side.
    // If facing Left (Post->Ant is -X, +Y). Anterior is -X side.
    // So Norm should have same X-sign as Vector?
    // Let's use Geometry:
    // Rotate +90: (-dy, dx).
    // Rotate -90: (dy, -dx).
    // If Facing Right (dx > 0, dy > 0). +90 is (-y, +x) -> X negative? No.
    // (1, 1) rot 90 is (-1, 1). Points Left (Posterior).
    // -90 is (1, -1). Points Right-Up? 
    // Wait. Canvas Y is Down.
    // Vector (1, 1) is Right-Down.
    // Rotate 90 CW in screen coords (x->-y, y->x). (+y to +x => +x to -y??)
    // Simply: Standard Vector (x,y). Rot 90 CW is (-y, x). Rot 90 CCW is (y, -x).

    // Let's use strict dot product check against S->H vector.
    // We want the perpendicular that creates an acute angle with the S->H vector.
    // (Since PI is typically ~50 deg acute).

    // Vector S->H
    const vSH = { x: hipAxisCenter.x - s1_center.x, y: hipAxisCenter.y - s1_center.y };

    // Candidate 1: (-dy, dx)
    // Candidate 2: (dy, -dx)

    // Dot Product 1
    const p1x = -dy; const p1y = dx;
    const dot1 = p1x * vSH.x + p1y * vSH.y;

    // Use Candidate 1 if Dot > 0 (Acute angle), else Candidate 2.
    let perpx = p1x, perpy = p1y;
    if (dot1 < 0) {
        perpx = -perpx;
        perpy = -perpy;
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.setLineDash([4 / k, 4 / k]);
    ctx.lineWidth = 1 / k;
    const perpLen = 100 / k;
    ctx.beginPath();
    ctx.moveTo(s1_center.x, s1_center.y);
    ctx.lineTo(s1_center.x + perpx * perpLen, s1_center.y + perpy * perpLen);
    ctx.stroke();
    ctx.restore();

    // PI Arc (Perp to S->H)
    const anglePerp = Math.atan2(perpy, perpx);
    const angleSH = Math.atan2(vSH.y, vSH.x);
    drawAcuteArc(s1_center, 45 / k, anglePerp, angleSH, '#ef4444');


    // LABELS =======================
    m.result = `PI: ${pi.toFixed(1)}°\nPT: ${pt.toFixed(1)}°\nSS: ${ss.toFixed(1)}°`;

    const labelPos = m.measurement?.labelPos || {
        x: s1_center.x + 60 / k,
        y: s1_center.y
    };

    drawMeasurementLabel(ctx, m.result, labelPos, k, color);
}
