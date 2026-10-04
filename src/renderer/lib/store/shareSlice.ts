import { StateCreator } from 'zustand';
import { AppState } from './index';

export interface ShareSlice {
    shareDialogOpen: boolean;
    setShareDialogOpen: (open: boolean) => void;
    generatedLink: string;
    /** Study the share dialog is about (people + rights) — UI12-10 */
    shareStudy: { patientId: string; studyId: string } | null;
    generateShareLink: (options?: { patientId?: string; contextId?: string; studyId?: string }) => void;
}

export const createShareSlice: StateCreator<AppState, [], [], ShareSlice> = (set, get) => ({
    shareDialogOpen: false,
    setShareDialogOpen: (open) => set({ shareDialogOpen: open, activeDialog: open ? 'share' : null }),
    generatedLink: '',
    shareStudy: null,
    generateShareLink: (options) => {
        const baseUrl = window.location.origin + window.location.pathname;
        const params = new URLSearchParams();

        const state = get();

        // Priority: options > active state. The active session is only used when
        // it belongs to that patient — never another patient's session (UI11-39).
        const pId = options?.patientId || state.activePatientId;
        const activeCtxOfPatient = state.contexts.find((c) => c.id === state.activeContextId && c.patientId === pId)?.id;
        const cId = options?.contextId || (options?.studyId ? undefined : activeCtxOfPatient);

        if (pId) params.set('patientId', pId);
        if (cId) params.set('contextId', cId);
        else if (options?.studyId) params.set('studyId', options.studyId);

        // Include currentImage for Quick Share / Non-Context Specific sharing
        if (!cId && state.currentImage && !state.currentImage.startsWith('blob:')) {
            params.set('currentImage', encodeURIComponent(state.currentImage));
        }

        // Always open in the workspace — Home/Patients ignore these params
        const hash = '#/workspace';

        const queryString = params.toString();
        const fullLink = `${baseUrl}${hash}${queryString ? '?' + queryString : ''}`;

        // The study whose people/rights the dialog manages: the given one, else the open session's
        const ctx = cId ? state.contexts.find((c) => c.id === cId) : undefined;
        const studyId = options?.studyId ?? ctx?.studyIds?.[0];
        const shareStudy = pId && studyId ? { patientId: pId, studyId } : null;

        set({ generatedLink: fullLink, shareStudy, shareDialogOpen: true, activeDialog: 'share' });
    },
});
