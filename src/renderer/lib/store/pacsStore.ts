import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const API_BASE = 'http://localhost:3001';


export interface PACSServerConfig {
    id: string;
    name: string;
    url: string;
    aet?: string;
}

export interface PACSStudy {
    studyInstanceUID: string;
    patientName: string;
    patientID: string;
    studyDate: string;
    modality: string;
    description: string;
    numberOfInstances: number;
}

interface PACSState {
    configs: PACSServerConfig[];
    activeConfigId: string | null;
    searchResults: PACSStudy[];
    isSearching: boolean;
    isImporting: boolean;

    // Actions
    addConfig: (config: Omit<PACSServerConfig, 'id'>) => void;
    removeConfig: (id: string) => void;
    setActiveConfig: (id: string) => void;
    search: (query: { patientName?: string; patientID?: string; studyDate?: string }) => Promise<void>;
    importStudy: (studyInstanceUID: string, patientId: string, visitId?: string) => Promise<{ success: boolean; studyId: string; count: number }>;
    updateConfig: (id: string, config: Partial<Omit<PACSServerConfig, 'id'>>) => void;
}


export const usePACSStore = create<PACSState>()(
    persist(
        (set, get) => ({
            configs: [
                { id: 'default', name: 'Hospital PACS', url: 'http://localhost:8042/dicom-web', aet: 'SPINESURGE' }
            ],
            activeConfigId: 'default',
            searchResults: [],
            isSearching: false,
            isImporting: false,

            addConfig: (config) => {
                const id = crypto.randomUUID();
                set((state) => ({ configs: [...state.configs, { ...config, id }] }));
            },

            removeConfig: (id) => {
                set((state) => ({
                    configs: state.configs.filter(c => c.id !== id),
                    activeConfigId: state.activeConfigId === id ? (state.configs[0]?.id || null) : state.activeConfigId
                }));
            },

            setActiveConfig: (id) => set({ activeConfigId: id }),

            updateConfig: (id, updates) => {
                set((state) => ({
                    configs: state.configs.map(c => c.id === id ? { ...c, ...updates } : c)
                }));
            },


            search: async (query) => {
                const { activeConfigId, configs } = get();
                const config = configs.find(c => c.id === activeConfigId);
                if (!config) return;

                set({ isSearching: true, searchResults: [] });
                try {
                    const response = await fetch(`${API_BASE}/api/pacs/search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ config, query })
                    });

                    const data = await response.json();
                    if (data.error) throw new Error(data.error);
                    set({ searchResults: data });
                } catch (error) {
                    console.error("PACS Search Failed:", error);
                    set({ searchResults: [] });
                } finally {
                    set({ isSearching: false });
                }
            },

            importStudy: async (studyInstanceUID, patientId, visitId) => {
                const { activeConfigId, configs } = get();
                const config = configs.find(c => c.id === activeConfigId);
                if (!config) throw new Error("No active PACS configuration");

                set({ isImporting: true });
                try {
                    const response = await fetch(`${API_BASE}/api/pacs/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ config, studyInstanceUID, patientId, visitId })
                    });

                    const result = await response.json();
                    if (result.error) throw new Error(result.error);
                    return result;
                } finally {
                    set({ isImporting: false });
                }
            }
        }),
        {
            name: 'pacs-storage',
            partialize: (state) => ({ configs: state.configs, activeConfigId: state.activeConfigId }),
        }
    )
);
