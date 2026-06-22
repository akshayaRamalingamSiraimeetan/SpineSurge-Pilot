import { useState, useMemo } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { ShieldAlert, Copy, X, FileText } from "lucide-react";
import TopMenuBar from "@/features/navigation/TopMenuBar";
import LeftSidebar from "@/features/navigation/LeftSidebar";
import RightSidebar from "@/features/navigation/RightSidebar";
import BottomToolbar from "@/features/canvas/BottomToolbar";
import { WorkspaceShell } from "@/features/navigation/WorkspaceShell";
import { useAppStore } from "@/lib/store/index";
import { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";

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
        setInspectionMode(null);
        clearImage();
        // Restore admin's own patient context
        useAppStore.getState().initializeStore();
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
        <div className="fixed top-16 left-0 right-0 z-40 flex items-center justify-between gap-3 border-b border-[#FF453A]/30 bg-[#1A0E0E] px-4 py-2.5">
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
                    className="flex items-center gap-1.5 rounded-lg border border-[#242427] bg-[#141416] px-3 py-1.5 text-xs font-medium text-[#9CA3AF] hover:bg-[#242427] hover:text-[#F5F5F7] transition-colors"
                >
                    <X className="h-3.5 w-3.5" />
                    Exit Inspection
                </button>
            </div>
        </div>
    );
};

// ─── Main Layout ──────────────────────────────────────────────────────────────

const MainLayout: React.FC = () => {
    const currentImage     = useAppStore((state) => state.currentImage);
    const isComparisonMode = useAppStore((state) => state.isComparisonMode);
    const comparison       = useAppStore((state) => state.comparison);
    const inspectionMode   = useAppStore((state) => state.inspectionMode);

    const hasImageForToolbar = isComparisonMode
        ? !!(comparison?.left?.image || comparison?.right?.image)
        : !!currentImage;

    // When inspection mode is active, push content down to make room for the banner
    const bannerOffset = inspectionMode?.active ? 'pt-[104px]' : 'pt-16';

    return (
        <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
            <TopMenuBar />
            <InspectionBanner />
            <div className={`flex flex-1 ${bannerOffset} h-screen overflow-hidden`}>
                <LeftSidebar />
                <main className="flex-1 relative overflow-hidden flex flex-col" style={{ background: 'var(--bg-2)' }}>
                    {/* Grid Overlay */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.015]"
                        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.22) 1px, transparent 1px)', backgroundSize: '40px 40px', zIndex: 0 }}>
                    </div>

                    {/* WorkspaceShell provides the Assessment/Planning/Compare/Report tab header */}
                    <div className="ws" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                            <Outlet />
                            {hasImageForToolbar && <BottomToolbar />}
                        </div>
                    </div>
                </main>
                <RightSidebar />
            </div>
        </div>
    );
};

export default MainLayout;
