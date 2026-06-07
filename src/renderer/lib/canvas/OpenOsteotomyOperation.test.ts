/**
 * Unit tests for OpenOsteotomyOperation - Specific Surgical Scenarios
 * 
 * These tests validate the Open Osteotomy tool with realistic surgical placements
 * that surgeons would use in practice. Each test represents a specific clinical
 * scenario with typical or edge-case point configurations.
 * 
 * Test Scenarios:
 * 1. Typical surgical placement (AB horizontal, CD at 15°, EF horizontal)
 * 2. Steep angle (CD at 60°)
 * 3. Near-parallel valid configuration (AB at 5°, CD at 6°, EF at 7°)
 * 4. Close points (2 pixel separation)
 * 5. Boundary points (exactly on image edges)
 * 6. Large opening (45° difference)
 * 7. Small opening (2° difference)
 * 
 * Requirements: 14.5
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { OpenOsteotomyOperation, OperationResult } from './OpenOsteotomyOperation';
import { CanvasManager, Point } from './CanvasManager';

// Polyfill ImageData for jsdom environment
beforeAll(() => {
  if (typeof ImageData === 'undefined') {
    (global as any).ImageData = class ImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };
  }
});

/**
 * Helper function to create a mock CanvasManager for testing.
 * 
 * The mock provides a minimal implementation with:
 * - A single fragment representing the original image
 * - Standard image dimensions (800x600)
 * - Basic operation support for CUT, ROTATE, and MOVE
 */
function createMockCanvasManager(): CanvasManager {
  const manager = new CanvasManager();
  
  // Initialize with a base image
  const baseImageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  // Create initial state synchronously for testing
  manager.head = {
    uid: 'test-head',
    timestamp: Date.now(),
    data: {
      fragments: [{
        id: 'fragment-1',
        image: baseImageData,
        imageX: 0,
        imageY: 0,
        imageWidth: 800,
        imageHeight: 600,
        x: 0,
        y: 0,
        rotation: 0,
        polygon: [
          { x: 0, y: 0 },
          { x: 800, y: 0 },
          { x: 800, y: 600 },
          { x: 0, y: 600 }
        ]
      }],
      cutLines: [],
      measurements: [],
      implants: [],
      description: 'Initial State'
    },
    parent: null,
    children: []
  } as any;
  
  manager.current = manager.head;
  manager.history = [manager.head];
  
  return manager;
}

/**
 * Helper function to create points defining a line at a specific angle.
 * 
 * @param centerX X-coordinate of line center
 * @param centerY Y-coordinate of line center
 * @param angleDegrees Angle in degrees (0° = horizontal, positive = counter-clockwise)
 * @param length Length of the line segment
 * @returns Array of two points [start, end]
 */
function createLineAtAngle(
  centerX: number,
  centerY: number,
  angleDegrees: number,
  length: number
): [Point, Point] {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const halfLength = length / 2;
  
  const dx = Math.cos(angleRad) * halfLength;
  const dy = Math.sin(angleRad) * halfLength;
  
  return [
    { x: centerX - dx, y: centerY - dy },
    { x: centerX + dx, y: centerY + dy }
  ];
}

describe('OpenOsteotomyOperation - Surgical Scenarios', () => {
  let manager: CanvasManager;
  let operation: OpenOsteotomyOperation;
  
  beforeEach(() => {
    manager = createMockCanvasManager();
    operation = new OpenOsteotomyOperation(manager);
  });
  
  /**
   * Test 1: Typical Surgical Placement
   * 
   * This represents the most common surgical scenario:
   * - Upper reference line (AB) is horizontal at the top
   * - Cut line (CD) is at a moderate 15° angle
   * - Lower reference line (EF) is horizontal at the bottom
   * 
   * This configuration creates a controlled opening wedge with clear
   * fragment separation and predictable transformation angles.
   * 
   * Requirements: 14.5
   */
  it('should handle typical surgical placement (AB horizontal, CD at 15°, EF horizontal)', async () => {
    // Upper reference line AB - horizontal at y=200
    const [A, B] = createLineAtAngle(400, 200, 0, 300);
    
    // Cut line CD - 15° angle at y=300
    const [C, D] = createLineAtAngle(400, 300, 15, 300);
    
    // Lower reference line EF - horizontal at y=400
    const [E, F] = createLineAtAngle(400, 400, 0, 300);
    
    // Add all six points
    operation.addPoint(A.x, A.y);
    operation.addPoint(B.x, B.y);
    operation.addPoint(C.x, C.y);
    operation.addPoint(D.x, D.y);
    operation.addPoint(E.x, E.y);
    operation.addPoint(F.x, F.y);
    
    // Execute the operation
    const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
    
    // Verify success
    expect(result.ok).toBe(true);
    expect(result.fragmentIds).toBeDefined();
    expect(result.fragmentIds?.length).toBe(2);
    expect(result.gapPolygon).toBeDefined();
    expect(result.transformations).toBeDefined();
    
    // Verify transformations are valid
    expect(result.transformations?.upper).toBeDefined();
    expect(result.transformations?.lower).toBeDefined();
    expect(isFinite(result.transformations!.upper.rotation)).toBe(true);
    expect(isFinite(result.transformations!.lower.rotation)).toBe(true);
  });
  
  /**
   * Test 2: Steep Angle
   * 
   * This tests a more aggressive surgical correction:
   * - Upper and lower reference lines are horizontal
   * - Cut line is at a steep 60° angle
   * 
   * This creates a large angular correction and tests the system's
   * ability to handle significant rotations without numerical instability.
   * 
   * Requirements: 14.5
   */
  it('should handle steep angle (CD at 60°)', async () => {
    // Upper reference line AB - horizontal at y=200
    const [A, B] = createLineAtAngle(400, 200, 0, 300);
    
    // Cut line CD - steep 60° angle at y=300
    const [C, D] = createLineAtAngle(400, 300, 60, 300);
    
    // Lower reference line EF - horizontal at y=400
    const [E, F] = createLineAtAngle(400, 400, 0, 300);
    
    // Add all six points
    operation.addPoint(A.x, A.y);
    operation.addPoint(B.x, B.y);
    operation.addPoint(C.x, C.y);
    operation.addPoint(D.x, D.y);
    operation.addPoint(E.x, E.y);
    operation.addPoint(F.x, F.y);
    
    // Execute the operation
    const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
    
    // Verify success
    expect(result.ok).toBe(true);
    expect(result.fragmentIds).toBeDefined();
    expect(result.fragmentIds?.length).toBe(2);
    
    // Verify transformations handle steep angle correctly
    expect(result.transformations?.upper).toBeDefined();
    expect(result.transformations?.lower).toBeDefined();
    
    // Rotation angles should be significant but finite
    const upperRotation = Math.abs(result.transformations!.upper.rotation);
    const lowerRotation = Math.abs(result.transformations!.lower.rotation);
    expect(upperRotation).toBeGreaterThan(0);
    expect(upperRotation).toBeLessThan(Math.PI); // Less than 180°
    expect(lowerRotation).toBeGreaterThan(0);
    expect(lowerRotation).toBeLessThan(Math.PI);
  });
  
  /**
   * Test 3: Near-Parallel Valid Configuration
   * 
   * This tests numerical robustness with lines that are close to parallel
   * but still valid (outside the degenerate threshold):
   * - AB at 5°
   * - CD at 6° (1° difference from AB)
   * - EF at 7° (1° difference from CD)
   * 
   * All angular differences are greater than the parallel threshold
   * (0.01 radians ≈ 0.57°), so this should succeed without numerical issues.
   * 
   * Requirements: 14.5, 9.3, 9.4, 9.5
   */
  it('should handle near-parallel valid configuration (AB at 5°, CD at 6°, EF at 7°)', async () => {
    // Upper reference line AB - 5° angle at y=200
    const [A, B] = createLineAtAngle(400, 200, 5, 300);
    
    // Cut line CD - 6° angle at y=300 (1° from AB, valid)
    const [C, D] = createLineAtAngle(400, 300, 6, 300);
    
    // Lower reference line EF - 7° angle at y=400 (1° from CD, valid)
    const [E, F] = createLineAtAngle(400, 400, 7, 300);
    
    // Add all six points
    operation.addPoint(A.x, A.y);
    operation.addPoint(B.x, B.y);
    operation.addPoint(C.x, C.y);
    operation.addPoint(D.x, D.y);
    operation.addPoint(E.x, E.y);
    operation.addPoint(F.x, F.y);
    
    // Execute the operation
    const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
    
    // Verify success (should not be degenerate)
    expect(result.ok).toBe(true);
    expect(result.fragmentIds).toBeDefined();
    expect(result.fragmentIds?.length).toBe(2);
    
    // Verify transformations are computed without numerical instability
    expect(result.transformations?.upper).toBeDefined();
    expect(result.transformations?.lower).toBeDefined();
    expect(isFinite(result.transformations!.upper.rotation)).toBe(true);
    expect(isFinite(result.transformations!.lower.rotation)).toBe(true);
    expect(isFinite(result.transformations!.upper.translation.x)).toBe(true);
    expect(isFinite(result.transformations!.upper.translation.y)).toBe(true);
  });
  
  /**
   * Test 4: Close Points
   * 
   * This tests robustness with points that are close together but not coincident:
   * - Points within each pair are separated by exactly 2 pixels
   * - This is above the coincident threshold (1.0 pixel) but still very close
   * 
   * The system should handle this correctly without enforcing artificial
   * minimum distance requirements.
   * 
   * Requirements: 14.5, 9.1, 9.2
   */
  it('should handle close points (2 pixel separation)', async () => {
    // Upper reference line AB - 2 pixel separation, horizontal
    const A: Point = { x: 400, y: 200 };
    const B: Point = { x: 402, y: 200 }; // 2 pixels apart
    
    // Cut line CD - 2 pixel separation, 15° angle
    const angleRad = (15 * Math.PI) / 180;
    const C: Point = { x: 400, y: 300 };
    const D: Point = { x: 400 + 2 * Math.cos(angleRad), y: 300 + 2 * Math.sin(angleRad) };
    
    // Lower reference line EF - 2 pixel separation, horizontal
    const E: Point = { x: 400, y: 400 };
    const F: Point = { x: 402, y: 400 }; // 2 pixels apart
    
    // Add all six points
    operation.addPoint(A.x, A.y);
    operation.addPoint(B.x, B.y);
    operation.addPoint(C.x, C.y);
    operation.addPoint(D.x, D.y);
    operation.addPoint(E.x, E.y);
    operation.addPoint(F.x, F.y);
    
    // Execute the operation
    const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
    
    // Verify success (should not be degenerate despite close points)
    expect(result.ok).toBe(true);
    expect(result.fragmentIds).toBeDefined();
    expect(result.fragmentIds?.length).toBe(2);
    
    // Verify geometry is computed correctly
    expect(result.transformations?.upper).toBeDefined();
    expect(result.transformations?.lower).toBeDefined();
  });
  
  /**
   * Test 5: Boundary Points
   * 
   * This tests points placed exactly on the image edges:
   * - Points are at x=0, x=800, y=0, y=600 (image boundaries)
   * - Tests boundary condition handling in extrapolation and cutting
   * 
   * The system should accept boundary points and handle them correctly
   * without edge case failures.
   * 
   * Requirements: 14.5, 1.4
   */
  it('should handle boundary points (exactly on image edges)', async () => {
    // Upper reference line AB - on top edge
    const A: Point = { x: 200, y: 0 };
    const B: Point = { x: 600, y: 0 };
    
    // Cut line CD - from left edge to right edge, with slight angle to avoid parallel
    const C: Point = { x: 0, y: 280 };
    const D: Point = { x: 800, y: 320 };
    
    // Lower reference line EF - on bottom edge
    const E: Point = { x: 200, y: 600 };
    const F: Point = { x: 600, y: 600 };
    
    // Add all six points
    operation.addPoint(A.x, A.y);
    operation.addPoint(B.x, B.y);
    operation.addPoint(C.x, C.y);
    operation.addPoint(D.x, D.y);
    operation.addPoint(E.x, E.y);
    operation.addPoint(F.x, F.y);
    
    // Execute the operation
    const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
    
    // Verify success
    expect(result.ok).toBe(true);
    expect(result.fragmentIds).toBeDefined();
    expect(result.fragmentIds?.length).toBe(2);
    
    // Verify transformations are valid
    expect(result.transformations?.upper).toBeDefined();
    expect(result.transformations?.lower).toBeDefined();
  });
  
  /**
   * Test 6: Large Opening
   * 
   * This tests a large angular correction:
   * - AB at 0° (horizontal)
   * - CD at 22.5° (midpoint)
   * - EF at 45° (large difference from AB)
   * 
   * This creates a 45° total opening angle, testing the system's ability
   * to handle large transformations and gap polygon generation.
   * 
   * Requirements: 14.5
   */
  it('should handle large opening (45° difference)', async () => {
    // Upper reference line AB - horizontal at y=200
    const [A, B] = createLineAtAngle(400, 200, 0, 300);
    
    // Cut line CD - 22.5° angle at y=300 (midpoint)
    const [C, D] = createLineAtAngle(400, 300, 22.5, 300);
    
    // Lower reference line EF - 45° angle at y=400
    const [E, F] = createLineAtAngle(400, 400, 45, 300);
    
    // Add all six points
    operation.addPoint(A.x, A.y);
    operation.addPoint(B.x, B.y);
    operation.addPoint(C.x, C.y);
    operation.addPoint(D.x, D.y);
    operation.addPoint(E.x, E.y);
    operation.addPoint(F.x, F.y);
    
    // Execute the operation
    const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
    
    // Verify success
    expect(result.ok).toBe(true);
    expect(result.fragmentIds).toBeDefined();
    expect(result.fragmentIds?.length).toBe(2);
    
    // Verify large rotations are handled correctly
    expect(result.transformations?.upper).toBeDefined();
    expect(result.transformations?.lower).toBeDefined();
    
    // Gap polygon should be generated for large opening
    expect(result.gapPolygon).toBeDefined();
    expect(result.gapPolygon!.length).toBeGreaterThan(0);
  });
  
  /**
   * Test 7: Small Opening
   * 
   * This tests a minimal angular correction:
   * - AB at 0° (horizontal)
   * - CD at 1° (small angle)
   * - EF at 2° (small difference from AB)
   * 
   * This creates a 2° total opening angle, testing the system's precision
   * with small transformations and ensuring no artificial restrictions.
   * 
   * Requirements: 14.5
   */
  it('should handle small opening (2° difference)', async () => {
    // Upper reference line AB - horizontal at y=200
    const [A, B] = createLineAtAngle(400, 200, 0, 300);
    
    // Cut line CD - 1° angle at y=300
    const [C, D] = createLineAtAngle(400, 300, 1, 300);
    
    // Lower reference line EF - 2° angle at y=400
    const [E, F] = createLineAtAngle(400, 400, 2, 300);
    
    // Add all six points
    operation.addPoint(A.x, A.y);
    operation.addPoint(B.x, B.y);
    operation.addPoint(C.x, C.y);
    operation.addPoint(D.x, D.y);
    operation.addPoint(E.x, E.y);
    operation.addPoint(F.x, F.y);
    
    // Execute the operation
    const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
    
    // Verify success
    expect(result.ok).toBe(true);
    expect(result.fragmentIds).toBeDefined();
    expect(result.fragmentIds?.length).toBe(2);
    
    // Verify small rotations are computed precisely
    expect(result.transformations?.upper).toBeDefined();
    expect(result.transformations?.lower).toBeDefined();
    expect(isFinite(result.transformations!.upper.rotation)).toBe(true);
    expect(isFinite(result.transformations!.lower.rotation)).toBe(true);
    
    // Rotations should be small but non-zero
    const upperRotation = Math.abs(result.transformations!.upper.rotation);
    const lowerRotation = Math.abs(result.transformations!.lower.rotation);
    expect(upperRotation).toBeGreaterThan(0);
    expect(upperRotation).toBeLessThan(0.1); // Less than ~5.7°
    expect(lowerRotation).toBeGreaterThan(0);
    expect(lowerRotation).toBeLessThan(0.1);
  });
});
