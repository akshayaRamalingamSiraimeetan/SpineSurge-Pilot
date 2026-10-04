import { sql } from 'drizzle-orm';
import { db } from './db';

/**
 * Live usage monitor (MON-01). Every notable action is stored in usage_events
 * and pushed to platform admins watching /platform (Server-Sent Events, see
 * routes/platform.ts). Sign-ins/sign-ups stay in audit_log and are only pushed.
 * Recording never throws and never slows a request down.
 */
export interface FeedEvent {
    id: string;                 // 'e<n>' usage event · 'a<id>' audit row
    at: string;
    kind: string;
    userId: string | null;
    who: string | null;
    patientId?: string | null;
    studyId?: string | null;
    contextId?: string | null;
    detail?: Record<string, unknown> | null;
}

export interface Presence {
    userId: string;
    who: string | null;
    email: string | null;
    page: string;
    tool: string | null;
    patientId: string | null;
    contextId: string | null;
    since: number;              // first heartbeat of this visit
    lastSeen: number;
}

type Message = { type: 'event'; event: FeedEvent } | { type: 'presence'; online: Presence[] };
const listeners = new Set<(m: Message) => void>();

export function subscribe(fn: (m: Message) => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
const broadcast = (m: Message) => {
    for (const fn of listeners) {
        try { fn(m); } catch { /* a closed stream */ }
    }
};

// Display names for pushed events (refreshed every 5 min)
const names = new Map<string, { who: string | null; email: string | null; at: number }>();
async function nameOf(userId: string | null) {
    if (!userId) return { who: null, email: null };
    const hit = names.get(userId);
    if (hit && Date.now() - hit.at < 300_000) return hit;
    try {
        const r = (await db.execute(sql`select full_name, email from users where id = ${userId}`)).rows[0] as { full_name: string | null; email: string } | undefined;
        const v = { who: r?.full_name || r?.email || null, email: r?.email ?? null, at: Date.now() };
        names.set(userId, v);
        return v;
    } catch {
        return { who: null, email: null };
    }
}

export interface Refs { patientId?: string | null; studyId?: string | null; contextId?: string | null }

/** Store + push one event. Resolves to the event id (or null on failure). */
export async function record(userId: string | null, kind: string, refs: Refs = {}, detail: Record<string, unknown> | null = null): Promise<string | null> {
    try {
        const r = (await db.execute(sql`
            insert into usage_events (user_id, kind, patient_id, study_id, context_id, detail)
            values (${userId}, ${kind}, ${refs.patientId ?? null}, ${refs.studyId ?? null}, ${refs.contextId ?? null}, ${detail ? JSON.stringify(detail) : null}::jsonb)
            returning id, created_at`)).rows[0] as { id: string; created_at: string };
        const id = `e${r.id}`;
        broadcast({ type: 'event', event: { id, at: new Date(r.created_at).toISOString(), kind, userId, who: (await nameOf(userId)).who, ...refs, detail } });
        return id;
    } catch (e) {
        console.error('[activity]', kind, e);
        return null;
    }
}

/** Change an event's detail (e.g. a growing DICOM upload count) and push it again with the same id. */
async function amend(id: string, userId: string | null, kind: string, refs: Refs, detail: Record<string, unknown>) {
    try {
        const r = (await db.execute(sql`update usage_events set detail = ${JSON.stringify(detail)}::jsonb where id = ${Number(id.slice(1))} returning created_at`)).rows[0] as { created_at: string } | undefined;
        if (r) broadcast({ type: 'event', event: { id, at: new Date(r.created_at).toISOString(), kind, userId, who: (await nameOf(userId)).who, ...refs, detail } });
    } catch (e) {
        console.error('[activity amend]', e);
    }
}

/** Audit rows (sign-in, sign-up, organization…) are already stored — only push them. */
export async function pushAudit(id: string, action: string, userId: string | null, metadata: Record<string, unknown> | null) {
    if (!listeners.size) return;
    broadcast({ type: 'event', event: { id: `a${id}`, at: new Date().toISOString(), kind: `auth.${action}`, userId, who: (await nameOf(userId)).who, detail: metadata } });
}

/**
 * Image uploads. A CT/MR series is hundreds of files: files of one study
 * arriving within 2 minutes of each other become ONE event with a count.
 */
const series = new Map<string, { id: string; count: number; last: number; detail: Record<string, unknown> }>();
export async function recordUpload(userId: string, refs: Refs, file: string, originalName: string, type: string) {
    if (type === 'Thumbnail') return; // the 3D screenshot of a CT/MR study, not a user upload
    const isImage = /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file);
    if (isImage) { await record(userId, 'image.upload', refs, { file, name: originalName, type }); return; }
    const key = `${userId}:${refs.studyId}`;
    const cur = series.get(key);
    if (cur && Date.now() - cur.last < 120_000) {
        cur.count++;
        cur.last = Date.now();
        cur.detail = { ...cur.detail, count: cur.count };
        // amend at most every 10 files (and at the first few) to keep the DB quiet
        if (cur.count <= 3 || cur.count % 10 === 0) await amend(cur.id, userId, 'series.upload', refs, cur.detail);
        return;
    }
    const detail = { file, name: originalName, type, count: 1 };
    const id = await record(userId, 'series.upload', refs, detail);
    if (id) series.set(key, { id, count: 1, last: Date.now(), detail });
    for (const [k, v] of series) if (Date.now() - v.last > 600_000) {
        if (v.count % 10 !== 0) void amend(v.id, userId, 'series.upload', refs, v.detail); // final count
        series.delete(k);
    }
}

// ── Presence (in memory: who is online right now and where) ────────────────
const online = new Map<string, Presence>();
const ONLINE_MS = 75_000;
let presenceTimer: NodeJS.Timeout | null = null;

const snapshot = () => [...online.values()].sort((a, b) => b.lastSeen - a.lastSeen);
const pushPresence = () => {
    if (presenceTimer) return;
    presenceTimer = setTimeout(() => { presenceTimer = null; broadcast({ type: 'presence', online: snapshot() }); }, 1000);
};

export async function heartbeat(userId: string, info: { page?: unknown; tool?: unknown; patientId?: unknown; contextId?: unknown; leaving?: unknown }) {
    if (info.leaving) {
        if (online.delete(userId)) pushPresence();
        return;
    }
    const str = (v: unknown, n = 200) => (typeof v === 'string' && v ? v.slice(0, n) : null);
    const prev = online.get(userId);
    const { who, email } = await nameOf(userId);
    const next: Presence = {
        userId, who, email,
        page: str(info.page) ?? prev?.page ?? '/',
        tool: str(info.tool, 60),
        patientId: str(info.patientId, 80),
        contextId: str(info.contextId, 80),
        since: prev?.since ?? Date.now(),
        lastSeen: Date.now(),
    };
    online.set(userId, next);
    if (!prev || prev.page !== next.page || prev.tool !== next.tool || prev.contextId !== next.contextId) pushPresence();
}

export const onlineNow = () => {
    for (const [k, v] of online) if (Date.now() - v.lastSeen > ONLINE_MS) online.delete(k);
    return snapshot();
};

setInterval(() => {
    const before = online.size;
    onlineNow();
    if (online.size !== before) pushPresence();
}, 30_000).unref();

/** Client-reported UI actions accepted by POST /api/activity. */
export const CLIENT_KINDS = new Set(['page', 'tool.select', 'viewer3d.open', 'report.preview', 'compare.open', 'calibrate']);

// ── Session saves → what changed (tools used, plans, comparisons) ──────────
interface SessionSnapshot {
    measurements: Map<string, string>;           // id → toolKey
    implants: Set<string>;
    implants3d: Set<string>;
    plans: Set<string>;
    imageB: string | null;
}

const parse = (s: string | null | undefined) => { try { return JSON.parse(s || '{}') ?? {}; } catch { return {}; } };
const ids = (arr: unknown) => new Set((Array.isArray(arr) ? arr : []).map((x: { id?: string }) => String(x?.id ?? '')).filter(Boolean));

export async function sessionSnapshot(contextId: string): Promise<SessionSnapshot | null> {
    try {
        const ctx = (await db.execute(sql`select tool_state from contexts where id = ${contextId}`)).rows[0] as { tool_state: string } | undefined;
        if (!ctx) return null;
        const ms = (await db.execute(sql`select id, tool_key from measurements where context_id = ${contextId}`)).rows as { id: string; tool_key: string }[];
        const im = (await db.execute(sql`select id from implants where context_id = ${contextId}`)).rows as { id: string }[];
        const ts = parse(ctx.tool_state);
        return {
            measurements: new Map(ms.map((m) => [m.id, m.tool_key])),
            implants: new Set(im.map((i) => i.id)),
            implants3d: ids(ts.threeDImplants),
            plans: ids(ts.plans),
            imageB: ts.comparisonB?.image ?? null,
        };
    } catch {
        return null;
    }
}

const short = (v: unknown) => {
    if (v == null) return null;
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
};

/** Compare a saved session with its state before the save and record what's new. */
export async function recordSessionChanges(userId: string, refs: Refs, before: SessionSnapshot | null, body: { name?: string; state?: any }) {
    const state = body.state ?? {};
    const ts = state.toolState ?? {};
    if (!before) await record(userId, 'session.create', refs, { name: body.name || null });
    for (const m of (state.measurements ?? []) as any[]) {
        if (!m?.id || before?.measurements.has(m.id)) continue;
        await record(userId, 'measurement.add', refs, { tool: m.toolKey, result: short(m.result) });
    }
    for (const i of (state.implants ?? []) as any[]) {
        if (!i?.id || before?.implants.has(i.id)) continue;
        await record(userId, 'implant.add', refs, { type: i.type, mode: '2d', size: short(i.properties?.size ?? i.properties?.length ?? null) });
    }
    for (const i of (Array.isArray(ts.threeDImplants) ? ts.threeDImplants : []) as any[]) {
        if (!i?.id || before?.implants3d.has(String(i.id))) continue;
        await record(userId, 'implant.add', refs, { type: i.type ?? i.kind ?? 'implant', mode: '3d', level: i.level ?? i.vertebra ?? null });
    }
    for (const p of (Array.isArray(ts.plans) ? ts.plans : []) as any[]) {
        if (!p?.id || before?.plans.has(String(p.id))) continue;
        await record(userId, 'plan.save', refs, {
            name: p.name ?? 'Plan', measurements: p.measurements?.length ?? 0, implants: p.implants?.length ?? 0,
            osteotomies: (p.measurements ?? []).filter((m: any) => String(m?.toolKey ?? '').startsWith('ost-')).length,
        });
    }
    const imageB = ts.comparisonB?.image ?? null;
    if (imageB && !String(imageB).startsWith('blob:') && imageB !== (before?.imageB ?? null)) {
        await record(userId, 'compare.image', refs, { image: String(imageB).split('/').pop(), source: ts.comparisonB?.source?.label ?? 'Imported file' });
    }
}
