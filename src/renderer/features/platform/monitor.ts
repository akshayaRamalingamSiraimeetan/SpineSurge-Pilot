import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { TOOL_DISPLAY_NAMES } from '@/features/measurements/toolNames';

/**
 * Shared pieces of the platform live monitor (MON-01): event wording, filters
 * and the live connection (Server-Sent Events read through an authenticated
 * fetch — EventSource can't send the Bearer token).
 */
export interface FeedEvent {
    id: string;
    at: string;
    kind: string;
    userId: string | null;
    who: string | null;
    patientId?: string | null;
    studyId?: string | null;
    contextId?: string | null;
    patientName?: string | null;
    studyName?: string | null;
    modality?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form JSON from the server
    detail?: Record<string, any> | null;
}

export interface Presence {
    userId: string;
    who: string | null;
    email: string | null;
    page: string;
    tool: string | null;
    patientId: string | null;
    contextId: string | null;
    since: number;
    lastSeen: number;
}

export const toolName = (key?: string | null) => (key ? TOOL_DISPLAY_NAMES[key] ?? key : 'a tool');

const PAGES: Record<string, string> = {
    '/dashboard': 'Home', '/patients': 'Patients', '/members': 'Members', '/compare': 'Compare',
    '/workspace': 'Workspace', '/workspace?tab=assessment': 'Assessment', '/workspace?tab=planning': 'Planning',
    '/workspace?tab=report': 'Report', '/workspace?tab=compare': 'Compare', '/platform': 'Monitor',
    '/complete-profile': 'Profile setup', '/create-org': 'Create organization', '/invitations': 'Invitations',
};
export const pageName = (p?: string | null) => {
    if (!p) return '—';
    if (PAGES[p]) return PAGES[p];
    if (p.startsWith('/members/')) return 'Member workspace';
    if (p.startsWith('/platform')) return 'Monitor';
    return p;
};

const fmtResult = (r: unknown): string => {
    if (r == null || r === 'null') return '';
    let v: unknown = r;
    if (typeof r === 'string') { try { v = JSON.parse(r); } catch { return r; } }
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
        const nums = Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'number').slice(0, 2);
        if (nums.length) return nums.map(([k, x]) => `${k} ${(x as number).toFixed(1)}`).join(', ');
    }
    return '';
};
export const resultText = fmtResult;

const AUTH: Record<string, string> = {
    LOGIN_SUCCESS: 'signed in', USER_REGISTERED: 'signed up', EMAIL_VERIFIED: 'verified their email',
    PROFILE_COMPLETED: 'completed their profile', ORG_CREATED: 'created an organization',
    INVITATION_ACCEPTED: 'joined an organization', LOGIN_FAILED: 'failed to sign in',
    PLATFORM_VIEW_USER: 'opened a user in the monitor',
};

/** "uploaded an X-ray", "measured Cobb Angle = 23.4"… (without the person's name). */
export function describe(e: FeedEvent): string {
    const d = e.detail ?? {};
    if (e.kind.startsWith('auth.')) {
        const a = e.kind.slice(5);
        return AUTH[a] ?? a.toLowerCase().replace(/_/g, ' ');
    }
    switch (e.kind) {
        case 'page': return `opened ${pageName(d.path)}`;
        case 'tool.select': return `picked ${toolName(d.tool)}${d.view === 'imageB' ? ' (Image B)' : ''}`;
        case 'measurement.add': {
            const r = fmtResult(d.result);
            return `measured ${toolName(d.tool)}${r ? ` = ${r}` : ''}`;
        }
        case 'implant.add': return `placed a ${d.mode === '3d' ? '3D ' : ''}${d.type ?? 'implant'}${d.level ? ` at ${d.level}` : ''}`;
        case 'plan.save': return `saved plan "${d.name ?? 'Plan'}" (${d.osteotomies ?? 0} osteotomies, ${d.implants ?? 0} implants)`;
        case 'compare.open': return 'opened Compare';
        case 'compare.image': return `loaded Image B for comparison — ${d.source ?? 'imported file'}`;
        case 'image.upload': return `uploaded an image${d.name ? ` (${d.name})` : ''}`;
        case 'series.upload': return `uploaded ${d.count > 1 ? `a DICOM series (${d.count} files)` : 'a DICOM file'}`;
        case 'patient.create': return 'added a patient';
        case 'study.create': return `created a ${d.modality ?? ''} study${d.name ? ` "${d.name}"` : ''}`;
        case 'study.delete': return `deleted a ${d.modality ?? ''} study`;
        case 'session.create': return 'started a session';
        case 'viewer3d.open': return 'opened the 3D viewer';
        case 'calibrate': return 'calibrated the image';
        case 'report.preview': return 'previewed the report';
        case 'report.export': return `exported report "${d.title ?? 'Report'}" (v${d.version ?? 1})`;
        case 'share.add': return `shared a study with ${d.with ?? 'someone'} (${d.permission ?? 'view'})`;
        default: return e.kind;
    }
}

/** Filter chips → event kind prefixes (server: ?kinds=). */
export const CATEGORIES: { key: string; label: string; kinds: string[] | null }[] = [
    { key: 'all', label: 'All', kinds: null },
    { key: 'uploads', label: 'Uploads', kinds: ['image.upload', 'series.upload', 'study.create', 'patient.create'] },
    { key: 'tools', label: 'Tools & measurements', kinds: ['tool.select', 'measurement.add', 'calibrate', 'viewer3d.open'] },
    { key: 'plans', label: 'Plans & implants', kinds: ['plan.save', 'implant.add'] },
    { key: 'compare', label: 'Comparisons', kinds: ['compare.'] },
    { key: 'reports', label: 'Reports', kinds: ['report.'] },
    { key: 'auth', label: 'Sign-ins', kinds: ['auth.'] },
    { key: 'nav', label: 'Navigation', kinds: ['page', 'session.create'] },
];
export const inCategory = (kind: string, cat: string) => {
    const c = CATEGORIES.find((x) => x.key === cat);
    return !c?.kinds || c.kinds.some((k) => kind.startsWith(k));
};

/** Colour dot per kind family (identity only; always next to text). */
export function kindTone(kind: string): string {
    if (kind.startsWith('auth.')) return 'var(--text-3)';
    if (kind.includes('upload') || kind.endsWith('.create')) return '#0A84FF';
    if (kind.startsWith('measurement') || kind.startsWith('tool') || kind === 'calibrate' || kind === 'viewer3d.open') return '#30D158';
    if (kind.startsWith('plan') || kind.startsWith('implant')) return '#FFD60A';
    if (kind.startsWith('compare')) return '#BF5AF2';
    if (kind.startsWith('report')) return '#FF9F0A';
    if (kind.startsWith('share')) return '#64D2FF';
    return 'var(--text-3)';
}

export const timeAgo = (v: string | number | null | undefined) => {
    if (v == null) return '—';
    const t = typeof v === 'number' ? v : Date.parse(v);
    if (isNaN(t)) return '—';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
    const days = Math.round(s / 86_400);
    return days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : new Date(t).toLocaleDateString();
};

export async function getJson<T>(path: string, token: string | null): Promise<T> {
    const r = await fetch(`${API_BASE}/api/platform${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 403) throw new Error('forbidden');
    if (!r.ok) throw new Error('failed');
    return r.json();
}

/** Block or unblock an account (MON-05). Resolves to the new active state. */
export async function setBlocked(token: string | null, userId: string, blocked: boolean): Promise<boolean> {
    const r = await fetch(`${API_BASE}/api/platform/users/${userId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ blocked }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? 'Could not update the account');
    return !!d.active;
}

export type LiveStatus = 'connecting' | 'live' | 'offline';

/** Live events + presence; reconnects by itself (the free host restarts/sleeps). */
export function useLiveMonitor(token: string | null, onEvent: (e: FeedEvent) => void, onSupport?: (m: { userId: string; fromAdmin: boolean }) => void) {
    const [status, setStatus] = useState<LiveStatus>('connecting');
    const [online, setOnline] = useState<Presence[]>([]);
    const handler = useRef(onEvent);
    const supportHandler = useRef(onSupport);
    useEffect(() => { handler.current = onEvent; supportHandler.current = onSupport; });

    useEffect(() => {
        if (!token) return;
        let stopped = false;
        let ctrl: AbortController | null = null;
        let retry = 1000;
        const run = async () => {
            while (!stopped) {
                ctrl = new AbortController();
                setStatus('connecting');
                try {
                    const r = await fetch(`${API_BASE}/api/platform/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
                    if (!r.ok || !r.body) throw new Error(String(r.status));
                    setStatus('live');
                    retry = 1000;
                    const reader = r.body.getReader();
                    const dec = new TextDecoder();
                    let buf = '';
                    for (;;) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        buf += dec.decode(value, { stream: true });
                        let i: number;
                        while ((i = buf.indexOf('\n\n')) >= 0) {
                            const block = buf.slice(0, i);
                            buf = buf.slice(i + 2);
                            const type = block.match(/^event: (.+)$/m)?.[1];
                            const data = block.match(/^data: (.+)$/m)?.[1];
                            if (!type || !data) continue;
                            try {
                                const msg = JSON.parse(data);
                                if (type === 'event') handler.current(msg);
                                else if (type === 'support') supportHandler.current?.(msg);
                                else if (type === 'presence') setOnline(msg.online ?? []);
                            } catch { /* ignore a bad message */ }
                        }
                    }
                } catch { /* reconnect below */ }
                if (stopped) break;
                setStatus('offline');
                await new Promise((res) => setTimeout(res, retry));
                retry = Math.min(retry * 2, 30_000);
            }
        };
        void run();
        return () => { stopped = true; ctrl?.abort(); };
    }, [token]);

    return { status, online };
}
