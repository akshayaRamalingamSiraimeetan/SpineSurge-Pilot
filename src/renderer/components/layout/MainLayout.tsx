import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ShieldAlert, Copy, X, ChevronLeft, ChevronRight } from "lucide-react";
import TopMenuBar from "@/features/navigation/TopMenuBar";
import LeftSidebar from "@/features/navigation/LeftSidebar";
import RightSidebar from "@/features/navigation/RightSidebar";
import BottomToolbar from "@/features/canvas/BottomToolbar";
import ReportDocumentPanel from "@/features/report/ReportDocumentPanel";
import { useAppStore } from "@/lib/store/index";
import { API_BASE } from "@/lib/api";

// ─── Workspace tab header (Assessment · Planning · Compare · Report) ──────────



// ─── Inspection Banner ────────────────────────────────────────────────────────

const InspectionBanner = () => {
    const navigate        = useNavigate();
    const inspectionMode  = useAppStore(s => s.inspectionMode);
    const token           = useAppStore(s => s.token);
    const setInspectionMode = useAppStore(s => s.setInspectionMode);
    const clearImage      = useAppStore(s => s.clearImage);

    const [creating, setCreating] = useState(false);
    const [copyError, setCopyError] = useState('');

    if (!inspectionMode?.active) return null;

    const handleExit = () => {
        // Drop the member's case entirely, then reload the admin's own list.
        setInspectionMode(null);
        clearImage();
        useAppStore.getState().resetWorkspace();
        void useAppStore.getState().initializeStore();
        navigate('/members');
    };

    const handleCreateReview = async () => {
        if (!token) return;
        setCreating(true);
        setCopyError('');
        try {
            const res = await fetch(
                `${API_BASE}/orgs/${inspectionMode.orgId}/members/${inspectionMode.ownerUserId}/review-copy`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ studyId: inspectionMode.studyId }),
                }
            );

            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setCopyError(d.error ?? 'Failed to create review copy');
                return;
            }

            const { reviewStudy } = await res.json();

            // Exit inspection mode — load the review copy as admin's own study
            setInspectionMode(null);

            // Reload store so the new review study appears in admin's org workspace
            await useAppStore.getState().initializeStore();

            // Navigate to workspace — the new study will be visible
            navigate('/workspace');
        } catch {
            setCopyError('Network error — please try again');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="fixed top-[54px] h-10 left-0 right-0 z-40 flex items-center justify-between gap-3 border-b border-[#FF453A]/30 bg-[#1A0E0E] px-4 py-0">
            <div className="flex items-center gap-2.5 min-w-0">
                <ShieldAlert className="h-4 w-4 flex-shrink-0 text-[#FF453A]" />
                <span className="text-xs text-[#FF453A]">
                    <span className="font-semibold">Inspection mode</span>
                    {' — '}Viewing study owned by{' '}
                    <span className="font-semibold">{inspectionMode.ownerName}</span>.
                    {' '}This is read-only. Your changes will not be saved.
                </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
                {copyError && (
                    <span className="text-xs text-[#FF453A]">{copyError}</span>
                )}
                <button
                    onClick={handleCreateReview}
                    disabled={creating}
                    className="flex items-center gap-1.5 rounded-lg border border-[#FF453A]/40 bg-[#FF453A]/10 px-3 py-1.5 text-xs font-semibold text-[#FF453A] hover:bg-[#FF453A]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Copy className="h-3.5 w-3.5" />
                    {creating ? 'Creating…' : 'Create Review Copy'}
                </button>
                <button
                    onClick={handleExit}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors"
                >
                    <X className="h-3.5 w-3.5" />
                    Exit Inspection
                </button>
            </div>
        </div>
    );
};

// ─── Sidebar edge tab ─────────────────────────────────────────────────────────
// Rounded tab attached to the canvas edge; same control whether the panel is
// open or closed, so it never jumps around or gets clipped.
const EdgeTab = ({ side, open, onClick }: { side: 'left' | 'right'; open: boolean; onClick: () => void }) => {
    const pointsLeft = side === 'left' ? open : !open;
    return (
        <button
            onClick={onClick}
            title={`${open ? 'Hide' : 'Show'} ${side === 'left' ? 'tools' : 'details'} panel`}
            className="absolute z-40 flex items-center justify-center transition-colors text-[var(--text-3)] hover:text-[var(--text)]"
            style={{
                top: 14,
                [side]: 0,
                width: 18,
                height: 44,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                [side === 'left' ? 'borderLeft' : 'borderRight']: 'none',
                borderRadius: side === 'left' ? '0 12px 12px 0' : '12px 0 0 12px',
                boxShadow: '0 2px 8px rgba(0,0,0,.18)',
            }}
        >
            {pointsLeft ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
    );
};

// ─── Main Layout ──────────────────────────────────────────────────────────────

const MainLayout: React.FC = () => {
    const location = useLocation();
    const currentImage      = useAppStore((state) => state.currentImage);
    const isComparisonMode  = useAppStore((state) => state.isComparisonMode);
    const comparison        = useAppStore((state) => state.comparison);
    const inspectionMode    = useAppStore((state) => state.inspectionMode);
    const isDicomMode       = useAppStore((state) => state.isDicomMode);
    const leftOpen          = useAppStore((state) => state.isLeftSidebarOpen);
    const rightOpen         = useAppStore((state) => state.isRightSidebarOpen);
    const toggleLeftSidebar = useAppStore((state) => state.toggleLeftSidebar);
    const toggleRightSidebar = useAppStore((state) => state.toggleRightSidebar);

    const isReportTab = location.pathname === '/workspace' && new URLSearchParams(location.search).get('tab') === 'report';
    const hasImageForToolbar = !isReportTab && !isDicomMode && (isComparisonMode
        ? !!(comparison?.left?.image || comparison?.right?.image || currentImage)
        : !!currentImage);

    // Header is 54px; inspection banner adds 40px.
    const topOffset = inspectionMode?.active ? 94 : 54;

    return (
        <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
            <TopMenuBar />
            <InspectionBanner />
            <div className="flex flex-1 h-screen overflow-hidden" style={{ paddingTop: topOffset }}>
                <LeftSidebar />
                <main className="flex-1 relative overflow-hidden flex flex-col" style={{ background: 'var(--bg-2)' }}>
                    <EdgeTab side="left" open={leftOpen} onClick={() => toggleLeftSidebar(!leftOpen)} />
                    <EdgeTab side="right" open={rightOpen} onClick={() => toggleRightSidebar(!rightOpen)} />
                    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                        <Outlet />
                        {hasImageForToolbar && <BottomToolbar />}
                    </div>
                </main>
                {isReportTab ? <ReportDocumentPanel /> : <RightSidebar />}
            </div>
        </div>
    );
};

export default MainLayout;
