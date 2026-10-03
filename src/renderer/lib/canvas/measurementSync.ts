import type { Measurement } from './CanvasManager';

/** Push store/context measurements into CanvasManager without triggering a store write. */
export function syncManagerMeasurements(manager: any, measurements: Measurement[]) {
    if (!manager?.current?.data) {
        return;
    }
    const copy = measurements.map((m) => ({
        ...m,
        points: m.points.map((p) => ({ ...p })),
        result: m.result,
        measurement: m.measurement ? { ...m.measurement } : m.measurement,
    }));
    // Never mutate a history node in place: earlier undo states must stay intact (UI6-01).
    if (typeof manager.replaceCurrentMeasurements === 'function') manager.replaceCurrentMeasurements(copy);
    else manager.current.data.measurements = copy;
}

export function measurementsDiffer(a: Measurement[], b: Measurement[]): boolean {
    if (a.length !== b.length) {
        return true;
    }
    const bIds = new Set(b.map((m) => m.id));
    return a.some((m) => !bIds.has(m.id));
}

/** Resolve the active measurement list: context state takes priority over top-level store. */
export function resolveActiveMeasurements(state: {
    activeContextId: string | null;
    contextStates: { contextId: string; measurements: Measurement[] }[];
    measurements: Measurement[];
}): Measurement[] {
    if (state.activeContextId) {
        const ctx = state.contextStates.find((s) => s.contextId === state.activeContextId);
        if (ctx) {
            return ctx.measurements ?? [];
        }
    }
    return state.measurements;
}
