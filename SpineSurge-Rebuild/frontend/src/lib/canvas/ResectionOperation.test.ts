import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasManager, StateNode, type Fragment } from './CanvasManager';
import { performResectionOnFragment } from './SurgicalOperations';

describe('ResectionOperation', () => {
    let manager: CanvasManager;

    beforeEach(() => {
        manager = new CanvasManager();
        
        // Create a simple test fragment manually instead of loading an image
        const testFragment: Fragment = {
            id: 'test-fragment',
            image: 'test-image-data',
            imageX: 0,
            imageY: 0,
            imageWidth: 400,
            imageHeight: 400,
            x: 0,
            y: 0,
            rotation: 0,
            polygon: [
                { x: 0, y: 0 },
                { x: 400, y: 0 },
                { x: 400, y: 400 },
                { x: 0, y: 400 }
            ]
        };

        const initialState = new StateNode({
            fragments: [testFragment],
            cutLines: [],
            measurements: [],
            implants: [],
            description: 'Test State'
        });

        manager.head = initialState;
        manager.current = initialState;
        manager.history = [initialState];
    });

    describe('performResectionOnFragment', () => {
        it('should cut, delete middle fragment, and move upper fragment to close gap', async () => {
            // Test points forming two horizontal cut lines with a gap between them
            const points = [
                { x: 100, y: 200 }, // A - upper line start
                { x: 300, y: 200 }, // B - upper line end
                { x: 100, y: 300 }, // C - lower line start  
                { x: 300, y: 300 }  // D - lower line end
            ];

            console.log('[ResectionTest] Starting resection with points:', points);
            console.log('[ResectionTest] Initial fragments:', manager.current?.data.fragments.length);

            // Perform the resection operation
            const result = await performResectionOnFragment(manager, null, points);

            console.log('[ResectionTest] Operation result:', result);
            console.log('[ResectionTest] Final fragments:', manager.current?.data.fragments.length);

            // Verify the operation completed successfully
            expect(result).toBeDefined();
            expect(result.fragmentIds).toHaveLength(2);
            expect(result.removedFragmentId).toBeDefined();
            expect(result.rotationAngle).toBeDefined();
            expect(result.translation).toBeDefined();

            // Verify we have exactly 2 fragments remaining (upper and lower)
            expect(manager.current?.data.fragments).toHaveLength(2);

            // Verify the middle fragment was removed
            const remainingFragmentIds = manager.current?.data.fragments.map(f => f.id) || [];
            expect(remainingFragmentIds).not.toContain(result.removedFragmentId);
            expect(remainingFragmentIds).toContain(result.fragmentIds[0]);
            expect(remainingFragmentIds).toContain(result.fragmentIds[1]);

            expect(manager.history).toHaveLength(2);

            const undoState = manager.undo();
            expect(undoState).toBeTruthy();
            expect(manager.current?.data.fragments).toHaveLength(1);

            const redoState = manager.redo();
            expect(redoState).toBeTruthy();
            expect(manager.current?.data.fragments).toHaveLength(2);

            console.log('[ResectionTest] ✓ Resection operation completed successfully');
        });

        it('should undo and redo normal tools step by step', async () => {
            await manager.applyOperation('ADD_MEASUREMENT', {
                toolKey: 'line',
                fragmentId: 'test-fragment',
                points: [
                    { x: 10, y: 10 },
                    { x: 60, y: 10 }
                ],
                result: 'Planning...'
            });

            await manager.applyOperation('ADD_MEASUREMENT', {
                toolKey: 'line',
                fragmentId: 'test-fragment',
                points: [
                    { x: 10, y: 20 },
                    { x: 60, y: 20 }
                ],
                result: 'Planning...'
            });

            expect(manager.history).toHaveLength(3);
            expect(manager.current?.data.measurements).toHaveLength(2);

            const firstUndo = manager.undo();
            expect(firstUndo).toBeTruthy();
            expect(manager.current?.data.measurements).toHaveLength(1);

            const secondUndo = manager.undo();
            expect(secondUndo).toBeTruthy();
            expect(manager.current?.data.measurements).toHaveLength(0);

            const firstRedo = manager.redo();
            expect(firstRedo).toBeTruthy();
            expect(manager.current?.data.measurements).toHaveLength(1);

            const secondRedo = manager.redo();
            expect(secondRedo).toBeTruthy();
            expect(manager.current?.data.measurements).toHaveLength(2);
        });

        it('should handle angled cut lines correctly', async () => {
            // Test points forming two angled cut lines
            const points = [
                { x: 100, y: 200 }, // A - upper line start
                { x: 300, y: 210 }, // B - upper line end (slight angle)
                { x: 100, y: 300 }, // C - lower line start
                { x: 300, y: 290 }  // D - lower line end (opposite angle)
            ];

            console.log('[ResectionTest] Starting angled resection with points:', points);

            const result = await performResectionOnFragment(manager, null, points);

            console.log('[ResectionTest] Angled operation result:', result);

            // Verify the operation handled the angles correctly
            expect(result).toBeDefined();
            expect(result.fragmentIds).toHaveLength(2);
            expect(result.rotationAngle).not.toBe(0); // Should have some rotation
            expect(result.translation).toBeDefined();

            // Verify fragments were processed
            expect(manager.current?.data.fragments).toHaveLength(2);

            console.log('[ResectionTest] ✓ Angled resection operation completed successfully');
        });

        it('should throw error with invalid input', async () => {
            // Test with insufficient points
            const points = [
                { x: 100, y: 200 },
                { x: 300, y: 200 }
            ];

            await expect(performResectionOnFragment(manager, null, points))
                .rejects.toThrow('performResectionOnFragment requires manager and 4 points');
        });
    });
});