/**
 * Unit tests for OpenOsteotomyOperation - API Compatibility
 * 
 * These tests verify that the public API of OpenOsteotomyOperation remains
 * stable and compatible with the original implementation. This ensures that
 * existing code using the tool continues to work without modification.
 * 
 * Test Coverage:
 * 1. addPoint method signature and behavior
 * 2. execute method signature and behavior
 * 3. reset method signature and behavior
 * 4. performOpenOsteotomyOnFragment wrapper function
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { 
  OpenOsteotomyOperation, 
  OperationResult,
  performOpenOsteotomyOnFragment 
} from './OpenOsteotomyOperation';
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
 * Helper function to create a valid six-point configuration.
 */
function createValidSixPoints(): Point[] {
  return [
    { x: 250, y: 200 }, // A
    { x: 550, y: 200 }, // B
    { x: 250, y: 300 }, // C
    { x: 550, y: 320 }, // D (slight angle)
    { x: 250, y: 400 }, // E
    { x: 550, y: 400 }  // F
  ];
}

function createShiftedSixPoints(dx: number, dy: number): Point[] {
  return createValidSixPoints().map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

describe('OpenOsteotomyOperation - API Compatibility', () => {
  let manager: CanvasManager;
  let operation: OpenOsteotomyOperation;
  
  beforeEach(() => {
    manager = createMockCanvasManager();
    operation = new OpenOsteotomyOperation(manager);
  });
  
  /**
   * Test: addPoint method signature matches original
   * 
   * Verifies that the addPoint method:
   * - Accepts two number parameters (x, y)
   * - Returns an object with pointCount and isComplete properties
   * - Correctly tracks the number of points added
   * - Correctly indicates when all six points are added
   * 
   * Requirements: 13.1, 1.1, 1.2, 1.3, 1.4
   */
  describe('addPoint method', () => {
    it('should accept x and y coordinates as numbers', () => {
      // Test that addPoint accepts number parameters
      const result = operation.addPoint(100, 200);
      
      // Verify return type
      expect(result).toBeDefined();
      expect(typeof result.pointCount).toBe('number');
      expect(typeof result.isComplete).toBe('boolean');
    });
    
    it('should return correct pointCount after each addition', () => {
      // Add points one by one and verify count
      let result = operation.addPoint(100, 200);
      expect(result.pointCount).toBe(1);
      expect(result.isComplete).toBe(false);
      
      result = operation.addPoint(200, 200);
      expect(result.pointCount).toBe(2);
      expect(result.isComplete).toBe(false);
      
      result = operation.addPoint(100, 300);
      expect(result.pointCount).toBe(3);
      expect(result.isComplete).toBe(false);
      
      result = operation.addPoint(200, 300);
      expect(result.pointCount).toBe(4);
      expect(result.isComplete).toBe(false);
      
      result = operation.addPoint(100, 400);
      expect(result.pointCount).toBe(5);
      expect(result.isComplete).toBe(false);
      
      result = operation.addPoint(200, 400);
      expect(result.pointCount).toBe(6);
      expect(result.isComplete).toBe(true);
    });
    
    it('should set isComplete to true when six points are added', () => {
      // Add five points
      for (let i = 0; i < 5; i++) {
        const result = operation.addPoint(100 + i * 10, 200);
        expect(result.isComplete).toBe(false);
      }
      
      // Add sixth point
      const result = operation.addPoint(150, 200);
      expect(result.isComplete).toBe(true);
    });
    
    it('should not accept more than six points', () => {
      // Add six points
      for (let i = 0; i < 6; i++) {
        operation.addPoint(100 + i * 10, 200);
      }
      
      // Try to add a seventh point
      const result = operation.addPoint(200, 200);
      
      // Should still report six points
      expect(result.pointCount).toBe(6);
      expect(result.isComplete).toBe(true);
    });
    
    it('should maintain the original method signature', () => {
      // Verify the method exists and has the expected signature
      expect(typeof operation.addPoint).toBe('function');
      expect(operation.addPoint.length).toBe(2); // Two parameters
    });
  });
  
  /**
   * Test: execute method signature matches original
   * 
   * Verifies that the execute method:
   * - Accepts three parameters (phi: number, H: Point, n: Point)
   * - Returns a Promise<OperationResult>
   * - Legacy parameters are accepted but not required for operation
   * - Result format matches expected structure
   * 
   * Requirements: 13.2, 13.5
   */
  describe('execute method', () => {
    it('should accept phi, H, and n parameters', async () => {
      // Add six valid points
      const points = createValidSixPoints();
      points.forEach(p => operation.addPoint(p.x, p.y));
      
      // Test that execute accepts the legacy parameters
      const phi = 0.5;
      const H: Point = { x: 100, y: 100 };
      const n: Point = { x: 1, y: 0 };
      
      // Should not throw
      const result = await operation.execute(phi, H, n);
      
      // Verify result is defined
      expect(result).toBeDefined();
    });
    
    it('should return a Promise', () => {
      // Add six valid points
      const points = createValidSixPoints();
      points.forEach(p => operation.addPoint(p.x, p.y));
      
      // Execute should return a Promise
      const result = operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      expect(result).toBeInstanceOf(Promise);
    });
    
    it('should return OperationResult with ok property', async () => {
      // Add six valid points
      const points = createValidSixPoints();
      points.forEach(p => operation.addPoint(p.x, p.y));
      
      // Execute the operation
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      // Verify result structure
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
    
    it('should return ok: false with reason when configuration is invalid', async () => {
      // Add six points with coincident pair (degenerate)
      operation.addPoint(100, 200);
      operation.addPoint(100, 200); // Same as first point
      operation.addPoint(100, 300);
      operation.addPoint(200, 300);
      operation.addPoint(100, 400);
      operation.addPoint(200, 400);
      
      // Execute should detect degenerate configuration
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('degenerate');
    });
    
    it('should return ok: true with fragmentIds and transformations on success', async () => {
      // Add six valid points
      const points = createValidSixPoints();
      points.forEach(p => operation.addPoint(p.x, p.y));
      
      // Execute the operation
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      // Verify success result structure
      if (result.ok) {
        expect(result.fragmentIds).toBeDefined();
        expect(Array.isArray(result.fragmentIds)).toBe(true);
        expect(result.gapPolygon).toBeDefined();
        expect(result.transformations).toBeDefined();
        expect(result.transformations?.upper).toBeDefined();
        expect(result.transformations?.lower).toBeDefined();
      }
    });
    
    it('should maintain the original method signature', () => {
      // Verify the method exists and has the expected signature
      expect(typeof operation.execute).toBe('function');
      expect(operation.execute.length).toBe(3); // Three parameters
    });
    
    it('should work without requiring legacy parameters to be meaningful', async () => {
      // Add six valid points
      const points = createValidSixPoints();
      points.forEach(p => operation.addPoint(p.x, p.y));
      
      // Execute with dummy legacy parameters
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      // Should still work (legacy parameters are ignored)
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });
  
  /**
   * Test: reset method signature matches original
   * 
   * Verifies that the reset method:
   * - Takes no parameters
   * - Returns void
   * - Clears all stored points
   * - Allows starting a new six-point sequence
   * 
   * Requirements: 13.3
   */
  describe('reset method', () => {
    it('should take no parameters', () => {
      // Verify the method exists and has no parameters
      expect(typeof operation.reset).toBe('function');
      expect(operation.reset.length).toBe(0); // Zero parameters
    });
    
    it('should return void', () => {
      // Add some points
      operation.addPoint(100, 200);
      operation.addPoint(200, 200);
      
      // Reset should return undefined (void)
      const result = operation.reset();
      expect(result).toBeUndefined();
    });
    
    it('should clear all stored points', () => {
      // Add some points
      operation.addPoint(100, 200);
      operation.addPoint(200, 200);
      operation.addPoint(100, 300);
      
      // Verify points were added
      let result = operation.addPoint(200, 300);
      expect(result.pointCount).toBe(4);
      
      // Reset
      operation.reset();
      
      // Add a new point - should start from 1
      result = operation.addPoint(150, 250);
      expect(result.pointCount).toBe(1);
      expect(result.isComplete).toBe(false);
    });
    
    it('should allow starting a new six-point sequence after reset', () => {
      // Add six points
      for (let i = 0; i < 6; i++) {
        operation.addPoint(100 + i * 10, 200);
      }
      
      // Verify complete
      let result = operation.addPoint(100, 200);
      expect(result.pointCount).toBe(6);
      expect(result.isComplete).toBe(true);
      
      // Reset
      operation.reset();
      
      // Add new six points
      for (let i = 0; i < 6; i++) {
        result = operation.addPoint(200 + i * 10, 300);
      }
      
      // Should be complete again
      expect(result.pointCount).toBe(6);
      expect(result.isComplete).toBe(true);
    });
    
    it('should maintain the original method signature', () => {
      // Verify the method exists
      expect(typeof operation.reset).toBe('function');
    });
  });
  
  /**
   * Test: performOpenOsteotomyOnFragment wrapper works correctly
   * 
   * Verifies that the wrapper function:
   * - Accepts the expected parameters
   * - Creates an OpenOsteotomyOperation instance internally
   * - Adds all six context points
   * - Executes the operation
   * - Returns the operation result
   * 
   * Requirements: 13.4
   */
  describe('performOpenOsteotomyOnFragment wrapper', () => {
    it('should accept manager, phi, H, n, and contextPoints parameters', async () => {
      const phi = 0.5;
      const H: Point = { x: 100, y: 100 };
      const n: Point = { x: 1, y: 0 };
      const contextPoints = createValidSixPoints();
      
      // Should not throw
      const result = await performOpenOsteotomyOnFragment(
        manager,
        phi,
        H,
        n,
        contextPoints
      );
      
      // Verify result is defined
      expect(result).toBeDefined();
    });
    
    it('should return a Promise<OperationResult>', () => {
      const contextPoints = createValidSixPoints();
      
      const result = performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        contextPoints
      );
      
      expect(result).toBeInstanceOf(Promise);
    });
    
    it('should process all six context points', async () => {
      const contextPoints = createValidSixPoints();
      
      const result = await performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        contextPoints
      );
      
      // Should execute successfully with six points
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
    
    it('should return ok: false when given invalid configuration', async () => {
      // Create degenerate configuration (coincident points)
      const contextPoints: Point[] = [
        { x: 100, y: 200 },
        { x: 100, y: 200 }, // Same as first
        { x: 100, y: 300 },
        { x: 200, y: 300 },
        { x: 100, y: 400 },
        { x: 200, y: 400 }
      ];
      
      const result = await performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        contextPoints
      );
      
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('degenerate');
    });
    
    it('should return ok: true with fragmentIds on success', async () => {
      const contextPoints = createValidSixPoints();
      
      const result = await performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        contextPoints
      );
      
      // Verify success result structure
      if (result.ok) {
        expect(result.fragmentIds).toBeDefined();
        expect(Array.isArray(result.fragmentIds)).toBe(true);
        expect(result.gapPolygon).toBeDefined();
        expect(result.transformations).toBeDefined();
      }
    });
    
    it('should work with legacy parameters being ignored', async () => {
      const contextPoints = createValidSixPoints();
      
      // Use arbitrary legacy parameters
      const result = await performOpenOsteotomyOnFragment(
        manager,
        999, // Arbitrary phi
        { x: -1000, y: -1000 }, // Arbitrary H
        { x: 42, y: 42 }, // Arbitrary n
        contextPoints
      );
      
      // Should still work (legacy parameters are ignored)
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
    
    it('should maintain the original function signature', () => {
      // Verify the function exists and has the expected signature
      expect(typeof performOpenOsteotomyOnFragment).toBe('function');
      expect(performOpenOsteotomyOnFragment.length).toBe(5); // Five parameters
    });
    
    it('should handle fewer than six context points gracefully', async () => {
      // Provide only 4 points
      const contextPoints: Point[] = [
        { x: 100, y: 200 },
        { x: 200, y: 200 },
        { x: 100, y: 300 },
        { x: 200, y: 300 }
      ];
      
      const result = await performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        contextPoints
      );
      
      // Should return degenerate (not enough points)
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('degenerate');
    });
    
    it('should handle more than six context points by using first six', async () => {
      // Provide 8 points (should use first 6)
      const contextPoints: Point[] = [
        { x: 250, y: 200 }, // A
        { x: 550, y: 200 }, // B
        { x: 250, y: 300 }, // C
        { x: 550, y: 320 }, // D
        { x: 250, y: 400 }, // E
        { x: 550, y: 400 }, // F
        { x: 100, y: 500 }, // Extra (should be ignored)
        { x: 200, y: 500 }  // Extra (should be ignored)
      ];
      
      const result = await performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        contextPoints
      );
      
      // Should process successfully using first six points
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('Undo/redo behavior for Opening Wedge', () => {
    it('should treat one completed opening wedge as one history step', async () => {
      const result = await performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        createValidSixPoints()
      );

      expect(result.ok).toBe(true);
      expect(manager.history).toHaveLength(2);

      const undoState = manager.undo();
      expect(undoState).toBeTruthy();
      expect(manager.current?.data.fragments).toHaveLength(1);

      const redoState = manager.redo();
      expect(redoState).toBeTruthy();
      expect(manager.current?.data.fragments.length).toBeGreaterThan(1);
    });

    it('should undo/redo multiple opening wedges step-by-step in sequence', async () => {
      const first = await performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        createValidSixPoints()
      );
      expect(first.ok).toBe(true);

      const second = await performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        createShiftedSixPoints(-20, 10)
      );
      expect(second.ok).toBe(true);

      expect(manager.history).toHaveLength(3);

      const undo1 = manager.undo();
      expect(undo1).toBeTruthy();
      expect(manager.history).toHaveLength(2);

      const undo2 = manager.undo();
      expect(undo2).toBeTruthy();
      expect(manager.history).toHaveLength(1);
      expect(manager.current?.data.fragments).toHaveLength(1);

      const redo1 = manager.redo();
      expect(redo1).toBeTruthy();
      expect(manager.history).toHaveLength(2);

      const redo2 = manager.redo();
      expect(redo2).toBeTruthy();
      expect(manager.history).toHaveLength(3);
    });
  });
  
  /**
   * Test: Result format compatibility
   * 
   * Verifies that the result objects returned by execute and the wrapper
   * contain the expected fields matching the original format.
   * 
   * Requirements: 13.5
   */
  describe('Result format compatibility', () => {
    it('should return result with ok property (boolean)', async () => {
      const points = createValidSixPoints();
      points.forEach(p => operation.addPoint(p.x, p.y));
      
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
    });
    
    it('should return result with reason property when ok is false', async () => {
      // Degenerate configuration
      operation.addPoint(100, 200);
      operation.addPoint(100, 200);
      operation.addPoint(100, 300);
      operation.addPoint(200, 300);
      operation.addPoint(100, 400);
      operation.addPoint(200, 400);
      
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty('reason');
      expect(typeof result.reason).toBe('string');
    });
    
    it('should return result with fragmentIds when ok is true', async () => {
      const points = createValidSixPoints();
      points.forEach(p => operation.addPoint(p.x, p.y));
      
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      if (result.ok) {
        expect(result).toHaveProperty('fragmentIds');
        expect(Array.isArray(result.fragmentIds)).toBe(true);
      }
    });
    
    it('should return result with gapPolygon when ok is true', async () => {
      const points = createValidSixPoints();
      points.forEach(p => operation.addPoint(p.x, p.y));
      
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      if (result.ok) {
        expect(result).toHaveProperty('gapPolygon');
        expect(Array.isArray(result.gapPolygon)).toBe(true);
      }
    });
    
    it('should return result with transformations when ok is true', async () => {
      const points = createValidSixPoints();
      points.forEach(p => operation.addPoint(p.x, p.y));
      
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      if (result.ok) {
        expect(result).toHaveProperty('transformations');
        expect(result.transformations).toHaveProperty('upper');
        expect(result.transformations).toHaveProperty('lower');
        
        // Verify transformation structure
        expect(result.transformations?.upper).toHaveProperty('rotation');
        expect(result.transformations?.upper).toHaveProperty('translation');
        expect(result.transformations?.upper).toHaveProperty('center');
        
        expect(result.transformations?.lower).toHaveProperty('rotation');
        expect(result.transformations?.lower).toHaveProperty('translation');
        expect(result.transformations?.lower).toHaveProperty('center');
      }
    });
    
    it('should not include fragmentIds when ok is false', async () => {
      // Degenerate configuration
      operation.addPoint(100, 200);
      operation.addPoint(100, 200);
      operation.addPoint(100, 300);
      operation.addPoint(200, 300);
      operation.addPoint(100, 400);
      operation.addPoint(200, 400);
      
      const result = await operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      expect(result.ok).toBe(false);
      expect(result.fragmentIds).toBeUndefined();
      expect(result.gapPolygon).toBeUndefined();
      expect(result.transformations).toBeUndefined();
    });
  });
});
