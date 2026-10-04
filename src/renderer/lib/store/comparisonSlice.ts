import { StateCreator } from 'zustand';
import { Measurement } from './types';
import { type AppState } from './index';

/**
 * Where a compare image comes from (UI12-02): a study scan and its version —
 * planId null = "No plan" (preop), 'working' = the session's current plan,
 * otherwise a saved plan id. Image B can also be a free import (source null).
 */
export interface CompareSource {
    patientId: string;
    studyId: string;
    contextId: string | null;
    planId: string | null;
    label: string;
}
export const WORKING_PLAN = 'working';

export interface ComparisonSlice {
    isComparisonMode: boolean;
    activeCanvasSide: 'left' | 'right';
    comparison: {
        left: {
            /** Version of the case shown as Image A: null = No plan (UI12-02). */
            planId?: string | null;
            image: string | null;
            measurements: Measurement[];
            implants: any[];
            canvas: {
                zoom: number;
                rotation: number;
                brightness: number;
                contrast: number;
                sharpness: number;
                flipX: boolean;
                pan: { x: number; y: number };
                pixelToMm: number | null;
                calibrationApplied: boolean;
                calibrationEnabledAt: number | null;
            };
        };
        right: {
            /** Study + version Image B was taken from; null = imported image. */
            source?: CompareSource | null;
            image: string | null;
            measurements: Measurement[];
            implants: any[];
            canvas: {
                zoom: number;
                rotation: number;
                brightness: number;
                contrast: number;
                sharpness: number;
                flipX: boolean;
                pan: { x: number; y: number };
                pixelToMm: number | null;
                calibrationApplied: boolean;
                calibrationEnabledAt: number | null;
            };
        };
    };
    setComparisonMode: (mode: boolean) => void;
    setActiveCanvasSide: (side: 'left' | 'right') => void;
    setComparisonImage: (side: 'left' | 'right', imageUrl: string | null) => void;
    setComparisonMeasurements: (side: 'left' | 'right', measurements: Measurement[]) => void;
    setComparisonImplants: (side: 'left' | 'right', implants: any[]) => void;
    /** Image A version (No plan / saved plan / working plan) — saved with the case. */
    setComparisonPlanA: (planId: string | null) => void;
    /** Image B from a study + version, or null to clear the source (free import). */
    setComparisonB: (b: { image: string; measurements: Measurement[]; implants: unknown[]; calibration?: Partial<{ pixelToMm: number | null; calibrationApplied: boolean; calibrationEnabledAt: number | null }>; source: CompareSource | null }) => void;
}

/**
 * Image B (Compare tab) belongs to the case: saved in the context's
 * toolState.comparisonB and restored on load (caseState.ts). Image A is the
 * case image itself.
 */
export const persistImageB = (get: () => AppState) => {
    const st = get();
    if (!st.activeContextId) return;
    const B = st.comparison.right;
    const ctx = st.contextStates.find((c) => c.contextId === st.activeContextId);
    // A local blob can't be saved — keep the stored URL; a cleared Image B is saved as cleared (UI11-09)
    const image = B.image === null ? null : !B.image.startsWith('blob:') ? B.image : (ctx?.toolState?.comparisonB?.image ?? null);
    void st.updateContextState(st.activeContextId, {
        toolState: {
            ...(ctx?.toolState ?? {}),
            comparisonB: {
                image,
                source: B.source ?? null,
                measurements: B.measurements,
                implants: B.implants,
                calibration: { pixelToMm: B.canvas.pixelToMm, calibrationApplied: B.canvas.calibrationApplied, calibrationEnabledAt: B.canvas.calibrationEnabledAt },
            },
        },
    });
};

export const createComparisonSlice: StateCreator<AppState, [], [], ComparisonSlice> = (set, get) => ({
    isComparisonMode: false,
    activeCanvasSide: 'left',
    comparison: {
        left: {
            image: null,
            measurements: [],
            implants: [],
            canvas: { zoom: 1, rotation: 0, brightness: 100, contrast: 100, sharpness: 0, flipX: false, pan: { x: 0, y: 0 }, pixelToMm: null, calibrationApplied: false, calibrationEnabledAt: null }
        },
        right: {
            image: null,
            measurements: [],
            implants: [],
            canvas: { zoom: 1, rotation: 0, brightness: 100, contrast: 100, sharpness: 0, flipX: false, pan: { x: 0, y: 0 }, pixelToMm: null, calibrationApplied: false, calibrationEnabledAt: null }
        }
    },
    setComparisonMode: (mode) => set(() => {
        if (mode) {
            // Entering comparison mode - Start fresh or resume previous state
            // Do NOT copy current image/measurements from normal mode
            return { isComparisonMode: true };
        } else {
            // Exiting comparison mode - DO NOT sync back to normal mode
            // This preserves the normal mode's independent state
            return { isComparisonMode: false };
        }
    }),
    setActiveCanvasSide: (side) => set({ activeCanvasSide: side }),
    setComparisonImage: (side, imageUrl) => {
        // A plain image (import / cleared) has no study source
        set((state) => ({ comparison: { ...state.comparison, [side]: { ...state.comparison[side], image: imageUrl, ...(side === 'right' ? { source: null } : {}) } } }));
        if (side === 'right') persistImageB(get);
    },
    setComparisonMeasurements: (side, measurements) => {
        set((state) => ({ comparison: { ...state.comparison, [side]: { ...state.comparison[side], measurements } } }));
        if (side === 'right') persistImageB(get);
    },
    setComparisonImplants: (side, implants) => {
        set((state) => ({ comparison: { ...state.comparison, [side]: { ...state.comparison[side], implants } } }));
        if (side === 'right') persistImageB(get);
    },
    setComparisonPlanA: (planId) => {
        set((state) => ({ comparison: { ...state.comparison, left: { ...state.comparison.left, planId } } }));
        const st = get();
        if (!st.activeContextId) return;
        const ctx = st.contextStates.find((c) => c.contextId === st.activeContextId);
        if ((ctx?.toolState?.comparisonA?.planId ?? null) === planId) return;
        void st.updateContextState(st.activeContextId, { toolState: { ...(ctx?.toolState ?? {}), comparisonA: { planId } } });
    },
    setComparisonB: ({ image, measurements, implants, calibration, source }) => {
        set((state) => ({
            comparison: {
                ...state.comparison,
                right: {
                    ...state.comparison.right,
                    image, measurements, implants, source,
                    canvas: {
                        ...state.comparison.right.canvas,
                        pixelToMm: calibration?.pixelToMm ?? null,
                        calibrationApplied: !!calibration?.calibrationApplied,
                        calibrationEnabledAt: calibration?.calibrationEnabledAt ?? null,
                    },
                },
            },
        }));
        persistImageB(get);
    },
});
