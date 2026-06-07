/* Annotation tool registry + geometry helpers. Pure, so unit-tested directly; the SVG rendering is
 * verified visually. */
import { describe, it, expect } from 'vitest';
import {
  ANNOTATION_TOOLS,
  isAnnotationTool,
  annotationToolKey,
  parseAnnotationKind,
  angleFromHorizontal,
  angleAtVertex,
} from './annotationTools';

describe('annotationTools', () => {
  it('catalogs the Manual-tab tools and guards membership', () => {
    expect(isAnnotationTool('Line')).toBe(true);
    expect(isAnnotationTool('Polygon')).toBe(true);
    expect(isAnnotationTool('Cobb')).toBe(false); // a clinical tool
    expect(isAnnotationTool(null)).toBe(false);
    expect(ANNOTATION_TOOLS.Polygon.variable).toBe(true);
    expect(ANNOTATION_TOOLS.Pen.freehand).toBe(true);
    expect(ANNOTATION_TOOLS.Annotation.text).toBe(true);
  });

  it('round-trips a kind through its persisted toolKey', () => {
    for (const spec of Object.values(ANNOTATION_TOOLS)) {
      expect(parseAnnotationKind(annotationToolKey(spec.kind))).toBe(spec.kind);
    }
    expect(parseAnnotationKind('Cobb')).toBeNull(); // a clinical measurement, not an annotation
    expect(parseAnnotationKind('annot:bogus')).toBeNull();
  });

  it('computes the angle from horizontal (orientation-agnostic)', () => {
    expect(angleFromHorizontal({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0, 9);
    expect(angleFromHorizontal({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45, 9);
    expect(angleFromHorizontal({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 9);
  });

  it('computes the interior vertex angle of a 3-point angle', () => {
    // arms along +x and +y from the vertex → 90°
    expect(angleAtVertex({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 9);
    // straight line → 180°
    expect(angleAtVertex({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(180, 9);
  });
});
