/* Step 7c — undo/redo linear-model regression lock (MASTER §8.1).
 *
 * The old CanvasManager carried THREE overlapping structures for time travel: `history`
 * (past+present), `redoStack`, and a single-slot `lastState`. The latter two always mirrored each
 * other, so results were correct but the bookkeeping was redundant and fragile. 7c collapses them
 * into one linear model: `history` (past+present) + `future` (redo stack).
 *
 * These tests pin the OBSERVABLE contract across deep, interleaved undo/redo so the refinement is
 * provably behavior-preserving (divergence type: refinement — no value moved). They are written
 * against the public surface only (applyOperation / undo / redo / current / history).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasManager, StateNode } from './CanvasManager';

function freshManager(): CanvasManager {
  const m = new CanvasManager();
  const s0 = new StateNode({
    fragments: [],
    cutLines: [],
    measurements: [],
    implants: [],
    description: 'root',
  });
  m.head = s0;
  m.current = s0;
  m.history = [s0];
  return m;
}

const addMeasurement = (m: CanvasManager, n: number) =>
  m.applyOperation('ADD_MEASUREMENT', {
    toolKey: 'line',
    fragmentId: 'frag',
    points: [
      { x: n, y: n },
      { x: n + 1, y: n },
    ],
    result: 'r',
  });

describe('CanvasManager linear undo/redo (7c)', () => {
  let m: CanvasManager;
  beforeEach(() => {
    m = freshManager();
  });

  it('round-trips three ops through full undo then full redo', async () => {
    await addMeasurement(m, 1);
    await addMeasurement(m, 2);
    await addMeasurement(m, 3);
    expect(m.current?.data.measurements).toHaveLength(3);

    for (const expected of [2, 1, 0]) {
      expect(m.undo()).toBeTruthy();
      expect(m.current?.data.measurements).toHaveLength(expected);
    }
    expect(m.undo()).toBeNull(); // can't undo past the root

    for (const expected of [1, 2, 3]) {
      expect(m.redo()).toBeTruthy();
      expect(m.current?.data.measurements).toHaveLength(expected);
    }
    expect(m.redo()).toBeNull(); // nothing left to redo
  });

  it('stays consistent under interleaved undo/redo/undo/redo after two undos', async () => {
    await addMeasurement(m, 1);
    await addMeasurement(m, 2);
    await addMeasurement(m, 3);

    m.undo();
    m.undo(); // -> 1
    expect(m.current?.data.measurements).toHaveLength(1);
    m.redo(); // -> 2
    expect(m.current?.data.measurements).toHaveLength(2);
    m.undo(); // -> 1
    expect(m.current?.data.measurements).toHaveLength(1);
    m.redo(); // -> 2
    m.redo(); // -> 3
    expect(m.current?.data.measurements).toHaveLength(3);
    expect(m.redo()).toBeNull();
  });

  it('a new operation after undo clears the redo future (branching)', async () => {
    await addMeasurement(m, 1);
    await addMeasurement(m, 2); // -> 2
    m.undo(); // -> 1
    await addMeasurement(m, 9); // new branch -> 2
    expect(m.current?.data.measurements).toHaveLength(2);
    expect(m.redo()).toBeNull(); // the discarded branch is not redoable
  });

  it('history reflects only past+present; undone states leave history', async () => {
    await addMeasurement(m, 1);
    await addMeasurement(m, 2);
    expect(m.history).toHaveLength(3); // root + 2 ops
    m.undo();
    expect(m.history).toHaveLength(2); // undone state moved to the future stack
    m.redo();
    expect(m.history).toHaveLength(3);
  });
});
