/* 3D planning state (pedicle workflow, screws/rods, segmentation controls, ROI crop).
 *
 * A focused Zustand store separate from the 2D workspace store — the 3D workspace has its own,
 * non-overlapping concerns. Mirrors the old repo's dicomSlice model but typed and trimmed to what
 * the rebuilt UI uses. Pure state + reducers; Cornerstone side effects live in the viewer. */
import { create } from 'zustand';
import { DEFAULT_HU_THRESHOLD } from '../volumePresets';
import { reconcileScrewSize } from './screwTrajectory';
import {
  FULL_ROI,
  type PedicleSimulation,
  type RenderMode,
  type RoiCrop,
  type ScrewProperties,
  type SegmentationTool,
  type ThreeDImplant,
} from './types';

interface PlanningState {
  // workflow
  workflowStep: number; // 1..5
  screwLevel: string;
  // entities
  simulations: PedicleSimulation[];
  implants: ThreeDImplant[];
  selectedImplantId: string | null;
  // 3D rendering controls
  renderMode: RenderMode;
  isoThreshold: number; // segmentation mask threshold (HU)
  volumeThreshold: number; // volume-mode opacity threshold (HU)
  segTool: SegmentationTool;
  roiCrop: RoiCrop;

  // actions
  setWorkflowStep: (step: number) => void;
  setScrewLevel: (level: string) => void;
  addSimulation: (sim: PedicleSimulation) => void;
  addImplant: (implant: ThreeDImplant) => void;
  updateImplant: (id: string, patch: Partial<ThreeDImplant>) => void;
  updateScrewProps: (id: string, props: Partial<ScrewProperties>) => void;
  removeImplant: (id: string) => void;
  selectImplant: (id: string | null) => void;
  setRenderMode: (mode: RenderMode) => void;
  setIsoThreshold: (v: number) => void;
  setVolumeThreshold: (v: number) => void;
  setSegTool: (t: SegmentationTool) => void;
  updateRoiCrop: (patch: Partial<RoiCrop>) => void;
  setGrading: (simId: string, side: 'left' | 'right', pct: number) => void;
  clearPlan: () => void;
}

const INITIAL = {
  workflowStep: 1,
  screwLevel: 'L4',
  simulations: [] as PedicleSimulation[],
  implants: [] as ThreeDImplant[],
  selectedImplantId: null as string | null,
  renderMode: 'volume' as RenderMode,
  isoThreshold: DEFAULT_HU_THRESHOLD,
  volumeThreshold: DEFAULT_HU_THRESHOLD,
  segTool: 'threshold' as SegmentationTool,
  roiCrop: FULL_ROI,
};

export const usePlanningStore = create<PlanningState>((set) => ({
  ...INITIAL,

  setWorkflowStep: (step) => set({ workflowStep: Math.max(1, Math.min(5, step)) }),
  setScrewLevel: (screwLevel) => set({ screwLevel }),

  addSimulation: (sim) => set((s) => ({ simulations: [...s.simulations, sim] })),
  addImplant: (implant) => set((s) => ({ implants: [...s.implants, implant], selectedImplantId: implant.id })),

  updateImplant: (id, patch) =>
    set((s) => ({ implants: s.implants.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),

  updateScrewProps: (id, props) =>
    set((s) => ({
      implants: s.implants.map((i) => {
        if (i.id !== id) return i;
        const merged = { ...i.properties, ...props };
        // Keep diameter/length consistent with the level catalog when either changes.
        if (i.level && (props.diameter !== undefined || props.length !== undefined)) {
          const { diameter, length } = reconcileScrewSize(i.level, merged.diameter, merged.length);
          return { ...i, properties: { ...merged, diameter, length } };
        }
        return { ...i, properties: merged };
      }),
    })),

  removeImplant: (id) =>
    set((s) => ({
      implants: s.implants.filter((i) => i.id !== id),
      selectedImplantId: s.selectedImplantId === id ? null : s.selectedImplantId,
    })),

  selectImplant: (selectedImplantId) => set({ selectedImplantId }),
  setRenderMode: (renderMode) => set({ renderMode }),
  setIsoThreshold: (isoThreshold) => set({ isoThreshold }),
  setVolumeThreshold: (volumeThreshold) => set({ volumeThreshold }),
  setSegTool: (segTool) => set({ segTool }),
  updateRoiCrop: (patch) => set((s) => ({ roiCrop: { ...s.roiCrop, ...patch } })),

  setGrading: (simId, side, pct) =>
    set((s) => ({
      simulations: s.simulations.map((sim) =>
        sim.id === simId ? { ...sim, grading: { ...sim.grading, [side]: pct } } : sim,
      ),
    })),

  clearPlan: () => set({ ...INITIAL }),
}));
