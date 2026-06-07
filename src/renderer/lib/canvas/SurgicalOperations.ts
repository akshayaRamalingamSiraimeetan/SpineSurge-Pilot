import { CanvasManager, Point } from './CanvasManager';
import { getPolygonCenter, extrapolateLine } from './GeometryUtils';
export { performOpenOsteotomyOnFragment } from './OpenOsteotomyOperation';

/**
 * Perform a resection osteotomy on a fragment using the fragment-based system
 * 
 * A resection removes a section of bone between two cut lines and closes the gap.
 * This implementation respects the actual cut lines drawn by the user (no forcing to horizontal).
 * 
 * @param {CanvasManager} manager - The canvas manager instance
 * @param {string} fragmentId - ID of the fragment to operate on (optional)
 * @param {Point[]} points - Array of 4 points [A, B, C, D] where:
 *   - A, B: First cut line
 *   - C, D: Second cut line
 * @returns {Promise<Object>} Result object with fragmentIds, removedFragmentId, and closureDistance
 */
export async function performResectionOnFragment(
    manager: CanvasManager,
    _fragmentId: string | null,
    points: Point[]
) {
    if (!manager || !points || points.length !== 4) {
        throw new Error('performResectionOnFragment requires manager and 4 points');
    }

    const [A, B, C, D] = points;

    console.log('[performResectionOnFragment] Starting - Points:', { A, B, C, D });

    // Extrapolate the cut lines to ensure they extend across the entire image
    const line1 = extrapolateLine(A, B, 10000);
    const line2 = extrapolateLine(C, D, 10000);

    console.log('[performResectionOnFragment] Extrapolated cut lines:', { line1, line2 });

    if (!manager.current) throw new Error('No active state');

    manager.beginHistoryTransaction('resection-cut');

    try {
        // 1. Cut along first line (AB)
        console.log('[performResectionOnFragment] Applying first cut from', line1.start, 'to', line1.end);
        const fragmentsBeforeFirstCut = manager.current.data.fragments.length;

        await manager.applyOperation('CUT', {
            startPoint: line1.start,
            endPoint: line1.end
        });

        const fragmentsAfterFirstCut = manager.current.data.fragments.length;
        console.log('[performResectionOnFragment] First cut (AB) complete - Fragments:', fragmentsBeforeFirstCut, '→', fragmentsAfterFirstCut);

        if (fragmentsAfterFirstCut === fragmentsBeforeFirstCut) {
            throw new Error('First cut line did not intersect the image. Please ensure the cut line crosses through the bone.');
        }

        // 2. Cut along second line (CD)
        console.log('[performResectionOnFragment] Applying second cut from', line2.start, 'to', line2.end);
        const fragmentsBeforeSecondCut = manager.current.data.fragments.length;

        await manager.applyOperation('CUT', {
            startPoint: line2.start,
            endPoint: line2.end
        });

        const fragmentsAfterSecondCut = manager.current.data.fragments.length;
        console.log('[performResectionOnFragment] Second cut (CD) complete - Fragments:', fragmentsBeforeSecondCut, '→', fragmentsAfterSecondCut);

        if (fragmentsAfterSecondCut === fragmentsBeforeSecondCut) {
            throw new Error('Second cut line did not intersect the image. Please ensure the cut line crosses through the bone.');
        }

        console.log('[performResectionOnFragment] Total fragments after both cuts:', manager.current.data.fragments.length);

        // Check if we got the expected fragments
        // Note: Depending on previous cuts, we might have more than 3 fragments total, 
        // but this specific operation should ideally work on a single bone piece.
        // The logic below assumes we are looking at the fragments created by the last two cuts.

        // 3. Identify the three fragments: upper, middle (to remove), and lower
        let middleFragment: any = null;
        let upperFragment: any = null;
        let lowerFragment: any = null;

        console.log('[performResectionOnFragment] Identifying fragments...');

        // Calculate which side of each line each fragment center is on for the NEW fragments
        for (const fragment of manager.current.data.fragments) {
            const center = getPolygonCenter(fragment.polygon);

            // Check which side of line1 the center is on
            const dx1 = line1.end.x - line1.start.x;
            const dy1 = line1.end.y - line1.start.y;
            const px1 = center.x - line1.start.x;
            const py1 = center.y - line1.start.y;
            const cross1 = dx1 * py1 - dy1 * px1;

            // Check which side of line2 the center is on
            const dx2 = line2.end.x - line2.start.x;
            const dy2 = line2.end.y - line2.start.y;
            const px2 = center.x - line2.start.x;
            const py2 = center.y - line2.start.y;
            const cross2 = dx2 * py2 - dy2 * px2;

            // The middle fragment is between the two lines (opposite signs)
            // We use a small epsilon for stability
            const eps = 1e-6;
            if ((cross1 > eps && cross2 < -eps) || (cross1 < -eps && cross2 > eps)) {
                middleFragment = fragment;
                console.log('[performResectionOnFragment] ✓ Middle fragment identified:', fragment.id);
            } else {
                // This is an outer fragment (above or below the resection zone)
                if (!upperFragment) {
                    upperFragment = fragment;
                } else if (!lowerFragment) {
                    lowerFragment = fragment;

                    // Determine which is upper vs lower based on Y-coordinate
                    const c1 = getPolygonCenter(upperFragment.polygon);
                    const c2 = getPolygonCenter(lowerFragment.polygon);

                    if (c1.y > c2.y) {
                        const temp = upperFragment;
                        upperFragment = lowerFragment;
                        lowerFragment = temp;
                    }
                } else {
                    // If there are more than 3 fragments, we might need a more robust way to pick the neighbors.
                    // For now, if we have multiple "outer" ones, we might need to compare them to the middle fragment.
                }
            }
        }

        if (!upperFragment || !middleFragment || !lowerFragment) {
            // If we have more fragments, try to refine the identification by checking proximity to middle fragment
            if (middleFragment) {
                const midCenter = getPolygonCenter(middleFragment.polygon);
                const others = manager.current.data.fragments.filter(f => f.id !== middleFragment.id);

                // Pick the two closest fragments in Y
                others.sort((a, b) => {
                    const ca = getPolygonCenter(a.polygon);
                    const cb = getPolygonCenter(b.polygon);
                    return Math.abs(ca.y - midCenter.y) - Math.abs(cb.y - midCenter.y);
                });

                upperFragment = others[0];
                lowerFragment = others[1];

                if (getPolygonCenter(upperFragment.polygon).y > getPolygonCenter(lowerFragment.polygon).y) {
                    const temp = upperFragment;
                    upperFragment = lowerFragment;
                    lowerFragment = temp;
                }
            }
        }

        if (!upperFragment || !middleFragment || !lowerFragment) {
            throw new Error('Could not identify all three fragments (upper, middle, lower).');
        }

        // 4. Calculate transformation to align upper fragment with lower fragment
        // This matches the logic from PlanningTools.drawResection()
        
        // Get midpoints of the cut lines (these will be aligned)
        const upperMid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
        const lowerMid = { x: (C.x + D.x) / 2, y: (C.y + D.y) / 2 };
        
        // Calculate rotation angle (from upper line to lower line)
        const upperAngle = Math.atan2(B.y - A.y, B.x - A.x);
        const lowerAngle = Math.atan2(D.y - C.y, D.x - C.x);
        let rotationAngle = (lowerAngle - upperAngle) * (180 / Math.PI);

        // Normalize to [-180, 180]
        while (rotationAngle > 180) rotationAngle -= 360;
        while (rotationAngle < -180) rotationAngle += 360;

        // Calculate translation vector (from upper midpoint to lower midpoint)
        const translation = {
            x: lowerMid.x - upperMid.x,
            y: lowerMid.y - upperMid.y
        };

        console.log('[performResectionOnFragment] Transformation calculated:');
        console.log('  Upper midpoint:', upperMid);
        console.log('  Lower midpoint:', lowerMid);
        console.log('  Rotation angle:', rotationAngle, 'degrees');
        console.log('  Translation:', translation);

        // 5. Delete the middle fragment
        await manager.applyOperation('DELETE_FRAGMENT', {
            fragmentId: middleFragment.id
        });

        console.log('[performResectionOnFragment] Middle fragment deleted, applying transformation to upper fragment:', upperFragment.id);

        // 6. Apply rotation to upper fragment around the upper midpoint (hinge point)
        if (Math.abs(rotationAngle) > 0.01) {
            console.log('[performResectionOnFragment] Applying rotation:', rotationAngle, 'degrees around', upperMid);
            await manager.applyOperation('ROTATE', {
                fragmentId: upperFragment.id,
                center: upperMid,
                angleDelta: rotationAngle
            });
        }

        // 7. Apply translation to move the rotated upper fragment to align with lower fragment
        if (Math.abs(translation.x) > 0.01 || Math.abs(translation.y) > 0.01) {
            console.log('[performResectionOnFragment] Applying translation:', translation);
            await manager.applyOperation('MOVE', {
                fragmentId: upperFragment.id,
                deltaX: translation.x,
                deltaY: translation.y
            });
        }

        manager.commitHistoryTransaction();

        return {
            fragmentIds: [upperFragment.id, lowerFragment.id],
            removedFragmentId: middleFragment.id,
            rotationAngle: rotationAngle,
            translation: translation
        };
    } catch (error) {
        manager.rollbackHistoryTransaction();
        throw error;
    }
}
