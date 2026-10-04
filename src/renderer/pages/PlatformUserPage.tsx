import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Eye, FileText, Layers, GitCompare, Ruler, Wrench, Share2, ImageOff } from 'lucide-react';
import { useAppStore } from '@/lib/store/index';
import { API_BASE, resolveAssetUrl } from '@/lib/api';
import { destroyCornerstone } from '@/lib/cornerstone/initCornerstone';
import { PLATFORM_INSPECT } from '@/lib/activity';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { type FeedEvent, getJson, pageName, resultText, setBlocked, timeAgo, toolName, useLiveMonitor } from '@/features/platform/monitor';
import { EventRow, LiveBadge } from '@/features/platform/MonitorParts';

/**
 * Platform monitor — one user (MON-01). Route: /platform/users/:userId
 * Their studies with uploaded images, sessions (measurements, implants, saved
 * plans, comparison Image B), exported reports, shares, and a live timeline.
 * "Open view-only" loads the study in the real workspace with editing off.
 */
interface Session {
    id: string; name: string | null; mode: string; lastModified: string | null; image: string | null; calibrated: boolean;
    measurements: { tool: string; result: unknown }[];
    implants: { type: string; n: number }[];
    implants3d: number;
    plans: { name: string; savedAt: string; measurements: number; implants: number; osteotomies: string[] }[];
    comparison: { image: string | null; label: string; measurements: number } | null;
}
interface StudyDetail {
    id: string; name: string | null; modality: string; status: string; source: string; acquisitionDate: string;
    patientId: string; patientName: string; orgName: string | null;
    images: { id: string; url: string; type: string; date: string; picture: boolean }[];
    thumbnail: string | null;
    sessions: Session[];
    reports: { id: string; title: string | null; version: number; createdAt: string; url: string }[];
}
interface Detail {
    user: { id: string; email: string; fullName: string | null; designation: string | null; country: string | null; signedUp: string; orgs: string | null; logins: number; lastLogin: string | null; active: boolean; isPlatformAdmin: boolean };
    studies: StudyDetail[];
    shares: { permission: string; at: string; studyName: string | null; modality: string; fromName: string; toName: string; direction: 'in' | 'out' }[];
    tools: { tool: string; n: number }[];
    online: { page: string; tool: string | null; since: number } | null;
}

const card = 'rounded-xl border border-[var(--border)] bg-[var(--surface)]';
const heading = 'text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]';

const Thumb = ({ url, onClick, label }: { url: string | null; onClick?: () => void; label: string }) => (
    url ? (
        <button onClick={onClick} className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-black" title={label}>
            <img src={resolveAssetUrl(url)} alt={label} loading="lazy" className="h-full w-full object-contain" />
            <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white">{label}</span>
        </button>
    ) : null
);

const PlatformUserPage = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const token = useAppStore((s) => s.token);
    const isAdmin = useAppStore((s) => !!s.user?.isPlatformAdmin);
    const [detail, setDetail] = useState<Detail | null>(null);
    const [events, setEvents] = useState<FeedEvent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState<{ url: string; label: string } | null>(null);
    const [opening, setOpening] = useState<string | null>(null);
    const [confirmBlock, setConfirmBlock] = useState(false);

    const load = useCallback(async () => {
        if (!userId) return;
        setError(null);
        try {
            const [d, f] = await Promise.all([
                getJson<Detail>(`/users/${userId}`, token),
                getJson<FeedEvent[]>(`/feed?limit=200&userId=${userId}`, token),
            ]);
            setDetail(d);
            setEvents(f);
        } catch (e) {
            if (e instanceof Error && e.message === 'forbidden') navigate('/dashboard', { replace: true });
            else setError('Could not load this user.');
        }
    }, [userId, token, navigate]);
    useEffect(() => { if (token && isAdmin) void load(); }, [token, isAdmin, load]);

    const { status, online } = useLiveMonitor(isAdmin ? token : null, (e) => {
        if (e.userId !== userId || e.kind === 'auth.PLATFORM_VIEW_USER') return;
        setEvents((f) => [e, ...f.filter((x) => x.id !== e.id)].slice(0, 500));
    });
    const me = online.find((o) => o.userId === userId) ?? null;

    /** Open the study in the workspace, view-only (server grants platform admins view access). */
    const openStudy = async (s: StudyDetail, contextId?: string) => {
        setOpening(contextId ?? s.id);
        try {
            const r = await fetch(`${API_BASE}/api/patients?inspect=${encodeURIComponent(s.patientId)}`, { headers: { Authorization: `Bearer ${token}` } });
            const [patient] = r.ok ? await r.json() : [];
            if (!patient) throw new Error('This study could not be loaded.');
            const st = useAppStore.getState();
            if (st.isDicomMode) destroyCornerstone();
            st.resetWorkspace();
            const mode = {
                active: true, ownerName: detail?.user.fullName || detail?.user.email || 'User', ownerUserId: userId!,
                orgId: PLATFORM_INSPECT, studyId: s.id, patientId: s.patientId, contextId: contextId ?? null,
            };
            useAppStore.setState((x) => ({ patients: [...x.patients.filter((p) => p.id !== patient.id), patient] }));
            st.setInspectionMode(mode);
            await useAppStore.getState().openStudy(s.patientId, s.id);
            if (contextId) useAppStore.getState().setActiveContextId(contextId);
            useAppStore.getState().setInspectionMode({ ...mode, contextId: useAppStore.getState().activeContextId });
            navigate('/workspace');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not open this study.');
        } finally {
            setOpening(null);
        }
    };

    if (!isAdmin) return <div className="py-20 text-center text-sm text-[var(--text-3)]">Platform admins only.</div>;
    const u = detail?.user;
    const sessions = detail?.studies.flatMap((s) => s.sessions) ?? [];
    const counts = detail ? {
        studies: detail.studies.length,
        images: detail.studies.reduce((n, s) => n + s.images.length, 0),
        measurements: sessions.reduce((n, c) => n + c.measurements.length, 0),
        plans: sessions.reduce((n, c) => n + c.plans.length, 0),
        comparisons: sessions.filter((c) => c.comparison).length,
        reports: detail.studies.reduce((n, s) => n + s.reports.length, 0),
    } : null;

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => navigate('/platform?view=users')} aria-label="Back to monitor"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]">
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="truncate text-xl font-semibold text-[var(--text)]">{u?.fullName || u?.email || 'User'}</h1>
                        {me ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#30D158]/15 px-2.5 py-1 text-[11px] font-semibold text-[#30D158]">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-[#30D158]" />
                                Online — {pageName(me.page)}{me.tool ? ` · ${toolName(me.tool)}` : ''}
                            </span>
                        ) : <LiveBadge status={status} />}
                        {u && !u.active && <span className="rounded-full bg-[#FF453A]/15 px-2.5 py-1 text-[11px] font-semibold text-[#FF453A]">Blocked</span>}
                    </div>
                    {u && (
                        <p className="mt-0.5 text-sm text-[var(--text-3)]">
                            {u.email}{u.designation ? ` · ${u.designation}` : ''}{u.country ? ` · ${u.country}` : ''}{u.orgs ? ` · ${u.orgs}` : ''}
                            {` · signed up ${timeAgo(u.signedUp)} · ${u.logins} sign-ins`}
                        </p>
                    )}
                </div>
                {u && !u.isPlatformAdmin && (
                    <button onClick={() => setConfirmBlock(true)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${u.active ? 'border-[#FF453A]/40 text-[#FF453A] hover:bg-[#FF453A]/10' : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'}`}>
                        <Ban className="h-3.5 w-3.5" />{u.active ? 'Block user' : 'Unblock user'}
                    </button>
                )}
            </div>

            {error && <div className="rounded-xl border border-[#FF453A]/30 bg-[#FF453A]/5 px-4 py-3 text-sm text-[#FF453A]">{error}</div>}
            {!detail && !error && <div className="py-16 text-center text-sm text-[var(--text-3)]">Loading…</div>}

            {detail && counts && (
                <>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                        {([['Studies', counts.studies], ['Images', counts.images], ['Measurements', counts.measurements], ['Saved plans', counts.plans], ['Comparisons', counts.comparisons], ['Reports', counts.reports]] as const).map(([l, n]) => (
                            <div key={l} className={`${card} px-4 py-3`}>
                                <div className="text-xl font-bold tabular-nums text-[var(--text)]">{n}</div>
                                <div className="text-xs text-[var(--text-3)]">{l}</div>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="space-y-4 lg:col-span-2">
                            {detail.studies.length === 0 && <div className={`${card} py-12 text-center text-sm text-[var(--text-3)]`}>No studies yet.</div>}
                            {detail.studies.map((s) => (
                                <div key={s.id} className={card}>
                                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-[var(--text)]">{s.name || `${s.modality} study`}</div>
                                            <div className="text-xs text-[var(--text-3)]">
                                                {s.modality} · {s.patientName} · {s.status}{s.orgName ? ` · ${s.orgName}` : ' · personal'}{s.acquisitionDate ? ` · ${new Date(s.acquisitionDate).toLocaleDateString()}` : ''}
                                            </div>
                                        </div>
                                        <button onClick={() => openStudy(s)} disabled={!!opening}
                                            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-50">
                                            <Eye className="h-3.5 w-3.5" />{opening === s.id ? 'Opening…' : 'Open view-only'}
                                        </button>
                                    </div>

                                    <div className="space-y-3 px-4 py-3">
                                        {/* Uploaded images */}
                                        <div className="flex gap-2 overflow-x-auto pb-1">
                                            {s.thumbnail && <Thumb url={s.thumbnail} label="3D view" onClick={() => setZoom({ url: s.thumbnail!, label: '3D view' })} />}
                                            {s.images.filter((i) => i.picture).slice(0, 12).map((i) => (
                                                <Thumb key={i.id} url={i.url} label={i.type} onClick={() => setZoom({ url: i.url, label: `${s.patientName} · ${i.type}` })} />
                                            ))}
                                            {s.images.some((i) => !i.picture) && (
                                                <div className="flex h-24 w-28 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] text-center text-[11px] text-[var(--text-3)]">
                                                    <ImageOff className="h-4 w-4" />{s.images.filter((i) => !i.picture).length} DICOM file{s.images.filter((i) => !i.picture).length === 1 ? '' : 's'}
                                                </div>
                                            )}
                                            {s.images.length === 0 && !s.thumbnail && <span className="text-xs text-[var(--text-3)]">No images uploaded.</span>}
                                        </div>

                                        {/* Sessions */}
                                        {s.sessions.map((c) => (
                                            <div key={c.id} className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex min-w-0 items-center gap-2 text-xs">
                                                        <Layers className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-3)]" />
                                                        <span className="truncate font-medium text-[var(--text)]">{c.name || 'Session'}</span>
                                                        <span className="text-[var(--text-3)]">· saved {timeAgo(c.lastModified)}{c.calibrated ? ' · calibrated' : ' · not calibrated'}</span>
                                                    </div>
                                                    <button onClick={() => openStudy(s, c.id)} disabled={!!opening} className="text-[11px] text-[var(--accent)] hover:underline disabled:opacity-50">
                                                        {opening === c.id ? 'Opening…' : 'Open this session'}
                                                    </button>
                                                </div>
                                                <div className="mt-2 flex gap-3">
                                                    {c.image && <Thumb url={c.image} label="Image A" onClick={() => setZoom({ url: c.image!, label: 'Session image' })} />}
                                                    {c.comparison?.image && <Thumb url={c.comparison.image} label="Image B" onClick={() => setZoom({ url: c.comparison!.image!, label: `Image B — ${c.comparison!.label}` })} />}
                                                    <div className="min-w-0 flex-1 space-y-1.5 text-[11px]">
                                                        {c.measurements.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                <Ruler className="mr-0.5 h-3.5 w-3.5 text-[#30D158]" />
                                                                {c.measurements.map((m, i) => {
                                                                    const r = resultText(m.result);
                                                                    return <span key={i} className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[var(--text-2)]">{toolName(m.tool)}{r ? `: ${r}` : ''}</span>;
                                                                })}
                                                            </div>
                                                        ) : <div className="text-[var(--text-3)]">No measurements.</div>}
                                                        {(c.implants.length > 0 || c.implants3d > 0) && (
                                                            <div className="flex items-center gap-1 text-[var(--text-2)]">
                                                                <Wrench className="h-3.5 w-3.5 text-[#FFD60A]" />
                                                                {c.implants.map((i) => `${i.n} ${i.type}`).join(', ')}{c.implants3d ? `${c.implants.length ? ', ' : ''}${c.implants3d} 3D implant${c.implants3d === 1 ? '' : 's'}` : ''}
                                                            </div>
                                                        )}
                                                        {c.plans.map((p) => (
                                                            <div key={p.name + p.savedAt} className="flex items-center gap-1 text-[var(--text-2)]">
                                                                <Layers className="h-3.5 w-3.5 text-[#FFD60A]" />
                                                                Plan <b className="font-medium text-[var(--text)]">{p.name}</b> · {p.osteotomies.length} osteotomies{p.osteotomies.length ? ` (${p.osteotomies.map(toolName).join(', ')})` : ''} · {p.implants} implants · {timeAgo(p.savedAt)}
                                                            </div>
                                                        ))}
                                                        {c.comparison && (
                                                            <div className="flex items-center gap-1 text-[var(--text-2)]">
                                                                <GitCompare className="h-3.5 w-3.5 text-[#BF5AF2]" />
                                                                Compared with <b className="font-medium text-[var(--text)]">{c.comparison.label}</b> · {c.comparison.measurements} measurements on Image B
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Reports */}
                                        {s.reports.map((r) => (
                                            <a key={r.id} href={resolveAssetUrl(r.url)} target="_blank" rel="noreferrer"
                                                className="flex items-center gap-2 text-xs text-[var(--text-2)] hover:text-[var(--text)]">
                                                <FileText className="h-3.5 w-3.5 text-[#FF9F0A]" />
                                                {r.title || 'Report'} v{r.version} · {timeAgo(r.createdAt)} <span className="text-[var(--accent)]">Open PDF</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {detail.shares.length > 0 && (
                                <div className={`${card} px-4 py-3`}>
                                    <div className={`${heading} mb-2`}>Sharing</div>
                                    {detail.shares.map((sh, i) => (
                                        <div key={i} className="flex items-center gap-2 py-0.5 text-xs text-[var(--text-2)]">
                                            <Share2 className="h-3.5 w-3.5 text-[#64D2FF]" />
                                            {sh.direction === 'out' ? `Shared "${sh.studyName ?? sh.modality}" with ${sh.toName}` : `${sh.fromName} shared "${sh.studyName ?? sh.modality}" with them`} ({sh.permission}) · {timeAgo(sh.at)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className={card}>
                                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                                    <span className={heading}>Timeline</span>
                                    <LiveBadge status={status} />
                                </div>
                                <div className="max-h-[640px] overflow-y-auto">
                                    {events.length === 0 && <p className="py-10 text-center text-xs text-[var(--text-3)]">No activity recorded yet.</p>}
                                    {events.filter((e) => e.kind !== 'auth.PLATFORM_VIEW_USER').map((e) => <EventRow key={e.id} e={e} showWho={false} />)}
                                </div>
                            </div>
                            {detail.tools.length > 0 && (
                                <div className={`${card} px-4 py-3`}>
                                    <div className={`${heading} mb-2`}>Their tools</div>
                                    {detail.tools.map((t) => (
                                        <div key={t.tool} className="flex justify-between py-0.5 text-xs">
                                            <span className="text-[var(--text-2)]">{toolName(t.tool)}</span>
                                            <span className="tabular-nums text-[var(--text)]">{t.n}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            <ConfirmDialog
                open={confirmBlock}
                onOpenChange={setConfirmBlock}
                title={u?.active ? `Block ${u?.fullName || u?.email}?` : `Unblock ${u?.fullName || u?.email}?`}
                description={u?.active
                    ? `${u?.email} will be signed out and can't sign in or open any files. Their studies are kept, and you can unblock them at any time.`
                    : `${u?.email} will be able to sign in again and find all their work as they left it.`}
                confirmLabel={u?.active ? 'Block' : 'Unblock'}
                destructive={!!u?.active}
                onConfirm={async () => {
                    const active = await setBlocked(token, u!.id, !!u!.active);
                    setDetail((d) => d && { ...d, user: { ...d.user, active } });
                    setConfirmBlock(false);
                }}
            />

            <Dialog open={!!zoom} onOpenChange={(o) => { if (!o) setZoom(null); }}>
                <DialogContent className="max-w-5xl w-[90vw] p-0 overflow-hidden">
                    {zoom && (
                        <div>
                            <img src={resolveAssetUrl(zoom.url)} alt={zoom.label} className="max-h-[80vh] w-full bg-black object-contain" />
                            <div className="px-4 py-2 text-xs text-[var(--text-2)]">{zoom.label}</div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PlatformUserPage;
