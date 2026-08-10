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
        canvas,
        comparison,
        setSyncStatus,
        setHasUnsyncedChanges,
    } = useAppStore();

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const initialMountRef = useRef(true);

    const attemptSave = async () => {
        const state = useAppStore.getState();
        if (!state.activeContextId) return;

        const { left, right } = state.comparison;
        const c = state.canvas;

        // Never persist blob: URLs — they are session-only browser references that
        // become broken after a page reload. Use null so the scan record URL is used
        // on restore instead.
        const safeImage = (url: string | null | undefined) =>
            url?.startsWith('blob:') ? null : (url ?? null);

        state.setSyncStatus('saving');
        const success = await state.updateContextState(state.activeContextId, {
            measurements: state.measurements,
            implants: state.implants,
            threeDImplants: state.threeDImplants,
            pedicleSimulations: state.pedicleSimulations,
            currentImage: safeImage(state.currentImage) ?? undefined,
            // Viewport state — restores zoom/pan/rotation/windowing on reopen
            viewportState: {
                zoom:               c.zoom,
                pan:                c.pan,
                rotation:           c.rotation,
                brightness:         c.brightness,
                contrast:           c.contrast,
                sharpness:          c.sharpness,
                flipX:              c.flipX,
                pixelToMm:          c.pixelToMm,
                calibrationApplied: c.calibrationApplied,
            },
            // Always write the latest comparison state so it is never lost
            comparisonLeft:  { image: safeImage(left.image),  measurements: left.measurements,  implants: left.implants  },
            comparisonRight: { image: safeImage(right.image), measurements: right.measurements, implants: right.implants },
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
        // Viewport changes
        canvas.zoom,
        canvas.rotation,
        canvas.brightness,
        canvas.contrast,
        canvas.sharpness,
        canvas.flipX,
        canvas.pixelToMm,
        // Compare side changes — measurements, implants, and images
        comparison.left.measurements,
        comparison.left.implants,
        comparison.left.image,
        comparison.right.measurements,
        comparison.right.implants,
        comparison.right.image,
    ]);
}
