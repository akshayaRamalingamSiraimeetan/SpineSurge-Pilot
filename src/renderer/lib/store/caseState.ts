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

/** Same picture? Stored and live URLs differ in host, so compare the uploaded file name. */
const sameImage = (a?: string | null, b?: string | null) => {
    if (!a || !b) return false;
    const file = (u: string) => u.match(/\/uploads\/([^/?#]+)/)?.[1] ?? u;
    return file(a) === file(b);
};

/**
 * Calibration of a session: its own, else the calibration already made for the
 * SAME image in another session of this patient (or when that image was used as
 * Compare Image B) — an image is calibrated once, not once per session (CAL-01).
 */
export function calibrationFor(state: Pick<AppState, 'contextStates'>, ctx: ContextState): StoredCalibration | undefined {
    const own: StoredCalibration | undefined = ctx.toolState?.calibration;
    if (own?.calibrationApplied || !ctx.currentImage) return own;
    for (const other of state.contextStates) {
        if (other.contextId === ctx.contextId) continue;
        const cal: StoredCalibration | undefined = other.toolState?.calibration;
        if (cal?.calibrationApplied && cal.pixelToMm && sameImage(other.currentImage, ctx.currentImage)) return cal;
        const b = other.toolState?.comparisonB;
        if (b?.calibration?.calibrationApplied && b.calibration.pixelToMm && sameImage(b.image, ctx.currentImage)) return b.calibration;
    }
    return own;
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
    const cal = calibrationFor(state, ctx);
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
