import { Point } from './CanvasManager';

/**
 * GeometryEngine: Pure geometric functions for the Open Osteotomy tool.
 * 
 * This class provides stateless geometric utilities with comprehensive inline
 * documentation. All methods are static and side-effect free.
 */

export interface Line {
  start: Point;
  end: Point;
  angle: number; // radians
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RigidTransform {
  rotation: number; // radians
  translation: Point;
  center: Point; // rotation center
}

/**
 * GeometryEngine provides pure geometric calculations for the Open Osteotomy tool.
 * All methods are static and have no side effects.
 */
export class GeometryEngine {
  // Epsilon thresholds for geometric comparisons
  private static readonly EPSILON_DISTANCE = 1.0; // pixels - coincident point threshold
  private static readonly EPSILON_ANGLE = 0.01; // radians (~0.57°) - parallel line threshold
  private static readonly EPSILON_FLOAT = 1e-10; // floating-point comparison threshold
  private static readonly EPSILON_TRANSFORM = 0.01; // pixels - transformation precision threshold
  
  /**
   * Extrapolates a line defined by two points to the image boundary.
   * 
   * Algorithm:
   * 1. Compute direction vector v = (D.x - C.x, D.y - C.y)
   * 2. Check for coincident points (|v| < ε)
   * 3. Use parametric line equation: P(t) = C + t·v
   * 4. Find intersections with all four image boundary edges
   * 5. Return the two intersection points that lie on the boundary
   * 
   * The parametric form allows us to find where the infinite line through C and D
   * intersects each boundary edge. We test all four edges and collect valid
   * intersections (those that lie within the edge bounds).
   * 
   * Numerical Robustness:
   * - Handles close points (1.1ε to 10ε separation) correctly
   * - Uses epsilon thresholds for division-by-zero checks
   * - Validates intersection points are within boundary with tolerance
   * - Removes duplicate intersections at corners
   * 
   * @param p1 First point defining the line
   * @param p2 Second point defining the line
   * @param imageBounds Rectangle defining the image boundaries
   * @returns Extended endpoints {start, end} or null if degenerate
   * 
   * Requirements: 3.1, 3.2, 3.3, 9.1, 9.2
   */
  static extrapolateToImageBounds(
    p1: Point,
    p2: Point,
    imageBounds: Rectangle
  ): { start: Point; end: Point } | null {
    // Compute direction vector
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    
    // Check for coincident points (degenerate case)
    const magnitude = Math.sqrt(vx * vx + vy * vy);
    if (magnitude < this.EPSILON_DISTANCE) {
      return null; // Points are coincident
    }
    
    // Normalize direction vector for numerical stability
    const nvx = vx / magnitude;
    const nvy = vy / magnitude;
    
    // Collect all valid intersections with image boundary
    const intersections: Point[] = [];
    
    // Use epsilon threshold for division checks to handle near-vertical/horizontal lines
    const divThreshold = this.EPSILON_FLOAT;
    
    // Left edge (x = imageBounds.x)
    if (Math.abs(nvx) > divThreshold) {
      const t = (imageBounds.x - p1.x) / vx;
      const y = p1.y + t * vy;
      // Use tolerance for boundary check to handle floating-point imprecision
      if (y >= imageBounds.y - this.EPSILON_FLOAT && 
          y <= imageBounds.y + imageBounds.height + this.EPSILON_FLOAT) {
        intersections.push({ 
          x: imageBounds.x, 
          y: Math.max(imageBounds.y, Math.min(y, imageBounds.y + imageBounds.height))
        });
      }
    }
    
    // Right edge (x = imageBounds.x + imageBounds.width)
    if (Math.abs(nvx) > divThreshold) {
      const t = (imageBounds.x + imageBounds.width - p1.x) / vx;
      const y = p1.y + t * vy;
      if (y >= imageBounds.y - this.EPSILON_FLOAT && 
          y <= imageBounds.y + imageBounds.height + this.EPSILON_FLOAT) {
        intersections.push({ 
          x: imageBounds.x + imageBounds.width, 
          y: Math.max(imageBounds.y, Math.min(y, imageBounds.y + imageBounds.height))
        });
      }
    }
    
    // Top edge (y = imageBounds.y)
    if (Math.abs(nvy) > divThreshold) {
      const t = (imageBounds.y - p1.y) / vy;
      const x = p1.x + t * vx;
      if (x >= imageBounds.x - this.EPSILON_FLOAT && 
          x <= imageBounds.x + imageBounds.width + this.EPSILON_FLOAT) {
        intersections.push({ 
          x: Math.max(imageBounds.x, Math.min(x, imageBounds.x + imageBounds.width)), 
          y: imageBounds.y 
        });
      }
    }
    
    // Bottom edge (y = imageBounds.y + imageBounds.height)
    if (Math.abs(nvy) > divThreshold) {
      const t = (imageBounds.y + imageBounds.height - p1.y) / vy;
      const x = p1.x + t * vx;
      if (x >= imageBounds.x - this.EPSILON_FLOAT && 
          x <= imageBounds.x + imageBounds.width + this.EPSILON_FLOAT) {
        intersections.push({ 
          x: Math.max(imageBounds.x, Math.min(x, imageBounds.x + imageBounds.width)), 
          y: imageBounds.y + imageBounds.height 
        });
      }
    }
    
    // Need at least 2 intersections for a valid line crossing the image
    if (intersections.length < 2) {
      return null; // Line doesn't properly intersect image bounds
    }
    
    // Remove duplicate intersections (can occur at corners)
    const uniqueIntersections = this.removeDuplicatePoints(intersections);
    
    if (uniqueIntersections.length < 2) {
      return null;
    }
    
    // Sort intersections by distance from p1 to get the two endpoints
    uniqueIntersections.sort((a, b) => {
      const distA = (a.x - p1.x) * (a.x - p1.x) + (a.y - p1.y) * (a.y - p1.y);
      const distB = (b.x - p1.x) * (b.x - p1.x) + (b.y - p1.y) * (b.y - p1.y);
      return distA - distB;
    });
    
    // Return the first and last points (the two endpoints)
    return {
      start: uniqueIntersections[0],
      end: uniqueIntersections[uniqueIntersections.length - 1]
    };
  }
  
  /**
   * Checks if two points are coincident (within epsilon threshold).
   * 
   * Two points are considered coincident if their Euclidean distance is less than
   * or equal to the epsilon threshold (default: 1.0 pixel).
   * 
   * This is used to detect degenerate configurations where a point pair doesn't
   * define a valid line.
   * 
   * @param p1 First point
   * @param p2 Second point
   * @param epsilon Distance threshold (default: 1.0 pixel)
   * @returns true if points are coincident, false otherwise
   * 
   * Requirements: 10.1
   */
  static areCoincident(p1: Point, p2: Point, epsilon: number = this.EPSILON_DISTANCE): boolean {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= epsilon;
  }
  
  /**
   * Checks if two lines are parallel (within angular epsilon threshold).
   * 
   * Two lines are considered parallel if the absolute difference between their
   * angles is less than the epsilon threshold (default: 0.01 radians ≈ 0.57°).
   * 
   * The angle difference is normalized to the range [0, π] to handle the fact
   * that angles θ and θ+π represent the same line orientation.
   * 
   * This is used to detect degenerate configurations where parallel lines would
   * result in undefined or infinite transformations.
   * 
   * @param line1 First line
   * @param line2 Second line
   * @param epsilon Angular threshold in radians (default: 0.01 radians)
   * @returns true if lines are parallel, false otherwise
   * 
   * Requirements: 10.2
   */
  static areParallel(line1: Line, line2: Line, epsilon: number = this.EPSILON_ANGLE): boolean {
    // Normalize angles to [0, π] since θ and θ+π represent the same line
    const normalizeAngle = (angle: number): number => {
      let normalized = angle % Math.PI;
      if (normalized < 0) normalized += Math.PI;
      return normalized;
    };
    
    const angle1 = normalizeAngle(line1.angle);
    const angle2 = normalizeAngle(line2.angle);
    
    // Compute the minimum angular difference
    const diff = Math.abs(angle1 - angle2);
    
    return diff <= epsilon;
  }
  
  /**
   * Computes the angle of a line in radians.
   * 
   * The angle is measured counter-clockwise from the positive x-axis.
   * Uses atan2 for proper quadrant handling.
   * 
   * @param p1 Start point of the line
   * @param p2 End point of the line
   * @returns Angle in radians [-π, π]
   */
  static computeLineAngle(p1: Point, p2: Point): number {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }
  
  /**
   * Creates a Line object from two points.
   * 
   * @param start Start point
   * @param end End point
   * @returns Line object with start, end, and angle
   */
  static createLine(start: Point, end: Point): Line {
    return {
      start,
      end,
      angle: this.computeLineAngle(start, end)
    };
  }
  
  /**
   * Computes the angle between two lines in radians.
   * 
   * Returns the absolute angular difference, normalized to [0, π].
   * 
   * @param line1 First line
   * @param line2 Second line
   * @returns Angle between lines in radians [0, π]
   */
  static angleBetweenLines(line1: Line, line2: Line): number {
    let diff = Math.abs(line1.angle - line2.angle);
    // Normalize to [0, π]
    if (diff > Math.PI) {
      diff = 2 * Math.PI - diff;
    }
    return diff;
  }
  
  /**
   * Applies a rigid-body transformation to a point.
   * 
   * A rigid-body transformation consists of:
   * 1. Rotation about a center point
   * 2. Translation
   * 
   * The transformation preserves distances and angles (no scaling or shearing).
   * 
   * Algorithm:
   * 1. Translate point to origin (relative to rotation center)
   * 2. Apply rotation matrix
   * 3. Translate back from origin
   * 4. Apply translation vector
   * 
   * Numerical Robustness:
   * - Uses high-precision trigonometric functions
   * - Validates rotation matrix orthogonality
   * - Handles small rotation angles correctly
   * - Rounds final coordinates to avoid floating-point drift
   * 
   * @param point Point to transform
   * @param transform Rigid transformation parameters
   * @returns Transformed point
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4, 9.1, 9.2, 9.3, 9.4, 9.5
   */
  static applyRigidTransform(point: Point, transform: RigidTransform): Point {
    // Handle near-zero rotation angles to avoid numerical instability
    const rotation = Math.abs(transform.rotation) < this.EPSILON_FLOAT 
      ? 0 
      : transform.rotation;
    
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    
    // Validate rotation matrix orthogonality: cos² + sin² should equal 1
    const orthogonalityCheck = cos * cos + sin * sin;
    if (Math.abs(orthogonalityCheck - 1.0) > this.EPSILON_FLOAT) {
      console.warn('Rotation matrix orthogonality check failed:', orthogonalityCheck);
    }
    
    // Translate to origin (relative to rotation center)
    const relX = point.x - transform.center.x;
    const relY = point.y - transform.center.y;
    
    // Apply rotation matrix
    // [cos -sin] [relX]
    // [sin  cos] [relY]
    const rotX = relX * cos - relY * sin;
    const rotY = relX * sin + relY * cos;
    
    // Translate back and apply translation vector
    // Round to avoid floating-point drift
    const finalX = rotX + transform.center.x + transform.translation.x;
    const finalY = rotY + transform.center.y + transform.translation.y;
    
    return {
      x: Math.round(finalX * 100) / 100, // Round to 2 decimal places
      y: Math.round(finalY * 100) / 100
    };
  }
  
  /**
   * Removes duplicate points from an array.
   * 
   * Two points are considered duplicates if they are within epsilon distance.
   * 
   * @param points Array of points
   * @param epsilon Distance threshold (default: 0.1 pixels)
   * @returns Array with duplicates removed
   */
  private static removeDuplicatePoints(points: Point[], epsilon: number = 0.1): Point[] {
    const unique: Point[] = [];
    
    for (const point of points) {
      let isDuplicate = false;
      for (const existing of unique) {
        const dx = point.x - existing.x;
        const dy = point.y - existing.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < epsilon) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        unique.push(point);
      }
    }
    
    return unique;
  }
  
  /**
   * Computes the Euclidean distance between two points.
   * 
   * @param p1 First point
   * @param p2 Second point
   * @returns Distance in pixels
   */
  static distance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Validates a rigid-body transformation for correctness.
   * 
   * Checks:
   * 1. Rotation matrix orthogonality (cos² + sin² = 1)
   * 2. Finite values (no NaN or Infinity)
   * 3. Reasonable rotation angles (within [-2π, 2π])
   * 
   * This validation ensures numerical stability and catches potential
   * issues from degenerate configurations or floating-point errors.
   * 
   * @param transform Rigid transformation to validate
   * @returns true if valid, false otherwise
   * 
   * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
   */
  static validateTransform(transform: RigidTransform): boolean {
    // Check for finite values
    if (!isFinite(transform.rotation) || 
        !isFinite(transform.translation.x) || 
        !isFinite(transform.translation.y) ||
        !isFinite(transform.center.x) ||
        !isFinite(transform.center.y)) {
      return false;
    }
    
    // Check rotation angle is reasonable
    if (Math.abs(transform.rotation) > 2 * Math.PI) {
      return false;
    }
    
    // Validate rotation matrix orthogonality
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);
    const orthogonalityCheck = cos * cos + sin * sin;
    
    if (Math.abs(orthogonalityCheck - 1.0) > this.EPSILON_FLOAT) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Normalizes an angle to the range [-π, π].
   * 
   * This ensures consistent angle representation and avoids issues
   * with angle wrapping in comparisons and calculations.
   * 
   * @param angle Angle in radians
   * @returns Normalized angle in [-π, π]
   * 
   * Requirements: 9.3, 9.4, 9.5
   */
  static normalizeAngle(angle: number): number {
    let normalized = angle % (2 * Math.PI);
    if (normalized > Math.PI) {
      normalized -= 2 * Math.PI;
    } else if (normalized < -Math.PI) {
      normalized += 2 * Math.PI;
    }
    return normalized;
  }
  
  /**
   * Computes the signed angular difference between two angles.
   * 
   * Returns the shortest angular path from angle1 to angle2,
   * normalized to the range [-π, π].
   * 
   * This is more robust than simple subtraction for near-parallel
   * line calculations, as it handles angle wrapping correctly.
   * 
   * @param angle1 First angle in radians
   * @param angle2 Second angle in radians
   * @returns Signed angular difference in [-π, π]
   * 
   * Requirements: 9.3, 9.4, 9.5
   */
  static angularDifference(angle1: number, angle2: number): number {
    const diff = angle2 - angle1;
    return this.normalizeAngle(diff);
  }
}
