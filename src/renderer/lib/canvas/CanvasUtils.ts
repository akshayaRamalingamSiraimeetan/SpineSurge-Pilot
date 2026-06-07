import { Point } from "./GeometryUtils";

export function drawMeasurementLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    pos: Point,
    k: number,
    color: string = '#ffffff'
) {
    const lines = text.split('\n');
    ctx.save();
    ctx.font = `bold ${13 / k}px Outfit, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const paddingX = 10 / k;
    const paddingY = 6 / k;
    const lineHeight = 18 / k;

    // Calculate max width and total height
    let maxWidth = 0;
    lines.forEach(line => {
        const w = ctx.measureText(line).width;
        if (w > maxWidth) maxWidth = w;
    });

    const rw = maxWidth + paddingX * 2;
    const rh = lines.length * lineHeight + paddingY * 2;

    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4 / k;

    // Draw pill background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.98)';
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(pos.x - paddingX, pos.y - rh / 2, rw, rh, 4 / k);
    } else {
        ctx.rect(pos.x - paddingX, pos.y - rh / 2, rw, rh);
    }
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1 / k;
    ctx.stroke();

    // Draw lines
    ctx.fillStyle = color;
    const startY = pos.y - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, i) => {
        if (line === '---') {
            // Draw horizontal line across the pill
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1 / k;
            ctx.beginPath();
            ctx.moveTo(pos.x - paddingX + 4 / k, startY + i * lineHeight);
            ctx.lineTo(pos.x + maxWidth + paddingX - 4 / k, startY + i * lineHeight);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.fillText(line, pos.x, startY + i * lineHeight);
        }
    });
    ctx.restore();
}
