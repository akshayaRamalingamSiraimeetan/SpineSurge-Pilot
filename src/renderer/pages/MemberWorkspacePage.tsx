import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, FolderOpen, Calendar, User, ShieldAlert, ExternalLink, Loader2
} from 'lucide-react';
import { useAppStore } from '@/lib/store/index';
import { API_BASE } from '@/lib/api';
import type { InspectionMode } from '@/lib/store/canvasSlice';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanRow {
    id:       string;
    studyId:  string;
    filePath: string;
    type:     string | null;
    date:     string | null;
}

interface StudyRow {
    id:              string;
    patientId:       string;
    visitId:         string | null;
    modality:        string | null;
    source:          string | null;
    acquisitionDate: string | null;
    organizationId:  string | null;
    ownerUserId:     string | null;
    scans:           ScanRow[];
}

interface MemberWorkspaceData {
    userId:  string;
    orgId:   string;
    studies: StudyRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toAbsoluteUrl = (filePath: string) =>
    filePath.startsWith('http')
        ? filePath
        : `${API_BASE}/uploads/${filePath.split(/[\\/]/).pop()}`;

const formatDate = (v: string | null) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return v; }
};

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyStudies = ({ name }: { name: string }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1C1C1F]">
            <FolderOpen className="h-7 w-7 text-[#4B5563]" />
        </div>
        <p className="text-sm font-medium text-[#6B7280]">No studies yet</p>
        <p className="mt-1 text-xs text-[#4B5563]">
            {name} has not created any studies in this organization.
        </p>
    </div>
);

// ─── Study Card ───────────────────────────────────────────────────────────────

interface StudyCardProps {
    study:       StudyRow;
    onOpen:      (study: StudyRow) => void;
    isOpening:   boolean;
}

const StudyCard = ({ study, onOpen, isOpening }: StudyCardProps) => (
    <div className="flex flex-col gap-3 rounded-xl border border-[#242427] bg-[#141416] p-4 transition-colors hover:border-[#3A3A3E]">
        {/* Header */}
        <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#242427]">
                <FolderOpen className="h-4 w-4 text-[#9CA3AF]" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#F5F5F7]">
                    {study.modality ?? 'Unknown Modality'}
                </p>
                <p className="text-xs text-[#6B7280]">{study.source ?? 'Import'}</p>
            </div>
            <span className="flex-shrink-0 rounded-md bg-[#242427] px-2 py-0.5 font-mono text-[10px] text-[#4B5563]">
                {study.id.slice(-6)}
            </span>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-[#6B7280]">
            <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {study.acquisitionDate ?? '—'}
            </span>
            <span className="flex items-center gap-1">
                <FolderOpen className="h-3 w-3" />
                {study.scans.length} scan{study.scans.length !== 1 ? 's' : ''}
            </span>
        </div>

        {/* Thumbnails */}
        {study.scans.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
                {study.scans.slice(0, 5).map(scan => (
                    <div key={scan.id} className="h-14 w-14 flex-none overflow-hidden rounded-lg border border-[#242427] bg-[#0F0F11]">
                        <img
                            src={toAbsoluteUrl(scan.filePath)}
                            alt={scan.type ?? 'Scan'}
                            className="h-full w-full object-cover opacity-80"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                    </div>
                ))}
                {study.scans.length > 5 && (
                    <div className="flex h-14 w-14 flex-none items-center justify-center rounded-lg border border-[#242427] bg-[#0F0F11] text-xs font-semibold text-[#4B5563]">
                        +{study.scans.length - 5}
                    </div>
                )}
            </div>
        )}

        {/* Open button */}
        <button
            onClick={() => onOpen(study)}
            disabled={isOpening || study.scans.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#242427] bg-[#1C1C1F] py-2 text-xs font-medium text-[#9CA3AF] transition-colors hover:border-[#FF453A]/40 hover:bg-[#FF453A]/5 hover:text-[#FF453A] disabled:cursor-not-allowed disabled:opacity-40"
        >
            {isOpening ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening…</>
            ) : (
                <><ExternalLink className="h-3.5 w-3.5" /> Open in Workspace</>
            )}
        </button>
    </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * MemberWorkspacePage
 *
 * Admin-only. Lists a member's studies in the active org.
 * "Open in Workspace" sets up inspection mode and navigates to /workspace.
 *
 * Route: /members/:userId/workspace
 */
const MemberWorkspacePage = () => {
    const navigate          = useNavigate();
    const { userId }        = useParams<{ userId: string }>();
    const activeWorkspace   = useAppStore(s => s.activeWorkspace);
    const token             = useAppStore(s => s.token);
    const setInspectionMode = useAppStore(s => s.setInspectionMode);
    const setActivePatient  = useAppStore(s => s.setActivePatient);
    const loadImage         = useAppStore(s => s.loadImage);
    const clearImage        = useAppStore(s => s.clearImage);

    const orgId = activeWorkspace.type === 'organization'
        ? (activeWorkspace as { type: 'organization'; orgId: string }).orgId
        : null;

    const [data,        setData]        = useState<MemberWorkspaceData | null>(null);
    const [memberInfo,  setMemberInfo]  = useState<{ fullName: string | null; email: string } | null>(null);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState<string | null>(null);
    const [openingId,   setOpeningId]   = useState<string | null>(null);

    // ── Guard ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!orgId) navigate('/members', { replace: true });
    }, [orgId, navigate]);

    // ── Fetch ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!orgId || !userId || !token) return;
        const load = async () => {
            setLoading(true); setError(null);
            try {
                // Member info
                const membersRes = await fetch(`${API_BASE}/orgs/${orgId}/members`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (membersRes.status === 403) { navigate('/members', { replace: true }); return; }
                if (membersRes.ok) {
                    const d = await membersRes.json();
                    const list = Array.isArray(d) ? d : (d.members ?? []);
                    const found = list.find((m: any) => m.userId === userId);
                    if (found) setMemberInfo({ fullName: found.fullName, email: found.email });
                }

                // Workspace data
                const wsRes = await fetch(`${API_BASE}/orgs/${orgId}/members/${userId}/patients`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (wsRes.status === 403) { navigate('/members', { replace: true }); return; }
                if (wsRes.status === 404) { setError('Member not found in this organization.'); return; }
                if (!wsRes.ok) { setError('Failed to load member workspace.'); return; }
                setData(await wsRes.json());
            } catch {
                setError('Network error — please try again.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [orgId, userId, token, navigate]);

    // ── Open study in workspace ───────────────────────────────────────────────
    const handleOpenStudy = useCallback(async (study: StudyRow) => {
        if (!orgId || !userId) return;
        if (study.scans.length === 0) return;
        setOpeningId(study.id);

        const ownerName = memberInfo?.fullName ?? memberInfo?.email ?? userId;
        const firstScan = study.scans[0];
        const imageUrl  = toAbsoluteUrl(firstScan.filePath);

        // Build a minimal synthetic context — measurements will come from
        // the existing contextStates if the backend has saved any for this patient.
        // We use the real patientId and studyId so the existing API data is picked up.
        const syntheticContextId = `inspect-${study.id}-${Date.now()}`;

        // Set inspection mode BEFORE navigating so MainLayout renders the banner
        setInspectionMode({
            active:      true,
            ownerName,
            ownerUserId: userId,
            orgId,
            studyId:     study.id,
            patientId:   study.patientId,
            contextId:   syntheticContextId,
        } satisfies InspectionMode);

        // Load the patient data so contexts/measurements are available.
        // setActivePatient fetches contexts for this patient from the backend.
        // The member's patient/study data is already in the DB — we just need to load it.
        clearImage();
        await setActivePatient(study.patientId);

        // Load the first scan image into the canvas
        loadImage(imageUrl);

        setOpeningId(null);
        navigate('/workspace');
    }, [orgId, userId, memberInfo, setInspectionMode, setActivePatient, loadImage, clearImage, navigate]);

    if (!orgId) return null;

    const displayName = memberInfo?.fullName ?? memberInfo?.email ?? userId ?? 'Member';
    const studies     = data?.studies ?? [];
    const totalScans  = studies.reduce((a, s) => a + s.scans.length, 0);
    const modalities  = [...new Set(studies.map(s => s.modality).filter(Boolean))] as string[];

    return (
        <div className="h-full overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-5xl space-y-6">

            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => navigate('/members')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#242427] bg-[#141416] text-[#9CA3AF] hover:bg-[#242427] hover:text-[#F5F5F7] transition-colors"
                    aria-label="Back to members"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="truncate text-xl font-semibold text-[#F5F5F7]">{displayName}</h1>
                        <span className="flex-shrink-0 rounded-full border border-[#242427] bg-[#1C1C1F] px-2 py-0.5 text-[10px] font-medium text-[#6B7280]">
                            Read-only inspection
                        </span>
                    </div>
                    <p className="mt-0.5 text-sm text-[#6B7280]">
                        {memberInfo?.email ?? ''} · Organization member workspace
                    </p>
                </div>
            </div>

            {/* ── Admin notice ─────────────────────────────────────── */}
            <div className="flex items-center gap-3 rounded-xl border border-[#FF453A]/20 bg-[#FF453A]/5 px-4 py-3">
                <ShieldAlert className="h-4 w-4 flex-shrink-0 text-[#FF453A]" />
                <p className="text-xs text-[#FF453A]">
                    <span className="font-semibold">Admin view.</span>{' '}
                    Clicking "Open in Workspace" loads this member's study in read-only inspection mode.
                    Use "Create Review Copy" in the workspace to make your own editable copy.
                </p>
            </div>

            {/* ── Loading / Error ──────────────────────────────────── */}
            {loading && <div className="py-20 text-center text-sm text-[#4B5563]">Loading workspace…</div>}
            {error && !loading && (
                <div className="flex items-center gap-3 rounded-xl border border-[#FF453A]/30 bg-[#FF453A]/5 px-4 py-3 text-sm text-[#FF453A]">{error}</div>
            )}

            {/* ── Stats ────────────────────────────────────────────── */}
            {!loading && !error && (
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Studies',    value: studies.length, icon: FolderOpen },
                        { label: 'Scans',      value: totalScans,     icon: Calendar   },
                        { label: 'Modalities', value: modalities.length, icon: User    },
                    ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="flex items-center gap-3 rounded-xl border border-[#242427] bg-[#141416] px-4 py-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#242427]">
                                <Icon className="h-4 w-4 text-[#9CA3AF]" />
                            </div>
                            <div>
                                <p className="text-lg font-bold text-[#F5F5F7]">{value}</p>
                                <p className="text-xs text-[#6B7280]">{label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Modality chips ───────────────────────────────────── */}
            {!loading && !error && modalities.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {modalities.map(m => (
                        <span key={m} className="rounded-full border border-[#242427] bg-[#1C1C1F] px-3 py-1 text-xs font-medium text-[#9CA3AF]">
                            {m}
                        </span>
                    ))}
                </div>
            )}

            {/* ── Studies list ─────────────────────────────────────── */}
            {!loading && !error && (
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F5F5F7]">
                    Studies ({studies.length})
                </h2>
            )}

            {!loading && !error && studies.length === 0 && <EmptyStudies name={displayName} />}

            {!loading && !error && studies.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {studies
                        .slice()
                        .sort((a, b) => (b.acquisitionDate ?? '').localeCompare(a.acquisitionDate ?? ''))
                        .map(study => (
                            <StudyCard
                                key={study.id}
                                study={study}
                                onOpen={handleOpenStudy}
                                isOpening={openingId === study.id}
                            />
                        ))}
                </div>
            )}
        </div>
        </div>
    );
};

export default MemberWorkspacePage;
