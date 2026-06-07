import { Point } from './CanvasManager';
import { GeometryEngine, Rectangle } from './GeometryEngine';

/**
 * ValidationEngine: Detects degenerate configurations for the Open Osteotomy tool.
 * 
 * This class validates six-point configurations before execution to ensure they
 * define valid geometry. It detects three categories of degenerate configurations:
 * 1. Coincident points within pairs (distance ≤ ε = 1.0 pixel)
 * 2. Parallel lines (angular difference ≤ ε_angle = 0.01 radians)
 * 3. Zero-width cuts (cut width < ε_width = 2.0 pixels)
 * 
 * All methods are static and side-effect free.
 */

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * ValidationEngine provides validation for Open Osteotomy configurations.
 * Detects degenerate cases that would result in undefined or invalid geometry.
 */
export class ValidationEngine {
  // Epsilon thresholds for validation
  private static readonly EPSILON_DISTANCE = 1.0; // pixels - coincident point threshold
  private static readonly EPSILON_ANGLE = 0.01; // radians (~0.57°) - parallel line threshold
  private static readonly EPSILON_WIDTH = 2.0; // pixels - minimum cut width
  
  /**
   * Validates a six-point configuration before execution.
   * 
   * This method performs comprehensive validation to detect degenerate configurations
   * that would result in undefined geometry or numerical instability:
   * 
   * 1. Coincident Points: Checks if any point pair (AB, CD, EF) has points closer
   *    than ε = 1.0 pixel. Coincident points don't define a valid line.
   * 
   * 2. Parallel Lines: Checks if the cut line CD is within ε_angle = 0.01 radians
   *    (~0.57°) of parallel to either reference line (AB or EF). Parallel lines
   *    would result in undefined or infinite transformations.
   * 
   * 3. Zero-Width Cuts: Checks if the extrapolated cut line produces a cut width
   *    less than ε_width = 2.0 pixels. This would result in fragments that are
   *    too thin to manipulate reliably.
   * 
   * If any degenerate condition is detected, the method returns {ok: false, reason: "degenerate"}
   * without modifying any state. This ensures the image and existing fragments remain
   * unchanged when invalid configurations are detected.
   * 
   * @param points Array of six points [A, B, C, D, E, F]
   * @param imageBounds Rectangle defining the image boundaries (optional, for cut width check)
   * @returns ValidationResult with ok=true if valid, ok=false with reason if degenerate
   * 
   * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
   */
  static validateConfiguration(
    points: Point[],
    imageBounds?: Rectangle
  ): ValidationResult {
    // Ensure we have exactly 6 points
    if (points.length !== 6) {
      return {
        ok: false,
        reason: "degenerate"
      };
    }
    
    // Extract point pairs
    const [A, B, C, D, E, F] = points;
    
    // Check 1: Coincident points within pairs
    const coincidentCheck = this.checkCoincidentPoints(A, B, C, D, E, F);
    if (!coincidentCheck.ok) {
      return coincidentCheck;
    }
    
    // Check 2: Parallel lines
    const parallelCheck = this.checkParallelLines(A, B, C, D, E, F);
    if (!parallelCheck.ok) {
      return parallelCheck;
    }
    
    // Check 3: Zero-width cut (only if imageBounds provided)
    if (imageBounds) {
      const cutWidthCheck = this.checkZeroWidthCut(C, D, imageBounds);
      if (!cutWidthCheck.ok) {
        return cutWidthCheck;
      }
    }
    
    // All checks passed
    return { ok: true };
  }
  
  /**
   * Checks for coincident points within point pairs.
   * 
   * A point pair is considered coincident if the Euclidean distance between
   * the two points is less than or equal to ε = 1.0 pixel.
   * 
   * Coincident points don't define a valid line, which would cause:
   * - Division by zero in line angle calculations
   * - Undefined direction vectors
   * - Invalid extrapolation results
   * 
   * @param A First point of upper reference line
   * @param B Second point of upper reference line
   * @param C First point of cut line
   * @param D Second point of cut line
   * @param E First point of lower reference line
   * @param F Second point of lower reference line
   * @returns ValidationResult with ok=false if any pair is coincident
   * 
   * Requirements: 10.1, 10.4, 10.5
   */
  private static checkCoincidentPoints(
    A: Point,
    B: Point,
    C: Point,
    D: Point,
    E: Point,
    F: Point
  ): ValidationResult {
    // Check AB pair
    if (GeometryEngine.areCoincident(A, B, this.EPSILON_DISTANCE)) {
      return {
        ok: false,
        reason: "degenerate"
      };
    }
    
    // Check CD pair
    if (GeometryEngine.areCoincident(C, D, this.EPSILON_DISTANCE)) {
      return {
        ok: false,
        reason: "degenerate"
      };
    }
    
    // Check EF pair
    if (GeometryEngine.areCoincident(E, F, this.EPSILON_DISTANCE)) {
      return {
        ok: false,
        reason: "degenerate"
      };
    }
    
    return { ok: true };
  }
  
  /**
   * Checks for parallel lines between cut line and reference lines.
   * 
   * Lines are considered parallel if the absolute angular difference is less than
   * or equal to ε_angle = 0.01 radians (~0.57°).
   * 
   * Parallel lines would cause:
   * - Undefined or infinite rotation angles in transformations
   * - Numerical instability in fragment alignment
   * - Invalid gap polygon generation
   * 
   * The check normalizes angles to [0, π] since θ and θ+π represent the same
   * line orientation.
   * 
   * @param A First point of upper reference line
   * @param B Second point of upper reference line
   * @param C First point of cut line
   * @param D Second point of cut line
   * @param E First point of lower reference line
   * @param F Second point of lower reference line
   * @returns ValidationResult with ok=false if cut line is parallel to any reference line
   * 
   * Requirements: 10.2, 10.4, 10.5
   */
  private static checkParallelLines(
    A: Point,
    B: Point,
    C: Point,
    D: Point,
    E: Point,
    F: Point
  ): ValidationResult {
    // Create line objects
    const lineAB = GeometryEngine.createLine(A, B);
    const lineCD = GeometryEngine.createLine(C, D);
    const lineEF = GeometryEngine.createLine(E, F);
    
    // Check if CD is parallel to AB
    if (GeometryEngine.areParallel(lineCD, lineAB, this.EPSILON_ANGLE)) {
      return {
        ok: false,
        reason: "degenerate"
      };
    }
    
    // Check if CD is parallel to EF
    if (GeometryEngine.areParallel(lineCD, lineEF, this.EPSILON_ANGLE)) {
      return {
        ok: false,
        reason: "degenerate"
      };
    }
    
    return { ok: true };
  }
  
  /**
   * Checks for zero-width cuts.
   * 
   * A cut is considered zero-width if the extrapolated cut line produces a cut
   * width less than ε_width = 2.0 pixels.
   * 
   * Zero-width cuts would cause:
   * - Fragments too thin to manipulate reliably
   * - Numerical precision issues in pixel classification
   * - Invalid or invisible gap polygons
   * 
   * The cut width is measured as the perpendicular distance between the two
   * intersection points where the cut line crosses the image boundary.
   * 
   * @param C First point of cut line
   * @param D Second point of cut line
   * @param imageBounds Rectangle defining the image boundaries
   * @returns ValidationResult with ok=false if cut width is too small
   * 
   * Requirements: 10.3, 10.4, 10.5
   */
  private static checkZeroWidthCut(
    C: Point,
    D: Point,
    imageBounds: Rectangle
  ): ValidationResult {
    // Extrapolate the cut line to image bounds
    const extrapolated = GeometryEngine.extrapolateToImageBounds(C, D, imageBounds);
    
    // If extrapolation fails, it's degenerate
    if (!extrapolated) {
      return {
        ok: false,
        reason: "degenerate"
      };
    }
    
    // Compute the distance between the extrapolated endpoints
    // This represents the length of the cut line across the image
    const cutLength = GeometryEngine.distance(extrapolated.start, extrapolated.end);
    
    // If the cut line is too short, it's effectively zero-width
    if (cutLength < this.EPSILON_WIDTH) {
      return {
        ok: false,
        reason: "degenerate"
      };
    }
    
    return { ok: true };
  }
}
