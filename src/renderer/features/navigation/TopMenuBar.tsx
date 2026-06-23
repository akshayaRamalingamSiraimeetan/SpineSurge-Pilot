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
} from "lucide-react";
import { ImportDialog } from "@/features/import-export/ImportDialog";
import { Button } from "@/components/ui/button";
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
import { useAppStore } from "@/lib/store/index";
import { cn } from "@/lib/utils";

/* ── Workspace mode tabs ─────────────────────────────────────── */
type WsTab = 'assessment' | 'planning' | 'compare' | 'report';
const WS_TABS: { key: WsTab; label: string }[] = [
    { key: 'assessment', label: 'Assessment' },
    { key: 'planning',   label: 'Planning'   },
    { key: 'compare',    label: 'Compare'    },
    { key: 'report',     label: 'Report'     },
];

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
    } = useAppStore();

    const [profileOpen, setProfileOpen]   = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [reportOpen, setReportOpen]     = useState(false);
    const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const wsTab = (queryParams.get('tab') as WsTab) || 'assessment';

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
    const subtitle = useMemo(() => {
        if (!patient) return null;
        const parts: string[] = [];
        if (patient.age)                    parts.push(`${patient.age}${patient.gender ?? ''}`);
        if ((patient as any).contact)       parts.push(`MRN ${(patient as any).contact}`);
        const dx = patient.visits?.[0]?.diagnosis;
        if (dx)                             parts.push(dx);
        return parts.length ? parts.join(' · ') : null;
    }, [patient]);

    const selectedCount = measurements.filter((m) => m.selected && !(m as any).isImplant).length;

    const userInitial = user?.name
        ? user.name.replace(/^(Dr\.|Mr\.|Ms\.)\s+/i, '').charAt(0).toUpperCase()
        : 'U';

    /* ── Tab switching ───────────────────────────────────────── */
    const handleWsTab = (key: WsTab) => {
        if (key === 'compare') {
            setComparisonMode(true);
            navigate('/compare');
        } else {
            if (isComparisonMode) setComparisonMode(false);
            const searchParams = new URLSearchParams(location.search);
            searchParams.set('tab', key);
            navigate(`/workspace?${searchParams.toString()}`);
            if (key === 'report') { setReportOpen(true); setActiveDialog('report'); }
        }
    };

    /* ── Other navigation ────────────────────────────────────── */
    const handleCompareToggle = () => {
        if (location.pathname === '/cases') { setComparisonMode(true); navigate('/compare'); return; }
        const next = !isComparisonMode;
        setComparisonMode(next);
        navigate(next ? '/compare' : '/dashboard');
    };

    const handlePatientsToggle = () => {
        if (location.pathname === '/cases') navigate(lastMainRouteRef.current);
        else navigate('/cases');
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
                onClick={() => { setComparisonMode(false); navigate('/dashboard'); }}
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
                            onClick={() => navigate('/dashboard')}
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
                                {activePatientId ? (patient?.name ?? 'Loading…') : 'Untitled Study'}
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
                        {WS_TABS.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => handleWsTab(t.key)}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: 8,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: wsTab === t.key ? 'var(--accent)' : 'var(--text-2)',
                                    background: wsTab === t.key ? 'var(--accent-soft)' : 'transparent',
                                    transition: 'all .14s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1 }} />
            )}

            {/* ── Right actions ─────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', flexShrink: 0 }}>

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

                {/* Import */}
                <ImportDialog>
                    <Button variant="ghost" size="icon" className={cn(iconBtn)} title="Import Scan">
                        <Upload className="h-3.5 w-3.5" />
                    </Button>
                </ImportDialog>

                {/* Compare (non-workspace only) */}
                {!isWorkspaceRoute && (
                    <Button variant="ghost" size="icon"
                        className={cn(iconBtn, isComparisonMode && "bg-primary text-primary-foreground border-primary/50")}
                        title="Compare" onClick={handleCompareToggle}>
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                    </Button>
                )}

                {/* Export */}
                <Button variant="ghost" size="icon" className={cn(iconBtn)} title="Export Report"
                    onClick={() => { setReportOpen(true); setActiveDialog('report'); }}>
                    <Download className="h-3.5 w-3.5" />
                </Button>

                {/* Cases (non-workspace only) */}
                {!isWorkspaceRoute && (
                    <Button variant="ghost" size="icon"
                        className={cn(iconBtn, location.pathname === '/cases' && "bg-primary/20 text-primary border-primary/30")}
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

                {/* View Report (workspace only) */}
                {isWorkspaceRoute && (
                    <button
                        onClick={() => { setWsTab('report'); setReportOpen(true); setActiveDialog('report'); }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            height: 30, padding: '0 12px',
                            borderRadius: 7,
                            border: `1px solid var(--border-2)`,
                            background: 'var(--surface-2)',
                            color: 'var(--text)',
                            fontSize: 12.5, fontWeight: 600,
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
                    >
                        <FileText size={13} style={{ color: 'var(--accent)' }} />
                        View Report
                    </button>
                )}

                {/* Three dots menu (workspace only) */}
                {isWorkspaceRoute && (
                    <button
                        style={{
                            display: 'grid', placeItems: 'center',
                            width: 30, height: 30, borderRadius: 7,
                            border: `1px solid var(--border-2)`,
                            background: 'var(--surface-2)',
                            color: 'var(--text-2)', cursor: 'pointer', flexShrink: 0,
                        }}
                        title="More options"
                    >
                        <MoreVertical size={15} />
                    </button>
                )}

                {/* Avatar / Profile */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="w-7 h-7 p-0 hover:bg-transparent">
                            <div className="w-7 h-7 rounded-full bg-[rgba(255,69,58,0.12)] flex items-center justify-center border border-[#FF453A]/20 hover:border-[#FF453A]/40 transition-all">
                                <span className="text-xs font-bold text-[#FF453A]">{userInitial}</span>
                            </div>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end"
                        className={cn("w-56 rounded-xl p-2 z-[100] shadow-md border",
                            isDark ? 'border-[#242427] bg-[#141416] text-[#F5F5F7]' : '!border-gray-200 !bg-white !text-gray-900'
                        )}
                    >
                        <DropdownMenuLabel className={cn("font-normal p-3", isDark ? '' : 'text-gray-900')}>
                            <div className="flex flex-col gap-0.5">
                                <p className="text-sm font-bold leading-none">{user?.name || 'User'}</p>
                                <p className="text-xs leading-none opacity-60">{user?.email || '—'}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className={isDark ? 'bg-[#242427]' : 'bg-gray-200'} />
                        <DropdownMenuItem className={cn("cursor-pointer rounded px-2 py-1.5 font-semibold !bg-transparent", isDark ? '!text-[#F5F5F7] hover:!bg-[#1B1B1E]' : '!text-gray-900 hover:!bg-gray-100')}
                            onClick={() => { setProfileOpen(true); setActiveDialog('profile'); }}>
                            <User className="mr-2 h-4 w-4 text-primary" /> Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem className={cn("cursor-pointer rounded px-2 py-1.5 font-semibold !bg-transparent", isDark ? '!text-[#F5F5F7] hover:!bg-[#1B1B1E]' : '!text-gray-900 hover:!bg-gray-100')}
                            onClick={() => { setSettingsOpen(true); setActiveDialog('settings'); }}>
                            <Settings className="mr-2 h-4 w-4 text-primary" /> Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className={isDark ? 'bg-[#242427]' : 'bg-gray-200'} />
                        <DropdownMenuItem className={cn("cursor-pointer rounded px-2 py-1.5 font-semibold !bg-transparent", isDark ? 'hover:!bg-[#1B1B1E]' : 'hover:!bg-red-50')}
                            onClick={() => { logout(); navigate('/login'); }}>
                            <LogOut className="mr-2 h-4 w-4" /> Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Dialogs */}
            <ProfileDialog open={profileOpen} onOpenChange={(v) => { setProfileOpen(v); setActiveDialog(v ? 'profile' : null); }} />
            <SettingsDialog open={settingsOpen} onOpenChange={(v) => { setSettingsOpen(v); setActiveDialog(v ? 'settings' : null); }} />
            <ReportDialog open={reportOpen} onOpenChange={(v) => { setReportOpen(v); setActiveDialog(v ? 'report' : null); }} checkedCount={measurements.filter((m) => m.selected).length} />
            <ShareDialog />
        </div>
    );
};

export default TopMenuBar;
