import { StateCreator } from 'zustand';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { AppState } from './index';

export interface LiveShareSlice {
    yDoc: Y.Doc | null;
    yProvider: WebsocketProvider | null;
    isLiveConnected: boolean;
    initializeLiveRoom: (roomId: string) => void;
    disconnectLiveRoom: () => void;
    syncToYjs: (key: string, data: any) => void;
}

export const createLiveShareSlice: StateCreator<AppState, [], [], LiveShareSlice> = (set, get, api) => {
    let unsubscribeLive: (() => void) | undefined;

    return {
        yDoc: null,
        yProvider: null,
        isLiveConnected: false,

        initializeLiveRoom: (roomId) => {
            const { disconnectLiveRoom } = get();
            disconnectLiveRoom();

            const doc = new Y.Doc();
            const provider = new WebsocketProvider(
                'ws://localhost:3001',
                `spinesurge-pro-${roomId}`,
                doc
            );


            provider.on('status', (event: any) => {
                set({ isLiveConnected: event.status === 'connected' });
            });

            // Set up observers for shared types
            const sharedMeasurements = doc.getMap('measurements');
            const sharedImplants = doc.getMap('implants');
            const sharedThreeDImplants = doc.getMap('threeDImplants');
            const sharedPedicleSimulations = doc.getMap('pedicleSimulations');
            const sharedCanvas = doc.getMap('canvas');
            const sharedAppState = doc.getMap('appState'); // New map for app-level state like currentImage

            sharedMeasurements.observe((event) => {
                if (event.transaction.local) return;
                const data = Object.values(sharedMeasurements.toJSON());
                set({ measurements: data as any[] });
            });

            sharedImplants.observe((event) => {
                if (event.transaction.local) return;
                const data = Object.values(sharedImplants.toJSON());
                set({ implants: data as any[] });
            });

            sharedThreeDImplants.observe((event) => {
                if (event.transaction.local) return;
                const data = Object.values(sharedThreeDImplants.toJSON());
                set({ threeDImplants: data as any[] });
            });

            sharedPedicleSimulations.observe((event) => {
                if (event.transaction.local) return;
                const data = Object.values(sharedPedicleSimulations.toJSON());
                set({ pedicleSimulations: data as any[] });
            });

            sharedCanvas.observe((event) => {
                if (event.transaction.local) return;
                const canvasState = sharedCanvas.toJSON();
                set((state) => ({
                    canvas: { ...state.canvas, ...canvasState }
                }));
            });

            sharedAppState.observe((event) => {
                if (event.transaction.local) return;
                const appState = sharedAppState.toJSON();
                if (appState.currentImage) {
                    set({ currentImage: appState.currentImage });
                }
            });

            // Sync local changes to Yjs using the store api
            if (unsubscribeLive) unsubscribeLive();
            unsubscribeLive = api.subscribe((state: AppState, prevState: AppState) => {
                if (state.measurements !== prevState.measurements) {
                    get().syncToYjs('measurements', state.measurements);
                }
                if (state.implants !== prevState.implants) {
                    get().syncToYjs('implants', state.implants);
                }
                if (state.threeDImplants !== prevState.threeDImplants) {
                    get().syncToYjs('threeDImplants', state.threeDImplants);
                }
                if (state.pedicleSimulations !== prevState.pedicleSimulations) {
                    get().syncToYjs('pedicleSimulations', state.pedicleSimulations);
                }
                if (state.canvas !== prevState.canvas) {
                    get().syncToYjs('canvas', state.canvas);
                }
                if (state.currentImage !== prevState.currentImage) {
                    get().syncToYjs('currentImage', state.currentImage);
                }
            });

            set({ yDoc: doc, yProvider: provider });

            // Initial Sync: Push current state to Yjs to ensure fresh peers get data
            const currentState = get();
            if (currentState.currentImage) get().syncToYjs('currentImage', currentState.currentImage);
            if (currentState.measurements.length > 0) get().syncToYjs('measurements', currentState.measurements);
            if (currentState.implants.length > 0) get().syncToYjs('implants', currentState.implants);
            if (currentState.threeDImplants.length > 0) get().syncToYjs('threeDImplants', currentState.threeDImplants);
            if (currentState.pedicleSimulations.length > 0) get().syncToYjs('pedicleSimulations', currentState.pedicleSimulations);
        },

        disconnectLiveRoom: () => {
            const { yProvider, yDoc } = get();
            if (unsubscribeLive) {
                unsubscribeLive();
                unsubscribeLive = undefined;
            }
            if (yProvider) {
                yProvider.disconnect();
                yProvider.destroy();
            }
            if (yDoc) {
                yDoc.destroy();
            }
            set({ yDoc: null, yProvider: null, isLiveConnected: false });
        },

        syncToYjs: (key, data) => {
            const { yDoc } = get();
            if (!yDoc) return;

            yDoc.transact(() => {
                if (key === 'measurements' || key === 'implants' || key === 'threeDImplants' || key === 'pedicleSimulations') {
                    const yMap = yDoc.getMap(key);
                    if (Array.isArray(data)) {
                        // Sync array to map
                        const currentIds = new Set(data.map(item => item.id));
                        // Remove items not in data
                        for (const id of yMap.keys()) {
                            if (!currentIds.has(id)) yMap.delete(id);
                        }
                        // Add/Update items
                        data.forEach(item => {
                            const existing = yMap.get(item.id);
                            if (JSON.stringify(existing) !== JSON.stringify(item)) {
                                yMap.set(item.id, item);
                            }
                        });
                    }
                } else if (key === 'canvas') {
                    const yMap = yDoc.getMap('canvas');
                    Object.entries(data).forEach(([k, v]) => {
                        if (yMap.get(k) !== v) {
                            yMap.set(k, v);
                        }
                    });
                } else if (key === 'currentImage') {
                    const yMap = yDoc.getMap('appState');
                    if (yMap.get('currentImage') !== data) {
                        yMap.set('currentImage', data);
                    }
                }
            });
        }
    };
};
