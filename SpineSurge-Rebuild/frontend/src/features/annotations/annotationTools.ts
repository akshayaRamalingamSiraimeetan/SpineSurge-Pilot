/* Manual annotation tools (Step 7 — non-clinical markup).
 *
 * Unlike the clinical measurement tools (which feed parity-locked calculators), annotations are free
 * markup — lines, freehand pen strokes, text notes, angles, circles/ellipses, polygons. They carry no
 * clinical result; they are drawn over the radiograph and persisted alongside measurements (as
 * `annot:<kind>` items on the contexts API, so no backend change is needed). This registry maps the
 * Manual-tab tool abbreviations (workspace/data.ts) to their geometry: how many points to collect and
 * how the overlay should capture them. */
export type AnnotationKind = 'line' | 'pen' | 'text' | 'angle2' | 'angle3' | 'circle' | 'ellipse' | 'polygon';

export interface AnnotationToolSpec {
  abbr: string;
  kind: AnnotationKind;
  /** Minimum points to commit. */
  pointsNeeded: number;
  /** Polygon-style: collect ≥pointsNeeded, commit on explicit finish (double-click / Finish). */
  variable?: boolean;
  /** Freehand drag capture rather than discrete clicks. */
  freehand?: boolean;
  /** Single click then a text prompt. */
  text?: boolean;
  hint: string;
}

/** Keyed by the Manual-tab tool abbreviation. */
export const ANNOTATION_TOOLS: Record<string, AnnotationToolSpec> = {
  Line: { abbr: 'Line', kind: 'line', pointsNeeded: 2, hint: 'Click the start and end of the line.' },
  Pen: { abbr: 'Pen', kind: 'pen', pointsNeeded: 2, freehand: true, hint: 'Press and drag to draw freehand.' },
  Annotation: { abbr: 'Annotation', kind: 'text', pointsNeeded: 1, text: true, hint: 'Click to place a text note.' },
  '2 Point Angle': { abbr: '2 Point Angle', kind: 'angle2', pointsNeeded: 2, hint: 'Click two points; the angle from horizontal is shown.' },
  '3 Point Angle': { abbr: '3 Point Angle', kind: 'angle3', pointsNeeded: 3, hint: 'Click vertex-arm, vertex, then the other arm.' },
  Circle: { abbr: 'Circle', kind: 'circle', pointsNeeded: 2, hint: 'Click the centre, then a point on the edge.' },
  Ellipse: { abbr: 'Ellipse', kind: 'ellipse', pointsNeeded: 2, hint: 'Click two opposite corners of the bounding box.' },
  Polygon: { abbr: 'Polygon', kind: 'polygon', pointsNeeded: 3, variable: true, hint: 'Click vertices; double-click to close the polygon.' },
};

export function isAnnotationTool(abbr: string | null | undefined): abbr is string {
  return !!abbr && abbr in ANNOTATION_TOOLS;
}

/** Persisted measurement-channel toolKey for an annotation of a given kind. */
export const annotationToolKey = (kind: AnnotationKind): string => `annot:${kind}`;

/** Parse an `annot:<kind>` toolKey back to its kind, or null if it is not an annotation. */
export function parseAnnotationKind(toolKey: string): AnnotationKind | null {
  if (!toolKey.startsWith('annot:')) return null;
  const kind = toolKey.slice('annot:'.length) as AnnotationKind;
  return (['line', 'pen', 'text', 'angle2', 'angle3', 'circle', 'ellipse', 'polygon'] as AnnotationKind[]).includes(kind)
    ? kind
    : null;
}

/** Geometry helpers shared by the overlay renderer. */
export function angleFromHorizontal(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
}

/** Interior angle at the vertex (middle point) of a 3-point angle, in degrees [0,180]. */
export function angleAtVertex(arm1: { x: number; y: number }, vertex: { x: number; y: number }, arm2: { x: number; y: number }): number {
  const a1 = Math.atan2(arm1.y - vertex.y, arm1.x - vertex.x);
  const a2 = Math.atan2(arm2.y - vertex.y, arm2.x - vertex.x);
  let diff = Math.abs(a1 - a2) * (180 / Math.PI);
  if (diff > 180) diff = 360 - diff;
  return diff;
}
