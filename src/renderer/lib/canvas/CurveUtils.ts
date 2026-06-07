import { Point, splitPolygonByLine } from './GeometryUtils';

interface Fragment {
    id: string;
    polygon: Point[];
    [key: string]: any;
}

/**
 * Ramer-Douglas-Peucker algorithm for path simplification
 */
export const simplifyPath = (points: Point[], epsilon: number = 2): Point[] => {
    if (points.length < 3) return points;

    const perpendicularDistance = (p: Point, lineStart: Point, lineEnd: Point) => {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;

        if (dx === 0 && dy === 0) {
            return Math.sqrt(Math.pow(p.x - lineStart.x, 2) + Math.pow(p.y - lineStart.y, 2));
        }

        const num = Math.abs(dy * p.x - dx * p.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
        const den = Math.sqrt(dx * dx + dy * dy);
        return num / den;
    };

    const findFurthestPoint = (pts: Point[], a: Point, b: Point) => {
        let maxDist = 0;
        let index = -1;

        for (let i = 0; i < pts.length; i++) {
            const dist = perpendicularDistance(pts[i], a, b);
            if (dist > maxDist) {
                maxDist = dist;
                index = i;
            }
        }

        return { maxDist, index };
    };

    const { maxDist, index } = findFurthestPoint(points, points[0], points[points.length - 1]);

    if (maxDist > epsilon) {
        const left = simplifyPath(points.slice(0, index + 1), epsilon);
        const right = simplifyPath(points.slice(index), epsilon);
        return [...left.slice(0, left.length - 1), ...right];
    } else {
        return [points[0], points[points.length - 1]];
    }
};

/**
 * Process a freehand cut by treating it as a sequence of straight cuts
 */
export const processFreehandCut = (fragments: Fragment[], pathPoints: Point[]): Fragment[] => {
    if (pathPoints.length < 2) return fragments;

    // Simplify path first
    const simplified = simplifyPath(pathPoints, 5); // 5px tolerance

    let currentFragments = [...fragments];

    // Apply cut for each segment in the path
    for (let i = 0; i < simplified.length - 1; i++) {
        const p1 = simplified[i];
        const p2 = simplified[i + 1];

        const nextFragments: Fragment[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars

        for (const frag of currentFragments) {
            // Try to split this fragment with current segment
            const resultPolys = splitPolygonByLine(frag.polygon, p1, p2);

            if (resultPolys.length === 2) {
                // Split occurred
                // Create new fragments (ID generation generally handled by caller, but here we mock/temp)
                nextFragments.push(
                    { ...frag, polygon: resultPolys[0] },
                    { ...frag, polygon: resultPolys[1] }
                );
            } else {
                nextFragments.push(frag);
            }
        }

        currentFragments = nextFragments;
    }

    return currentFragments;
};
