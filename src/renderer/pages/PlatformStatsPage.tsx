import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { useAppStore } from '@/lib/store/index';
import { API_BASE } from '@/lib/api';

/**
 * Platform owner's usage dashboard (DEPLOY-06): who signed up, how often they
 * come back, how much they work and which tools they use. Counts only —
 * patients and images stay private to their owners.
 * Visible to PLATFORM_ADMIN_EMAILS. Route: /platform
 */
interface UserRow {
    id: string; email: string; fullName: string | null; designation: string | null; country: string | null;
    signedUp: string; verified: boolean; orgs: string | null; lastLogin: string | null; logins: number;
    patients: number; studies: number; studies3d: number; sessions: number; measurements: number; reports: number;
    sharedOut: number; lastWork: string | null;
}
interface Stats {
    totals: Record<string, number>;
    users: UserRow[];
    tools: { tool: string; n: number }[];
    activity: { at: string; action: string; who: string | null }[];
    signups: { day: string; n: number }[];
}

const when = (v: string | null) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '—';
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : d.toLocaleDateString();
};
const ACTION_LABEL: Record<string, string> = {
    LOGIN_SUCCESS: 'signed in', USER_REGISTERED: 'signed up', EMAIL_VERIFIED: 'verified email', PROFILE_COMPLETED: 'completed profile',
    ORG_CREATED: 'created an organization', INVITATION_ACCEPTED: 'joined an organization', LOGIN_FAILED: 'failed sign-in',
};

const TOTALS: [string, string][] = [
    ['users', 'Users'], ['newUsers7d', 'New this week'], ['activeUsers7d', 'Active this week'], ['orgs', 'Organizations'],
    ['patients', 'Patients'], ['studies', 'Studies'], ['sessions', 'Sessions'], ['measurements', 'Measurements'], ['reports', 'Reports'], ['shares', 'Shares'],
];

const PlatformStatsPage = () => {
    const navigate = useNavigate();
    const token = useAppStore((s) => s.token);
    const isAdmin = useAppStore((s) => !!s.user?.isPlatformAdmin);
    const [stats, setStats] = useState<Stats | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState('');

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await fetch(`${API_BASE}/api/platform/stats`, { headers: { Authorization: `Bearer ${token}` } });
            if (r.status === 403) { navigate('/dashboard', { replace: true }); return; }
            if (!r.ok) throw new Error();
            setStats(await r.json());
        } catch {
            setError('Could not load usage stats.');
        } finally {
            setLoading(false);
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (token) void load(); }, [token]);

    const users = useMemo(() => {
        const s = q.toLowerCase();
        return (stats?.users ?? []).filter((u) => !s || u.email.toLowerCase().includes(s) || (u.fullName ?? '').toLowerCase().includes(s) || (u.orgs ?? '').toLowerCase().includes(s));
    }, [stats, q]);
    const maxSignup = Math.max(1, ...(stats?.signups ?? []).map((d) => d.n));
    const maxTool = Math.max(1, ...(stats?.tools ?? []).map((t) => t.n));

    if (!isAdmin) return <div className="py-20 text-center text-sm text-[var(--text-3)]">Platform admins only.</div>;

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-[var(--text)]">Usage</h1>
                    <p className="text-sm text-[var(--text-3)]">Who uses SpineSurge and how — counts only; patient data stays private.</p>
                </div>
                <button onClick={load} disabled={loading} aria-label="Refresh"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] disabled:opacity-50">
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {error && <div className="rounded-xl border border-[#FF453A]/30 bg-[#FF453A]/5 px-4 py-3 text-sm text-[#FF453A]">{error}</div>}

            {stats && (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {TOTALS.map(([k, label]) => (
                            <div key={k} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                                <div className="text-xl font-bold tabular-nums text-[var(--text)]">{stats.totals[k] ?? 0}</div>
                                <div className="text-xs text-[var(--text-3)]">{label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Sign-ups, last 30 days</div>
                            {stats.signups.length === 0 ? <p className="text-xs text-[var(--text-3)]">None yet.</p> : (
                                <div className="flex h-28 items-end gap-1">
                                    {stats.signups.map((d) => (
                                        <div key={d.day} title={`${d.day}: ${d.n}`} className="flex-1 rounded-t bg-[var(--accent)]" style={{ height: `${(d.n / maxSignup) * 100}%`, minHeight: 4 }} />
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Most used measurement tools</div>
                            <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                                {stats.tools.map((t) => (
                                    <div key={t.tool} className="flex items-center gap-2 text-xs">
                                        <span className="w-20 truncate font-mono text-[var(--text-2)]">{t.tool}</span>
                                        <div className="h-2 flex-1 rounded bg-[var(--surface-2)]">
                                            <div className="h-2 rounded bg-[var(--accent)]" style={{ width: `${(t.n / maxTool) * 100}%` }} />
                                        </div>
                                        <span className="w-8 text-right tabular-nums text-[var(--text-3)]">{t.n}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Users ({users.length})</span>
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
                                        {['User', 'Organization', 'Signed up', 'Last sign-in', 'Sign-ins', 'Patients', 'Studies (3D)', 'Sessions', 'Measurements', 'Reports', 'Shared', 'Last work'].map((h) => (
                                            <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => (
                                        <tr key={u.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                                            <td className="px-3 py-2">
                                                <div className="font-medium text-[var(--text)]">{u.fullName || '— (profile not completed)'}</div>
                                                <div className="text-[var(--text-3)]">{u.email}{u.designation ? ` · ${u.designation}` : ''}{u.country ? ` · ${u.country}` : ''}</div>
                                            </td>
                                            <td className="px-3 py-2 text-[var(--text-2)]">{u.orgs || '—'}</td>
                                            <td className="whitespace-nowrap px-3 py-2 text-[var(--text-2)]">{when(u.signedUp)}</td>
                                            <td className="whitespace-nowrap px-3 py-2 text-[var(--text-2)]">{when(u.lastLogin)}</td>
                                            {[u.logins, u.patients].map((n, i) => <td key={i} className="px-3 py-2 tabular-nums text-[var(--text)]">{n}</td>)}
                                            <td className="px-3 py-2 tabular-nums text-[var(--text)]">{u.studies}{u.studies3d ? ` (${u.studies3d})` : ''}</td>
                                            {[u.sessions, u.measurements, u.reports, u.sharedOut].map((n, i) => <td key={i} className="px-3 py-2 tabular-nums text-[var(--text)]">{n}</td>)}
                                            <td className="whitespace-nowrap px-3 py-2 text-[var(--text-2)]">{when(u.lastWork)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-2)]">Recent activity</div>
                        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                            {stats.activity.map((a, i) => (
                                <div key={i} className="flex gap-3 text-xs">
                                    <span className="w-36 flex-shrink-0 tabular-nums text-[var(--text-3)]">{new Date(a.at).toLocaleString()}</span>
                                    <span className="text-[var(--text-2)]"><b className="font-medium text-[var(--text)]">{a.who ?? 'Someone'}</b> {ACTION_LABEL[a.action] ?? a.action.toLowerCase().replace(/_/g, ' ')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default PlatformStatsPage;
