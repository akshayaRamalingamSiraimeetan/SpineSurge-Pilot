import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the API layer ─────────────────────────────────────────────────────
const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
};

const contextsByPatient: Record<string, any[]> = {};
let getContextsImpl: (pid: string) => Promise<any[]> = async (pid) => contextsByPatient[pid] ?? [];
const saveContext = vi.fn(async (_payload: any) => ({}));

vi.mock('../api', () => ({
    API_BASE: 'http://test',
    resolveAssetUrl: (u: string) => u,
    api: {
        getPatients: vi.fn(async () => [
            { id: 'A', name: 'A', visits: [], studies: [] },
            { id: 'B', name: 'B', visits: [], studies: [] },
        ]),
        getContexts: (pid: string) => getContextsImpl(pid),
        saveContext: (p: any) => saveContext(p),
        savePatient: vi.fn(async () => ({})),
        saveVisit: vi.fn(async () => ({})),
        saveStudy: vi.fn(async () => ({})),
    },
}));

import { useAppStore } from './index';

const ctx = (id: string, patientId: string, extra: any = {}) => ({
    id, patientId, studyIds: ['s1'], mode: 'plan', name: id, lastModified: '2026-01-01',
    measurements: [], implants: [], toolState: {}, currentImage: null, ...extra,
});

beforeEach(async () => {
    saveContext.mockClear();
    getContextsImpl = async (pid) => contextsByPatient[pid] ?? [];
    contextsByPatient.A = [ctx('cA', 'A', { measurements: [{ id: 'mA', toolKey: 'cobb', points: [] }], currentImage: 'http://img/a.png' })];
    contextsByPatient.B = [ctx('cB', 'B')];
    useAppStore.setState({ token: 't', patients: [
        { id: 'A', name: 'A', visits: [], studies: [] } as any,
        { id: 'B', name: 'B', visits: [], studies: [] } as any,
    ] });
    useAppStore.getState().resetWorkspace();
});

describe('case isolation', () => {
    it('switching patient clears the previous case (NAV-03)', async () => {
        await useAppStore.getState().setActivePatient('A', 'cA');
        expect(useAppStore.getState().measurements).toHaveLength(1);
        expect(useAppStore.getState().currentImage).toBe('http://img/a.png');

        await useAppStore.getState().setActivePatient('B');
        const s = useAppStore.getState();
        expect(s.measurements).toHaveLength(0);
        expect(s.currentImage).toBeNull();
        expect(s.activeContextId).toBeNull();
    });

    it('a slow response for A cannot land under B (NAV-04)', async () => {
        const slowA = deferred<any[]>();
        getContextsImpl = (pid) => (pid === 'A' ? slowA.promise : Promise.resolve(contextsByPatient[pid]));
        const pA = useAppStore.getState().setActivePatient('A', 'cA');
        await useAppStore.getState().setActivePatient('B');
        slowA.resolve(contextsByPatient.A);
        await pA;
        const s = useAppStore.getState();
        expect(s.activePatientId).toBe('B');
        expect(s.contexts.map(c => c.id)).toEqual(['cB']);
        expect(s.measurements).toHaveLength(0);
    });

    it('new context for another patient does not inherit measurements', async () => {
        await useAppStore.getState().setActivePatient('A', 'cA');
        await useAppStore.getState().setActivePatient('B');
        await useAppStore.getState().addContext({ id: 'cB2', patientId: 'B', studyIds: ['s2'], mode: 'plan', name: 'x', lastModified: '' });
        const payload = saveContext.mock.calls.at(-1)![0];
        expect(payload.state.measurements).toEqual([]);
    });

    it('switching context sets every per-case field (WS-01)', async () => {
        contextsByPatient.A.push(ctx('cA2', 'A'));
        await useAppStore.getState().setActivePatient('A', 'cA');
        useAppStore.setState({ threeDImplants: [{ id: 'screw' } as any] });
        useAppStore.getState().setActiveContextId('cA2');
        const s = useAppStore.getState();
        expect(s.currentImage).toBeNull();
        expect(s.threeDImplants).toEqual([]);
        expect(s.measurements).toEqual([]);
    });
});

describe('save queue (WS-02)', () => {
    it('serializes and coalesces saves per context', async () => {
        await useAppStore.getState().setActivePatient('A', 'cA');
        let inFlight = 0, maxInFlight = 0;
        const gates: (() => void)[] = [];
        saveContext.mockImplementation(async () => {
            inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise<void>((r) => gates.push(r));
            inFlight--;
            return {};
        });

        const st = useAppStore.getState();
        const p1 = st.updateContextState('cA', { measurements: [{ id: '1' } as any] });
        const p2 = st.updateContextState('cA', { measurements: [{ id: '2' } as any] });
        const p3 = st.updateContextState('cA', { measurements: [{ id: '3' } as any] });

        await Promise.resolve();
        expect(saveContext).toHaveBeenCalledTimes(1);
        gates.shift()!();
        await new Promise((r) => setTimeout(r, 0));
        // p2 and p3 coalesced into one request carrying the latest data
        expect(saveContext).toHaveBeenCalledTimes(2);
        expect(saveContext.mock.calls[1][0].state.measurements[0].id).toBe('3');
        gates.shift()!();
        expect(await Promise.all([p1, p2, p3])).toEqual([true, true, true]);
        expect(maxInFlight).toBe(1);
    });

    it('reports failure when the context is unknown (WS-07)', async () => {
        expect(await useAppStore.getState().updateContextState('nope', {})).toBe(false);
    });
});
