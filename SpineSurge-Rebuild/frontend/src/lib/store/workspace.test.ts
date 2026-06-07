/* Workspace store — point-collection → auto-compute pipeline. */
import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from './workspace';

const p = (x: number, y: number) => ({ x, y });
const reset = () => useWorkspaceStore.getState().reset();

describe('useWorkspaceStore', () => {
  beforeEach(reset);

  it('ignores points when no tool is armed', () => {
    useWorkspaceStore.getState().addPoint(p(0, 0));
    expect(useWorkspaceStore.getState().draft).toHaveLength(0);
    expect(useWorkspaceStore.getState().measurements).toHaveLength(0);
  });

  it('accumulates draft points and commits a measurement at the tool point count', () => {
    const s = useWorkspaceStore.getState();
    s.setActiveTool('Cobb'); // needs 4
    useWorkspaceStore.getState().addPoint(p(0, 0));
    useWorkspaceStore.getState().addPoint(p(100, -17.6327));
    useWorkspaceStore.getState().addPoint(p(0, 100));
    expect(useWorkspaceStore.getState().draft).toHaveLength(3);
    expect(useWorkspaceStore.getState().measurements).toHaveLength(0);

    useWorkspaceStore.getState().addPoint(p(100, 117.6327)); // 4th → commit
    const { draft, measurements } = useWorkspaceStore.getState();
    expect(draft).toHaveLength(0); // draft cleared, tool stays armed
    expect(measurements).toHaveLength(1);
    expect(measurements[0].tool).toBe('Cobb');
    expect(measurements[0].rows[0].display).toMatch(/^20\.0°$/);
  });

  it('arming a different tool clears a half-finished draft', () => {
    const s = useWorkspaceStore.getState();
    s.setActiveTool('SVA');
    useWorkspaceStore.getState().addPoint(p(1, 1));
    expect(useWorkspaceStore.getState().draft).toHaveLength(1);
    useWorkspaceStore.getState().setActiveTool('Cobb');
    expect(useWorkspaceStore.getState().draft).toHaveLength(0);
  });

  it('applies the current calibration to a length measurement', () => {
    const s = useWorkspaceStore.getState();
    s.setCalibration({ pixelToMm: 0.5 });
    s.setActiveTool('SVA'); // needs 2
    useWorkspaceStore.getState().addPoint(p(110, 50));
    useWorkspaceStore.getState().addPoint(p(100, 300));
    expect(useWorkspaceStore.getState().measurements[0].rows[0].display).toMatch(/mm$/);
  });

  it('removes a committed measurement by id', () => {
    const s = useWorkspaceStore.getState();
    s.setActiveTool('SVA');
    useWorkspaceStore.getState().addPoint(p(110, 50));
    useWorkspaceStore.getState().addPoint(p(100, 300));
    const id = useWorkspaceStore.getState().measurements[0].id;
    useWorkspaceStore.getState().removeMeasurement(id);
    expect(useWorkspaceStore.getState().measurements).toHaveLength(0);
  });

  it('captures two calibration points and derives pixelToMm from a known distance', () => {
    const s = useWorkspaceStore.getState();
    s.startCalibration();
    expect(useWorkspaceStore.getState().calibrating).toBe(true);
    useWorkspaceStore.getState().addPoint(p(0, 0));
    useWorkspaceStore.getState().addPoint(p(100, 0)); // 100 px apart
    expect(useWorkspaceStore.getState().pendingCalibrationPx).toBeCloseTo(100, 9);

    useWorkspaceStore.getState().confirmCalibration(50); // 100 px = 50 mm → 0.5 mm/px
    const st = useWorkspaceStore.getState();
    expect(st.calibration.pixelToMm).toBeCloseTo(0.5, 9);
    expect(st.calibrating).toBe(false);
    expect(st.pendingCalibrationPx).toBeNull();
  });

  it('calibration routes points away from measurement, and measurement points are ignored meanwhile', () => {
    const s = useWorkspaceStore.getState();
    s.setActiveTool('Cobb');
    s.startCalibration(); // disarms Cobb
    expect(useWorkspaceStore.getState().activeTool).toBeNull();
    useWorkspaceStore.getState().addPoint(p(0, 0));
    expect(useWorkspaceStore.getState().calibrationPoints).toHaveLength(1);
    expect(useWorkspaceStore.getState().draft).toHaveLength(0);
  });

  it('ignores a non-positive mm and leaves calibration unchanged', () => {
    const s = useWorkspaceStore.getState();
    s.startCalibration();
    useWorkspaceStore.getState().addPoint(p(0, 0));
    useWorkspaceStore.getState().addPoint(p(10, 0));
    useWorkspaceStore.getState().confirmCalibration(0); // invalid
    expect(useWorkspaceStore.getState().calibration.pixelToMm).toBeNull();
    expect(useWorkspaceStore.getState().calibrating).toBe(false);
  });

  it('cancelCalibration drops the capture without setting a ratio', () => {
    const s = useWorkspaceStore.getState();
    s.startCalibration();
    useWorkspaceStore.getState().addPoint(p(0, 0));
    useWorkspaceStore.getState().cancelCalibration();
    const st = useWorkspaceStore.getState();
    expect(st.calibrating).toBe(false);
    expect(st.calibrationPoints).toHaveLength(0);
    expect(st.calibration.pixelToMm).toBeNull();
  });

  const addSva = (n: number) => {
    useWorkspaceStore.getState().setActiveTool('SVA');
    useWorkspaceStore.getState().addPoint(p(n, 0));
    useWorkspaceStore.getState().addPoint(p(n, 100));
  };

  it('undoes and redoes measurement commits', () => {
    addSva(1);
    addSva(2);
    expect(useWorkspaceStore.getState().measurements).toHaveLength(2);
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().measurements).toHaveLength(1);
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().measurements).toHaveLength(0);
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().measurements).toHaveLength(1);
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().measurements).toHaveLength(2);
  });

  it('undo covers removal, and a new commit clears the redo future', () => {
    addSva(1);
    const id = useWorkspaceStore.getState().measurements[0].id;
    useWorkspaceStore.getState().removeMeasurement(id);
    expect(useWorkspaceStore.getState().measurements).toHaveLength(0);
    useWorkspaceStore.getState().undo(); // brings the removed one back
    expect(useWorkspaceStore.getState().measurements).toHaveLength(1);

    useWorkspaceStore.getState().undo(); // back to empty
    addSva(5); // new commit
    expect(useWorkspaceStore.getState().future).toHaveLength(0); // redo branch discarded
  });

  it('undo/redo are no-ops at the ends of history', () => {
    expect(() => useWorkspaceStore.getState().undo()).not.toThrow();
    expect(useWorkspaceStore.getState().measurements).toHaveLength(0);
    expect(() => useWorkspaceStore.getState().redo()).not.toThrow();
  });

  it('variable (polygon) tools accumulate and commit only on finishMeasurement', () => {
    const s = useWorkspaceStore.getState();
    s.setActiveTool('Canal Area'); // variable, min 3
    for (const pt of [p(0, 0), p(10, 0), p(10, 10), p(0, 10)]) useWorkspaceStore.getState().addPoint(pt);
    // 4 points placed, NOT auto-committed
    expect(useWorkspaceStore.getState().draft).toHaveLength(4);
    expect(useWorkspaceStore.getState().measurements).toHaveLength(0);

    useWorkspaceStore.getState().finishMeasurement();
    const { draft, measurements } = useWorkspaceStore.getState();
    expect(draft).toHaveLength(0);
    expect(measurements).toHaveLength(1);
    expect(measurements[0].tool).toBe('Canal Area');
    expect(measurements[0].rows[0].display).toMatch(/px²$/);
  });

  it('finishMeasurement is a no-op below the minimum vertex count', () => {
    const s = useWorkspaceStore.getState();
    s.setActiveTool('Canal Area');
    useWorkspaceStore.getState().addPoint(p(0, 0));
    useWorkspaceStore.getState().addPoint(p(10, 0)); // only 2 (< 3)
    useWorkspaceStore.getState().finishMeasurement();
    expect(useWorkspaceStore.getState().measurements).toHaveLength(0);
  });

  it('commits, removes, and undoes manual annotations', () => {
    useWorkspaceStore.getState().addAnnotation({ kind: 'line', points: [p(0, 0), p(5, 5)], color: '#22d3ee' });
    expect(useWorkspaceStore.getState().annotations).toHaveLength(1);
    const id = useWorkspaceStore.getState().annotations[0].id;

    useWorkspaceStore.getState().removeAnnotation(id);
    expect(useWorkspaceStore.getState().annotations).toHaveLength(0);
    useWorkspaceStore.getState().undo(); // brings it back
    expect(useWorkspaceStore.getState().annotations).toHaveLength(1);
    useWorkspaceStore.getState().undo(); // back to none
    expect(useWorkspaceStore.getState().annotations).toHaveLength(0);
  });

  it('undo history is shared across measurements and annotations (single linear timeline)', () => {
    addSva(1); // measurement commit
    useWorkspaceStore.getState().addAnnotation({ kind: 'text', points: [p(2, 2)], text: 'x', color: '#22d3ee' });
    expect(useWorkspaceStore.getState().measurements).toHaveLength(1);
    expect(useWorkspaceStore.getState().annotations).toHaveLength(1);

    useWorkspaceStore.getState().undo(); // undoes the annotation only
    expect(useWorkspaceStore.getState().annotations).toHaveLength(0);
    expect(useWorkspaceStore.getState().measurements).toHaveLength(1);
    useWorkspaceStore.getState().undo(); // undoes the measurement
    expect(useWorkspaceStore.getState().measurements).toHaveLength(0);
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().measurements).toHaveLength(1);
  });

  it('loadWorkspace replaces both collections and resets history', () => {
    addSva(1);
    useWorkspaceStore.getState().loadWorkspace({
      measurements: [],
      annotations: [{ id: 'srv1', kind: 'circle', points: [p(0, 0), p(3, 0)], color: '#22d3ee', timestamp: 1 }],
    });
    const st = useWorkspaceStore.getState();
    expect(st.measurements).toHaveLength(0);
    expect(st.annotations).toHaveLength(1);
    expect(st.past).toHaveLength(0);
    expect(st.future).toHaveLength(0);
  });
});
