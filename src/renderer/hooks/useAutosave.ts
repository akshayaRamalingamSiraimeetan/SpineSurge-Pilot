import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';

const DEBOUNCE_MS = 3000;
const RETRY_DELAYS_MS = [5000, 15000, 45000];

/**
 * Debounced backstop save of the active context's live fields.
 *
 * - Changes caused by switching/loading a context are NOT saves (the data
 *   just came from the server) — tracked via the context id the values
 *   belong to.
 * - Retries are bounded and bound to the context they were for.
 * - On unmount (leaving the workspace) a pending save is flushed, not dropped.
 * Saves themselves are serialized per context inside updateContextState.
 */
export function useAutosave() {
    const activeContextId    = useAppStore(s => s.activeContextId);
    const measurements       = useAppStore(s => s.measurements);
    const implants           = useAppStore(s => s.implants);
    const threeDImplants     = useAppStore(s => s.threeDImplants);
    const pedicleSimulations = useAppStore(s => s.pedicleSimulations);
    const currentImage       = useAppStore(s => s.currentImage);

    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingCtxRef = useRef<string | null>(null);
    const lastCtxRef = useRef<string | null>(null);
    const mountedRef = useRef(true);

    const save = async (ctxId: string, attempt = 0): Promise<void> => {
        const state = useAppStore.getState();
        // Context changed meanwhile → this save is obsolete (its data was
        // already saved by the switch path or belongs to another case).
        if (state.activeContextId !== ctxId) return;
        pendingCtxRef.current = null;

        state.setSyncStatus('saving');
        const ok = await state.updateContextState(ctxId, {
            measurements: state.measurements,
            implants: state.implants,
            threeDImplants: state.threeDImplants,
            pedicleSimulations: state.pedicleSimulations,
            ...(state.currentImage ? { currentImage: state.currentImage } : {}),
        });

        const after = useAppStore.getState();
        if (ok) {
            after.setHasUnsyncedChanges(false);
            after.setSyncStatus('synced');
            return;
        }
        after.setSyncStatus('error');
        if (attempt < RETRY_DELAYS_MS.length && mountedRef.current) {
            timeoutRef.current = setTimeout(() => void save(ctxId, attempt + 1), RETRY_DELAYS_MS[attempt]);
        }
    };

    useEffect(() => {
        // First run for this context (mount or switch): data is fresh, don't save.
        if (lastCtxRef.current !== activeContextId) {
            lastCtxRef.current = activeContextId;
            return;
        }
        if (!activeContextId) return;

        const s = useAppStore.getState();
        s.setHasUnsyncedChanges(true);
        s.setSyncStatus('unsynced');

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        pendingCtxRef.current = activeContextId;
        timeoutRef.current = setTimeout(() => void save(activeContextId), DEBOUNCE_MS);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeContextId, measurements, implants, threeDImplants, pedicleSimulations, currentImage]);

    // Flush on unmount instead of dropping the pending save.
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            const ctx = pendingCtxRef.current;
            if (ctx) void save(ctx);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
