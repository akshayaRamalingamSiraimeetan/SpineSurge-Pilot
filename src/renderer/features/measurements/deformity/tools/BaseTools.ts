import { Point, getMidpoint, getDistance } from "@/lib/canvas/GeometryUtils";

export function drawAngleArc(ctx: CanvasRenderingContext2D, center: Point, radius: number, startAngle: number, endAngle: number, k: number, color: string) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 / k;
    let diff = endAngle - startAngle;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    const counterClockwise = diff < 0;
    ctx.arc(center.x, center.y, radius, startAngle, endAngle, counterClockwise);
    ctx.stroke();
    ctx.restore();
}

export function getHipAxisCenter(points: Point[]) {
    if (points.length < 4) return null;
    const fh1 = getMidpoint(points[0], points[1]);
    const fh2 = getMidpoint(points[2], points[3]);
    return getMidpoint(fh1, fh2);
}

export function drawFemoralHeads(ctx: CanvasRenderingContext2D, points: Point[], k: number) {
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
        return center;
    };
    if (points.length >= 2) drawCircle(points[0], points[1]);
    if (points.length >= 4) {
        const c1 = getMidpoint(points[0], points[1]);
        const c2 = getMidpoint(points[2], points[3]);
        drawCircle(points[2], points[3]);
        ctx.save();
        ctx.strokeStyle = circleColor;
        ctx.setLineDash([4 / k, 4 / k]);
        ctx.lineWidth = 1.5 / k;
        ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
        ctx.restore();
    }
}
