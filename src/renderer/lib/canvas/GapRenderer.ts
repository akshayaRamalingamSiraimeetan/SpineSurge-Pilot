import { Point } from './CanvasManager';
import { Fragment } from './FragmentSplitter';
import { RigidTransform, GeometryEngine } from './GeometryEngine';

/**
 * GapRenderer: Generates and renders the gap polygon for Open Osteotomy visualization.
 * 
 * This class provides methods for computing and rendering the surgical gap polygon
 * that appears between the transformed upper and lower fragments after an opening
 * wedge osteotomy operation.
 * 
 * The gap polygon represents the space created by the osteotomy and is rendered
 * with a pale red semi-transparent fill to clearly visualize the surgical opening.
 * 
 * Key Concepts:
 * - Gap polygon: The geometric region between transformed fragments
 * - Boundary tracing: Following fragment edges to create the gap outline
 * - Layering: Gap is rendered behind fragments for correct visual appearance
 * - Reactivity: Gap updates whenever fragment positions change
 */

export interface GapPolygon {
  vertices: Point[];
  color: string; // "rgba(255, 200, 200, 0.5)" - pale red semi-transparent
}

/**
 * GapRenderer provides gap polygon computation and rendering.
 * All methods are static and side-effect free (except rendering).
 */
export class GapRenderer {
  // Standard gap color: pale red with 50% opacity
  private static readonly GAP_COLOR = 'rgba(255, 200, 200, 0.5)';
  
  /**
   * Computes the gap polygon between transformed upper and lower fragments.
   * 
   * The gap polygon is the geometric region between the two fragments after
   * they have been transformed (rotated and translated) to create the opening.
   * 
   * Algorithm:
   * 1. Apply transformations to fragment boundary polygons
   * 2. Identify the edges of each fragment closest to the original cut line
   *    - Upper fragment: bottom edge (closest to cut)
   *    - Lower fragment: top edge (closest to cut)
   * 3. Trace the gap polygon by connecting these edges:
   *    - Start at leftmost point of upper fragment's bottom edge
   *    - Follow upper edge from left to right
   *    - Connect to rightmost point of lower fragment's top edge
   *    - Follow lower edge from right to left
   *    - Close polygon back to start
   * 4. Return polygon with vertices and color
   * 
   * Gap Polygon Tracing:
   * The gap polygon forms a closed shape that represents the surgical opening.
   * It is bounded by:
   * - Top: Bottom edge of the transformed upper fragment
   * - Bottom: Top edge of the transformed lower fragment
   * - Sides: Connections between the fragment edges
   * 
   * The polygon is traced in a consistent order (clockwise or counter-clockwise)
   * to ensure proper rendering with canvas fill operations.
   * 
   * Edge Identification:
   * For each fragment, we identify the edge closest to where the cut line was.
   * This is typically:
   * - Upper fragment: The bottom-most points of the polygon
   * - Lower fragment: The top-most points of the polygon
   * 
   * After transformation, these edges define the boundaries of the gap.
   * 
   * @param upperFragment Upper fragment (before transformation)
   * @param lowerFragment Lower fragment (before transformation)
   * @param upperTransform Transformation applied to upper fragment
   * @param lowerTransform Transformation applied to lower fragment
   * @returns GapPolygon with vertices and color
   * 
   * Requirements: 8.1, 8.2, 8.4
   */
  static computeGapPolygon(
    upperFragment: Fragment,
    lowerFragment: Fragment,
    upperTransform: RigidTransform,
    lowerTransform: RigidTransform
  ): GapPolygon {
    // Apply transformations to fragment boundaries
    const transformedUpperPolygon = upperFragment.polygon.map(point =>
      GeometryEngine.applyRigidTransform(point, upperTransform)
    );
    
    const transformedLowerPolygon = lowerFragment.polygon.map(point =>
      GeometryEngine.applyRigidTransform(point, lowerTransform)
    );
    
    // Identify the edges closest to the cut line
    // For upper fragment: bottom edge (highest y values)
    // For lower fragment: top edge (lowest y values)
    const upperBottomEdge = this.extractBottomEdge(transformedUpperPolygon);
    const lowerTopEdge = this.extractTopEdge(transformedLowerPolygon);
    
    // Trace gap polygon by connecting the edges
    // Order: upper edge (left to right) → lower edge (right to left) → close
    const gapVertices: Point[] = [];
    
    // Add upper fragment's bottom edge (left to right)
    gapVertices.push(...upperBottomEdge);
    
    // Add lower fragment's top edge (right to left for proper closure)
    gapVertices.push(...lowerTopEdge.reverse());
    
    // Polygon automatically closes when rendered
    
    return {
      vertices: gapVertices,
      color: this.GAP_COLOR
    };
  }
  
  /**
   * Extracts the bottom edge of a polygon.
   * 
   * The bottom edge consists of the vertices with the highest y-coordinates
   * (in canvas coordinates, y increases downward).
   * 
   * Algorithm:
   * 1. Find the maximum y-coordinate in the polygon
   * 2. Collect all vertices within a threshold of this maximum
   * 3. Sort these vertices by x-coordinate (left to right)
   * 4. Return the sorted edge vertices
   * 
   * The threshold allows for slight variations in y-coordinate due to
   * rotation and numerical precision, ensuring we capture the entire edge.
   * 
   * @param polygon Array of polygon vertices
   * @returns Array of points forming the bottom edge, sorted left to right
   */
  private static extractBottomEdge(polygon: Point[]): Point[] {
    if (polygon.length === 0) {
      return [];
    }
    
    // Find maximum y-coordinate (bottom of polygon in canvas coordinates)
    let maxY = polygon[0].y;
    for (const point of polygon) {
      maxY = Math.max(maxY, point.y);
    }
    
    // Collect vertices near the bottom edge
    // Use a threshold to account for numerical precision and slight variations
    const threshold = 5; // pixels
    const bottomVertices = polygon.filter(point => 
      Math.abs(point.y - maxY) <= threshold
    );
    
    // Sort left to right (ascending x)
    bottomVertices.sort((a, b) => a.x - b.x);
    
    return bottomVertices;
  }
  
  /**
   * Extracts the top edge of a polygon.
   * 
   * The top edge consists of the vertices with the lowest y-coordinates
   * (in canvas coordinates, y increases downward).
   * 
   * Algorithm:
   * 1. Find the minimum y-coordinate in the polygon
   * 2. Collect all vertices within a threshold of this minimum
   * 3. Sort these vertices by x-coordinate (left to right)
   * 4. Return the sorted edge vertices
   * 
   * The threshold allows for slight variations in y-coordinate due to
   * rotation and numerical precision, ensuring we capture the entire edge.
   * 
   * @param polygon Array of polygon vertices
   * @returns Array of points forming the top edge, sorted left to right
   */
  private static extractTopEdge(polygon: Point[]): Point[] {
    if (polygon.length === 0) {
      return [];
    }
    
    // Find minimum y-coordinate (top of polygon in canvas coordinates)
    let minY = polygon[0].y;
    for (const point of polygon) {
      minY = Math.min(minY, point.y);
    }
    
    // Collect vertices near the top edge
    // Use a threshold to account for numerical precision and slight variations
    const threshold = 5; // pixels
    const topVertices = polygon.filter(point => 
      Math.abs(point.y - minY) <= threshold
    );
    
    // Sort left to right (ascending x)
    topVertices.sort((a, b) => a.x - b.x);
    
    return topVertices;
  }
  
  /**
   * Renders the gap polygon to a canvas context.
   * 
   * The gap is rendered with a pale red semi-transparent fill to clearly
   * visualize the surgical opening. The rendering uses canvas path operations
   * for smooth, anti-aliased edges.
   * 
   * Rendering Order:
   * This method should be called BEFORE rendering the fragments to ensure
   * the gap appears behind the fragments (correct layering).
   * 
   * Algorithm:
   * 1. Begin a new canvas path
   * 2. Move to the first vertex
   * 3. Draw lines to each subsequent vertex
   * 4. Close the path (automatic line back to start)
   * 5. Fill the path with the gap color
   * 
   * The scale parameter allows for rendering at different zoom levels,
   * ensuring the gap appears correctly regardless of canvas scale.
   * 
   * @param ctx Canvas rendering context
   * @param gap Gap polygon to render
   * @param scale Scale factor for coordinate transformation (default: 1.0)
   * 
   * Requirements: 8.2, 8.3, 8.4
   */
  static renderGap(
    ctx: CanvasRenderingContext2D,
    gap: GapPolygon,
    scale: number = 1.0
  ): void {
    if (gap.vertices.length < 3) {
      // Need at least 3 vertices to form a polygon
      return;
    }
    
    // Begin path
    ctx.beginPath();
    
    // Move to first vertex
    const firstVertex = gap.vertices[0];
    ctx.moveTo(firstVertex.x * scale, firstVertex.y * scale);
    
    // Draw lines to each subsequent vertex
    for (let i = 1; i < gap.vertices.length; i++) {
      const vertex = gap.vertices[i];
      ctx.lineTo(vertex.x * scale, vertex.y * scale);
    }
    
    // Close path (draws line back to first vertex)
    ctx.closePath();
    
    // Fill with gap color (pale red semi-transparent)
    ctx.fillStyle = gap.color;
    ctx.fill();
  }
}
