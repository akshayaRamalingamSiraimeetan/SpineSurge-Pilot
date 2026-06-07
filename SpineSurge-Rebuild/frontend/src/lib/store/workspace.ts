/* Workspace measurement store — serializable client state for the 2D Assessment flow.
 *
 * Holds the active tool, the points being placed, the current calibration, the list of computed
 * clinical measurements, and free-form manual annotations. When enough points are placed for the
 * active clinical tool, the matching parity-locked calculator (via the tool registry) runs and the
 * result is committed as a measurement. Annotations are committed by the overlay (no calculator).
 * Undo/redo is linear and covers BOTH measurements and annotations via a single snapshot history
 * (MASTER §8.1). No class instances / managers live here (MASTER §8.6) — only plain data. */
import { create } from 'zustand';
import { type Point, getDistance } from '@/lib/canvas/GeometryUtils';
import type { Calibration } from '@/features/measurements/calibration';
import { TOOL_SPECS, isWiredTool, type ComputedRow } from '@/features/measurements/toolRegistry';
import type { AnnotationKind } from '@/features/annotations/annotationTools';

export interface Measurement {
  id: string;
  /** Tool abbreviation that produced it. */
  tool: string;
  name: string;
  points: Point[];
  rows: ComputedRow[];
  /** Epoch ms when created (persisted; used for stable ordering). */
  timestamp: number;
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  points: Point[];
  /** Text body (text annotations only). */
  text?: string;
  color: string;
  timestamp: number;
}

/** One undo/redo frame — both editable collections move together. */
interface Snapshot {
  measurements: Measurement[];
  annotations: Annotation[];
}

interface WorkspaceState {
  /** Loaded radiograph (object URL / data URL), or null for the empty placeholder. */
  imageSrc: string | null;
  calibration: Calibration;
  /** Abbreviation of the armed tool, or null. */
  activeTool: string | null;
  /** Points placed for the in-progress measurement. */
  draft: Point[];
  measurements: Measurement[];
  annotations: Annotation[];

  /** Calibration capture: collecting two points of a known real-world distance. */
  calibrating: boolean;
  calibrationPoints: Point[];
  /** Pixel distance between the two calibration points, awaiting the user's mm input. */
  pendingCalibrationPx: number | null;

  setImage: (src: string | null) => void;
  setCalibration: (calibration: Calibration) => void;
  /** Arm a tool (clears any half-finished draft). Pass null to disarm. */
  setActiveTool: (abbr: string | null) => void;
  /** Place one point; routed to the measurement draft or the calibration capture by mode. */
  addPoint: (point: Point) => void;
  /** Commit a variable-vertex (polygon) measurement from the current draft. */
  finishMeasurement: () => void;
  clearDraft: () => void;
  removeMeasurement: (id: string) => void;
  /** Replace the measurement list (used when hydrating a saved context). Resets undo history. */
  loadMeasurements: (measurements: Measurement[]) => void;

  /** Commit a manual annotation (already-formed geometry from the overlay). */
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'timestamp'>) => void;
  removeAnnotation: (id: string) => void;
  /** Replace both collections at once (hydration). Resets undo history. */
  loadWorkspace: (data: { measurements: Measurement[]; annotations: Annotation[] }) => void;

  /** Undo/redo over measurement + annotation edits (linear past/future, mirrors CanvasManager §8.1). */
  past: Snapshot[];
  future: Snapshot[];
  undo: () => void;
  redo: () => void;

  /** Begin a two-point calibration (disarms any measurement tool). */
  startCalibration: () => void;
  /** Turn the captured pixel distance into a pixel→mm ratio and store it. */
  confirmCalibration: (mm: number) => void;
  cancelCalibration: () => void;

  reset: () => void;

  /** Counters watched by CanvasWorkspace to trigger canvas-level undo/redo. */
  undoCanvasTrigger: number;
  redoCanvasTrigger: number;
  triggerCanvasUndo: () => void;
  triggerCanvasRedo: () => void;
}

let seq = 0;
const nextId = (): string => `m${++seq}`;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  /** Current editable collections, snapshotted before a mutation for undo. */
  const snap = (s: WorkspaceState): Snapshot => ({ measurements: s.measurements, annotations: s.annotations });

  return {
    imageSrc: null,
    calibration: { pixelToMm: null },
    activeTool: null,
    draft: [],
    measurements: [],
    annotations: [],
    past: [],
    future: [],
    calibrating: false,
    calibrationPoints: [],
    pendingCalibrationPx: null,
    undoCanvasTrigger: 0,
    redoCanvasTrigger: 0,

    setImage: (src) => set({ imageSrc: src }),

    setCalibration: (calibration) => set({ calibration }),

    setActiveTool: (abbr) => set({ activeTool: abbr, draft: [], calibrating: false }),

    addPoint: (point) => {
      const state = get();

      // Calibration capture takes precedence over measurement.
      if (state.calibrating) {
        if (state.pendingCalibrationPx !== null) return; // already have two points, awaiting mm
        const pts = [...state.calibrationPoints, point];
        if (pts.length < 2) {
          set({ calibrationPoints: pts });
          return;
        }
        set({ calibrationPoints: pts, pendingCalibrationPx: getDistance(pts[0], pts[1]) });
        return;
      }

      const { activeTool, draft, calibration } = state;
      if (!isWiredTool(activeTool)) return;
      const spec = TOOL_SPECS[activeTool];

      const nextDraft = [...draft, point];
      // Variable tools (polygons) accumulate until an explicit finish; fixed tools commit at count.
      if (spec.variable || nextDraft.length < spec.pointsNeeded) {
        set({ draft: nextDraft });
        return;
      }

      // Enough points — compute and commit, then clear the draft (tool stays armed for the next one).
      const measurement: Measurement = {
        id: nextId(),
        tool: spec.abbr,
        name: spec.name,
        points: nextDraft,
        rows: spec.compute(nextDraft, calibration),
        timestamp: Date.now(),
      };
      set({ past: [...state.past, snap(state)], measurements: [...state.measurements, measurement], future: [], draft: [] });
    },

    finishMeasurement: () => {
      const state = get();
      const { activeTool, draft, calibration } = state;
      if (!isWiredTool(activeTool)) return;
      const spec = TOOL_SPECS[activeTool];
      if (!spec.variable || draft.length < spec.pointsNeeded) return;
      const measurement: Measurement = {
        id: nextId(),
        tool: spec.abbr,
        name: spec.name,
        points: draft,
        rows: spec.compute(draft, calibration),
        timestamp: Date.now(),
      };
      set({ past: [...state.past, snap(state)], measurements: [...state.measurements, measurement], future: [], draft: [] });
    },

    clearDraft: () => set({ draft: [] }),

    removeMeasurement: (id) =>
      set((s) => ({
        past: [...s.past, snap(s)],
        measurements: s.measurements.filter((m) => m.id !== id),
        future: [],
      })),

    loadMeasurements: (measurements) => set({ measurements, draft: [], past: [], future: [] }),

    addAnnotation: (annotation) =>
      set((s) => ({
        past: [...s.past, snap(s)],
        annotations: [...s.annotations, { ...annotation, id: nextId(), timestamp: Date.now() }],
        future: [],
        draft: [],
      })),

    removeAnnotation: (id) =>
      set((s) => ({
        past: [...s.past, snap(s)],
        annotations: s.annotations.filter((a) => a.id !== id),
        future: [],
      })),

    loadWorkspace: ({ measurements, annotations }) =>
      set({ measurements, annotations, draft: [], past: [], future: [] }),

    undo: () =>
      set((s) =>
        s.past.length
          ? {
              ...s.past[s.past.length - 1],
              past: s.past.slice(0, -1),
              future: [snap(s), ...s.future],
            }
          : {},
      ),

    redo: () =>
      set((s) =>
        s.future.length
          ? {
              ...s.future[0],
              future: s.future.slice(1),
              past: [...s.past, snap(s)],
            }
          : {},
      ),

    startCalibration: () =>
      set({ calibrating: true, activeTool: null, draft: [], calibrationPoints: [], pendingCalibrationPx: null }),

    confirmCalibration: (mm) => {
      const { pendingCalibrationPx } = get();
      // Need two captured points and a positive, finite mm distance to form a ratio.
      if (pendingCalibrationPx && pendingCalibrationPx > 0 && Number.isFinite(mm) && mm > 0) {
        set({ calibration: { pixelToMm: mm / pendingCalibrationPx } });
      }
      set({ calibrating: false, calibrationPoints: [], pendingCalibrationPx: null });
    },

    cancelCalibration: () =>
      set({ calibrating: false, calibrationPoints: [], pendingCalibrationPx: null }),

    triggerCanvasUndo: () => set(s => ({ undoCanvasTrigger: s.undoCanvasTrigger + 1 })),
    triggerCanvasRedo: () => set(s => ({ redoCanvasTrigger: s.redoCanvasTrigger + 1 })),

    reset: () =>
      set({
        imageSrc: null,
        calibration: { pixelToMm: null },
        activeTool: null,
        draft: [],
        measurements: [],
        annotations: [],
        past: [],
        future: [],
        calibrating: false,
        calibrationPoints: [],
        pendingCalibrationPx: null,
      }),
  };
});
