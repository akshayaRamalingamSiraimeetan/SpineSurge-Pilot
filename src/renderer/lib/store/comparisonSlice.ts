import { StateCreator } from 'zustand';
import { Measurement } from './types';
import { type AppState } from './index';

export interface ComparisonSlice {
    isComparisonMode: boolean;
    activeCanvasSide: 'left' | 'right';
    comparison: {
        left: {
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
    /** Persist current comparison.left/right state into the active context so it
     *  survives leaving/re-entering Compare mode and page reloads. */
    persistComparisonState: () => Promise<void>;
}

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
    setComparisonImage: (side, imageUrl) => set((state) => ({
        comparison: {
            ...state.comparison,
            [side]: {
                ...state.comparison[side],
                image: imageUrl,
            }
        }
    })),
    setComparisonMeasurements: (side, measurements) => set((state) => ({
        comparison: {
            ...state.comparison,
            [side]: {
                ...state.comparison[side],
                measurements
            }
        }
    })),
    setComparisonImplants: (side, implants) => set((state) => ({
        comparison: {
            ...state.comparison,
            [side]: {
                ...state.comparison[side],
                implants
            }
        }
    })),
    persistComparisonState: async () => {
        const state = get();
        if (!state.activeContextId) return;
        const { left, right } = state.comparison;
        await state.updateContextState(state.activeContextId, {
            comparisonLeft:  { image: left.image,  measurements: left.measurements,  implants: left.implants  },
            comparisonRight: { image: right.image, measurements: right.measurements, implants: right.implants },
        });
    },
});
