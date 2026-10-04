import type { AppState } from './index';
import type { ContextState } from './types';
import { migrateImplants } from '@/features/planning3d/implantModel';
import type { CompareSource } from './comparisonSlice';

/**
 * Shared defaults + helpers for "per-case" workspace state.
 *
 * A "case" is whatever is loaded on the canvas: one context of one patient.
 * Every time the active patient or context changes, ALL per-case fields must
 * be replaced together — partial updates are what leaked measurements, images
 * and 3D screws from one study into another (see docs/BUGS.md NAV-03, WS-01).
 */

export const defaultCanvas = () => ({
    zoom: 1,
    rotation: 0,
    brightness: 100,
    contrast: 100,
    sharpness: 0,
    flipX: false,
    pan: { x: 0, y: 0 },
    pixelToMm: null as number | null,
    calibrationApplied: false,
    calibrationEnabledAt: null as number | null,
});

export const defaultComparison = () => ({
    left: { planId: null as string | null, image: null, measurements: [], implants: [], canvas: defaultCanvas() },
    right: { source: null as CompareSource | null, image: null, measurements: [], implants: [], canvas: defaultCanvas() },
});

/** Calibration is stored per context in toolState.calibration. */
export interface StoredCalibration {
    pixelToMm: number | null;
    calibrationApplied: boolean;
    calibrationEnabledAt: number | null;
}

/** Fields that must be cleared whenever the loaded case changes. */
export function emptyCaseState(state: AppState): Partial<AppState> {
    return {
        currentImage: null,
        pendingImageFile: null,
        measurements: [],
        implants: [],
        threeDImplants: [],
        pedicleSimulations: [],
        isDicomMode: false,
        dicomSeries: [],
        activeTool: null,
        selection: null,
        canvas: defaultCanvas(),
        comparison: defaultComparison(),
        dicom3D: {
            ...state.dicom3D,
            interactionMode: 'view',
            selectedImplantId: null,
            selectedLandmarkId: null,
            metadata: null,
            currentVolumeId: null,
            isCroppingActive: false,
            showClipBox3D: false,
            roiCrop: { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 },
            workflowStep: 1,
            isSimulationActive: false,
            activeLandmarkLevel: null,
        },
    };
}

/** Compare tab: Image A version (toolState.comparisonA) and Image B (toolState.comparisonB). */
function comparisonFromContext(ctx: ContextState) {
    const b = ctx.toolState?.comparisonB;
    const base = defaultComparison();
    base.left.planId = ctx.toolState?.comparisonA?.planId ?? null;
    if (!b) return base;
    return {
        ...base,
        right: {
            source: b.source ?? null,
            image: b.image ?? null,
            measurements: b.measurements ?? [],
            implants: b.implants ?? [],
            canvas: { ...defaultCanvas(), ...(b.calibration ?? {}) },
        },
    };
}

/** Full per-case state for a loaded context (every field set, never inherited). */
export function caseStateFromContext(state: AppState, ctx: ContextState): Partial<AppState> {
    const cal: StoredCalibration | undefined = ctx.toolState?.calibration;
    return {
        ...emptyCaseState(state),
        currentImage: ctx.currentImage ?? null,
        measurements: ctx.measurements ?? [],
        implants: ctx.implants ?? [],
        threeDImplants: migrateImplants(ctx.threeDImplants),
        pedicleSimulations: ctx.pedicleSimulations ?? [],
        comparison: comparisonFromContext(ctx),
        canvas: {
            ...defaultCanvas(),
            ...(cal ? {
                pixelToMm: cal.pixelToMm ?? null,
                calibrationApplied: !!cal.calibrationApplied,
                calibrationEnabledAt: cal.calibrationEnabledAt ?? null,
            } : {}),
        },
    };
}
