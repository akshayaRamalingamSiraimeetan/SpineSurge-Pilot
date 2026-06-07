import { Point } from './CanvasManager';
import { Fragment } from './FragmentSplitter';
import { Line, RigidTransform, GeometryEngine } from './GeometryEngine';

/**
 * TransformationCalculator: Computes rigid-body transformations for fragment alignment.
 * 
 * This class calculates the rotation and translation needed to align each fragment
 * (upper and lower) with its respective reference line (AB for upper, EF for lower)
 * relative to the cut line CD.
 * 
 * The transformations are rigid-body only (rotation + translation), preserving:
 * - All distances within the fragment
 * - All angles within the fragment
 * - Fragment shape and size
 * 
 * Key Concepts:
 * - Upper fragment: Aligned relative to reference line AB
 * - Lower fragment: Aligned relative to reference line EF
 * - Both transformations reference the cut line C′D′ as the geometric baseline
 * - Rotation centers are chosen from fragment edges closest to the cut line
 * - Translations create controlled opening gaps between fragments and cut line
 * 
 * Numerical Robustness:
 * - Handles close points (1.1ε to 10ε separation) correctly
 * - Handles near-parallel lines (1° to 5° difference) correctly
 * - Uses epsilon thresholds for all floating-point comparisons
 * - Validates transformation matrices for orthogonality
 * - Normalizes angles to avoid wrapping issues
 */
export class TransformationCalculator {
  // Epsilon thresholds for numerical precision
  private static readonly EPSILON_ANGLE = 0.01; // radians (~0.57°) - for near-zero angle checks
  private static readonly EPSILON_DISTANCE = 1.0; // pixels - for distance comparisons
  private static readonly EPSILON_FLOAT = 1e-10; // for floating-point comparisons
  /**
   * Calculates the rigid-body transformation for the upper fragment.
   * 
   * The upper fragment transformation aligns the fragment geometry relative to
   * the upper reference line AB. The transformation consists of:
   * 
   * 1. Rotation: Computed based on the angular relationship between AB and the cut line CD
   *    - The rotation angle aligns the fragment's orientation with AB
   *    - Rotation is performed about a center point on the fragment's edge closest to the cut
   * 
   * 2. Translation: Positions the fragment to create a controlled opening
   *    - The fragment is moved away from the cut line in the direction of AB
   *    - Translation magnitude creates the desired gap width
   * 
   * Algorithm:
   * 1. Compute reference line angle θ_AB = atan2(AB)
   * 2. Compute cut line angle θ_CD = atan2(CD)
   * 3. Compute rotation angle: θ_rot = θ_AB - θ_CD (normalized)
   * 4. Find rotation center: centroid of fragment edge closest to cut line
   * 5. Compute translation vector to position fragment relative to AB
   * 
   * The rotation center is chosen from the fragment's edge closest to the cut line
   * to ensure the rotation opens the gap naturally. This prevents the fragment from
   * rotating in a way that would close the gap or create unnatural movement.
   * 
   * Numerical Robustness:
   * - Handles near-parallel lines (1° to 5° difference) correctly
   * - Normalizes angles to avoid wrapping issues
   * - Validates transformation matrix orthogonality
   * - Uses epsilon thresholds for floating-point comparisons
   * - Handles close points (1.1ε to 10ε separation) in rotation center calculation
   * 
   * @param upperFragment The upper fragment to transform
   * @param lineAB Upper reference line (points A and B)
   * @param cutLineCD Cut line (extended to image bounds as C′D′)
   * @returns RigidTransform with rotation angle, translation vector, and rotation center
   * 
   * Requirements: 5.1, 5.5, 6.1, 6.2, 6.3, 6.4, 9.1, 9.2, 9.3, 9.4, 9.5
   */
  static calculateUpperTransform(
    upperFragment: Fragment,
    lineAB: Line,
    cutLineCD: Line
  ): RigidTransform {
    // Compute angles with normalization for numerical stability
    const angleAB = GeometryEngine.normalizeAngle(lineAB.angle);
    const angleCD = GeometryEngine.normalizeAngle(cutLineCD.angle);
    
    // Compute rotation angle to align with AB
    // Use normalized angular difference for robustness with near-parallel lines
    let rotationAngle = GeometryEngine.angularDifference(angleCD, angleAB);
    
    // Handle near-zero rotation angles to avoid numerical instability
    if (Math.abs(rotationAngle) < this.EPSILON_ANGLE) {
      rotationAngle = 0;
    }
    
    // Find rotation center from fragment edge closest to cut line
    const rotationCenter = this.findRotationCenter(upperFragment, cutLineCD);
    
    // Compute translation vector
    // The translation moves the fragment away from the cut line
    // in the direction perpendicular to AB, creating the opening gap
    const translation = this.computeUpperTranslation(
      upperFragment,
      lineAB,
      cutLineCD,
      rotationAngle,
      rotationCenter
    );
    
    const transform: RigidTransform = {
      rotation: rotationAngle,
      translation,
      center: rotationCenter
    };
    
    // Validate transformation for numerical correctness
    if (!GeometryEngine.validateTransform(transform)) {
      console.warn('Upper fragment transformation validation failed', {
        rotation: rotationAngle,
        translation,
        center: rotationCenter,
        angleAB,
        angleCD
      });
    }
    
    return transform;
  }
  
  /**
   * Calculates the rigid-body transformation for the lower fragment.
   * 
   * The lower fragment transformation aligns the fragment geometry relative to
   * the lower reference line EF. The transformation consists of:
   * 
   * 1. Rotation: Computed based on the angular relationship between EF and the cut line CD
   *    - The rotation angle aligns the fragment's orientation with EF
   *    - Rotation is performed about a center point on the fragment's edge closest to the cut
   * 
   * 2. Translation: Positions the fragment to create a controlled opening
   *    - The fragment is moved away from the cut line in the direction of EF
   *    - Translation magnitude creates the desired gap width
   * 
   * Algorithm:
   * 1. Compute reference line angle θ_EF = atan2(EF)
   * 2. Compute cut line angle θ_CD = atan2(CD)
   * 3. Compute rotation angle: θ_rot = θ_EF - θ_CD (normalized)
   * 4. Find rotation center: centroid of fragment edge closest to cut line
   * 5. Compute translation vector to position fragment relative to EF
   * 
   * The rotation center is chosen from the fragment's edge closest to the cut line
   * to ensure the rotation opens the gap naturally. This prevents the fragment from
   * rotating in a way that would close the gap or create unnatural movement.
   * 
   * Numerical Robustness:
   * - Handles near-parallel lines (1° to 5° difference) correctly
   * - Normalizes angles to avoid wrapping issues
   * - Validates transformation matrix orthogonality
   * - Uses epsilon thresholds for floating-point comparisons
   * - Handles close points (1.1ε to 10ε separation) in rotation center calculation
   * 
   * @param lowerFragment The lower fragment to transform
   * @param lineEF Lower reference line (points E and F)
   * @param cutLineCD Cut line (extended to image bounds as C′D′)
   * @returns RigidTransform with rotation angle, translation vector, and rotation center
   * 
   * Requirements: 5.1, 5.5, 7.1, 7.2, 7.3, 7.4, 9.1, 9.2, 9.3, 9.4, 9.5
   */
  static calculateLowerTransform(
    lowerFragment: Fragment,
    lineEF: Line,
    cutLineCD: Line
  ): RigidTransform {
    // Compute angles with normalization for numerical stability
    const angleEF = GeometryEngine.normalizeAngle(lineEF.angle);
    const angleCD = GeometryEngine.normalizeAngle(cutLineCD.angle);
    
    // Compute rotation angle to align with EF
    // Use normalized angular difference for robustness with near-parallel lines
    let rotationAngle = GeometryEngine.angularDifference(angleCD, angleEF);
    
    // Handle near-zero rotation angles to avoid numerical instability
    if (Math.abs(rotationAngle) < this.EPSILON_ANGLE) {
      rotationAngle = 0;
    }
    
    // Find rotation center from fragment edge closest to cut line
    const rotationCenter = this.findRotationCenter(lowerFragment, cutLineCD);
    
    // Compute translation vector
    // The translation moves the fragment away from the cut line
    // in the direction perpendicular to EF, creating the opening gap
    const translation = this.computeLowerTranslation(
      lowerFragment,
      lineEF,
      cutLineCD,
      rotationAngle,
      rotationCenter
    );
    
    const transform: RigidTransform = {
      rotation: rotationAngle,
      translation,
      center: rotationCenter
    };
    
    // Validate transformation for numerical correctness
    if (!GeometryEngine.validateTransform(transform)) {
      console.warn('Lower fragment transformation validation failed', {
        rotation: rotationAngle,
        translation,
        center: rotationCenter,
        angleEF,
        angleCD
      });
    }
    
    return transform;
  }
  
  /**
   * Finds the rotation center for a fragment transformation.
   * 
   * The rotation center is chosen to be on the fragment's edge closest to the cut line.
   * This ensures that when the fragment rotates, it opens away from the cut line
   * naturally, creating the surgical gap.
   * 
   * Algorithm:
   * 1. Identify all polygon vertices of the fragment
   * 2. For each vertex, compute perpendicular distance to the cut line
   * 3. Find vertices within a threshold distance of the cut line (edge vertices)
   * 4. Compute the centroid of these edge vertices
   * 5. Return the centroid as the rotation center
   * 
   * The threshold distance is set to ensure we capture vertices that form the
   * edge closest to the cut, while excluding vertices far from the cut.
   * 
   * If no vertices are found within the threshold (unusual case), we fall back
   * to using the fragment's overall centroid.
   * 
   * Mathematical Details:
   * - Perpendicular distance from point P to line through A and B:
   *   d = |((B - A) × (P - A))| / |B - A|
   * - Where × denotes the 2D cross product (scalar result)
   * 
   * Numerical Robustness:
   * - Handles close points (1.1ε to 10ε separation) correctly
   * - Uses epsilon threshold for division-by-zero checks
   * - Validates line magnitude before division
   * - Falls back to fragment centroid if edge detection fails
   * 
   * @param fragment Fragment to find rotation center for
   * @param cutLine Cut line to measure distance from
   * @returns Point representing the rotation center
   * 
   * Requirements: 6.4, 7.4, 9.1, 9.2
   */
  private static findRotationCenter(fragment: Fragment, cutLine: Line): Point {
    const polygon = fragment.polygon;
    
    if (polygon.length === 0) {
      // Fallback: use fragment bounds center
      return {
        x: fragment.bounds.x + fragment.bounds.width / 2,
        y: fragment.bounds.y + fragment.bounds.height / 2
      };
    }
    
    // Compute perpendicular distance from each vertex to the cut line
    const lineVector = {
      x: cutLine.end.x - cutLine.start.x,
      y: cutLine.end.y - cutLine.start.y
    };
    const lineMagnitude = Math.sqrt(lineVector.x ** 2 + lineVector.y ** 2);
    
    // Validate line magnitude to avoid division by zero
    if (lineMagnitude < this.EPSILON_FLOAT) {
      console.warn('Cut line has near-zero magnitude, using fragment centroid');
      return this.computeCentroid(polygon);
    }
    
    // Find vertices close to the cut line (edge vertices)
    const edgeVertices: Point[] = [];
    const threshold = 50; // pixels - vertices within this distance are considered "edge"
    
    for (const vertex of polygon) {
      // Compute perpendicular distance using cross product
      const toVertex = {
        x: vertex.x - cutLine.start.x,
        y: vertex.y - cutLine.start.y
      };
      
      // 2D cross product: |lineVector × toVertex|
      const crossProduct = Math.abs(
        lineVector.x * toVertex.y - lineVector.y * toVertex.x
      );
      
      const distance = crossProduct / lineMagnitude;
      
      if (distance <= threshold) {
        edgeVertices.push(vertex);
      }
    }
    
    // If we found edge vertices, use their centroid
    if (edgeVertices.length > 0) {
      const centroid = this.computeCentroid(edgeVertices);
      return centroid;
    }
    
    // Fallback: use centroid of all vertices
    return this.computeCentroid(polygon);
  }
  
  /**
   * Computes the translation vector for the upper fragment.
   * 
   * The translation moves the upper fragment AWAY from the cut line to create
   * the opening gap. The direction is perpendicular to the cut line, pointing
   * away from the cut line (increasing the distance between fragment and cut).
   * 
   * Algorithm:
   * 1. Compute the perpendicular direction to the cut line CD
   * 2. Compute the fragment centroid
   * 3. Determine which perpendicular direction moves AWAY from the cut line
   *    (by checking which direction increases distance from cut to fragment)
   * 4. Scale the direction by the desired gap distance
   * 5. Account for the rotation angle (larger rotation = larger gap)
   * 
   * The gap distance is computed based on the angular difference between
   * AB and CD, creating a proportional opening. The reference line AB
   * influences only the rotation angle, NOT the translation direction.
   * 
   * Key Change (Bug Fix):
   * - Previous implementation moved fragments TOWARD reference lines AB/EF
   * - This made it appear that regions between cut and reference lines were deleted
   * - New implementation moves fragments AWAY from cut line CD
   * - This creates a proper opening gap while keeping fragments whole
   * 
   * Numerical Robustness:
   * - Handles near-zero perpendicular vectors
   * - Uses epsilon threshold for magnitude checks
   * - Validates direction vectors before normalization
   * - Handles near-parallel lines correctly
   * 
   * @param fragment Upper fragment
   * @param _lineAB Upper reference line (unused - only affects rotation)
   * @param cutLineCD Cut line
   * @param rotationAngle Rotation angle that will be applied
   * @param _rotationCenter Center of rotation (unused in translation calculation)
   * @returns Translation vector {x, y}
   * 
   * Requirements: 6.3, 6.5, 9.1, 9.2, 9.3, 9.4, 9.5
   */
  private static computeUpperTranslation(
    fragment: Fragment,
    _lineAB: Line,
    cutLineCD: Line,
    rotationAngle: number,
    _rotationCenter: Point
  ): Point {
    // Compute perpendicular to cut line (normal vector)
    const cutVector = {
      x: cutLineCD.end.x - cutLineCD.start.x,
      y: cutLineCD.end.y - cutLineCD.start.y
    };
    
    // Perpendicular vector (rotate 90 degrees counter-clockwise)
    const perpendicular = {
      x: -cutVector.y,
      y: cutVector.x
    };
    
    // Normalize perpendicular vector with epsilon check
    const perpMagnitude = Math.sqrt(perpendicular.x ** 2 + perpendicular.y ** 2);
    
    // Validate perpendicular magnitude to avoid division by zero
    if (perpMagnitude < this.EPSILON_FLOAT) {
      console.warn('Perpendicular vector has near-zero magnitude, using default translation');
      return { x: 0, y: -20 }; // Default: move up
    }
    
    const normalizedPerp = {
      x: perpendicular.x / perpMagnitude,
      y: perpendicular.y / perpMagnitude
    };
    
    // Determine which perpendicular direction moves AWAY from the cut line
    // For the upper fragment, we want to move in the direction that increases
    // the distance from the cut line (creating an opening gap)
    
    // Compute fragment centroid
    const fragmentCenter = this.computeCentroid(fragment.polygon);
    
    // Compute a point on the cut line (use midpoint)
    const cutMidpoint = {
      x: (cutLineCD.start.x + cutLineCD.end.x) / 2,
      y: (cutLineCD.start.y + cutLineCD.end.y) / 2
    };
    
    // Vector from cut line to fragment center
    const fromCutToFragment = {
      x: fragmentCenter.x - cutMidpoint.x,
      y: fragmentCenter.y - cutMidpoint.y
    };
    
    // Normalize for robust dot product
    const fromCutMagnitude = Math.sqrt(fromCutToFragment.x ** 2 + fromCutToFragment.y ** 2);
    if (fromCutMagnitude < this.EPSILON_FLOAT) {
      // Fragment center is on the cut line, use default upward direction
      const direction = normalizedPerp.y < 0 ? 1 : -1;
      const baseGapDistance = 20;
      const gapDistance = baseGapDistance * (1 + Math.abs(rotationAngle));
      return {
        x: direction * normalizedPerp.x * gapDistance,
        y: direction * normalizedPerp.y * gapDistance
      };
    }
    
    const normalizedFromCut = {
      x: fromCutToFragment.x / fromCutMagnitude,
      y: fromCutToFragment.y / fromCutMagnitude
    };
    
    // Dot product to determine which perpendicular direction moves away from cut
    // Positive dot product means perpendicular points in same direction as fromCut
    const dot = normalizedPerp.x * normalizedFromCut.x + normalizedPerp.y * normalizedFromCut.y;
    const direction = dot > 0 ? 1 : -1;
    
    // Gap distance based on rotation angle magnitude
    // Larger rotation = larger gap
    const baseGapDistance = 20; // pixels
    const gapDistance = baseGapDistance * (1 + Math.abs(rotationAngle));
    
    // Compute translation vector - move AWAY from cut line
    return {
      x: direction * normalizedPerp.x * gapDistance,
      y: direction * normalizedPerp.y * gapDistance
    };
  }
  
  /**
   * Computes the translation vector for the lower fragment.
   * 
   * The translation moves the lower fragment AWAY from the cut line to create
   * the opening gap. The direction is perpendicular to the cut line, pointing
   * away from the cut line (increasing the distance between fragment and cut).
   * 
   * Algorithm:
   * 1. Compute the perpendicular direction to the cut line CD
   * 2. Compute the fragment centroid
   * 3. Determine which perpendicular direction moves AWAY from the cut line
   *    (by checking which direction increases distance from cut to fragment)
   * 4. Scale the direction by the desired gap distance
   * 5. Account for the rotation angle (larger rotation = larger gap)
   * 
   * The gap distance is computed based on the angular difference between
   * EF and CD, creating a proportional opening. The reference line EF
   * influences only the rotation angle, NOT the translation direction.
   * 
   * Key Change (Bug Fix):
   * - Previous implementation moved fragments TOWARD reference lines AB/EF
   * - This made it appear that regions between cut and reference lines were deleted
   * - New implementation moves fragments AWAY from cut line CD
   * - This creates a proper opening gap while keeping fragments whole
   * 
   * Numerical Robustness:
   * - Handles near-zero perpendicular vectors
   * - Uses epsilon threshold for magnitude checks
   * - Validates direction vectors before normalization
   * - Handles near-parallel lines correctly
   * 
   * @param fragment Lower fragment
   * @param _lineEF Lower reference line (unused - only affects rotation)
   * @param cutLineCD Cut line
   * @param rotationAngle Rotation angle that will be applied
   * @param _rotationCenter Center of rotation (unused in translation calculation)
   * @returns Translation vector {x, y}
   * 
   * Requirements: 7.3, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5
   */
  private static computeLowerTranslation(
    fragment: Fragment,
    _lineEF: Line,
    cutLineCD: Line,
    rotationAngle: number,
    _rotationCenter: Point
  ): Point {
    // Compute perpendicular to cut line (normal vector)
    const cutVector = {
      x: cutLineCD.end.x - cutLineCD.start.x,
      y: cutLineCD.end.y - cutLineCD.start.y
    };
    
    // Perpendicular vector (rotate 90 degrees counter-clockwise)
    const perpendicular = {
      x: -cutVector.y,
      y: cutVector.x
    };
    
    // Normalize perpendicular vector with epsilon check
    const perpMagnitude = Math.sqrt(perpendicular.x ** 2 + perpendicular.y ** 2);
    
    // Validate perpendicular magnitude to avoid division by zero
    if (perpMagnitude < this.EPSILON_FLOAT) {
      console.warn('Perpendicular vector has near-zero magnitude, using default translation');
      return { x: 0, y: 20 }; // Default: move down
    }
    
    const normalizedPerp = {
      x: perpendicular.x / perpMagnitude,
      y: perpendicular.y / perpMagnitude
    };
    
    // Determine which perpendicular direction moves AWAY from the cut line
    // For the lower fragment, we want to move in the direction that increases
    // the distance from the cut line (creating an opening gap)
    
    // Compute fragment centroid
    const fragmentCenter = this.computeCentroid(fragment.polygon);
    
    // Compute a point on the cut line (use midpoint)
    const cutMidpoint = {
      x: (cutLineCD.start.x + cutLineCD.end.x) / 2,
      y: (cutLineCD.start.y + cutLineCD.end.y) / 2
    };
    
    // Vector from cut line to fragment center
    const fromCutToFragment = {
      x: fragmentCenter.x - cutMidpoint.x,
      y: fragmentCenter.y - cutMidpoint.y
    };
    
    // Normalize for robust dot product
    const fromCutMagnitude = Math.sqrt(fromCutToFragment.x ** 2 + fromCutToFragment.y ** 2);
    if (fromCutMagnitude < this.EPSILON_FLOAT) {
      // Fragment center is on the cut line, use default downward direction
      const direction = normalizedPerp.y > 0 ? 1 : -1;
      const baseGapDistance = 20;
      const gapDistance = baseGapDistance * (1 + Math.abs(rotationAngle));
      return {
        x: direction * normalizedPerp.x * gapDistance,
        y: direction * normalizedPerp.y * gapDistance
      };
    }
    
    const normalizedFromCut = {
      x: fromCutToFragment.x / fromCutMagnitude,
      y: fromCutToFragment.y / fromCutMagnitude
    };
    
    // Dot product to determine which perpendicular direction moves away from cut
    // Positive dot product means perpendicular points in same direction as fromCut
    const dot = normalizedPerp.x * normalizedFromCut.x + normalizedPerp.y * normalizedFromCut.y;
    const direction = dot > 0 ? 1 : -1;
    
    // Gap distance based on rotation angle magnitude
    // Larger rotation = larger gap
    const baseGapDistance = 20; // pixels
    const gapDistance = baseGapDistance * (1 + Math.abs(rotationAngle));
    
    // Compute translation vector - move AWAY from cut line
    return {
      x: direction * normalizedPerp.x * gapDistance,
      y: direction * normalizedPerp.y * gapDistance
    };
  }
  
  /**
   * Computes the centroid (geometric center) of a set of points.
   * 
   * The centroid is the average position of all points:
   * centroid = (Σ points) / n
   * 
   * @param points Array of points
   * @returns Centroid point
   */
  private static computeCentroid(points: Point[]): Point {
    if (points.length === 0) {
      return { x: 0, y: 0 };
    }
    
    let sumX = 0;
    let sumY = 0;
    
    for (const point of points) {
      sumX += point.x;
      sumY += point.y;
    }
    
    return {
      x: sumX / points.length,
      y: sumY / points.length
    };
  }
}
