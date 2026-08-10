/**
 * TopMenuBar — Unified application header.
 *
 * On workspace routes (/workspace, /compare):
 *   [S] [← Patient Name / subtitle]  [Assessment|Planning|Compare|Report]  [Import][Share][Theme][View Report][⋮][Avatar]
 *
 * On all other routes:
 *   [Logo]  (spacer)  [Import][Compare][Export][Cases][Share][Theme][Avatar]
 *
 * All existing functionality (import, compare, share, report, theme, profile, DICOM controls)
 * is fully preserved — only the visual layout changes.
 */
import {
    Upload,
    ArrowLeftRight,
    Download,
    FolderOpen,
    LogOut,
    Moon,
    Sun,
    Settings,
    User,
    Crop,
    LayoutTemplate,
    Grid2X2,
    Share2,
    Target,
    FileText,
    MoreVertical,
    Cloud,
    CloudOff,
    Loader2
} from "lucide-react";
import { ImportDialog } from "@/features/import-export/ImportDialog";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useTheme } from "@/components/theme-provider";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useRef, useMemo } from "react";
import { ProfileDialog } from "./ProfileDialog";
import { SettingsDialog } from "./SettingsDialog";
import { ReportDialog } from "./ReportDialog";
import { ShareDialog } from "./ShareDialog";
import { useAppStore, getStudyDisplayName } from "@/lib/store/index";
import { cn } from "@/lib/utils";
import { generateReportPDF } from "@/lib/pdf/generateReportPDF";
import { Eye, BookmarkPlus, RefreshCcw } from "lucide-react";

/* ── Workspace mode tabs ─────────────────────────────────────── */
type WsTab = 'assessment' | 'planning' | 'compare' | 'report';
const WS_TABS: { key: WsTab; label: string }[] = [
    { key: 'assessment', label: 'Assessment' },
    { key: 'planning',   label: 'Planning'   },
    { key: 'compare',    label: 'Compare'    },
    { key: 'report',     label: 'Report'     },
];

/* ── Save Plan button (Planning tab only) ────────────────────── */
const SavePlanButton = () => {
    const { savePlan, activeContextId, contextStates } = useAppStore();
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const ctxState = contextStates.find(s => s.contextId === activeContextId);
    const planCount = ctxState?.savedPlans?.length ?? 0;

    const handleSave = async () => {
        setSaving(true);
        try {
            const plan = await savePlan();
            if (plan) {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex items-center gap-2 mr-2">
            {planCount > 0 && (
                <span className="text-[10px] font-bold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full border border-border/50">
                    {planCount} plan{planCount !== 1 ? 's' : ''} saved
                </span>
            )}
            <Button
                size="sm"
                className="h-8 text-xs text-white shadow-sm hover:brightness-110 transition-all border-none"
                style={{ backgroundColor: saved ? '#34C759' : '#FF453A' }}
                onClick={handleSave}
                disabled={saving}
            >
                <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" />
                {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Plan'}
            </Button>
        </div>
    );
};

const TopMenuBar = () => {
    const { setTheme, theme, resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const isDark = resolvedTheme === 'dark';

    const {
        user,
        logout,
        activePatientId,
        patients,
        activeContextId,
        contexts,
        currentImage,
        addContext,
        updateContextState,
        generateShareLink,
        measurements,
        implants,
        threeDImplants,
        pedicleSimulations,
        isComparisonMode,
        setComparisonMode,
        isDicomMode,
        dicomSeries,
        dicom3D,
        setDicomLayoutMode,
        setDicomCroppingActive,
        triggerFocusCrop,
        setActiveDialog,
        syncStatus,
        hasUnsyncedChanges,
        contextStates,
    } = useAppStore();

    const [profileOpen, setProfileOpen]   = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [reportOpen, setReportOpen]     = useState(false);
    const [closeAttemptRoute, setCloseAttemptRoute] = useState<string | null>(null);
    const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    // When on /compare the URL has no ?tab=, so default to 'compare' for that route.
    const wsTab: WsTab = location.pathname === '/compare'
        ? 'compare'
        : (queryParams.get('tab') as WsTab) || 'assessment';

    const lastMainRouteRef = useRef('/dashboard');
    if (location.pathname === '/dashboard' || location.pathname === '/compare') {
        lastMainRouteRef.current = location.pathname;
    }

    // Is this a workspace route?
    const isWorkspaceRoute = location.pathname === '/workspace' || location.pathname === '/compare';

    /* ── Patient / context data ──────────────────────────────── */
    const patient = useMemo(
        () => patients.find((p) => p.id === activePatientId) ?? null,
        [activePatientId, patients],
    );
    const context = useMemo(
        () => contexts.find((c) => c.id === activeContextId) ?? null,
        [activeContextId, contexts],
    );
    const headerTitle = useMemo(() => {
        if (!activePatientId) return 'Untitled Study';
        if (activeContextId && context && patient) {
            const studyId = context.studyIds?.[0];
            const study =
                patient.studies?.find(s => s.id === studyId) ||
                patient.visits?.flatMap(v => v.studies || []).find(s => s.id === studyId);
            if (study) return getStudyDisplayName(study);
            if (context.name) return context.name;
        }
        return patient?.name ?? 'Loading…';
    }, [activePatientId, activeContextId, context, patient]);

    const subtitle = useMemo(() => {
        if (!patient) return null;
        const parts: string[] = [];
        if (patient.age) parts.push(`${patient.age}${patient.gender ?? ''}`);
        if (patient.contact) parts.push(`MRN ${patient.contact}`);
        const dx = patient.visits?.[0]?.diagnosis;
        if (dx) parts.push(dx);
        return parts.length ? parts.join(' · ') : null;
    }, [patient]);

    const selectedCount = measurements.filter((m) => m.selected && !(m as any).isImplant).length;

    const userInitial = user?.name
        ? user.name.replace(/^(Dr\.|Mr\.|Ms\.)\s+/i, '').charAt(0).toUpperCase()
        : 'U';

    // Resolved workspace image — mirrors ComparePage / CanvasWorkspace priority logic.
    // Used to guard Compare mode entry: Compare is only allowed when an image is loaded.
    const workspaceImage = useMemo(() => {
        if (currentImage) return currentImage;
        if (activeContextId) {
            const ctxState = contextStates.find((s) => s.contextId === activeContextId);
            if (ctxState?.currentImage) return ctxState.currentImage;
        }
        return null;
    }, [currentImage, activeContextId, contextStates]);

    /* ── Tab switching ───────────────────────────────────────── */
    const handleWsTab = (key: WsTab) => {
        if (key === 'compare') {
            // Guard: require a workspace image before entering Compare
            if (!workspaceImage) {
                setActiveDialog('import');
                return;
            }
            setComparisonMode(true);
            navigate('/compare');
        } else if (key === 'report') {
            // Keep isComparisonMode as-is so users can generate Comparison Reports
            const searchParams = new URLSearchParams(location.search);
            searchParams.set('tab', key);
            navigate(`/workspace?${searchParams.toString()}`);
        } else {
            if (isComparisonMode) setComparisonMode(false);
            const searchParams = new URLSearchParams(location.search);
            searchParams.set('tab', key);
            navigate(`/workspace?${searchParams.toString()}`);
        }
    };

    /* ── Other navigation ────────────────────────────────────── */
    const handleCloseWorkspace = async (targetRoute: string) => {
        if (!hasUnsyncedChanges) {
            setComparisonMode(false);
            navigate(targetRoute);
            return;
        }

        const state = useAppStore.getState();
        if (state.activeContextId) {
            state.setSyncStatus('saving');
            const success = await state.updateContextState(state.activeContextId, {
                measurements: state.measurements,
                implants: state.implants,
                threeDImplants: state.threeDImplants,
                pedicleSimulations: state.pedicleSimulations,
                currentImage: state.currentImage,
            });

            if (success) {
                state.setHasUnsyncedChanges(false);
                state.setSyncStatus('synced');
                setComparisonMode(false);
                navigate(targetRoute);
            } else {
                state.setSyncStatus('error');
                setCloseAttemptRoute(targetRoute);
            }
        } else {
            setComparisonMode(false);
            navigate(targetRoute);
        }
    };

    const handleCompareToggle = () => {
        if (location.pathname === '/patients') {
            // Guard: require a workspace image before entering Compare
            if (!workspaceImage) { setActiveDialog('import'); return; }
            setComparisonMode(true);
            navigate('/compare');
            return;
        }
        const next = !isComparisonMode;
        // Guard: require a workspace image when entering Compare
        if (next && !workspaceImage) { setActiveDialog('import'); return; }
        setComparisonMode(next);
        if (!next) handleCloseWorkspace('/dashboard');
        else navigate('/compare');
    };

    const handlePatientsToggle = () => {
        if (location.pathname === '/patients') handleCloseWorkspace(lastMainRouteRef.current);
        else handleCloseWorkspace('/patients');
    };

    /* ── Share handler (unchanged logic) ─────────────────────── */
    const handleShare = async () => {
        if (activeContextId) { generateShareLink(); return; }
        const newId = crypto.randomUUID();
        if (isDicomMode && dicomSeries.length > 0 && typeof dicomSeries[0] === 'string') {
            const targetUrl = dicomSeries[0] as string;
            let foundStudyId: string | undefined;
            let foundPatientId: string | undefined = activePatientId || undefined;
            const findStudy = (p: any) => p.studies.find((s: any) =>
                s.scans.some((scan: any) => targetUrl.includes(scan.imageUrl) || scan.imageUrl.includes(targetUrl))
            );
            const state = useAppStore.getState();
            let study: any;
            if (activePatientId) { const p = state.patients.find((p: any) => p.id === activePatientId); if (p) study = findStudy(p); }
            if (!study) { for (const p of state.patients) { study = findStudy(p); if (study) { foundPatientId = p.id; break; } } }
            if (study && foundPatientId) {
                foundStudyId = study.id;
                await addContext({ id: newId, patientId: foundPatientId!, studyIds: [foundStudyId!], mode: 'view', name: `Shared DICOM ${new Date().toLocaleDateString()}`, lastModified: new Date().toISOString() });
                await updateContextState(newId, { threeDImplants, pedicleSimulations });
                generateShareLink({ contextId: newId }); return;
            }
        }
        if (activePatientId && currentImage && !isDicomMode) {
            await addContext({ id: newId, patientId: activePatientId, studyIds: [], mode: 'view', name: `Shared Snapshot ${new Date().toLocaleDateString()}`, lastModified: new Date().toISOString() });
            await updateContextState(newId, { measurements, implants, threeDImplants, pedicleSimulations, currentImage });
            generateShareLink({ contextId: newId }); return;
        }
        generateShareLink();
    };

    /* ── Shared icon button style ────────────────────────────── */
    const iconBtn = "h-7 w-7 rounded-md border border-border/70 bg-secondary hover:bg-muted text-foreground transition-all active:scale-95 shadow-sm";

    return (
        <div
            className="fixed top-0 left-0 right-0 z-50 flex items-center gap-0"
            style={{
                height: 54,
                background: isDark ? 'rgba(10,10,11,0.97)' : 'rgba(255,255,255,0.97)',
                borderBottom: `1px solid var(--border)`,
                backdropFilter: 'blur(20px)',
                boxShadow: '0 1px 3px rgba(0,0,0,.08)',
            }}
        >
            {/* ── [S] Logo placeholder ─────────────────────────── */}
            <div
                onClick={() => handleCloseWorkspace('/dashboard')}
                style={{
                    width: 54, height: 54, flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    borderRight: `1px solid var(--border)`,
                    cursor: 'pointer',
                }}
            >
                <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'var(--accent)',
                    display: 'grid', placeItems: 'center',
                    color: '#fff', fontSize: 16, fontWeight: 800,
                    letterSpacing: '-.02em', userSelect: 'none',
                }}>
                    S
                </div>
            </div>

            {/* ── Patient info (workspace routes) / empty (other) ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 16px', minWidth: 0, flexShrink: 0,
                maxWidth: isWorkspaceRoute ? 280 : 0,
                overflow: 'hidden',
                transition: 'max-width .2s',
            }}>
                {isWorkspaceRoute && (
                    <>
                        <button
                            onClick={() => handleCloseWorkspace('/dashboard')}
                            style={{
                                display: 'grid', placeItems: 'center',
                                width: 26, height: 26, borderRadius: 6,
                                border: `1px solid var(--border-2)`,
                                background: 'transparent', cursor: 'pointer',
                                color: 'var(--text-2)', flexShrink: 0,
                            }}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                        </button>
                        <div style={{ minWidth: 0 }}>
                            <div style={{
                                fontSize: 14, fontWeight: 700,
                                color: 'var(--text)',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                maxWidth: 200,
                            }}>
                                {headerTitle}
                            </div>
                            {activePatientId && (
                                <div style={{
                                    fontSize: 11, color: 'var(--text-3)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    maxWidth: 200,
                                }}>
                                    {subtitle ?? '—'}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ── Center: Assessment / Planning / Compare / Report tabs ── */}
            {isWorkspaceRoute ? (
                <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        display: 'flex', gap: 2,
                        background: 'var(--surface-3)',
                        padding: '3px',
                        borderRadius: 10,
                    }}>
                        {WS_TABS.map((t) => {
                            const isDisabled = isDicomMode && (t.key === 'assessment' || t.key === 'compare');
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => !isDisabled && handleWsTab(t.key)}
                                    disabled={isDisabled}
                                    style={{
                                        padding: '6px 16px',
                                        borderRadius: 8,
                                        fontSize: 13,
                                        fontWeight: 600,
                                        border: 'none',
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        opacity: isDisabled ? 0.35 : 1,
                                        color: wsTab === t.key ? 'var(--accent)' : 'var(--text-2)',
                                        background: wsTab === t.key ? 'var(--accent-soft)' : 'transparent',
                                        transition: 'all .14s',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1 }} />
            )}

            {/* ── Right actions ─────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 12 }}>
                
                {/* Sync Indicator */}
                {isWorkspaceRoute && (
                    <div className="flex items-center gap-1.5 mr-2 text-xs font-medium text-muted-foreground bg-muted/30 px-2 py-1 rounded-md">
                        {syncStatus === 'synced' && <><Cloud className="w-3.5 h-3.5" /> Saved</>}
                        {syncStatus === 'unsynced' && <><CloudOff className="w-3.5 h-3.5" /> Unsynced changes</>}
                        {syncStatus === 'saving' && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>}
                        {syncStatus === 'error' && <><CloudOff className="w-3.5 h-3.5 text-red-500" /> Sync error</>}
                    </div>
                )}

                {/* DICOM layout controls */}
                {isDicomMode && (
                    <>
                        <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/50">
                            <Button variant="ghost" size="icon" onClick={() => setDicomLayoutMode('axial-sagittal')}
                                className={cn("h-7 w-10 rounded text-[10px] font-bold", dicom3D.layoutMode === 'axial-sagittal' ? "bg-[#FF453A] text-white" : "text-muted-foreground")} title="2D Layout">
                                <LayoutTemplate className="w-3.5 h-3.5 rotate-90" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDicomLayoutMode('grid')}
                                className={cn("h-7 w-7 rounded", dicom3D.layoutMode === 'grid' ? "bg-[#FF453A] text-white" : "text-muted-foreground")} title="Grid">
                                <Grid2X2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDicomLayoutMode('focus-3d')}
                                className={cn("h-7 w-7 rounded", dicom3D.layoutMode === 'focus-3d' ? "bg-[#FF453A] text-white" : "text-muted-foreground")} title="3D Focus">
                                <LayoutTemplate className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/50">
                            <Button variant="ghost" size="icon" onClick={() => setDicomCroppingActive(!dicom3D.isCroppingActive)}
                                className={cn("h-7 w-7 rounded", dicom3D.isCroppingActive ? "bg-primary text-white" : "text-muted-foreground")} title="Crop">
                                <Crop className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={triggerFocusCrop}
                                className="h-7 w-7 rounded text-primary" title="Focus">
                                <Target className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </>
                )}

                {/* Import (hidden in workspace mode) */}
                {!isWorkspaceRoute && (
                <ImportDialog>
                    <Button variant="ghost" size="icon" className={cn(iconBtn)} title="Import Scan">
                        <Upload className="h-3.5 w-3.5" />
                    </Button>
                </ImportDialog>
                )}

                {/* Compare (non-workspace only) */}
                {!isWorkspaceRoute && (
                    <Button variant="ghost" size="icon"
                        className={cn(iconBtn, isComparisonMode && "bg-primary text-primary-foreground border-primary/50")}
                        title="Compare" onClick={handleCompareToggle}>
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                    </Button>
                )}

                {/* PDF Actions (Report Tab Only) */}
                {wsTab === 'report' ? (
                    <div className="flex items-center gap-2 mr-2">
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8 text-xs bg-white/10 hover:bg-white/20 border-white/5 text-white"
                            onClick={async () => {
                                if (confirm("Are you sure you want to start a new report? This will clear all saved plans and comparisons for this patient.")) {
                                    if (activeContextId) {
                                        await updateContextState(activeContextId, {
                                            savedPlans: [],
                                            savedComparisons: [],
                                        });
                                    }
                                }
                            }}
                        >
                            <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                            Start New Report
                        </Button>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="h-8 text-xs bg-white/10 hover:bg-white/20 border-white/5"
                            onClick={async () => {
                                try {
                                    const url = await generateReportPDF({ previewOnly: true });
                                    if (url) window.open(url, '_blank');
                                } catch (e: any) {
                                    alert(e.message || "Failed to preview PDF");
                                }
                            }}
                        >
                            <Eye className="w-3.5 h-3.5 mr-1.5" />
                            Preview PDF
                        </Button>
                        <Button 
                            size="sm" 
                            className="h-8 text-xs text-white shadow-sm hover:brightness-110 transition-all border-none"
                            style={{ backgroundColor: '#FF453A' }}
                            onClick={async () => {
                                try {
                                    await generateReportPDF();
                                    if (activeContextId) {
                                        await updateContextState(activeContextId, {
                                            savedPlans: [],
                                            savedComparisons: [],
                                        });
                                    }
                                } catch (e: any) {
                                    alert(e.message || "Failed to export PDF");
                                }
                            }}
                        >
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            Export PDF
                        </Button>
                    </div>
                ) : wsTab === 'planning' ? (
                    <SavePlanButton />
                ) : (
                    /* Legacy Export (hidden in workspace mode) */
                    !isWorkspaceRoute && (
                        <Button variant="ghost" size="icon" className={cn(iconBtn)} title="Export Report"
                            onClick={() => handleWsTab('report')}>
                            <FileText className="h-3.5 w-3.5" />
                        </Button>
                    )
                )}

                {/* Cases (non-workspace only) */}
                {!isWorkspaceRoute && (
                    <Button variant="ghost" size="icon"
                        className={cn(iconBtn, location.pathname === '/patients' && "bg-primary/20 text-primary border-primary/30")}
                        onClick={handlePatientsToggle} title="Patient Cases">
                        <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                )}

                {/* Share */}
                <Button variant="ghost" size="icon" className={cn(iconBtn)} title="Share" onClick={handleShare}>
                    <Share2 className="h-3.5 w-3.5" />
                </Button>

                {/* Theme */}
                <Button variant="ghost" size="icon" className={cn(iconBtn)}
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle Theme">
                    <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                </Button>

                {/* View Report, More Menu, and Profile avatar hidden in workspace per request */}
            </div>

            {/* Dialogs */}
            <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
            <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
            <ReportDialog open={reportOpen} onOpenChange={(v) => { setReportOpen(v); setActiveDialog(v ? 'report' : null); }} checkedCount={measurements.filter((m) => m.selected).length} />
            <ImportDialog />
            <ShareDialog />

            {closeAttemptRoute && (
                <Dialog open={true} onOpenChange={(open) => { if (!open) setCloseAttemptRoute(null); }}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Sync Failed</DialogTitle>
                            <DialogDescription>
                                Changes could not be synced.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:justify-start">
                            <Button variant="outline" onClick={() => setCloseAttemptRoute(null)}>Keep Editing</Button>
                            <Button onClick={() => {
                                const route = closeAttemptRoute;
                                setCloseAttemptRoute(null);
                                handleCloseWorkspace(route);
                            }}>Retry</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default TopMenuBar;
