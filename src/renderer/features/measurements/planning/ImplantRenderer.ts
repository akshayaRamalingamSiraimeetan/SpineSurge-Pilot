import { Point } from "@/lib/canvas/CanvasManager";

export interface ImplantProperties {
    type: 'screw' | 'rod' | 'cage' | 'plate';
    length?: number;
    diameter?: number;
    height?: number;
    angle?: number;
    color?: string;
    points?: Point[];
}

export function drawScrew(
    ctx: CanvasRenderingContext2D,
    pos: Point,
    angleDeg: number,
    properties: { length: number; diameter: number },
    k: number,
    color: string = '#cbd5e1'
) {
    const { length, diameter } = properties;
    const rad = (angleDeg * Math.PI) / 180;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(rad);

    // Realistic Screw Body (Gradient)
    const gradient = ctx.createLinearGradient(0, -diameter / 2, 0, diameter / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, '#f1f5f9');
    gradient.addColorStop(1, '#64748b');

    ctx.fillStyle = gradient;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1 / k;

    // Screw Head
    ctx.beginPath();
    ctx.roundRect(-diameter * 0.8, -diameter * 0.8, diameter * 1.6, diameter * 1.6, diameter * 0.4);
    ctx.fill();
    ctx.stroke();

    // Screw Shaft
    ctx.beginPath();
    ctx.moveTo(0, -diameter / 2);
    ctx.lineTo(length, -diameter / 3);
    ctx.lineTo(length + diameter, 0); // Tip
    ctx.lineTo(length, diameter / 3);
    ctx.lineTo(0, diameter / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Threads (Subtle visual texture)
    for (let i = diameter; i < length; i += diameter * 0.8) {
        ctx.beginPath();
        ctx.moveTo(i, -diameter / 2);
        ctx.lineTo(i + diameter * 0.4, diameter / 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Draws the intersection of a 3D screw with a 2D plane.
 * Includes labels for Diameter and Length as shown in the reference.
 */
/**
 * Draws a high-fidelity realistic 2D screw icon (Tulip + Threaded Shaft).
 * Matches the "Realism" requirement from the user reference.
 */
export function drawProjectedScrew(
    ctx: CanvasRenderingContext2D,
    pos: Point,          // Entry point 2D (projected)
    tipPos: Point,       // Tip point 2D (projected)
    params: { radius: number; length: number; headDiameter: number },
    color: string,
    isSelected: boolean = false,
    k: number = 1
) {
    const dx = tipPos.x - pos.x;
    const dy = tipPos.y - pos.y;
    const angle = Math.atan2(dy, dx);
    const dist = Math.sqrt(dx * dx + dy * dy);

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    const themeColor = isSelected ? '#ffffff' : color;
    const shaftRad = params.radius;
    const headRad = params.headDiameter / 2;
    const headHeight = params.headDiameter * 0.8;

    // 1. Draw Infinite Axis Line (Subtle)
    ctx.beginPath();
    ctx.setLineDash([5 / k, 5 / k]);
    ctx.strokeStyle = isSelected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1 / k;
    ctx.moveTo(-1000, 0);
    ctx.lineTo(2000, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Realistic Tulip (U-Shape)
    ctx.fillStyle = isSelected ? themeColor : `${themeColor}cc`;
    ctx.strokeStyle = '#00000033';
    ctx.lineWidth = 1 / k;

    ctx.beginPath();
    // U-Shape profile centered at entry point
    // Points define the "sides" and "bottom" of the tulip slot
    ctx.moveTo(-headHeight * 0.4, -headRad);      // Top outer corner
    ctx.lineTo(headHeight * 0.6, -headRad);       // Tip of one side
    ctx.lineTo(headHeight * 0.6, -headRad * 0.5); // Inner tip
    ctx.lineTo(0, -headRad * 0.5);                // Bottom of slot (one side)
    ctx.lineTo(0, headRad * 0.5);                 // Bottom of slot (other side)
    ctx.lineTo(headHeight * 0.6, headRad * 0.5);  // Inner tip
    ctx.lineTo(headHeight * 0.6, headRad);        // Tip of other side
    ctx.lineTo(-headHeight * 0.4, headRad);       // Bottom outer corner
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Threaded Shaft (Serrated edge)
    ctx.beginPath();
    ctx.moveTo(0, -shaftRad * 0.8);

    const threadCount = 12;
    const step = dist / threadCount;
    for (let i = 0; i <= threadCount; i++) {
        const x = i * step;
        const yOffset = (i % 2 === 0) ? -shaftRad : -shaftRad * 0.7;
        ctx.lineTo(x, yOffset);
    }
    // Rounded Tip
    ctx.arc(dist, 0, shaftRad * 0.7, -Math.PI / 2, Math.PI / 2);

    for (let i = threadCount; i >= 0; i--) {
        const x = i * step;
        const yOffset = (i % 2 === 0) ? shaftRad : shaftRad * 0.7;
        ctx.lineTo(x, yOffset);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Labels (Always prominent if selected)
    if (isSelected) {
        ctx.restore();
        ctx.save();
        ctx.translate(pos.x + dx / 2, pos.y + dy / 2); // Center of shaft for labels

        const labelColor = '#f97316'; // Orange-500
        ctx.fillStyle = labelColor;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2 / k;
        ctx.font = `bold ${14 / k}px Inter, system-ui`;

        const textX = 20 / k;
        ctx.strokeText(`Ø ${params.radius * 2}`, textX, -10 / k);
        ctx.fillText(`Ø ${params.radius * 2}`, textX, -10 / k);

        ctx.strokeText(`↕ ${Math.round(params.length)}.0`, textX, 10 / k);
        ctx.fillText(`↕ ${Math.round(params.length)}.0`, textX, 10 / k);
    }

    ctx.restore();
}

export function drawProjectedCylinder(
    ctx: CanvasRenderingContext2D,
    pos: Point,
    direction: [number, number, number],
    viewPlane: 'axial' | 'sagittal' | 'coronal',
    radius: number,
    color: string
) {
    // Keep for generic rods/cylinders
    const [dx, dy, dz] = direction;
    let cosTheta = 0;
    let angle = 0;

    if (viewPlane === 'axial') {
        cosTheta = Math.abs(dz);
        angle = Math.atan2(dy, dx);
    } else if (viewPlane === 'sagittal') {
        cosTheta = Math.abs(dx);
        angle = Math.atan2(dz, dy);
    } else {
        cosTheta = Math.abs(dy);
        angle = Math.atan2(dz, dx);
    }

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);

    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;

    const majorAxis = radius / Math.max(cosTheta, 0.05);
    ctx.beginPath();
    ctx.ellipse(0, 0, majorAxis, radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

export function drawCage(
    ctx: CanvasRenderingContext2D,
    pos: Point,
    angleDeg: number,
    properties: { width: number; height: number; wedgeAngle?: number },
    k: number,
    color: string = '#10b981'
) {
    const { width, height, wedgeAngle = 0 } = properties;
    const rad = (angleDeg * Math.PI) / 180;
    const wedgeRad = (wedgeAngle * Math.PI) / 180;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(rad);

    // Transparent Body
    ctx.fillStyle = `${color}33`; // 20% opacity
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    // Wedge Geometry
    const h1 = height + Math.tan(wedgeRad / 2) * width;
    const h2 = height - Math.tan(wedgeRad / 2) * width;

    ctx.beginPath();
    ctx.moveTo(-width / 2, -h1 / 2);
    ctx.lineTo(width / 2, -h2 / 2);
    ctx.lineTo(width / 2, h2 / 2);
    ctx.lineTo(-width / 2, h1 / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Internal Grid (Porous structure look)
    ctx.setLineDash([2 / k, 4 / k]);
    ctx.lineWidth = 1 / k;
    for (let x = -width / 2 + 5 / k; x < width / 2; x += 10 / k) {
        ctx.beginPath();
        ctx.moveTo(x, -height); // Simple vertical lines
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.restore();
}

export function drawRod(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    k: number,
    diameter: number = 6,
    color: string = '#94a3b8'
) {
    if (points.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer Stroke (Chrome-like glow)
    ctx.strokeStyle = color;
    ctx.lineWidth = (diameter + 2) / k;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // Inner Highlight
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = diameter / 2 / k;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    ctx.restore();
}

export function drawPlate(
    ctx: CanvasRenderingContext2D,
    pos: Point,
    angleDeg: number,
    properties: { width: number; height: number; holes?: number },
    k: number,
    color: string = '#64748b'
) {
    const { width, height, holes = 2 } = properties;
    const rad = (angleDeg * Math.PI) / 180;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(rad);

    // Plate Body
    const gradient = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, '#94a3b8');
    gradient.addColorStop(1, '#1e293b');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(-width / 2, -height / 2, width, height, width * 0.2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1 / k;
    ctx.stroke();

    // Hole Representations
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    const holeSpacing = height / (holes + 1);
    for (let i = 1; i <= holes; i++) {
        const hY = -height / 2 + i * holeSpacing;
        ctx.beginPath();
        ctx.arc(0, hY, width * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Returns the control points (handles) for an implant in world coordinates.
 */
export function getImplantHandles(implant: any): Point[] {
    const { position: pos, angle, properties } = implant;
    if (!pos || angle === undefined || !properties) return [];

    const rad = (angle * Math.PI) / 180;

    if (implant.type === 'screw') {
        const { length } = properties;
        const tipX = pos.x + Math.cos(rad) * length;
        const tipY = pos.y + Math.sin(rad) * length;
        return [pos, { x: tipX, y: tipY }];
    }

    if (implant.type === 'cage') {
        const { width, height } = properties;
        // Simplified: center, top, bottom handles
        const topX = pos.x - Math.sin(rad) * (height / 2);
        const topY = pos.y + Math.cos(rad) * (height / 2);
        const botX = pos.x + Math.sin(rad) * (height / 2);
        const botY = pos.y - Math.cos(rad) * (height / 2);

        // Also a width handle at the front
        const frontX = pos.x + Math.cos(rad) * (width / 2);
        const frontY = pos.y + Math.sin(rad) * (width / 2);

        return [pos, { x: topX, y: topY }, { x: botX, y: botY }, { x: frontX, y: frontY }];
    }

    if (implant.type === 'rod') {
        return properties.points || [];
    }

    if (implant.type === 'plate') {
        const { height } = properties;
        const topX = pos.x - Math.sin(rad) * (height / 2);
        const topY = pos.y + Math.cos(rad) * (height / 2);
        const botX = pos.x + Math.sin(rad) * (height / 2);
        const botY = pos.y - Math.cos(rad) * (height / 2);
        return [pos, { x: topX, y: topY }, { x: botX, y: botY }];
    }

    return [pos];
}

export function drawImplantHandles(
    ctx: CanvasRenderingContext2D,
    implant: any,
    k: number
) {
    const handles = getImplantHandles(implant);
    if (handles.length === 0) return;

    ctx.save();
    handles.forEach((h, i) => {
        ctx.beginPath();
        // First handle is usually move, others are resize/rotate
        ctx.fillStyle = i === 0 ? '#3b82f6' : '#f59e0b';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 / k;
        ctx.arc(h.x, h.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Add a subtle shadow/glow to make handles more visible
        ctx.shadowBlur = 4 / k;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.stroke();
        ctx.shadowBlur = 0;
    });
    ctx.restore();
}
