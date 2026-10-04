import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Search, FileText, ImageOff, Radio, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/lib/store/index';
import { resolveAssetUrl } from '@/lib/api';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
    CATEGORIES, type FeedEvent, getJson, inCategory, pageName, setBlocked, timeAgo, toolName, useLiveMonitor,
} from '@/features/platform/monitor';
import { EventRow, LiveBadge } from '@/features/platform/MonitorParts';
import { FeedbackPanel } from '@/features/platform/FeedbackPanel';
import { useSupport } from '@/features/support/supportStore';

/**
 * Platform owner's live monitor (DEPLOY-06, MON-01). Route: /platform
 * Overview: live activity feed + who is online now + daily activity.
 * Users: every account and how much they work (click → /platform/users/:id).
 * Tools · Images · Reports: what people measure, upload and export.
 * Visible to PLATFORM_ADMIN_EMAILS only (server-enforced).
 */
interface UserRow {
    id: string; email: string; fullName: string | null; designation: string | null; country: string | null;
    signedUp: string; verified: boolean; active: boolean; orgs: string | null; lastLogin: string | null; logins: number;
    patients: number; studies: number; studies3d: number; images: number; sessions: number; measurements: number;
    plans: number; comparisons: number; reports: number; sharedOut: number; lastActive: string | null;
}
interface Stats {
    totals: Record<string, number>;
    users: UserRow[];
    tools: { tool: string; n: number; users: number }[];
    picked: { tool: string; n: number; users: number }[];
    implants: { type: string; mode: string; n: number }[];
    daily: { day: string; signups: number; active: number; events: number }[];
}
interface Upload {
    id: string; url: string; type: string; studyId: string; studyName: string | null; modality: string | null;
    patientName: string; userId: string | null; who: string | null; files: number; uploadedAt: string | null;
}
interface Report {
    id: string; url: string; title: string | null; version: number; createdAt: string | null; studyName: string | null;
    modality: string | null; patientName: string; userId: string | null; who: string | null;
}

const TILES: [string, string][] = [
    ['activeToday', 'Active today'], ['users', 'Users'], ['newUsers7d', 'New this week'], ['studies', 'Studies'],
    ['images', 'X-ray images'], ['series', 'CT/MR studies'], ['measurements', 'Measurements'], ['plans', 'Saved plans'],
    ['comparisons', 'Comparisons'], ['reports', 'Reports'], ['shares', 'Shares'], ['eventsToday', 'Actions today'],
];
type Tab = 'overview' | 'feedback' | 'users' | 'tools' | 'images' | 'reports';
const TABS: [Tab, string][] = [['overview', 'Live overview'], ['feedback', 'Feedback'], ['users', 'Users'], ['tools', 'Tools'], ['images', 'Images'], ['reports', 'Reports']];

const card = 'rounded-xl border border-[var(--border)] bg-[var(--surface)]';
const heading = 'text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]';

/** One bar per item, longest first (single series: magnitude only). */
const Bars = ({ items, empty }: { items: { label: string; n: number; sub?: string }[]; empty: string }) => {
    const max = Math.max(1, ...items.map((i) => i.n));
    if (!items.length) return <p className="px-1 py-6 text-center text-xs text-[var(--text-3)]">{empty}</p>;
    return (
        <div className="space-y-1.5">
            {items.map((i) => (
                <div key={i.label} className="group flex items-center gap-2 text-xs" title={`${i.label}: ${i.n}${i.sub ? ` · ${i.sub}` : ''}`}>
                    <span className="w-40 truncate text-[var(--text-2)]">{i.label}</span>
                    <div className="h-2.5 flex-1 rounded-sm bg-[var(--surface-2)]">
                        <div className="h-2.5 rounded-sm bg-[var(--accent)] group-hover:opacity-80" style={{ width: `${(i.n / max) * 100}%`, minWidth: 3 }} />
                    </div>
                    <span className="w-10 text-right tabular-nums text-[var(--text)]">{i.n}</span>
                    {i.sub && <span className="w-16 text-right text-[11px] text-[var(--text-3)]">{i.sub}</span>}
                </div>
            ))}
        </div>
    );
};

const PlatformStatsPage = () => {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const tab = (params.get('view') as Tab) || 'overview';
    const token = useAppStore((s) => s.token);
    const isAdmin = useAppStore((s) => !!s.user?.isPlatformAdmin);

    const [stats, setStats] = useState<Stats | null>(null);
    const [feed, setFeed] = useState<FeedEvent[]>([]);
    const [cat, setCat] = useState('all');
    const [hideNav, setHideNav] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState('');
    const [uploads, setUploads] = useState<Upload[] | null>(null);
    const [reports, setReports] = useState<Report[] | null>(null);
    const [zoom, setZoom] = useState<Upload | null>(null);
    const [, setTick] = useState(0);
    const [moreBusy, setMoreBusy] = useState(false);
    const [blockTarget, setBlockTarget] = useState<UserRow | null>(null);
    const [feedbackKey, setFeedbackKey] = useState(0);
    const unreadFeedback = useSupport((s) => s.unread);

    const openUser = useCallback((id: string) => navigate(`/platform/users/${id}`), [navigate]);
    const fail = useCallback((e: unknown) => {
        if (e instanceof Error && e.message === 'forbidden') navigate('/dashboard', { replace: true });
        else setError('Could not load the monitor. The server may be waking up — try again in a minute.');
    }, [navigate]);

    const loadStats = useCallback(async () => {
        setLoading(true);
        setError(null);
        try { setStats(await getJson<Stats>('/stats', token)); } catch (e) { fail(e); } finally { setLoading(false); }
    }, [token, fail]);

    const kindsParam = useMemo(() => CATEGORIES.find((c) => c.key === cat)?.kinds?.join(',') ?? '', [cat]);
    const loadFeed = useCallback(async () => {
        try { setFeed(await getJson<FeedEvent[]>(`/feed?limit=150${kindsParam ? `&kinds=${kindsParam}` : ''}`, token)); } catch (e) { fail(e); }
    }, [token, kindsParam, fail]);

    useEffect(() => { if (token && isAdmin) void loadStats(); }, [token, isAdmin, loadStats]);
    useEffect(() => { if (token && isAdmin) void loadFeed(); }, [token, isAdmin, loadFeed]);
    useEffect(() => {
        if (!token || !isAdmin) return;
        if (tab === 'images' && !uploads) getJson<Upload[]>('/uploads', token).then(setUploads).catch(fail);
        if (tab === 'reports' && !reports) getJson<Report[]>('/reports', token).then(setReports).catch(fail);
    }, [tab, token, isAdmin, uploads, reports, fail]);
    // keep "x min ago" fresh
    useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

    // Live: prepend new events (an amended DICOM upload replaces its row); refresh the numbers now and then
    const statsDirty = useRef(false);
    const { status, online } = useLiveMonitor(isAdmin ? token : null, (e) => {
        if (inCategory(e.kind, cat)) setFeed((f) => [e, ...f.filter((x) => x.id !== e.id)].slice(0, 400));
        if (e.kind.includes('upload')) setUploads(null);
        if (e.kind === 'report.export') setReports(null);
        statsDirty.current = true;
    }, () => {
        // a help & feedback message (either side) → refresh the Feedback tab and the bell
        setFeedbackKey((k) => k + 1);
        void useSupport.getState().refreshUnread();
    });
    useEffect(() => {
        const t = setInterval(() => {
            if (!statsDirty.current) return;
            statsDirty.current = false;
            getJson<Stats>('/stats', token).then(setStats).catch(() => {});
        }, 15_000);
        return () => clearInterval(t);
    }, [token]);

    const loadOlder = async () => {
        const last = feed[feed.length - 1];
        if (!last) return;
        setMoreBusy(true);
        try {
            const older = await getJson<FeedEvent[]>(`/feed?limit=150&before=${encodeURIComponent(last.at)}${kindsParam ? `&kinds=${kindsParam}` : ''}`, token);
            setFeed((f) => [...f, ...older.filter((o) => !f.some((x) => x.id === o.id))]);
        } catch (e) { fail(e); } finally { setMoreBusy(false); }
    };

    const shownFeed = useMemo(
        () => feed.filter((e) => !(hideNav && cat === 'all' && (e.kind === 'page' || e.kind === 'tool.select' || e.kind === 'auth.PLATFORM_VIEW_USER'))),
        [feed, hideNav, cat],
    );
    const users = useMemo(() => {
        const s = q.toLowerCase();
        return (stats?.users ?? []).filter((u) => !s || u.email.toLowerCase().includes(s) || (u.fullName ?? '').toLowerCase().includes(s) || (u.orgs ?? '').toLowerCase().includes(s));
    }, [stats, q]);
    const onlineIds = useMemo(() => new Set(online.map((o) => o.userId)), [online]);
    const maxActive = Math.max(1, ...(stats?.daily ?? []).map((d) => d.active));

    if (!isAdmin) return <div className="py-20 text-center text-sm text-[var(--text-3)]">Platform admins only.</div>;

    const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { view: t }, { replace: true });
    const feedbackUser = params.get('user');

    return (
        <div className="mx-auto max-w-7xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl font-semibold text-[var(--text)]">Pilot monitor</h1>
                        <LiveBadge status={status} />
                    </div>
                    <p className="text-sm text-[var(--text-3)]">What every user does in SpineSurge — uploads, tools, plans, comparisons and reports, as it happens.</p>
                </div>
                <button onClick={() => { void loadStats(); void loadFeed(); setUploads(null); setReports(null); }} disabled={loading} aria-label="Refresh"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {error && <div className="rounded-xl border border-[#FF453A]/30 bg-[#FF453A]/5 px-4 py-3 text-sm text-[#FF453A]">{error}</div>}

            {/* Headline numbers */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <div className={`${card} px-4 py-3`}>
                    <div className="flex items-center gap-2 text-xl font-bold tabular-nums text-[#30D158]"><Radio className="h-4 w-4" />{online.length}</div>
                    <div className="text-xs text-[var(--text-3)]">Online now</div>
                </div>
                {stats && TILES.slice(0, 6).map(([k, label]) => (
                    <div key={k} className={`${card} px-4 py-3`}>
                        <div className="text-xl font-bold tabular-nums text-[var(--text)]">{stats.totals[k] ?? 0}</div>
                        <div className="text-xs text-[var(--text-3)]">{label}</div>
                    </div>
                ))}
            </div>
            {stats && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    {TILES.slice(6).map(([k, label]) => (
                        <div key={k} className={`${card} px-4 py-2.5`}>
                            <div className="text-lg font-bold tabular-nums text-[var(--text)]">{stats.totals[k] ?? 0}</div>
                            <div className="text-[11px] text-[var(--text-3)]">{label}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex gap-1 border-b border-[var(--border)]">
                {TABS.map(([k, label]) => (
                    <button key={k} onClick={() => setTab(k)}
                        className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${tab === k ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-3)] hover:text-[var(--text)]'}`}>
                        {label}
                        {k === 'feedback' && unreadFeedback > 0 && (
                            <span className="ml-1.5 rounded-full bg-[#FF453A] px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadFeedback}</span>
                        )}
                    </button>
                ))}
            </div>

            {tab === 'feedback' && (
                <FeedbackPanel token={token} refreshKey={feedbackKey} selected={feedbackUser} onOpenUser={openUser}
                    onSelect={(id) => setParams({ view: 'feedback', user: id }, { replace: true })} />
            )}

            {tab === 'overview' && (
                <div className="grid gap-4 lg:grid-cols-3">
                    <div className={`${card} flex flex-col lg:col-span-2`}>
                        <div className="space-y-2 border-b border-[var(--border)] px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className={heading}>Activity</span>
                                {cat === 'all' && (
                                    <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                                        <input type="checkbox" checked={hideNav} onChange={(e) => setHideNav(e.target.checked)} />
                                        Hide page views & tool picks
                                    </label>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {CATEGORIES.map((c) => (
                                    <button key={c.key} onClick={() => setCat(c.key)}
                                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${cat === c.key ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]'}`}>
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="max-h-[620px] overflow-y-auto">
                            {shownFeed.length === 0 && <p className="py-12 text-center text-xs text-[var(--text-3)]">No activity yet. New actions appear here the moment they happen.</p>}
                            {shownFeed.map((e) => <EventRow key={e.id} e={e} onUser={openUser} />)}
                            {feed.length >= 100 && (
                                <button onClick={loadOlder} disabled={moreBusy} className="w-full py-3 text-xs text-[var(--accent)] hover:underline disabled:opacity-50">
                                    {moreBusy ? 'Loading…' : 'Load older activity'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className={card}>
                            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                                <span className={heading}>Online now</span>
                                <span className="text-xs tabular-nums text-[var(--text-3)]">{online.length}</span>
                            </div>
                            {online.length === 0 && <p className="px-4 py-6 text-center text-xs text-[var(--text-3)]">Nobody is using the app right now.</p>}
                            {online.map((o) => (
                                <button key={o.userId} onClick={() => openUser(o.userId)} className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 text-left last:border-0 hover:bg-[var(--surface-2)]">
                                    <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-[#30D158]" />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-xs font-medium text-[var(--text)]">{o.who ?? o.email}</div>
                                        <div className="truncate text-[11px] text-[var(--text-3)]">
                                            {pageName(o.page)}{o.tool ? ` · ${toolName(o.tool)}` : ''}
                                        </div>
                                    </div>
                                    <span className="text-[11px] text-[var(--text-3)]">{Math.max(1, Math.round((Date.now() - o.since) / 60000))} min</span>
                                </button>
                            ))}
                        </div>

                        {stats && (
                            <div className={`${card} p-4`}>
                                <div className={`${heading} mb-1`}>Active users per day</div>
                                <div className="mb-3 text-[11px] text-[var(--text-3)]">Last 30 days · hover a bar for details</div>
                                <div className="flex h-28 items-end gap-[2px]">
                                    {stats.daily.map((d) => (
                                        <div key={d.day} className="group relative flex h-full flex-1 items-end">
                                            <div className="w-full rounded-t-[3px] bg-[var(--accent)] group-hover:opacity-80"
                                                style={{ height: `${(d.active / maxActive) * 100}%`, minHeight: d.active ? 4 : 1, opacity: d.active ? 1 : 0.25 }} />
                                            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] text-[var(--text-2)] shadow group-hover:block">
                                                <b className="text-[var(--text)]">{d.day}</b><br />{d.active} active · {d.signups} sign-ups · {d.events} actions
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-1 flex justify-between text-[10px] text-[var(--text-3)]">
                                    <span>{stats.daily[0]?.day}</span><span>today</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tab === 'users' && stats && (
                <div className={`${card} overflow-hidden`}>
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                        <span className={heading}>
                            Users ({users.length}) · click a user for everything they did
                            {stats.totals.blocked ? <span className="ml-2 normal-case text-[#FF453A]">· {stats.totals.blocked} blocked</span> : null}
                        </span>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-3)]" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, organization"
                                className="h-8 w-full rounded-lg bg-[var(--surface-2)] pl-8 pr-3 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-3)]" />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="text-left text-[var(--text-3)]">
                                <tr className="border-b border-[var(--border)]">
                                    {['User', 'Organization', 'Signed up', 'Last active', 'Sign-ins', 'Patients', 'Studies (CT/MR)', 'Images', 'Measurements', 'Plans', 'Compares', 'Reports', 'Shared', 'Access', ''].map((h) => (
                                        <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u.id} onClick={() => openUser(u.id)} className={`cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] ${u.active ? '' : 'opacity-60'}`}>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                                                {onlineIds.has(u.id) && <span className="h-2 w-2 rounded-full bg-[#30D158]" title="Online now" />}
                                                {u.fullName || '— (profile not completed)'}
                                                {!u.active && <span className="rounded-full bg-[#FF453A]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#FF453A]">Blocked</span>}
                                            </div>
                                            <div className="text-[var(--text-3)]">{u.email}{u.designation ? ` · ${u.designation}` : ''}{u.country ? ` · ${u.country}` : ''}</div>
                                        </td>
                                        <td className="px-3 py-2 text-[var(--text-2)]">{u.orgs || '—'}</td>
                                        <td className="whitespace-nowrap px-3 py-2 text-[var(--text-2)]">{timeAgo(u.signedUp)}</td>
                                        <td className="whitespace-nowrap px-3 py-2 text-[var(--text-2)]">{timeAgo(u.lastActive)}</td>
                                        {[u.logins, u.patients].map((n, i) => <td key={i} className="px-3 py-2 tabular-nums text-[var(--text)]">{n}</td>)}
                                        <td className="px-3 py-2 tabular-nums text-[var(--text)]">{u.studies}{u.studies3d ? ` (${u.studies3d})` : ''}</td>
                                        {[u.images, u.measurements, u.plans, u.comparisons, u.reports, u.sharedOut].map((n, i) => <td key={i} className="px-3 py-2 tabular-nums text-[var(--text)]">{n}</td>)}
                                        <td className="px-3 py-2">
                                            <button onClick={(e) => { e.stopPropagation(); setBlockTarget(u); }}
                                                className={`whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium ${u.active ? 'border-[#FF453A]/40 text-[#FF453A] hover:bg-[#FF453A]/10' : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-3)]'}`}>
                                                {u.active ? 'Block' : 'Unblock'}
                                            </button>
                                        </td>
                                        <td className="px-2 text-[var(--text-3)]"><ChevronRight className="h-4 w-4" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'tools' && stats && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className={`${card} p-4`}>
                        <div className={`${heading} mb-1`}>Measurements on record, by tool</div>
                        <div className="mb-3 text-[11px] text-[var(--text-3)]">Finished measurements saved in sessions · right column = number of users</div>
                        <Bars empty="No measurements yet." items={stats.tools.map((t) => ({ label: toolName(t.tool), n: t.n, sub: `${t.users} user${t.users === 1 ? '' : 's'}` }))} />
                    </div>
                    <div className={`${card} p-4`}>
                        <div className={`${heading} mb-1`}>Tools picked, last 30 days</div>
                        <div className="mb-3 text-[11px] text-[var(--text-3)]">Every time someone selects a tool — including ones they didn't finish</div>
                        <Bars empty="No tool picks recorded yet." items={stats.picked.map((t) => ({ label: toolName(t.tool), n: t.n, sub: `${t.users} user${t.users === 1 ? '' : 's'}` }))} />
                    </div>
                    <div className={`${card} p-4 lg:col-span-2`}>
                        <div className={`${heading} mb-3`}>Implants placed</div>
                        <Bars empty="No implants placed yet." items={stats.implants.map((i) => ({ label: `${i.type} (${i.mode.toUpperCase()})`, n: i.n }))} />
                    </div>
                </div>
            )}

            {tab === 'images' && (
                <div className={`${card} p-4`}>
                    <div className={`${heading} mb-3`}>Uploaded images — newest first {uploads ? `(${uploads.length})` : ''}</div>
                    {!uploads && <p className="py-10 text-center text-xs text-[var(--text-3)]">Loading…</p>}
                    {uploads?.length === 0 && <p className="py-10 text-center text-xs text-[var(--text-3)]">No images uploaded yet.</p>}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        {uploads?.map((u) => (
                            <div key={u.id} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
                                <button onClick={() => setZoom(u)} className="block aspect-square w-full bg-black">
                                    <img src={resolveAssetUrl(u.url)} alt={u.studyName ?? 'Uploaded image'} loading="lazy" className="h-full w-full object-contain"
                                        onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                </button>
                                <div className="space-y-0.5 px-2 py-1.5 text-[11px]">
                                    <button onClick={() => u.userId && openUser(u.userId)} className="block max-w-full truncate font-medium text-[var(--text)] hover:underline">{u.who ?? '—'}</button>
                                    <div className="truncate text-[var(--text-3)]">{u.type === 'Thumbnail' ? `${u.modality ?? 'CT'} · 3D view · ${u.files} files` : u.modality ?? 'Image'} · {u.patientName}</div>
                                    <div className="text-[var(--text-3)]">{timeAgo(u.uploadedAt)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--text-3)]"><ImageOff className="h-3.5 w-3.5" />Raw DICOM files can't be shown as pictures; CT/MR studies appear here once their 3D view has been opened.</p>
                </div>
            )}

            {tab === 'reports' && (
                <div className={`${card} overflow-hidden`}>
                    <div className={`${heading} border-b border-[var(--border)] px-4 py-3`}>Exported reports {reports ? `(${reports.length})` : ''}</div>
                    {!reports && <p className="py-10 text-center text-xs text-[var(--text-3)]">Loading…</p>}
                    {reports?.length === 0 && <p className="py-10 text-center text-xs text-[var(--text-3)]">No reports exported yet.</p>}
                    {reports?.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 text-xs last:border-0">
                            <FileText className="h-4 w-4 flex-shrink-0 text-[#FF9F0A]" />
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-[var(--text)]">{r.title || 'Report'} <span className="font-normal text-[var(--text-3)]">v{r.version}</span></div>
                                <div className="truncate text-[var(--text-3)]">
                                    <button onClick={() => r.userId && openUser(r.userId)} className="hover:underline">{r.who ?? '—'}</button> · {r.patientName}{r.studyName ? ` · ${r.studyName}` : ''}
                                </div>
                            </div>
                            <span className="text-[var(--text-3)]">{timeAgo(r.createdAt)}</span>
                            <a href={resolveAssetUrl(r.url)} target="_blank" rel="noreferrer" className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[var(--text-2)] hover:bg-[var(--surface-3)]">Open PDF</a>
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={!!blockTarget}
                onOpenChange={(o) => { if (!o) setBlockTarget(null); }}
                title={blockTarget?.active ? `Block ${blockTarget?.fullName || blockTarget?.email}?` : `Unblock ${blockTarget?.fullName || blockTarget?.email}?`}
                description={blockTarget?.active
                    ? `${blockTarget?.email} will be signed out and can't sign in or open any files. Their studies are kept, and you can unblock them at any time.`
                    : `${blockTarget?.email} will be able to sign in again and find all their work as they left it.`}
                confirmLabel={blockTarget?.active ? 'Block' : 'Unblock'}
                destructive={!!blockTarget?.active}
                onConfirm={async () => {
                    const u = blockTarget!;
                    const active = await setBlocked(token, u.id, u.active);
                    setStats((s) => s && ({
                        ...s,
                        totals: { ...s.totals, blocked: (s.totals.blocked ?? 0) + (active ? -1 : 1) },
                        users: s.users.map((x) => (x.id === u.id ? { ...x, active } : x)),
                    }));
                    setBlockTarget(null);
                }}
            />

            <Dialog open={!!zoom} onOpenChange={(o) => { if (!o) setZoom(null); }}>
                <DialogContent className="max-w-5xl w-[90vw] p-0 overflow-hidden">
                    {zoom && (
                        <div>
                            <img src={resolveAssetUrl(zoom.url)} alt="" className="max-h-[80vh] w-full bg-black object-contain" />
                            <div className="flex items-center justify-between px-4 py-2 text-xs text-[var(--text-2)]">
                                <span>{zoom.who} · {zoom.patientName}{zoom.studyName ? ` · ${zoom.studyName}` : ''}</span>
                                {zoom.userId && <button onClick={() => openUser(zoom.userId!)} className="text-[var(--accent)] hover:underline">See this user's work →</button>}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PlatformStatsPage;
