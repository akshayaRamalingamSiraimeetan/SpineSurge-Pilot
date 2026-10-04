import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Eye, Users, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { caseAccess, findStudy } from "@/lib/access";
import TopMenuBar from "@/features/navigation/TopMenuBar";
import LeftSidebar from "@/features/navigation/LeftSidebar";
import RightSidebar from "@/features/navigation/RightSidebar";
import BottomToolbar from "@/features/canvas/BottomToolbar";
import ReportDocumentPanel from "@/features/report/ReportDocumentPanel";
import { useAppStore } from "@/lib/store/index";

// ─── Workspace tab header (Assessment · Planning · Compare · Report) ──────────



// ─── Access banner (UI12-10) ──────────────────────────────────────────────────
// View-only (shared view, or an org admin looking at a member's study): the
// measurements and plan are visible, the tools are off, nothing is saved.
// Shared with edit rights: both people edit; changes sync live.

/** Banner text for the open case, or null for the user's own study. */
const useAccessBanner = () => useAppStore(useShallow((s) => {
    const access = caseAccess(s);
    const ctx = s.contexts.find((c) => c.id === s.activeContextId);
    const study = findStudy(s, ctx?.patientId ?? s.activePatientId, ctx?.studyIds?.[0] ?? s.inspectionMode?.studyId);
    const viewOnly = access === 'view' || !!s.inspectionMode?.active;
    if (!viewOnly && access !== 'edit') return null;
    return { viewOnly, owner: s.inspectionMode?.ownerName ?? study?.ownerName ?? 'another user', team: !!s.inspectionMode?.active };
}));

const AccessBanner = () => {
    const navigate = useNavigate();
    const banner = useAccessBanner();
    if (!banner) return null;

    const handleExit = () => {
        const s = useAppStore.getState();
        const memberId = s.inspectionMode?.ownerUserId;
        s.setInspectionMode(null);
        s.resetWorkspace();
        navigate(banner.team && memberId ? `/members/${memberId}/workspace` : '/patients');
    };

    const tone = banner.viewOnly
        ? 'border-[#FF453A]/30 bg-[#FF453A]/10 text-[#FF453A]'
        : 'border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]';
    return (
        <div className={`fixed top-[54px] h-10 left-0 right-0 z-40 flex items-center justify-between gap-3 border-b px-4 ${tone}`}>
            <div className="flex items-center gap-2.5 min-w-0 text-xs">
                {banner.viewOnly ? <Eye className="h-4 w-4 flex-shrink-0" /> : <Users className="h-4 w-4 flex-shrink-0" />}
                <span className="truncate">
                    <span className="font-semibold">{banner.viewOnly ? 'View only' : 'Shared with you'}</span>
                    {' — '}{banner.owner}'s study.{' '}
                    {banner.viewOnly
                        ? 'You can see the measurements and plan; editing tools are off.'
                        : 'You can edit — changes sync live with everyone in this study.'}
                </span>
            </div>
            <button
                onClick={handleExit}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors flex-shrink-0"
            >
                <X className="h-3.5 w-3.5" />
                {banner.team ? 'Back to member' : 'Close'}
            </button>
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
    const banner            = useAccessBanner();
    const isDicomMode       = useAppStore((state) => state.isDicomMode);
    const leftOpen          = useAppStore((state) => state.isLeftSidebarOpen);
    const rightOpen         = useAppStore((state) => state.isRightSidebarOpen);
    const toggleLeftSidebar = useAppStore((state) => state.toggleLeftSidebar);
    const toggleRightSidebar = useAppStore((state) => state.toggleRightSidebar);

    const isReportTab = location.pathname === '/workspace' && new URLSearchParams(location.search).get('tab') === 'report';
    // Compare renders its own fixed toolbar between Image A and B (UI5-02).
    const hasImageForToolbar = !isReportTab && !isDicomMode && !isComparisonMode && !!currentImage;

    // Header is 54px; the access banner adds 40px.
    const topOffset = banner ? 94 : 54;

    return (
        <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
            <TopMenuBar />
            <AccessBanner />
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
