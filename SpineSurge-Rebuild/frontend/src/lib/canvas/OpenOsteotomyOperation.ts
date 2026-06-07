import { CanvasManager, type Point } from './CanvasManager';
import { GeometryEngine, type Rectangle } from './GeometryEngine';
import { ValidationEngine } from './ValidationEngine';
import { type Fragment as SplitterFragment } from './FragmentSplitter';
import { TransformationCalculator } from './TransformationCalculator';
import { GapRenderer } from './GapRenderer';

/**
 * OpenOsteotomyOperation: Production-ready implementation of opening wedge osteotomy.
 * 
 * This class manages the six-point workflow for open osteotomy surgical planning:
 * 1. Accept six user-placed points defining three independent line pairs (AB, CD, EF)
 * 2. Validate configuration for degenerate cases
 * 3. Extrapolate middle line CD to image bounds (C′D′)
 * 4. Split image into exactly two fragments along C′D′
 * 5. Apply rigid-body transformations to align fragments with reference lines
 * 6. Generate and visualize gap polygon between transformed fragments
 * 
 * The implementation emphasizes:
 * - Geometric correctness using pixel-center tests
 * - Clear separation of concerns via specialized components
 * - Numerical robustness for close points and near-parallel lines
 * - Degenerate configuration detection without state modification
 * - Backward compatibility with existing public API
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 13.1, 13.2, 13.3, 13.5
 */
export class OpenOsteotomyOperation {
    private points: Point[] = [];
    private canvasManager: CanvasManager;

    constructor(canvasManager: CanvasManager) {
        this.canvasManager = canvasManager;
    }

    /**
     * Adds a point to the operation (A through F in sequence).
     * 
     * Points are added in order:
     * - Points 0-1: A, B (upper reference line)
     * - Points 2-3: C, D (middle cut line)
     * - Points 4-5: E, F (lower reference line)
     * 
     * Each point must be within the image boundary.
     * 
     * @param x X-coordinate of the point
     * @param y Y-coordinate of the point
     * @returns Object with pointCount and isComplete flag
     * 
     * Requirements: 1.1, 1.2, 1.3, 1.4, 13.1
     */
    addPoint(x: number, y: number): { pointCount: number; isComplete: boolean } {
        if (this.points.length < 6) {
            this.points.push({ x, y });
        }
        return {
            pointCount: this.points.length,
            isComplete: this.points.length === 6
        };
    }

    /**
     * Executes the open osteotomy operation (public API maintained for compatibility).
     * 
     * This method maintains the existing signature for backward compatibility.
     * The parameters phi, H, and n are legacy parameters that are no longer used
     * in the new implementation. The operation is now fully determined by the
     * six points (A-F) stored via addPoint().
     * 
     * @param _phi Legacy parameter (unused)
     * @param _H Legacy parameter (unused)
     * @param _n Legacy parameter (unused)
     * @returns Operation result with ok flag and optional reason/data
     * 
     * Requirements: 13.2, 13.5
     */
    async execute(_phi: number, _H: Point, _n: Point): Promise<OperationResult> {
        return await this.executeNew();
    }

    /**
     * Resets the operation to start over.
     * 
     * Clears all stored points, allowing a new six-point sequence to begin.
     * 
     * Requirements: 13.3
     */
    reset(): void {
        this.points = [];
    }

    /**
     * Executes the open osteotomy operation using the new algorithm.
     * 
     * This is the core implementation that uses the new component architecture:
     * 
     * Algorithm:
     * 1. Validate six-point configuration for degenerate cases
     * 2. Extract point pairs: AB (upper ref), CD (cut), EF (lower ref)
     * 3. Extrapolate CD to image bounds → C′D′
     * 4. Get current image data from canvas
     * 5. Split image along C′D′ into upper and lower fragments
     * 6. Calculate rigid-body transformations for each fragment
     * 7. Apply transformations to fragments
     * 8. Compute gap polygon between transformed fragments
     * 9. Render gap and fragments to canvas
     * 10. Update canvas manager state
     * 
     * Degenerate Configuration Handling:
     * If validation detects any degenerate configuration (coincident points,
     * parallel lines, zero-width cut), the method returns {ok: false, reason: "degenerate"}
     * without modifying any state. This ensures the image and existing fragments
     * remain unchanged when invalid configurations are detected.
     * 
     * @returns Operation result with ok flag, optional reason, and operation data
     * 
     * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4,
     *              5.1, 5.5, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2,
     *              8.3, 8.4, 8.5, 10.1, 10.2, 10.3, 10.4, 10.5, 13.5
     */
    private async executeNew(): Promise<OperationResult> {
        console.log('[OpenOsteotomyOperation] ========== STARTING OPEN OSTEOTOMY ==========');
        console.log('[OpenOsteotomyOperation] Points:', this.points);
        
        // Ensure we have exactly 6 points
        if (this.points.length !== 6) {
            console.error('[OpenOsteotomyOperation] ERROR: Need exactly 6 points, got:', this.points.length);
            return {
                ok: false,
                reason: "degenerate"
            };
        }

        // Get image bounds from canvas manager
        const imageBounds = this.getImageBounds();
        if (!imageBounds) {
            console.error('[OpenOsteotomyOperation] ERROR: Could not get image bounds');
            return {
                ok: false,
                reason: "degenerate"
            };
        }

        console.log('[OpenOsteotomyOperation] Image bounds:', imageBounds);

        // Step 1: Validate configuration for degenerate cases
        const validation = ValidationEngine.validateConfiguration(this.points, imageBounds);
        if (!validation.ok) {
            console.error('[OpenOsteotomyOperation] ERROR: Validation failed:', validation.reason);
            return {
                ok: false,
                reason: validation.reason
            };
        }

        console.log('[OpenOsteotomyOperation] ✓ Validation passed');

        // Step 2: Extract point pairs
        const [A, B, C, D, E, F] = this.points;
        console.log('[OpenOsteotomyOperation] Point pairs:');
        console.log('  AB (upper ref):', A, B);
        console.log('  CD (cut line):', C, D);
        console.log('  EF (lower ref):', E, F);

        // Step 3: Extrapolate CD to image bounds
        const cutLineExtended = GeometryEngine.extrapolateToImageBounds(C, D, imageBounds);
        if (!cutLineExtended) {
            console.error('[OpenOsteotomyOperation] ERROR: Could not extrapolate cut line');
            return {
                ok: false,
                reason: "degenerate"
            };
        }

        console.log('[OpenOsteotomyOperation] ✓ Cut line extrapolated:', cutLineExtended);
        console.log('[OpenOsteotomyOperation] IMPORTANT: This is the ONLY cut that should happen!');

        // Step 4: Get current image data and identify the fragment to cut
        // We need to find the main fragment (usually the first/largest one)
        const beforeFragments = this.canvasManager.current?.data.fragments || [];
        
        if (beforeFragments.length === 0) {
            console.error('[OpenOsteotomyOperation] ERROR: No fragments found');
            return {
                ok: false,
                reason: "degenerate"
            };
        }

        console.log('[OpenOsteotomyOperation] Fragments before cut:', beforeFragments.length);

        // Find the fragment that contains all 6 points (or the largest fragment)
        let targetFragment = beforeFragments[0];
        for (const frag of beforeFragments) {
            // Check if all points are within this fragment's bounds
            const allPointsInside = this.points.every(p => 
                this.isPointInPolygon(p, frag.polygon)
            );
            if (allPointsInside) {
                targetFragment = frag;
                break;
            }
        }

        console.log('[OpenOsteotomyOperation] Target fragment to cut:', targetFragment.id);
        console.log('[OpenOsteotomyOperation] ========== PERFORMING CUT OPERATION ==========');

        this.canvasManager.beginHistoryTransaction('open-osteotomy-cut');

        try {

        const beforeIds = new Set(beforeFragments.map(f => f.id));

        // Perform the cut using CanvasManager - only on the target fragment
        await this.canvasManager.applyOperation('CUT', {
            startPoint: cutLineExtended.start,
            endPoint: cutLineExtended.end,
            fragmentId: targetFragment.id  // Specify which fragment to cut
        });

        console.log('[OpenOsteotomyOperation] ✓ CUT operation completed');

        // Get the newly created fragments
        const currentFragments = this.canvasManager.current?.data.fragments || [];
        const newFragments = currentFragments.filter(f => !beforeIds.has(f.id));

        console.log('[OpenOsteotomyOperation] Fragments after cut:', currentFragments.length);
        console.log('[OpenOsteotomyOperation] New fragments created:', newFragments.length);

        if (newFragments.length !== 2) {
            // If we didn't get exactly 2 fragments, something went wrong
            console.error('[OpenOsteotomyOperation] ERROR: Expected 2 new fragments, got:', newFragments.length);
            this.canvasManager.rollbackHistoryTransaction();
            return {
                ok: false,
                reason: "degenerate"
            };
        }

        console.log('[OpenOsteotomyOperation] ✓ Got exactly 2 fragments as expected');
        console.log('[OpenOsteotomyOperation] ========== NO MORE CUTS SHOULD HAPPEN ==========');

        // Step 5: Identify upper and lower fragments
        // Upper fragment has lower average y-coordinate (top of image)
        const [fragment1, fragment2] = newFragments;
        const avgY1 = fragment1.polygon.reduce((sum, p) => sum + p.y, 0) / fragment1.polygon.length;
        const avgY2 = fragment2.polygon.reduce((sum, p) => sum + p.y, 0) / fragment2.polygon.length;
        
        const upperFragment = avgY1 < avgY2 ? fragment1 : fragment2;
        const lowerFragment = avgY1 < avgY2 ? fragment2 : fragment1;

        console.log('[OpenOsteotomyOperation] Upper fragment:', upperFragment.id, 'avgY:', avgY1 < avgY2 ? avgY1 : avgY2);
        console.log('[OpenOsteotomyOperation] Lower fragment:', lowerFragment.id, 'avgY:', avgY1 < avgY2 ? avgY2 : avgY1);

        // Step 6: Create line objects for transformation calculation
        const lineAB = GeometryEngine.createLine(A, B);
        const lineCD = GeometryEngine.createLine(cutLineExtended.start, cutLineExtended.end);
        const lineEF = GeometryEngine.createLine(E, F);

        console.log('[OpenOsteotomyOperation] Line angles:');
        console.log('  AB:', (lineAB.angle * 180 / Math.PI).toFixed(2), '°');
        console.log('  CD:', (lineCD.angle * 180 / Math.PI).toFixed(2), '°');
        console.log('  EF:', (lineEF.angle * 180 / Math.PI).toFixed(2), '°');

        // Convert CanvasManager fragments to FragmentSplitter format
        const upperFragmentSplitter: SplitterFragment = {
            id: upperFragment.id,
            pixels: new ImageData(1, 1), // Placeholder - not used for transformation
            polygon: upperFragment.polygon,
            bounds: {
                x: Math.min(...upperFragment.polygon.map(p => p.x)),
                y: Math.min(...upperFragment.polygon.map(p => p.y)),
                width: Math.max(...upperFragment.polygon.map(p => p.x)) - Math.min(...upperFragment.polygon.map(p => p.x)),
                height: Math.max(...upperFragment.polygon.map(p => p.y)) - Math.min(...upperFragment.polygon.map(p => p.y))
            }
        };

        const lowerFragmentSplitter: SplitterFragment = {
            id: lowerFragment.id,
            pixels: new ImageData(1, 1), // Placeholder - not used for transformation
            polygon: lowerFragment.polygon,
            bounds: {
                x: Math.min(...lowerFragment.polygon.map(p => p.x)),
                y: Math.min(...lowerFragment.polygon.map(p => p.y)),
                width: Math.max(...lowerFragment.polygon.map(p => p.x)) - Math.min(...lowerFragment.polygon.map(p => p.x)),
                height: Math.max(...lowerFragment.polygon.map(p => p.y)) - Math.min(...lowerFragment.polygon.map(p => p.y))
            }
        };

        // Step 7: Calculate transformations
        console.log('[OpenOsteotomyOperation] ========== CALCULATING TRANSFORMATIONS ==========');
        
        const upperTransform = TransformationCalculator.calculateUpperTransform(
            upperFragmentSplitter,
            lineAB,
            lineCD
        );

        const lowerTransform = TransformationCalculator.calculateLowerTransform(
            lowerFragmentSplitter,
            lineEF,
            lineCD
        );

        console.log('[OpenOsteotomyOperation] Upper transform:');
        console.log('  Rotation:', (upperTransform.rotation * 180 / Math.PI).toFixed(2), '°');
        console.log('  Translation:', upperTransform.translation);
        console.log('  Center:', upperTransform.center);
        
        console.log('[OpenOsteotomyOperation] Lower transform:');
        console.log('  Rotation:', (lowerTransform.rotation * 180 / Math.PI).toFixed(2), '°');
        console.log('  Translation:', lowerTransform.translation);
        console.log('  Center:', lowerTransform.center);

        // Step 8: Apply transformations using CanvasManager operations
        console.log('[OpenOsteotomyOperation] ========== APPLYING TRANSFORMATIONS ==========');
        console.log('[OpenOsteotomyOperation] NOTE: Only ROTATE and MOVE operations, NO additional cuts!');
        
        // First rotate, then translate
        const upperRotationDeg = upperTransform.rotation * (180 / Math.PI);
        const lowerRotationDeg = lowerTransform.rotation * (180 / Math.PI);

        console.log('[OpenOsteotomyOperation] Applying ROTATE to upper fragment...');
        await this.canvasManager.applyOperation('ROTATE', {
            fragmentId: upperFragment.id,
            angleDelta: upperRotationDeg,
            center: upperTransform.center
        });

        console.log('[OpenOsteotomyOperation] Applying ROTATE to lower fragment...');
        await this.canvasManager.applyOperation('ROTATE', {
            fragmentId: lowerFragment.id,
            angleDelta: lowerRotationDeg,
            center: lowerTransform.center
        });

        // Apply translations
        console.log('[OpenOsteotomyOperation] Applying MOVE to upper fragment...');
        await this.canvasManager.applyOperation('MOVE', {
            fragmentId: upperFragment.id,
            deltaX: upperTransform.translation.x,
            deltaY: upperTransform.translation.y
        });

        console.log('[OpenOsteotomyOperation] Applying MOVE to lower fragment...');
        await this.canvasManager.applyOperation('MOVE', {
            fragmentId: lowerFragment.id,
            deltaX: lowerTransform.translation.x,
            deltaY: lowerTransform.translation.y
        });

        console.log('[OpenOsteotomyOperation] ✓ All transformations applied');
        console.log('[OpenOsteotomyOperation] ========== OPERATION COMPLETE ==========');
        
        // Log final fragment positions to check if they're outside image bounds
        const finalFragments = this.canvasManager.current?.data.fragments || [];
        console.log('[OpenOsteotomyOperation] FINAL FRAGMENT POSITIONS:');
        finalFragments.forEach((frag, i) => {
            const bounds = {
                minX: Math.min(...frag.polygon.map(p => p.x)),
                maxX: Math.max(...frag.polygon.map(p => p.x)),
                minY: Math.min(...frag.polygon.map(p => p.y)),
                maxY: Math.max(...frag.polygon.map(p => p.y))
            };
            console.log(`[OpenOsteotomyOperation]   Fragment ${i+1} (${frag.id}):`);
            console.log(`[OpenOsteotomyOperation]     Bounds: (${bounds.minX.toFixed(1)}, ${bounds.minY.toFixed(1)}) to (${bounds.maxX.toFixed(1)}, ${bounds.maxY.toFixed(1)})`);
            console.log(`[OpenOsteotomyOperation]     Image bounds: (0, 0) to (${imageBounds.width}, ${imageBounds.height})`);
            
            // Check if fragment is outside image bounds
            const outsideLeft = bounds.maxX < 0;
            const outsideRight = bounds.minX > imageBounds.width;
            const outsideTop = bounds.maxY < 0;
            const outsideBottom = bounds.minY > imageBounds.height;
            
            if (outsideLeft || outsideRight || outsideTop || outsideBottom) {
                console.warn(`[OpenOsteotomyOperation]     ⚠️  Fragment is OUTSIDE image bounds!`);
            }
            
            // Check if fragment extends significantly outside bounds
            const leftOverhang = Math.max(0, -bounds.minX);
            const rightOverhang = Math.max(0, bounds.maxX - imageBounds.width);
            const topOverhang = Math.max(0, -bounds.minY);
            const bottomOverhang = Math.max(0, bounds.maxY - imageBounds.height);
            
            if (leftOverhang > 10 || rightOverhang > 10 || topOverhang > 10 || bottomOverhang > 10) {
                console.warn(`[OpenOsteotomyOperation]     ⚠️  Fragment extends significantly outside bounds:`);
                console.warn(`[OpenOsteotomyOperation]       Left: ${leftOverhang.toFixed(1)}px, Right: ${rightOverhang.toFixed(1)}px, Top: ${topOverhang.toFixed(1)}px, Bottom: ${bottomOverhang.toFixed(1)}px`);
            }
        });
        
        // Log the complete history to verify operation count
        const history = this.canvasManager.getHistory();
        console.log('[OpenOsteotomyOperation] FINAL HISTORY CHECK:');
        console.log('[OpenOsteotomyOperation] Total operations in history:', history.length);
        history.slice(-10).forEach((h, i) => {
            console.log(`[OpenOsteotomyOperation]   ${i}: ${h.description} (${h.isCurrent ? 'CURRENT' : ''})`);
        });

        // Step 9: Compute gap polygon
        const gapPolygon = GapRenderer.computeGapPolygon(
            upperFragmentSplitter,
            lowerFragmentSplitter,
            upperTransform,
            lowerTransform
        );

        // Step 10: Return success result
        this.canvasManager.commitHistoryTransaction();
        return {
            ok: true,
            fragmentIds: [upperFragment.id, lowerFragment.id],
            gapPolygon: gapPolygon.vertices,
            transformations: {
                upper: upperTransform,
                lower: lowerTransform
            }
        };
        } catch (error) {
            console.error('[OpenOsteotomyOperation] ERROR during transactional operation:', error);
            this.canvasManager.rollbackHistoryTransaction();
            return {
                ok: false,
                reason: "degenerate"
            };
        }
    }

    /**
     * Gets the image bounds from the canvas manager.
     * 
     * The image bounds are determined by the first fragment in the current state,
     * which represents the original image before any operations.
     * 
     * @returns Rectangle representing the image bounds, or null if unavailable
     */
    private getImageBounds(): Rectangle | null {
        if (!this.canvasManager.current) {
            return null;
        }

        const fragments = this.canvasManager.current.data.fragments;
        if (fragments.length === 0) {
            return null;
        }

        // Use the first fragment's dimensions as image bounds
        const firstFragment = fragments[0];
        return {
            x: 0,
            y: 0,
            width: firstFragment.imageWidth,
            height: firstFragment.imageHeight
        };
    }

    /**
     * Checks if a point is inside a polygon using ray-casting algorithm.
     * 
     * @param point Point to test
     * @param polygon Array of points forming the polygon
     * @returns true if point is inside polygon, false otherwise
     */
    private isPointInPolygon(point: Point, polygon: Point[]): boolean {
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
}

/**
 * Result object returned by the execute operation.
 * 
 * Success case (ok: true):
 * - fragmentIds: IDs of the two created fragments (upper and lower)
 * - gapPolygon: Vertices of the gap polygon for visualization
 * - transformations: Rigid-body transforms applied to each fragment
 * 
 * Failure case (ok: false):
 * - reason: "degenerate" indicating invalid configuration
 * 
 * Requirements: 13.5
 */
export interface OperationResult {
    ok: boolean;
    reason?: string;
    fragmentIds?: string[];
    gapPolygon?: Point[];
    transformations?: {
        upper: {
            rotation: number;
            translation: Point;
            center: Point;
        };
        lower: {
            rotation: number;
            translation: Point;
            center: Point;
        };
    };
}

/**
 * Convenience wrapper for the open osteotomy operation.
 * 
 * This wrapper maintains backward compatibility with existing code that uses
 * the performOpenOsteotomyOnFragment function. It creates an OpenOsteotomyOperation
 * instance, adds the six context points, and executes the operation.
 * 
 * The parameters phi, H, and n are legacy parameters maintained for API compatibility
 * but are no longer used in the new implementation. The operation is fully determined
 * by the six context points.
 * 
 * @param manager CanvasManager instance
 * @param phi Legacy parameter (unused)
 * @param H Legacy parameter (unused)
 * @param n Legacy parameter (unused)
 * @param contextPoints Array of six points [A, B, C, D, E, F]
 * @returns Operation result
 * 
 * Requirements: 13.4
 */
export async function performOpenOsteotomyOnFragment(
    manager: CanvasManager,
    phi: number,
    H: Point,
    n: Point,
    contextPoints: Point[]
): Promise<OperationResult> {
    const operation = new OpenOsteotomyOperation(manager);
    contextPoints.forEach(p => operation.addPoint(p.x, p.y));
    return await operation.execute(phi, H, n);
}
