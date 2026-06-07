/**
 * Integration tests for OpenOsteotomyOperation with CanvasManager
 * 
 * These tests verify that the Open Osteotomy tool integrates correctly with
 * the existing CanvasManager system, focusing on:
 * - API compatibility and instantiation
 * - State structure and access
 * - Integration points with CanvasManager
 * 
 * Note: These tests focus on integration points and API compatibility.
 * Full end-to-end execution tests are covered in the unit test files.
 * 
 * Requirements: 13.4
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { 
  OpenOsteotomyOperation, 
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
 * Helper function to create a CanvasManager with mock state (synchronous).
 */
function createMockCanvasManager(): CanvasManager {
  const manager = new CanvasManager();
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

describe('OpenOsteotomyOperation - CanvasManager Integration', () => {
  let manager: CanvasManager;
  
  beforeEach(() => {
    manager = createMockCanvasManager();
  });
  
  /**
   * Test: Integration with existing CanvasManager operations
   * 
   * Verifies that the Open Osteotomy operation works correctly with
   * the CanvasManager's operation system.
   * 
   * Requirements: 13.4
   */
  describe('CanvasManager operations integration', () => {
    it('should instantiate with CanvasManager', () => {
      const operation = new OpenOsteotomyOperation(manager);
      
      // Should create successfully
      expect(operation).toBeDefined();
      expect(typeof operation.addPoint).toBe('function');
      expect(typeof operation.execute).toBe('function');
      expect(typeof operation.reset).toBe('function');
    });
    
    it('should access CanvasManager current state', () => {
      const operation = new OpenOsteotomyOperation(manager);
      
      // CanvasManager should have current state
      expect(manager.current).toBeDefined();
      expect(manager.current!.data).toBeDefined();
      expect(manager.current!.data.fragments).toBeDefined();
      expect(manager.current!.data.fragments.length).toBeGreaterThan(0);
    });
    
    it('should have access to CanvasManager applyOperation method', () => {
      // CanvasManager should have applyOperation method
      expect(typeof manager.applyOperation).toBe('function');
    });
    
    it('should maintain wrapper function compatibility', () => {
      const points = createValidSixPoints();
      
      // Wrapper function should exist and be callable
      expect(typeof performOpenOsteotomyOnFragment).toBe('function');
      expect(performOpenOsteotomyOnFragment.length).toBe(5);
      
      // Should return a Promise
      const result = performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        points
      );
      
      expect(result).toBeInstanceOf(Promise);
    });
    
    it('should be able to add points to operation', () => {
      const operation = new OpenOsteotomyOperation(manager);
      
      // Add points
      const result1 = operation.addPoint(100, 200);
      expect(result1.pointCount).toBe(1);
      expect(result1.isComplete).toBe(false);
      
      const result2 = operation.addPoint(200, 200);
      expect(result2.pointCount).toBe(2);
      expect(result2.isComplete).toBe(false);
    });
    
    it('should be able to reset operation', () => {
      const operation = new OpenOsteotomyOperation(manager);
      
      // Add some points
      operation.addPoint(100, 200);
      operation.addPoint(200, 200);
      
      // Reset
      operation.reset();
      
      // Add new point - should start from 1
      const result = operation.addPoint(150, 250);
      expect(result.pointCount).toBe(1);
    });
  });
  
  /**
   * Test: Fragment creation and management
   * 
   * Verifies that the CanvasManager fragment system is accessible
   * and properly structured for integration.
   * 
   * Requirements: 13.4
   */
  describe('Fragment creation and management', () => {
    it('should have initial fragment in CanvasManager', () => {
      // Initial state should have 1 fragment
      expect(manager.current!.data.fragments.length).toBe(1);
      
      const fragment = manager.current!.data.fragments[0];
      expect(fragment).toBeDefined();
      expect(fragment.id).toBeDefined();
      expect(typeof fragment.id).toBe('string');
    });
    
    it('should have fragments with valid polygon data', () => {
      const fragment = manager.current!.data.fragments[0];
      
      expect(fragment.polygon).toBeDefined();
      expect(Array.isArray(fragment.polygon)).toBe(true);
      expect(fragment.polygon.length).toBeGreaterThan(2);
      
      // All polygon points should have x and y coordinates
      fragment.polygon.forEach(p => {
        expect(typeof p.x).toBe('number');
        expect(typeof p.y).toBe('number');
        expect(isFinite(p.x)).toBe(true);
        expect(isFinite(p.y)).toBe(true);
      });
    });
    
    it('should have fragments with valid image properties', () => {
      const fragment = manager.current!.data.fragments[0];
      
      // Check image properties
      expect(fragment.image).toBeDefined();
      expect(typeof fragment.imageWidth).toBe('number');
      expect(typeof fragment.imageHeight).toBe('number');
      expect(fragment.imageWidth).toBeGreaterThan(0);
      expect(fragment.imageHeight).toBeGreaterThan(0);
    });
    
    it('should have fragments with position and rotation properties', () => {
      const fragment = manager.current!.data.fragments[0];
      
      // Check transform properties
      expect(typeof fragment.x).toBe('number');
      expect(typeof fragment.y).toBe('number');
      expect(typeof fragment.rotation).toBe('number');
      expect(isFinite(fragment.x)).toBe(true);
      expect(isFinite(fragment.y)).toBe(true);
      expect(isFinite(fragment.rotation)).toBe(true);
    });
  });
  
  /**
   * Test: Undo/redo compatibility
   * 
   * Verifies that the CanvasManager undo/redo system is accessible
   * and properly structured.
   * 
   * Requirements: 13.4
   */
  describe('Undo/redo compatibility', () => {
    it('should have undo method available', () => {
      expect(typeof manager.undo).toBe('function');
    });
    
    it('should have redo method available', () => {
      expect(typeof manager.redo).toBe('function');
    });
    
    it('should have history tracking', () => {
      expect(manager.history).toBeDefined();
      expect(Array.isArray(manager.history)).toBe(true);
      expect(manager.history.length).toBeGreaterThan(0);
    });
    
    it('should have current state pointer', () => {
      expect(manager.current).toBeDefined();
      expect(manager.current).toBe(manager.history[manager.history.length - 1]);
    });
    
    it('should have head state pointer', () => {
      expect(manager.head).toBeDefined();
      expect(manager.head).toBe(manager.history[0]);
    });
    
    it('should have state nodes with parent-child structure', () => {
      const currentState = manager.current!;
      
      expect(currentState.data).toBeDefined();
      expect(currentState.children).toBeDefined();
      expect(Array.isArray(currentState.children)).toBe(true);
      
      // Head should have no parent
      expect(manager.head!.parent).toBeNull();
    });
  });
  
  /**
   * Test: State structure compatibility
   * 
   * Verifies that the CanvasManager state structure matches
   * what the OpenOsteotomyOperation expects.
   * 
   * Requirements: 13.4
   */
  describe('State structure compatibility', () => {
    it('should have fragments array in state', () => {
      expect(manager.current!.data.fragments).toBeDefined();
      expect(Array.isArray(manager.current!.data.fragments)).toBe(true);
    });
    
    it('should have measurements array in state', () => {
      expect(manager.current!.data.measurements).toBeDefined();
      expect(Array.isArray(manager.current!.data.measurements)).toBe(true);
    });
    
    it('should have implants array in state', () => {
      expect(manager.current!.data.implants).toBeDefined();
      expect(Array.isArray(manager.current!.data.implants)).toBe(true);
    });
    
    it('should have cutLines array in state', () => {
      expect(manager.current!.data.cutLines).toBeDefined();
      expect(Array.isArray(manager.current!.data.cutLines)).toBe(true);
    });
    
    it('should have description in state', () => {
      expect(manager.current!.data.description).toBeDefined();
      expect(typeof manager.current!.data.description).toBe('string');
    });
  });
  
  /**
   * Test: Operation result format compatibility
   * 
   * Verifies that the operation result format structure is correct.
   * Note: Full execution tests are covered in unit test files.
   * 
   * Requirements: 13.4
   */
  describe('Operation result format compatibility', () => {
    it('should have execute method that returns a Promise', () => {
      const operation = new OpenOsteotomyOperation(manager);
      
      // Add some points
      operation.addPoint(100, 200);
      operation.addPoint(200, 200);
      
      const result = operation.execute(0, { x: 0, y: 0 }, { x: 0, y: 0 });
      
      expect(result).toBeInstanceOf(Promise);
    });
    
    it('should have wrapper function that returns a Promise', () => {
      const points = createValidSixPoints();
      
      const result = performOpenOsteotomyOnFragment(
        manager,
        0,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        points
      );
      
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
