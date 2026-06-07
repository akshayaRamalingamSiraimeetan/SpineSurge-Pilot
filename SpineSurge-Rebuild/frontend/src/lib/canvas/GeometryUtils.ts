export interface Point {
    x: number;
    y: number;
}

// Calculate angle between three points (center is the vertex)
export function calculateAngle(center: Point, p1: Point, p2: Point): number {
    const ang1 = Math.atan2(p1.y - center.y, p1.x - center.x);
    const ang2 = Math.atan2(p2.y - center.y, p2.x - center.x);
    let deg = (ang2 - ang1) * (180 / Math.PI);

    // Normalize to positive angle
    if (deg < 0) deg += 360;

    // Return the smaller angle
    if (deg > 180) deg = 360 - deg;

    return deg;
}

// Check if a point is inside a polygon (Ray-casting algorithm)
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Split a polygon by a line (p1 -> p2)
// Returns array of polygons. If no cut, returns original wrapped in array.
export function splitPolygonByLine(polygon: Point[], lineStart: Point, lineEnd: Point): Point[][] {
    // A line equation: Ax + By + C = 0
    const A = lineStart.y - lineEnd.y;
    const B = lineEnd.x - lineStart.x;
    const C = -A * lineStart.x - B * lineStart.y;

    const classify = (pt: Point) => A * pt.x + B * pt.y + C;

    const poly1: Point[] = [];
    const poly2: Point[] = [];

    const getIntersection = (p1: Point, p2: Point, p3: Point, p4: Point): Point | null => {
        const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
        if (denom === 0) return null; // Parallel

        const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
        // const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

        if (ua >= 0 && ua <= 1) { // Removed ub check for now as we just need line segment vs infinite line locally logic can be refined
            return {
                x: p1.x + ua * (p2.x - p1.x),
                y: p1.y + ua * (p2.y - p1.y)
            };
        }
        return null;
    };

    for (let i = 0; i < polygon.length; i++) {
        const curr = polygon[i];
        const next = polygon[(i + 1) % polygon.length];

        const c1 = classify(curr);
        const c2 = classify(next);

        if (c1 >= 0) poly1.push(curr);
        if (c1 <= 0) poly2.push(curr);

        // If spanning the line, add intersection to both
        if ((c1 > 0 && c2 < 0) || (c1 < 0 && c2 > 0)) {
            const intersect = getIntersection(curr, next, lineStart, lineEnd);
            if (intersect) {
                poly1.push({ x: intersect.x, y: intersect.y });
                poly2.push({ x: intersect.x, y: intersect.y });
            }
        }
    }

    if (poly1.length < 3 || poly2.length < 3) {
        // Cut didn't verify or grazed edge
        return [polygon];
    }

    return [poly1, poly2];
}

export function getDistance(p1: Point, p2: Point): number {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function getMidpoint(p1: Point, p2: Point): Point {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

export function getHipAxisCenter(points: Point[]): Point {
    if (points.length < 4) return { x: 0, y: 0 };
    const fh1 = getMidpoint(points[0], points[1]);
    const fh2 = getMidpoint(points[2], points[3]);
    return getMidpoint(fh1, fh2);
}

export function getLineLinesIntersection(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;

    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom === 0) return null; // Parallel

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    return {
        x: x1 + ua * (x2 - x1),
        y: y1 + ua * (y2 - y1)
    };
}

export function getPolygonCenter(polygon: Point[]): Point {
    let x = 0, y = 0;
    polygon.forEach(p => { x += p.x; y += p.y; });
    return { x: x / polygon.length, y: y / polygon.length };
}

export function getPolylineLength(points: Point[]): number {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
        length += getDistance(points[i], points[i + 1]);
    }
    return length;
}

export function getPolygonArea(points: Point[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return Math.abs(area / 2);
}

export function getPolygonPerimeter(points: Point[]): number {
    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        perimeter += getDistance(points[i], points[j]);
    }
    return perimeter;
}

export function extrapolateLine(p1: Point, p2: Point, length: number): { start: Point, end: Point } {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / mag;
    const uy = dy / mag;

    return {
        start: {
            x: p1.x - ux * length,
            y: p1.y - uy * length
        },
        end: {
            x: p2.x + ux * length,
            y: p2.y + uy * length
        }
    };
}
