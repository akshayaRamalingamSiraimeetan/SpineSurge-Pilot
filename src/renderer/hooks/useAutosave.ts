import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';

export function useAutosave() {
    const {
        activeContextId,
        measurements,
        implants,
        threeDImplants,
        pedicleSimulations,
        currentImage,
        updateContextState,
        setSyncStatus,
        setHasUnsyncedChanges,
    } = useAppStore();

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const initialMountRef = useRef(true);

    const attemptSave = async () => {
        const state = useAppStore.getState();
        if (!state.activeContextId) return;
        
        state.setSyncStatus('saving');
        const success = await state.updateContextState(state.activeContextId, {
            measurements: state.measurements,
            implants: state.implants,
            threeDImplants: state.threeDImplants,
            pedicleSimulations: state.pedicleSimulations,
            currentImage: state.currentImage,
        });

        if (success) {
            state.setHasUnsyncedChanges(false);
            state.setSyncStatus('synced');
        } else {
            state.setSyncStatus('error');
            // Schedule a retry if it failed
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = setTimeout(attemptSave, 5000);
        }
    };

    // Watch for meaningful changes to trigger autosave
    useEffect(() => {
        if (initialMountRef.current) {
            initialMountRef.current = false;
            return;
        }

        if (!activeContextId) return;

        setHasUnsyncedChanges(true);
        setSyncStatus('unsynced');

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

        timeoutRef.current = setTimeout(async () => {
            await attemptSave();
        }, 3000);

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        };
    }, [
        measurements,
        implants,
        threeDImplants,
        pedicleSimulations,
        currentImage,
    ]);
}
