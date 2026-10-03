import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Report logo, downscaled at upload; width/height keep the aspect ratio for the PDF. */
export interface ReportLogo { dataUrl: string; width: number; height: number }

/**
 * User preferences (Settings dialog, BUGS UI6-11). Stored in this browser —
 * they are conveniences, not case data.
 */
interface SettingsState {
    /** Logo used by reports that don't set their own. */
    defaultLogo: ReportLogo | null;
    /** Institution name pre-filled on new reports. */
    defaultInstitution: string;
    /** Clicks snap onto existing measurement points while placing. */
    snapToPoints: boolean;
    /** New tools reuse landmarks already placed by other measurements. */
    reuseLandmarks: boolean;
    /** Metrics offered as planning targets (keys from features/planning2d/metrics.ts). */
    targetKeys: string[];
    /** Bumped to send the floating image toolbar back to its default dock. */
    toolbarResetAt: number;
    set: (patch: Partial<Omit<SettingsState, 'set' | 'resetToolbar'>>) => void;
    resetToolbar: () => void;
}

export const useSettings = create<SettingsState>()(
    persist(
        (set) => ({
            defaultLogo: null,
            defaultInstitution: '',
            snapToPoints: true,
            reuseLandmarks: true,
            targetKeys: ['tk', 'll', 'sva'],
            toolbarResetAt: 0,
            set: (patch) => set(patch),
            resetToolbar: () => set({ toolbarResetAt: Date.now() }),
        }),
        {
            name: 'spinesurge-settings',
            storage: createJSONStorage(() => localStorage),
            partialize: (s) => ({
                defaultLogo: s.defaultLogo,
                defaultInstitution: s.defaultInstitution,
                snapToPoints: s.snapToPoints,
                reuseLandmarks: s.reuseLandmarks,
                targetKeys: s.targetKeys,
            }),
        },
    ),
);

/** Read an image file into a PNG data URL no larger than `max` px on its long side. */
export function readLogoFile(file: File, max = 320): Promise<ReportLogo> {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) { reject(new Error('Please choose an image file (PNG, JPG or SVG).')); return; }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const w0 = img.naturalWidth || 200, h0 = img.naturalHeight || 200;
            const s = Math.min(1, max / Math.max(w0, h0));
            const c = document.createElement('canvas');
            c.width = Math.round(w0 * s);
            c.height = Math.round(h0 * s);
            c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve({ dataUrl: c.toDataURL('image/png'), width: c.width, height: c.height });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
        img.src = url;
    });
}
