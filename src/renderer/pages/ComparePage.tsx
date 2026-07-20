import { Search, Upload, Image as ImageIcon, ChevronRight, FolderOpen } from "lucide-react";
import { useAppStore } from "@/lib/store/index";
import { useLocation } from "react-router-dom";
import CanvasWorkspace from "@/features/canvas/CanvasWorkspace";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImportDialog } from "@/features/import-export/ImportDialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { getStudyDisplayName } from "@/lib/store/types";

type PickerStep = "ROOT" | "PATIENTS" | "STUDIES";

/* ─────────────────────────────────────────────────────────────────────────────
   PanePicker — reusable overlay for either the left or right pane.

   RULES OF HOOKS: every hook is called unconditionally at the top of the
   function.  The guard that short-circuits to `null` comes AFTER all hooks.
───────────────────────────────────────────────────────────────────────────── */
interface PanePickerProps {
    side: "left" | "right";
    label: string;
}

const PanePicker = ({ side, label }: PanePickerProps) => {
    /* ── All hooks — unconditional, at the top level ── */
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const { patients, setComparisonImage, comparison } = useAppStore();

    const [step, setStep] = useState<PickerStep>("ROOT");
    const [query, setQuery] = useState("");
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

    const selectedPatient = useMemo(
        () => patients.find((p) => p.id === selectedPatientId) ?? null,
        [patients, selectedPatientId],
    );

    const filteredPatients = useMemo(
        () =>
            patients.filter(
                (p) =>
                    (p.name || "").toLowerCase().includes(query.toLowerCase()) ||
                    (p.id || "").toLowerCase().includes(query.toLowerCase()),
            ),
        [patients, query],
    );

    const allStudiesWithScans = useMemo(() => {
        if (!selectedPatient) return [];
        return (selectedPatient.studies ?? [])
            .map((s) => ({
                study: s,
                scans: (s.scans ?? []).filter((sc) => !!sc.imageUrl),
            }))
            .filter((e) => e.scans.length > 0);
    }, [selectedPatient]);

    /* ── Early-return guard comes AFTER all hooks ── */
    if (comparison[side].image) return null;

    /* ── Helpers (non-hook) ── */
    const handleSelectScan = (imageUrl: string) => {
        setComparisonImage(side, imageUrl);
    };

    const card = cn(
        "rounded-2xl border p-5 transition-all",
        isDark
            ? "bg-[#141416] border-[#242427] text-[#F5F5F7]"
            : "bg-white border-gray-200 text-slate-900",
    );

    const btn = cn(
        "w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all cursor-pointer",
        isDark
            ? "hover:bg-[#1B1B1E] text-[#9CA3AF] hover:text-[#F5F5F7]"
            : "hover:bg-gray-50 text-slate-600 hover:text-slate-900",
    );

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className={cn(
                "w-[420px] max-h-[560px] flex flex-col shadow-2xl rounded-2xl border overflow-hidden",
                isDark ? "bg-[#0A0A0B] border-[#242427]" : "bg-gray-50 border-gray-300",
            )}>

                {/* Header */}
                <div className={cn(
                    "flex items-center justify-between px-5 py-4 border-b",
                    isDark ? "border-[#242427]" : "border-gray-200",
                )}>
                    <div>
                        {step !== "ROOT" && (
                            <button
                                className={cn(
                                    "text-xs font-semibold mb-0.5 flex items-center gap-1 transition-colors",
                                    isDark ? "text-[#FF453A] hover:text-red-400" : "text-red-600 hover:text-red-500",
                                )}
                                onClick={() => {
                                    if (step === "STUDIES") setStep("PATIENTS");
                                    else setStep("ROOT");
                                }}
                            >
                                ← Back
                            </button>
                        )}
                        <h3 className="text-base font-bold">
                            {step === "ROOT" && "Load Comparison Scan"}
                            {step === "PATIENTS" && "Select Patient"}
                            {step === "STUDIES" && (selectedPatient?.name || "Select Study")}
                        </h3>
                        <p className={cn("text-xs mt-0.5", isDark ? "text-[#6B7280]" : "text-slate-400")}>
                            {step === "ROOT" && `Choose a source for ${label}`}
                            {step === "PATIENTS" && "Pick a patient to browse their studies"}
                            {step === "STUDIES" && `Pick a scan to load into ${label}`}
                        </p>
                    </div>
                    <div className={cn(
                        "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full",
                        isDark ? "bg-[#242427] text-[#6B7280]" : "bg-gray-200 text-slate-400",
                    )}>
                        {label}
                    </div>
                </div>

                {/* Body */}
                <ScrollArea className="flex-1 min-h-0 p-4">

                    {/* ── ROOT ── */}
                    {step === "ROOT" && (
                        <div className="flex flex-col gap-3">
                            {/* Option 1: Existing study */}
                            <button
                                className={cn(card, "w-full text-left hover:border-[#FF453A]/40 hover:shadow-lg transition-all group")}
                                onClick={() => setStep("PATIENTS")}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
                                        isDark ? "bg-[#242427] group-hover:bg-[rgba(255,69,58,0.12)]" : "bg-gray-100 group-hover:bg-red-50",
                                    )}>
                                        <FolderOpen className={cn("h-5 w-5", isDark ? "text-[#FF453A]" : "text-red-600")} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm">Choose Existing Study</div>
                                        <div className={cn("text-xs mt-0.5", isDark ? "text-[#6B7280]" : "text-slate-400")}>
                                            Browse from patients already in the system
                                        </div>
                                    </div>
                                    <ChevronRight className={cn("h-4 w-4 flex-shrink-0", isDark ? "text-[#6B7280]" : "text-slate-300")} />
                                </div>
                            </button>

                            {/* Option 2: Import local image — reuses existing ImportDialog */}
                            <ImportDialog targetSide={side} hideCloseButton>
                                <button className={cn(card, "w-full text-left hover:border-[#FF453A]/40 hover:shadow-lg transition-all group cursor-pointer")}>
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
                                            isDark ? "bg-[#242427] group-hover:bg-[rgba(255,69,58,0.12)]" : "bg-gray-100 group-hover:bg-red-50",
                                        )}>
                                            <Upload className={cn("h-5 w-5", isDark ? "text-[#FF453A]" : "text-red-600")} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm">Import Local Image</div>
                                            <div className={cn("text-xs mt-0.5", isDark ? "text-[#6B7280]" : "text-slate-400")}>
                                                Upload a file from your computer
                                                <span className={cn("ml-2 text-[10px] font-bold", isDark ? "text-[#4B5563]" : "text-slate-300")}>
                                                    DICOM · JPG · PNG · TIFF
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className={cn("h-4 w-4 flex-shrink-0", isDark ? "text-[#6B7280]" : "text-slate-300")} />
                                    </div>
                                </button>
                            </ImportDialog>
                        </div>
                    )}

                    {/* ── PATIENTS ── */}
                    {step === "PATIENTS" && (
                        <div className="flex flex-col gap-2">
                            <div className="relative mb-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search patients…"
                                    className={cn(
                                        "pl-9 h-8 text-sm",
                                        isDark ? "bg-[#141416] border-[#242427]" : "bg-white border-gray-200",
                                    )}
                                    autoFocus
                                />
                            </div>

                            {filteredPatients.length === 0 && (
                                <div className={cn("text-center py-8 text-sm", isDark ? "text-[#4B5563]" : "text-slate-400")}>
                                    No patients found
                                </div>
                            )}

                            {filteredPatients.map((p) => {
                                const scanCount = (p.studies ?? []).reduce(
                                    (acc, s) => acc + (s.scans?.length ?? 0),
                                    0,
                                );
                                return (
                                    <button
                                        key={p.id}
                                        className={btn}
                                        onClick={() => {
                                            setSelectedPatientId(p.id);
                                            setStep("STUDIES");
                                        }}
                                    >
                                        <div className={cn(
                                            "h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0",
                                            isDark ? "bg-[#242427] text-[#FF453A]" : "bg-red-50 text-red-600",
                                        )}>
                                            {(p.name || "?")[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-sm truncate">{p.name}</div>
                                            <div className={cn("text-xs", isDark ? "text-[#4B5563]" : "text-slate-400")}>
                                                {p.id} · {scanCount} scan{scanCount !== 1 ? "s" : ""}
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 flex-shrink-0 opacity-50" />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* ── STUDIES ── */}
                    {step === "STUDIES" && (
                        <div className="flex flex-col gap-3">
                            {allStudiesWithScans.length === 0 && (
                                <div className={cn("text-center py-8 text-sm", isDark ? "text-[#4B5563]" : "text-slate-400")}>
                                    No scans available for this patient
                                </div>
                            )}

                            {allStudiesWithScans.map(({ study, scans }) => (
                                <div key={study.id}>
                                    <div className={cn(
                                        "text-[10px] font-bold uppercase tracking-widest mb-1.5 px-1",
                                        isDark ? "text-[#4B5563]" : "text-slate-300",
                                    )}>
                                        {getStudyDisplayName(study)} · {study.acquisitionDate}
                                    </div>
                                    {scans.map((sc) => (
                                        <button
                                            key={sc.id}
                                            className={btn}
                                            onClick={() => handleSelectScan(sc.imageUrl)}
                                        >
                                            <div className={cn(
                                                "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
                                                isDark ? "bg-[#242427]" : "bg-gray-100",
                                            )}>
                                                <ImageIcon className={cn("h-4 w-4", isDark ? "text-[#FF453A]" : "text-red-600")} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm truncate">{sc.type} · {sc.date}</div>
                                                <div className={cn("text-[10px] font-mono truncate", isDark ? "text-[#4B5563]" : "text-slate-300")}>
                                                    {sc.id}
                                                </div>
                                            </div>
                                            <ChevronRight className="h-4 w-4 flex-shrink-0 opacity-50" />
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </div>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────────────────────
   ComparePage
───────────────────────────────────────────────────────────────────────────── */
const ComparePage = () => {
    const location = useLocation();
    const {
        setComparisonMode,
        toggleRightSidebar,
        setActivePatient,
        setActiveContextId,
        setComparisonImage,
        setComparisonMeasurements,
        setComparisonImplants,
        persistComparisonState,
        currentImage,
        contextStates,
        activeContextId,
        comparison,
        measurements,
        implants
    } = useAppStore();

    // Resolve workspace image — mirrors CanvasWorkspace priority logic
    const workspaceImage = useMemo(() => {
        if (currentImage) return currentImage;
        if (activeContextId) {
            const ctxState = contextStates.find((s) => s.contextId === activeContextId);
            if (ctxState?.currentImage) return ctxState.currentImage;
        }
        return null;
    }, [currentImage, activeContextId, contextStates]);

    // Resolve workspace measurements — mirrors CanvasWorkspace / resolveActiveMeasurements
    // priority: contextState > root store. This is the correct source for Image A in Compare.
    const workspaceMeasurements = useMemo(() => {
        if (activeContextId) {
            const ctxState = contextStates.find((s) => s.contextId === activeContextId);
            if (ctxState) return ctxState.measurements ?? [];
        }
        return measurements;
    }, [activeContextId, contextStates, measurements]);

    const workspaceImplants = useMemo(() => {
        if (activeContextId) {
            const ctxState = contextStates.find((s) => s.contextId === activeContextId);
            if (ctxState) return ctxState.implants ?? [];
        }
        return implants;
    }, [activeContextId, contextStates, implants]);

    // Restore persisted comparison state (from a previous Compare session) on mount.
    // This runs once — it brings back Image B and both sides' measurements from the
    // saved contextState so Compare looks exactly as it was left.
    const restored = useRef(false);
    // Track whether we loaded persisted Compare measurements for Image A so the
    // leftLoaded effect below doesn't overwrite them with Assessment measurements.
    const hasRestoredLeft = useRef(false);
    useEffect(() => {
        if (restored.current) return;
        restored.current = true;
        if (!activeContextId) return;
        const ctxState = contextStates.find((s) => s.contextId === activeContextId);
        if (ctxState?.comparisonLeft) {
            const l = ctxState.comparisonLeft;
            if (l.image) setComparisonImage('left', l.image);
            if (l.measurements?.length) {
                setComparisonMeasurements('left', l.measurements);
                hasRestoredLeft.current = true; // persisted Compare measurements loaded
            }
            if (l.implants?.length) setComparisonImplants('left', l.implants);
        }
        if (ctxState?.comparisonRight) {
            const r = ctxState.comparisonRight;
            if (r.image) setComparisonImage('right', r.image);
            if (r.measurements?.length) setComparisonMeasurements('right', r.measurements);
            if (r.implants?.length)     setComparisonImplants('right', r.implants);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-load left image and data from workspace.
    // Only populates Image A from Assessment on first entry; if Compare-specific
    // measurements were already restored from persistence, do not overwrite them.
    const leftLoaded = useRef(false);
    useEffect(() => {
        if (!workspaceImage) return;
        // Always set the image if it hasn't been set yet.
        if (!comparison.left.image) {
            setComparisonImage("left", workspaceImage);
        }
        // Only sync Assessment measurements when no persisted Compare-specific
        // measurements exist for Image A. Once the user has created Compare
        // measurements, those take precedence.
        if (!hasRestoredLeft.current) {
            setComparisonMeasurements("left", workspaceMeasurements);
            setComparisonImplants("left", workspaceImplants);
        }
        leftLoaded.current = true;
    }, [workspaceImage, workspaceMeasurements, workspaceImplants, comparison.left.image, setComparisonImage, setComparisonMeasurements, setComparisonImplants]);

    // Persist comparison state whenever either side's measurements or images change.
    // This is what makes Compare measurements survive leaving/re-entering Compare.
    useEffect(() => {
        if (!activeContextId) return;
        // Skip the very first render before any measurements have been loaded
        if (!comparison.left.image && !comparison.right.image) return;
        persistComparisonState();
    }, [
        activeContextId,
        comparison.left.measurements,
        comparison.right.measurements,
        comparison.left.image,
        comparison.right.image,
        persistComparisonState,
    ]);

    // Deep Linking Support
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const pId = queryParams.get("patientId");
        const cId = queryParams.get("contextId");
        if (pId) setActivePatient(pId);
        if (cId) setActiveContextId(cId);
    }, [location.search, setActivePatient, setActiveContextId]);

    // Ensure comparison mode
    useEffect(() => {
        setComparisonMode(true);
    }, [setComparisonMode]);

    return (
        <div id="comparison-container" className="flex flex-col h-full bg-background relative">


            {/* Split Canvas Area */}
            <div className="flex-1 flex overflow-hidden relative p-2 gap-2 mt-2">

                {/* ── Left (View A) ───────────────────────────────────────── */}
                <div className="flex-1 flex flex-col relative rounded-xl overflow-hidden border border-border/20">
                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">View A</span>
                        <span className="text-[9px] text-white/40">
                            {workspaceImage ? "· Workspace" : "· No image loaded"}
                        </span>
                    </div>
                    <CanvasWorkspace side="left" />
                    {/* Image A is always the current workspace — never manually imported.
                        If no workspace image exists yet, show a non-interactive message. */}
                    {!workspaceImage && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <div className="text-center px-6">
                                <p className="text-white/60 text-sm font-semibold">No workspace image</p>
                                <p className="text-white/30 text-xs mt-1">
                                    Open an image in the workspace first, then return to Compare.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right (View B) — always picker until image selected ── */}
                <div className="flex-1 flex flex-col relative rounded-xl overflow-hidden border border-border/20">
                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">View B</span>
                        <span className="text-[9px] text-white/40">· Comparison</span>
                    </div>
                    <CanvasWorkspace side="right" />
                    <PanePicker side="right" label="View B" />
                </div>
            </div>
        </div>
    );
};

export default ComparePage;
