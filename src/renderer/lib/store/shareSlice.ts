import { StateCreator } from 'zustand';
import { AppState } from './index';

export interface ShareSlice {
    shareDialogOpen: boolean;
    setShareDialogOpen: (open: boolean) => void;
    generatedLink: string;
    generateShareLink: (options?: { patientId?: string; contextId?: string }) => void;
}

export const createShareSlice: StateCreator<AppState, [], [], ShareSlice> = (set, get) => ({
    shareDialogOpen: false,
    setShareDialogOpen: (open) => set({ shareDialogOpen: open, activeDialog: open ? 'share' : null }),
    generatedLink: '',
    generateShareLink: (options) => {
        const baseUrl = window.location.origin + window.location.pathname;
        const params = new URLSearchParams();

        const state = get();

        // Priority: options > active state
        const pId = options?.patientId || state.activePatientId;
        const cId = options?.contextId || state.activeContextId;

        if (pId) params.set('patientId', pId);
        if (cId) params.set('contextId', cId);

        // Include currentImage for Quick Share / Non-Context Specific sharing
        if (!cId && state.currentImage && !state.currentImage.startsWith('blob:')) {
            params.set('currentImage', encodeURIComponent(state.currentImage));
        }

        // Add current route if needed, or default to dashboard if patient/context is present
        let hash = window.location.hash || '#/dashboard';

        const queryString = params.toString();
        const fullLink = `${baseUrl}${hash}${queryString ? '?' + queryString : ''}`;

        set({ generatedLink: fullLink, shareDialogOpen: true, activeDialog: 'share' });
    },
});
