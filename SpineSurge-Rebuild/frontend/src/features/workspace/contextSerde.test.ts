/* Context serializer — store ↔ backend ContextState contract. Proves the save shape matches what
 * the backend `_to_measurement` mapper reads, and that a save→load round-trip reproduces the
 * displayed rows (re-derived from points). */
import { describe, it, expect } from 'vitest';
import type { Measurement } from '@/lib/store/workspace';
import type { ContextMeasurementItem } from '@/lib/api/types';
import type { Annotation } from '@/lib/store/workspace';
import {
  toApiMeasurement,
  fromApiMeasurement,
  toApiMeasurements,
  fromApiMeasurements,
  toApiState,
  fromApiState,
} from './contextSerde';

const uncal = { pixelToMm: null };
const cobb: Measurement = {
  id: 'm1',
  tool: 'Cobb',
  name: 'Cobb Angle',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: -17.6327 },
    { x: 0, y: 100 },
    { x: 100, y: 117.6327 },
  ],
  rows: [{ label: 'Cobb Angle', display: '20.0°' }],
  timestamp: 1717000000000,
};

describe('contextSerde', () => {
  it('serializes to the backend ContextMeasurementItem contract (toolKey, points, numeric result)', () => {
    const item = toApiMeasurement(cobb);
    expect(item.toolKey).toBe('Cobb');
    expect(item.points).toHaveLength(4);
    expect(item.timestamp).toBe(1717000000000);
    expect(item.measurement).toEqual({ name: 'Cobb Angle' });
    // result is numeric value+unit (NOT a display string) — matches the backend `result` jsonb.
    expect(item.result).toMatchObject({ angle: { unit: 'deg' } });
    const angle = (item.result as { angle: { value: number } }).angle.value;
    expect(angle).toBeCloseTo(20, 4);
  });

  it('round-trips: load re-derives the same display rows from the stored points', () => {
    const item = toApiMeasurement(cobb);
    const back = fromApiMeasurement(item, uncal);
    expect(back.id).toBe('m1');
    expect(back.tool).toBe('Cobb');
    expect(back.name).toBe('Cobb Angle');
    expect(back.points).toEqual(cobb.points);
    expect(back.rows).toEqual(cobb.rows); // recomputed, identical
    expect(back.timestamp).toBe(1717000000000);
  });

  it('hydration applies the current calibration to length tools', () => {
    const sva: Measurement = {
      id: 's1', tool: 'SVA', name: 'Sagittal Vertical Axis',
      points: [{ x: 110, y: 50 }, { x: 100, y: 300 }],
      rows: [{ label: 'SVA', display: '10.0px' }],
      timestamp: 1,
    };
    const item = toApiMeasurement(sva);
    expect(item.result).toMatchObject({ sva: { unit: 'px' } }); // stored calibration-invariant (px)
    const mm = fromApiMeasurement(item, { pixelToMm: 0.5 });
    expect(mm.rows[0].display).toMatch(/mm$/); // rendered under calibration
  });

  it('tolerates an unknown tool and a server item missing optional fields', () => {
    const item: ContextMeasurementItem = { toolKey: 'Annotation', points: [{ x: 0, y: 0 }] };
    const back = fromApiMeasurement(item, uncal);
    expect(back.tool).toBe('Annotation');
    expect(back.rows).toEqual([]); // not a wired tool → no computed rows
    expect(back.id).toMatch(/^srv-Annotation-/); // synthesizes a stable id when the server omits one
  });

  it('maps lists both ways', () => {
    const items = toApiMeasurements([cobb]);
    expect(items).toHaveLength(1);
    expect(fromApiMeasurements(items, uncal)[0].tool).toBe('Cobb');
  });

  it('serializes annotations as annot:<kind> items and partitions them back on load', () => {
    const annotations: Annotation[] = [
      { id: 'a1', kind: 'line', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], color: '#22d3ee', timestamp: 10 },
      { id: 'a2', kind: 'text', points: [{ x: 3, y: 4 }], text: 'note', color: '#22d3ee', timestamp: 11 },
    ];
    const items = toApiState([cobb], annotations);
    // one clinical measurement + two annotations, ordered measurements-first
    expect(items.map((i) => i.toolKey)).toEqual(['Cobb', 'annot:line', 'annot:text']);
    expect(items[2].measurement).toMatchObject({ text: 'note' });

    const back = fromApiState(items, uncal);
    expect(back.measurements).toHaveLength(1);
    expect(back.measurements[0].tool).toBe('Cobb');
    expect(back.annotations).toHaveLength(2);
    expect(back.annotations[0]).toMatchObject({ kind: 'line', id: 'a1' });
    expect(back.annotations[1]).toMatchObject({ kind: 'text', text: 'note' });
  });
});
