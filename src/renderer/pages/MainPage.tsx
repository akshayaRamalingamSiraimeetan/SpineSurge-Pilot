import { Button } from "@/components/ui/button";
import { Context, Patient } from "@/lib/store/types";
import { Upload } from "lucide-react";
import { ImportDialog } from "@/features/import-export/ImportDialog";
import { useAppStore } from "@/lib/store/index";
import CanvasWorkspace from "@/features/canvas/CanvasWorkspace";
import { DICOMViewer } from "@/features/dicom/DICOMViewer";

import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "@/lib/api";

const MainPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const {
        currentImage,
        activeContextId,
        activePatientId, // Added activePatientId
        isDicomMode,
        dicomSeries,
        contexts,
        patients,
        contextStates,
        loadDicomURLs,
        setActivePatient,
        setActiveContextId,
        initializeLiveRoom,
        disconnectLiveRoom
    } = useAppStore();

    // Initialize Live Room when context OR patient is active
    useEffect(() => {
        if (activeContextId) {
            initializeLiveRoom(activeContextId);
        } else if (activePatientId && activePatientId.startsWith('quick-')) {
            // Special handling for Quick Analysis sharing - use patientId as room ID
            initializeLiveRoom(activePatientId);
        } else {
            disconnectLiveRoom();
        }
        return () => disconnectLiveRoom();
    }, [activeContextId, activePatientId, initializeLiveRoom, disconnectLiveRoom]);

    // Deep Linking Support
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const pId = queryParams.get('patientId');
        const cId = queryParams.get('contextId');
        const img = queryParams.get('currentImage');

        if (pId) {
            setActivePatient(pId, cId || undefined);
        } else if (cId) {
            setActiveContextId(cId);
        }

        if (img) {
            const decodedImg = decodeURIComponent(img);
            if (decodedImg !== useAppStore.getState().currentImage) {
                // Determine if it's a full URL or relative path
                const finalUrl = (decodedImg.startsWith('http') || decodedImg.startsWith('blob:'))
                    ? decodedImg
                    : `${API_BASE}/uploads/${decodedImg.split('/').pop()}`; // Best guess reconstruction if partial

                useAppStore.setState({ currentImage: finalUrl });
            }
        }
    }, [location.search, setActivePatient, setActiveContextId]);

    // Persist currentImage to context state whenever it changes while a context is active
    useEffect(() => {
        if (activeContextId && currentImage) {
            const state = useAppStore.getState();
            const existingState = state.contextStates.find(s => s.contextId === activeContextId);
            // Only save if the image actually changed to avoid thrashing
            if (existingState?.currentImage !== currentImage) {
                state.updateContextState(activeContextId, { currentImage });
            }
        }
    }, [currentImage, activeContextId]);

    // Populate 3D State from Context
    useEffect(() => {
        if (activeContextId) {
            const contextState = useAppStore.getState().contextStates.find(s => s.contextId === activeContextId);
            if (contextState) {
                if (contextState.threeDImplants) {
                    useAppStore.setState({ threeDImplants: contextState.threeDImplants });
                }
                if (contextState.pedicleSimulations) {
                    useAppStore.setState({ pedicleSimulations: contextState.pedicleSimulations });
                }
                if (contextState.currentImage && !useAppStore.getState().currentImage) {
                    useAppStore.setState({ currentImage: contextState.currentImage });
                }
            }
        }
    }, [activeContextId, contextStates]); // Observe contextStates for hydration

    useEffect(() => {
        if (activeContextId && !isDicomMode) {
            const context = contexts.find((c: Context) => c.id === activeContextId);
            if (context) {
                const patient = patients.find((p: Patient) => p.id === context.patientId);
                const study = patient?.studies.find((s: any) => s.id === context.studyIds[0]);
                if (study && study.scans.length > 0) {
                    const firstScan = study.scans[0];
                    const isDICOM = study.modality === 'CT' || study.modality === 'MRI' || firstScan.imageUrl.toLowerCase().endsWith('.dcm');

                    if (isDICOM) {
                        const urls = study.scans.map((s: any) => {
                            const url = s.imageUrl;
                            if (url.startsWith('http') || url.startsWith('blob:')) return url;
                            return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
                        });
                        loadDicomURLs(urls);
                    }
                }
            }
        }
    }, [activeContextId, contexts, patients, isDicomMode, loadDicomURLs]);

    // ESC Key Navigation Handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();

                return;

                // Priority 1: Clear DICOM Mode
                if (useAppStore.getState().isDicomMode) {
                    useAppStore.getState().clearImage(); // This clears isDicomMode too
                    return;
                }

                // Priority 2: Clear Active Canvas / Context
                const state = useAppStore.getState();
                if (state.currentImage || state.activeContextId) {
                    state.clearImage();
                    state.setActiveContextId(null);
                    return;
                }

                // Priority 3: Navigate Back if not on Workspace
                if (location.pathname !== '/workspace' && location.pathname !== '/') {
                    navigate('/dashboard');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [location.pathname, navigate]);

    const hasActiveContent = !!currentImage || !!activeContextId || isDicomMode;

    return (
        <div className="h-full w-full flex items-center justify-center relative bg-background overflow-hidden">
            {isDicomMode ? (
                <DICOMViewer fileList={dicomSeries} />
            ) : hasActiveContent ? (
                <CanvasWorkspace />
            ) : (
                <div className="text-center space-y-4 bg-background/5 p-10 rounded-xl border border-white/10 backdrop-blur-sm">
                    <div className="h-24 w-24 bg-muted/20 rounded-full flex items-center justify-center mx-auto ring-4 ring-muted/10">
                        <Upload className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold mb-2 text-foreground">No Image Loaded</h2>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                            Import a scan to begin analysis, or select a patient from the cases menu.
                        </p>
                    </div>
                    <ImportDialog>
                        <Button size="lg" className="gap-2 shadow-lg hover:shadow-xl transition-all">
                            <Upload className="h-4 w-4" />
                            Import Scan
                        </Button>
                    </ImportDialog>
                </div>
            )}
        </div>
    );
};

export default MainPage;
