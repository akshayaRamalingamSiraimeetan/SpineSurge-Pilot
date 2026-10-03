import { Point, getMidpoint, getDistance } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawArc, drawLabel, drawPoints, strokeLine, toolColor } from "@/lib/canvas/annotationStyle";
import { drawFemoralHeads } from "../deformity/tools/BaseTools";

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

    // PI = angle between the S1 endplate normal and the line S1-midpoint → hip
    // axis. Take the normal that points toward the hips so the result is the
    // same for left- and right-facing films (BUGS CV-02).
    const toHip = { x: hipAxisCenter.x - s1_center.x, y: hipAxisCenter.y - s1_center.y };
    let normal = { x: -vec_plate.y, y: vec_plate.x };
    if (normal.x * toHip.x + normal.y * toHip.y < 0) normal = { x: -normal.x, y: -normal.y };
    const nLen = Math.hypot(normal.x, normal.y) || 1;
    const hLen = Math.hypot(toHip.x, toHip.y) || 1;
    const cosPI = Math.max(-1, Math.min(1, (normal.x * toHip.x + normal.y * toHip.y) / (nLen * hLen)));
    const pi_angle = Math.acos(cosPI) * (180 / Math.PI);

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

export function drawPelvicParameters(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    const points = m.points;
    if (points.length < 2) return;
    const color = toolColor(m.toolKey);

    drawFemoralHeads(ctx, points, k, color);
    if (points.length >= 6) drawSacralGeometry(ctx, points, k, color, { pt: true, ss: true });
    drawPoints(ctx, points, k, color);

    const data = calculatePelvicParameters(points);
    if (!data) return;
    m.result = `PI: ${data.pi.toFixed(1)}°
PT: ${data.pt.toFixed(1)}°
SS: ${data.ss.toFixed(1)}°`;
    const labelPos = m.measurement?.labelPos || { x: data.s1_center.x + 60 / k, y: data.s1_center.y };
    drawLabel(ctx, m.result, labelPos, k, color);
}

/**
 * S1 endplate, hip-axis → S1 line, endplate normal + PI arc, and optionally
 * the PT (vertical) and SS (horizontal) references. Shared with PI-LL.
 */
export function drawSacralGeometry(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    k: number,
    color: string,
    opts: { pt?: boolean; ss?: boolean } = {},
) {
    const data = calculatePelvicParameters(points);
    if (!data) return;
    const { hipAxisCenter, s1_center, s1_anterior, s1_posterior, angle_plate } = data;
    const ref = Math.max(getDistance(s1_anterior, s1_posterior) * 1.2, 50 / k);

    strokeLine(ctx, s1_posterior, s1_anterior, k, color);
    strokeLine(ctx, hipAxisCenter, s1_center, k, color);

    // Endplate normal pointing toward the hips → PI arc
    const vSH = { x: hipAxisCenter.x - s1_center.x, y: hipAxisCenter.y - s1_center.y };
    let nx = -Math.sin(angle_plate), ny = Math.cos(angle_plate);
    if (nx * vSH.x + ny * vSH.y < 0) { nx = -nx; ny = -ny; }
    strokeLine(ctx, s1_center, { x: s1_center.x + nx * ref, y: s1_center.y + ny * ref }, k, color, true);
    drawArc(ctx, s1_center, ref * 0.45, Math.atan2(ny, nx), Math.atan2(vSH.y, vSH.x), k, color);

    if (opts.pt) {
        strokeLine(ctx, hipAxisCenter, { x: hipAxisCenter.x, y: hipAxisCenter.y - ref }, k, color, true);
        drawArc(ctx, hipAxisCenter, ref * 0.4, -Math.PI / 2, Math.atan2(s1_center.y - hipAxisCenter.y, s1_center.x - hipAxisCenter.x), k, color);
    }
    if (opts.ss) {
        const signX = Math.sign(Math.cos(angle_plate)) || 1;
        strokeLine(ctx, s1_center, { x: s1_center.x + ref * signX, y: s1_center.y }, k, color, true);
        drawArc(ctx, s1_center, ref * 0.3, signX >= 0 ? 0 : Math.PI, angle_plate, k, color);
    }
}
