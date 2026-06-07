/* Step 7c — applyOperation discriminated-union typing (MASTER §8.4).
 *
 * This pins the COMPILE-TIME contract: `applyOperation(type, params)` now type-checks `params`
 * against the operation `type`. The real assertion is `npm run type-check` (tsc covers src/) — the
 * `@ts-expect-error` lines below MUST error, and a green type-check proves they do. The runtime body
 * is never executed (the calls live in an uncalled closure), so this needs no canvas state. */
import { describe, it, expect } from 'vitest';
import { CanvasManager } from './CanvasManager';

describe('applyOperation typing (7c)', () => {
  it('enforces per-operation params at compile time', () => {
    const m = new CanvasManager();

    // Never invoked — present only so tsc checks the call signatures.
    const _contract = () => {
      // Valid calls:
      void m.applyOperation('ROTATE', { fragmentId: 'f', angleDelta: 10 });
      void m.applyOperation('ROTATE', { fragmentId: 'f', angleDelta: 10, center: { x: 0, y: 0 } });
      void m.applyOperation('MOVE', { fragmentId: 'f', deltaX: 1, deltaY: 2 });
      void m.applyOperation('CUT', { startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } });
      void m.applyOperation('ADD_MEASUREMENT', { toolKey: 'line', points: [{ x: 0, y: 0 }] });
      void m.applyOperation('DELETE_FRAGMENT', { fragmentId: 'f', skipHistory: true });

      // @ts-expect-error ROTATE requires angleDelta
      void m.applyOperation('ROTATE', { fragmentId: 'f' });
      // @ts-expect-error deltaY must be a number
      void m.applyOperation('MOVE', { fragmentId: 'f', deltaX: 1, deltaY: 'nope' });
      // @ts-expect-error CUT has no `fragmentId`-only form without the cut points
      void m.applyOperation('CUT', { fragmentId: 'f' });
      // @ts-expect-error unknown operation type is rejected
      void m.applyOperation('NOT_AN_OP', {});
    };

    expect(typeof _contract).toBe('function');
  });
});
