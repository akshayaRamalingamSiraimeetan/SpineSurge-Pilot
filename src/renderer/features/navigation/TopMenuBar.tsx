/**
 * TopMenuBar — workspace header (only rendered by MainLayout: /workspace, /compare).
 *
 *   [S] [←] Patient / Study name     [Assessment | Planning | Compare | Report]     [Saved] [☀/☾]
 *
 * Nothing else lives here on purpose: import, report export and 3D layout
 * controls belong to the page they act on, so the header only navigates.
 */
import { Cloud, CloudOff, Loader2, AlertCircle } from "lucide-react";
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
import { ThemeToggle } from "@/components/ThemeToggle";
import { useNavigate, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore, getStudyDisplayName } from "@/lib/store/index";

export type WsTab = 'assessment' | 'planning' | 'compare' | 'report';
const WS_TABS: { key: WsTab; label: string }[] = [
    { key: 'assessment', label: 'Assessment' },
    { key: 'planning',   label: 'Planning'   },
    { key: 'compare',    label: 'Compare'    },
    { key: 'report',     label: 'Report'     },
];

/** Work exists that is not attached to any study (untitled Quick Use session). */
export const hasUntitledWork = () => {
    const s = useAppStore.getState();
    return !s.activeContextId && (!!s.currentImage || s.measurements.length > 0 || s.implants.length > 0 || s.threeDImplants.length > 0);
};

const TopMenuBar = () => {
    const { resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const isDark = resolvedTheme === 'dark';

    const {
        activePatientId, patients, activeContextId, contexts, syncStatus, hasUnsyncedChanges,
        isComparisonMode, setComparisonMode, currentImage, measurements,
    } = useAppStore(useShallow((s) => ({
        activePatientId: s.activePatientId,
        patients: s.patients,
        activeContextId: s.activeContextId,
        contexts: s.contexts,
        syncStatus: s.syncStatus,
        hasUnsyncedChanges: s.hasUnsyncedChanges,
        isComparisonMode: s.isComparisonMode,
        setComparisonMode: s.setComparisonMode,
        currentImage: s.currentImage,
        measurements: s.measurements,
    })));

    const [closeAttemptRoute, setCloseAttemptRoute] = useState<string | null>(null);
    const [discardRoute, setDiscardRoute] = useState<string | null>(null);

    const wsTab: WsTab = location.pathname === '/compare'
        ? 'compare'
        : ((new URLSearchParams(location.search).get('tab') as WsTab) || 'assessment');

    /* ── Title ─────────────────────────────────────────────── */
    const patient = useMemo(() => patients.find((p) => p.id === activePatientId) ?? null, [activePatientId, patients]);
    const context = useMemo(() => contexts.find((c) => c.id === activeContextId) ?? null, [activeContextId, contexts]);
    const headerTitle = useMemo(() => {
        if (!activePatientId) return 'Untitled study';
        if (context && patient) {
            const studyId = context.studyIds?.[0];
            const study = patient.studies?.find(s => s.id === studyId)
                || patient.visits?.flatMap(v => v.studies || []).find(s => s.id === studyId);
            if (study) return `${patient.name || 'Unnamed patient'} · ${getStudyDisplayName(study)}`;
        }
        return patient?.name || 'Unnamed patient';
    }, [activePatientId, context, patient]);
    const subtitle = useMemo(() => {
        if (!patient) return null;
        const parts: string[] = [];
        if (patient.age) parts.push(`${patient.age}${patient.gender ?? ''}`);
        if (patient.id) parts.push(`ID ${patient.id}`);
        const dx = patient.visits?.[0]?.diagnosis;
        if (dx) parts.push(dx);
        return parts.join(' · ') || null;
    }, [patient]);

    /* ── Tabs: always available; replace history so Back leaves the workspace ── */
    const handleWsTab = (key: WsTab) => {
        const st = useAppStore.getState();
        st.setActiveTool(null);
        st.setSelection(null);
        if (key === 'compare') {
            setComparisonMode(true);
            navigate('/compare', { replace: location.pathname === '/workspace' || location.pathname === '/compare' });
            return;
        }
        if (key !== 'report' && isComparisonMode) setComparisonMode(false);
        navigate(`/workspace?tab=${key}`, { replace: true });
    };

    /* ── Leaving the workspace ─────────────────────────────── */
    const leaveWorkspace = (targetRoute: string | -1) => {
        setComparisonMode(false);
        useAppStore.getState().closeCase();
        if (targetRoute === -1) navigate(-1);
        else navigate(targetRoute);
    };

    const handleClose = async (target: string | -1) => {
        // Untitled work has nowhere to be saved — confirm before discarding.
        if (hasUntitledWork()) {
            setDiscardRoute(target === -1 ? '__back__' : target);
            return;
        }
        const state = useAppStore.getState();
        if (!state.activeContextId || !hasUnsyncedChanges) {
            leaveWorkspace(target);
            return;
        }
        state.setSyncStatus('saving');
        const ok = await state.updateContextState(state.activeContextId, {
            measurements: state.measurements,
            implants: state.implants,
            threeDImplants: state.threeDImplants,
            pedicleSimulations: state.pedicleSimulations,
            ...(state.currentImage ? { currentImage: state.currentImage } : {}),
        });
        if (ok) {
            state.setHasUnsyncedChanges(false);
            state.setSyncStatus('synced');
            leaveWorkspace(target);
        } else {
            state.setSyncStatus('error');
            setCloseAttemptRoute(target === -1 ? '__back__' : target);
        }
    };

    // Back = where the user came from (tabs replace history), else dashboard.
    const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
    const onBack = () => handleClose(canGoBack ? -1 : '/dashboard');
    const routeOf = (r: string) => (r === '__back__' ? -1 : r);

    /* ── Save status ───────────────────────────────────────── */
    const untitled = !activeContextId && (!!currentImage || measurements.length > 0);
    const status = untitled
        ? { icon: <AlertCircle className="w-3.5 h-3.5 text-amber-500" />, text: 'Not saved — add patient details', title: 'Fill in the patient name in the right panel to save this study' }
        : syncStatus === 'saving' ? { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, text: 'Saving…', title: '' }
        : syncStatus === 'error' ? { icon: <CloudOff className="w-3.5 h-3.5 text-red-500" />, text: 'Save failed — retrying', title: '' }
        : syncStatus === 'unsynced' ? { icon: <Cloud className="w-3.5 h-3.5 opacity-50" />, text: 'Saving soon…', title: '' }
        : activeContextId ? { icon: <Cloud className="w-3.5 h-3.5" />, text: 'Saved', title: '' }
        : null;

    return (
        <div
            className="fixed top-0 left-0 right-0 z-50 flex items-center"
            style={{
                height: 54,
                background: isDark ? 'rgba(10,10,11,0.97)' : 'rgba(255,255,255,0.97)',
                borderBottom: '1px solid var(--border)',
                backdropFilter: 'blur(20px)',
            }}
        >
            {/* Logo */}
            <button
                onClick={() => handleClose('/dashboard')}
                title="Dashboard"
                style={{ width: 54, height: 54, flexShrink: 0, display: 'grid', placeItems: 'center', borderRight: '1px solid var(--border)' }}
            >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 16, fontWeight: 800 }}>
                    S
                </div>
            </button>

            {/* Back + title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', minWidth: 0, flex: '0 1 340px' }}>
                <button
                    onClick={onBack}
                    title="Back"
                    style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-2)', color: 'var(--text-2)', flexShrink: 0 }}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {headerTitle}
                    </div>
                    {subtitle && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
                    )}
                </div>
            </div>

            {/* Tabs (always navigable) */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <div style={{ display: 'flex', gap: 2, background: 'var(--surface-3)', padding: 3, borderRadius: 10 }}>
                    {WS_TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => handleWsTab(t.key)}
                            style={{
                                padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                color: wsTab === t.key ? 'var(--accent)' : 'var(--text-2)',
                                background: wsTab === t.key ? 'var(--accent-soft)' : 'transparent',
                                transition: 'all .14s', whiteSpace: 'nowrap',
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Save status + theme (rightmost) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', flex: '0 1 340px', justifyContent: 'flex-end' }}>
                {status && (
                    <div title={status.title} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground px-2 py-1 rounded-md bg-muted/30 whitespace-nowrap">
                        {status.icon} {status.text}
                    </div>
                )}
                <ThemeToggle />
            </div>

            {/* Save failed while leaving */}
            <Dialog open={!!closeAttemptRoute} onOpenChange={(o) => { if (!o) setCloseAttemptRoute(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Changes not saved</DialogTitle>
                        <DialogDescription>Your latest changes could not be saved. Retry, or stay and keep editing.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setCloseAttemptRoute(null)}>Keep editing</Button>
                        <Button onClick={() => { const r = closeAttemptRoute!; setCloseAttemptRoute(null); handleClose(routeOf(r)); }}>Retry</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Untitled study: confirm discard */}
            <Dialog open={!!discardRoute} onOpenChange={(o) => { if (!o) setDiscardRoute(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Discard untitled study?</DialogTitle>
                        <DialogDescription>
                            This study isn't saved yet. Add the patient's name in the right panel to save it, or discard the image and measurements.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setDiscardRoute(null)}>Keep editing</Button>
                        <Button variant="destructive" onClick={() => {
                            const r = discardRoute!;
                            setDiscardRoute(null);
                            useAppStore.getState().resetWorkspace();
                            leaveWorkspace(routeOf(r));
                        }}>Discard</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default TopMenuBar;
