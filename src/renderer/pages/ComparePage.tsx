import { Search, Upload, Image as ImageIcon, ChevronRight, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store/index";
import { useNavigate, useLocation } from "react-router-dom";
import CanvasWorkspace from "@/features/canvas/CanvasWorkspace";
import { useEffect, useMemo, useState } from "react";
import { EmptyImport } from "@/pages/MainPage";
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

    const patients = useAppStore((s) => s.patients);
    const setComparisonImage = useAppStore((s) => s.setComparisonImage);
    const comparison = useAppStore((s) => s.comparison);

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
            ? "bg-[var(--surface)] border-[var(--border)] text-[var(--text)]"
            : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)]",
    );

    const btn = cn(
        "w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all cursor-pointer",
        isDark
            ? "hover:bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]"
            : "hover:bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]",
    );

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className={cn(
                "w-[420px] max-h-[560px] flex flex-col shadow-2xl rounded-2xl border overflow-hidden",
                isDark ? "bg-[var(--bg)] border-[var(--border)]" : "bg-[var(--surface-2)] border-[var(--border)]",
            )}>

                {/* Header */}
                <div className={cn(
                    "flex items-center justify-between px-5 py-4 border-b",
                    isDark ? "border-[var(--border)]" : "border-[var(--border)]",
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
                        <p className={cn("text-xs mt-0.5", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")}>
                            {step === "ROOT" && `Choose a source for ${label}`}
                            {step === "PATIENTS" && "Pick a patient to browse their studies"}
                            {step === "STUDIES" && `Pick a scan to load into ${label}`}
                        </p>
                    </div>
                    <div className={cn(
                        "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full",
                        isDark ? "bg-[var(--surface-3)] text-[var(--text-3)]" : "bg-[var(--surface-2)] text-[var(--text-3)]",
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
                                        isDark ? "bg-[var(--surface-3)] group-hover:bg-[rgba(255,69,58,0.12)]" : "bg-[var(--surface)] group-hover:bg-red-50",
                                    )}>
                                        <FolderOpen className={cn("h-5 w-5", isDark ? "text-[#FF453A]" : "text-red-600")} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm">Choose Existing Study</div>
                                        <div className={cn("text-xs mt-0.5", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")}>
                                            Browse from patients already in the system
                                        </div>
                                    </div>
                                    <ChevronRight className={cn("h-4 w-4 flex-shrink-0", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")} />
                                </div>
                            </button>

                            {/* Option 2: Import local image — reuses existing ImportDialog */}
                            <ImportDialog targetSide={side}>
                                <button className={cn(card, "w-full text-left hover:border-[#FF453A]/40 hover:shadow-lg transition-all group cursor-pointer")}>
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0",
                                            isDark ? "bg-[var(--surface-3)] group-hover:bg-[rgba(255,69,58,0.12)]" : "bg-[var(--surface)] group-hover:bg-red-50",
                                        )}>
                                            <Upload className={cn("h-5 w-5", isDark ? "text-[#FF453A]" : "text-red-600")} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-sm">Import Local Image</div>
                                            <div className={cn("text-xs mt-0.5", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")}>
                                                Upload a file from your computer
                                                <span className={cn("ml-2 text-[10px] font-bold", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")}>
                                                    DICOM · JPG · PNG · TIFF
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className={cn("h-4 w-4 flex-shrink-0", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")} />
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
                                        isDark ? "bg-[var(--surface)] border-[var(--border)]" : "bg-[var(--surface)] border-[var(--border)]",
                                    )}
                                    autoFocus
                                />
                            </div>

                            {filteredPatients.length === 0 && (
                                <div className={cn("text-center py-8 text-sm", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")}>
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
                                            isDark ? "bg-[var(--surface-3)] text-[#FF453A]" : "bg-red-50 text-red-600",
                                        )}>
                                            {(p.name || "?")[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-sm truncate">{p.name}</div>
                                            <div className={cn("text-xs", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")}>
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
                                <div className={cn("text-center py-8 text-sm", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")}>
                                    No scans available for this patient
                                </div>
                            )}

                            {allStudiesWithScans.map(({ study, scans }) => (
                                <div key={study.id}>
                                    <div className={cn(
                                        "text-[10px] font-bold uppercase tracking-widest mb-1.5 px-1",
                                        isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]",
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
                                                isDark ? "bg-[var(--surface-3)]" : "bg-[var(--surface)]",
                                            )}>
                                                <ImageIcon className={cn("h-4 w-4", isDark ? "text-[#FF453A]" : "text-red-600")} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm truncate">{sc.type} · {sc.date}</div>
                                                <div className={cn("text-[10px] font-mono truncate", isDark ? "text-[var(--text-3)]" : "text-[var(--text-3)]")}>
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
   ComparePage — Image A is the case (same image + measurements as Assessment
   and Planning); Image B is the only separate pane and is saved with the case.
───────────────────────────────────────────────────────────────────────────── */
const ComparePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const setComparisonMode  = useAppStore((s) => s.setComparisonMode);
    const setActivePatient   = useAppStore((s) => s.setActivePatient);
    const setActiveContextId = useAppStore((s) => s.setActiveContextId);
    const currentImage       = useAppStore((s) => s.currentImage);
    const isDicomMode        = useAppStore((s) => s.isDicomMode);
    const imageB             = useAppStore((s) => s.comparison.right.image);
    const [confirmReplace, setConfirmReplace] = useState(false);

    // Deep link (?patientId=&contextId=): load the case, then strip the params.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const pId = params.get("patientId");
        const cId = params.get("contextId");
        if (!pId && !cId) return;
        params.delete("patientId");
        params.delete("contextId");
        const rest = params.toString();
        navigate({ pathname: location.pathname, search: rest ? `?${rest}` : "" }, { replace: true });
        if (pId) void setActivePatient(pId, cId || undefined);
        else if (cId) setActiveContextId(cId);
    }, [location.search, location.pathname, navigate, setActivePatient, setActiveContextId]);

    // Comparison mode lives only on this page.
    useEffect(() => {
        setComparisonMode(true);
        return () => setComparisonMode(false);
    }, [setComparisonMode]);

    if (isDicomMode) {
        return (
            <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
                Compare works with X-ray images. This case is a CT/MR series — use Planning for 3D work.
            </div>
        );
    }

    const paneLabel = (text: string, hint: string) => (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm pointer-events-none">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">{text}</span>
            <span className="text-[9px] text-white/50">· {hint}</span>
        </div>
    );

    return (
        <div className="flex h-full bg-background relative p-2 gap-2">
            <div className="flex-1 flex flex-col relative rounded-xl overflow-hidden border border-[var(--border)]">
                {paneLabel("Image A", "case image")}
                {currentImage ? (
                    <CanvasWorkspace side="left" />
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <EmptyImport title="No case image yet" hint="Image A is the case image shared with Assessment and Planning. Import it here or in Assessment." />
                    </div>
                )}
            </div>
            <div className="flex-1 flex flex-col relative rounded-xl overflow-hidden border border-[var(--border)]">
                {paneLabel("Image B", imageB ? "comparison" : "choose an image")}
                {imageB && (
                    <button
                        onClick={() => setConfirmReplace(true)}
                        className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/80 text-[11px] font-semibold text-white/80 hover:text-white backdrop-blur-sm"
                    >
                        <RefreshCw className="h-3 w-3" /> Replace image
                    </button>
                )}
                <CanvasWorkspace side="right" />
                <PanePicker side="right" label="Image B" />
            </div>

            <Dialog open={confirmReplace} onOpenChange={setConfirmReplace}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Replace Image B?</DialogTitle>
                        <DialogDescription>Image B and its measurements will be removed so you can choose another image.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setConfirmReplace(false)}>Cancel</Button>
                        <Button onClick={() => {
                            const st = useAppStore.getState();
                            st.setComparisonMeasurements('right', []);
                            st.setComparisonImplants('right', []);
                            st.setComparisonImage('right', null);
                            setConfirmReplace(false);
                        }}>Replace</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ComparePage;
