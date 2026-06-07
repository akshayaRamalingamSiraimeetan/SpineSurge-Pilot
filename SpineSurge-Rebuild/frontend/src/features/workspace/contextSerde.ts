/* Context (de)serialization — the pure bridge between the workspace store and the backend
 * ContextState contract (`app/schemas/contexts.py` + `app/services/contexts._to_measurement`).
 *
 * Save:   store Measurement → ContextMeasurementItem (toolKey, points, numeric `result` value+unit,
 *         `measurement` meta, timestamp).
 * Load:   ContextMeasurementItem → store Measurement. Display `rows` are RE-DERIVED from the stored
 *         points via the same parity-locked calculators (formatting at render under the current
 *         calibration), so reload reproduces exactly what compute would have shown.
 *
 * Pure and unit-tested without a database — mirroring the backend's own pure `_to_*` mappers. */
import type { Calibration } from '@/features/measurements/calibration';
import { TOOL_SPECS, isWiredTool } from '@/features/measurements/toolRegistry';
import { annotationToolKey, parseAnnotationKind } from '@/features/annotations/annotationTools';
import type { Annotation, Measurement } from '@/lib/store/workspace';
import type { ContextMeasurementItem } from '@/lib/api/types';

export function toApiMeasurement(m: Measurement): ContextMeasurementItem {
  const spec = isWiredTool(m.tool) ? TOOL_SPECS[m.tool] : null;
  return {
    id: m.id,
    toolKey: m.tool,
    fragmentId: null,
    points: m.points,
    result: spec ? spec.raw(m.points) : {},
    measurement: { name: m.name },
    timestamp: m.timestamp,
  };
}

export function fromApiMeasurement(item: ContextMeasurementItem, calibration: Calibration): Measurement {
  const tool = item.toolKey;
  const spec = isWiredTool(tool) ? TOOL_SPECS[tool] : null;
  const points = item.points ?? [];
  const metaName = item.measurement && typeof item.measurement.name === 'string' ? item.measurement.name : undefined;
  return {
    id: item.id ?? `srv-${tool}-${item.timestamp ?? 0}`,
    tool,
    name: metaName ?? spec?.name ?? tool,
    points,
    rows: spec ? spec.compute(points, calibration) : [],
    timestamp: item.timestamp ?? 0,
  };
}

export const toApiMeasurements = (ms: Measurement[]): ContextMeasurementItem[] => ms.map(toApiMeasurement);

export const fromApiMeasurements = (
  items: ContextMeasurementItem[],
  calibration: Calibration,
): Measurement[] => items.map((i) => fromApiMeasurement(i, calibration));

/* ---- annotations ----
   Manual annotations ride the same measurements channel so the backend needs no new field: each is an
   `annot:<kind>` item carrying its geometry in `points` and its text/color in `measurement` meta, with
   an empty clinical `result`. On load they are partitioned back out by their toolKey prefix. */
export function toApiAnnotation(a: Annotation): ContextMeasurementItem {
  return {
    id: a.id,
    toolKey: annotationToolKey(a.kind),
    fragmentId: null,
    points: a.points,
    result: {},
    measurement: { text: a.text ?? null, color: a.color },
    timestamp: a.timestamp,
  };
}

export function fromApiAnnotation(item: ContextMeasurementItem): Annotation | null {
  const kind = parseAnnotationKind(item.toolKey);
  if (!kind) return null;
  const meta = item.measurement ?? {};
  return {
    id: item.id ?? `srv-${item.toolKey}-${item.timestamp ?? 0}`,
    kind,
    points: item.points ?? [],
    text: typeof meta.text === 'string' ? meta.text : undefined,
    color: typeof meta.color === 'string' ? meta.color : '#22d3ee',
    timestamp: item.timestamp ?? 0,
  };
}

/** Serialize the full editable workspace state (clinical measurements + manual annotations). */
export function toApiState(measurements: Measurement[], annotations: Annotation[]): ContextMeasurementItem[] {
  return [...measurements.map(toApiMeasurement), ...annotations.map(toApiAnnotation)];
}

/** Partition a hydrated context's items back into clinical measurements and manual annotations. */
export function fromApiState(
  items: ContextMeasurementItem[],
  calibration: Calibration,
): { measurements: Measurement[]; annotations: Annotation[] } {
  const measurements: Measurement[] = [];
  const annotations: Annotation[] = [];
  for (const item of items) {
    const annotation = fromApiAnnotation(item);
    if (annotation) annotations.push(annotation);
    else measurements.push(fromApiMeasurement(item, calibration));
  }
  return { measurements, annotations };
}
