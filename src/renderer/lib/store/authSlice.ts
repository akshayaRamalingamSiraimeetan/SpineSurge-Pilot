import { StateCreator } from 'zustand';
import { UserProfile } from './types';
import type { AppState } from './index';

export interface AuthSlice {
    isAuthenticated: boolean;
    user: UserProfile | null;
    login: (email: string) => void;
    logout: () => void;
    updateUser: (updates: Partial<UserProfile>) => void;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set) => ({
    isAuthenticated: false,
    user: null,
    login: (email: string) => set({
        isAuthenticated: true,
        user: {
            name: 'Dr. Veera',
            email,
            title: 'Chief Surgical Consultant',
            specialty: 'Spine Surgery',
            joined: '2024-12-01',
            subsection: 'Lumbar'
        }
    }),
    logout: () => set({
        isAuthenticated: false,
        user: null,
    }),
    updateUser: (updates) => set((state) => ({
        user: state.user ? { ...state.user, ...updates } : null
    })),
});
