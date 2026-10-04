import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FolderOpen, Eye, Users } from 'lucide-react';
import { useAppStore, type Study } from '@/lib/store/index';
import { API_BASE } from '@/lib/api';
import { visibleStudies } from '@/lib/studies';
import { StudyCard } from '@/components/StudyCard';
import { destroyCornerstone } from '@/lib/cornerstone/initCornerstone';
import type { InspectionMode } from '@/lib/store/canvasSlice';

/**
 * Admin / organization owner: one member's studies in this organization
 * (UI12-10). Everything is view-only — opening a study shows its measurements
 * and plan exactly as the member saved them, with the editing tools off.
 *
 * The studies come with the admin's own patient list (GET /api/patients in the
 * organization workspace returns team studies marked via = 'team').
 * Route: /members/:userId/workspace
 */
const MemberWorkspacePage = () => {
    const navigate        = useNavigate();
    const { userId }      = useParams<{ userId: string }>();
    const activeWorkspace = useAppStore(s => s.activeWorkspace);
    const token           = useAppStore(s => s.token);
    const patients        = useAppStore(s => s.patients);
    const orgId = activeWorkspace.type === 'organization' ? activeWorkspace.orgId : null;

    const [member, setMember]   = useState<{ fullName: string | null; email: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);

    useEffect(() => {
        if (!orgId) navigate('/members', { replace: true });
    }, [orgId, navigate]);

    useEffect(() => {
        if (!orgId || !userId || !token) return;
        let alive = true;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_BASE}/orgs/${orgId}/members`, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) throw new Error();
                const d = await res.json();
                if (!d.isAdmin) { navigate('/members', { replace: true }); return; } // members never see others' studies
                const found = (d.members ?? []).find((m: { userId: string }) => m.userId === userId);
                if (alive) setMember(found ? { fullName: found.fullName, email: found.email } : null);
                await useAppStore.getState().refreshPatients(); // fresh team studies
            } catch {
                if (alive) setError('Could not load this member. Please try again.');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [orgId, userId, token, navigate]);

    const studies = useMemo(
        () => visibleStudies(patients, 'team').filter(({ study }) => study.ownerUserId === userId),
        [patients, userId],
    );
    const displayName = member?.fullName ?? member?.email ?? 'Member';

    const open = async (patientId: string, study: Study) => {
        const st = useAppStore.getState();
        if (st.isDicomMode) destroyCornerstone();
        try {
            await st.openStudy(patientId, study.id);
            useAppStore.getState().setInspectionMode({
                active: true,
                ownerName: displayName,
                ownerUserId: userId!,
                orgId: orgId!,
                studyId: study.id,
                patientId,
                contextId: useAppStore.getState().activeContextId ?? '',
            } satisfies InspectionMode);
            navigate('/workspace');
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Could not open this study.');
        }
    };

    if (!orgId) return null;

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => navigate('/members')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors"
                    aria-label="Back to members"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h1 className="truncate text-xl font-semibold text-[var(--text)]">{displayName}</h1>
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                            <Eye className="h-3 w-3" /> View only
                        </span>
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--text-3)]">{member?.email ?? ''} · Studies in this organization</p>
                </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--accent)]" />
                <p className="text-xs leading-relaxed text-[var(--text-2)]">
                    As the organization's admin you can open every member's study to see its measurements, plan and report.
                    Studies stay the member's own — nothing can be changed from here. To work on a study together, the member
                    shares it with you with edit rights.
                </p>
            </div>

            {loading && <div className="py-16 text-center text-sm text-[var(--text-3)]">Loading…</div>}
            {error && !loading && (
                <div className="rounded-xl border border-[#FF453A]/30 bg-[#FF453A]/5 px-4 py-3 text-sm text-[#FF453A]">{error}</div>
            )}

            {!loading && !error && (
                <>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text)]">Studies ({studies.length})</h2>
                    {studies.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
                                <FolderOpen className="h-7 w-7 text-[var(--text-3)]" />
                            </div>
                            <p className="text-sm font-medium text-[var(--text-3)]">No studies yet</p>
                            <p className="mt-1 text-xs text-[var(--text-3)]">{displayName} has not created any studies in this organization.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {studies.map(({ patient, study }) => (
                                <StudyCard key={study.id} study={study} patientId={patient.id} onOpenWorkspace={(s) => open(patient.id, s)} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default MemberWorkspacePage;
