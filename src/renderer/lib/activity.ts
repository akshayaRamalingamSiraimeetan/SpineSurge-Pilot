import { API_BASE } from '@/lib/api';
import { useAppStore } from '@/lib/store/index';

/**
 * Usage tracking for the pilot's live monitor (MON-01, /platform).
 * Saves, uploads, plans, comparisons and reports are recorded by the server;
 * this file adds what only the browser knows: which page/tab is open, which
 * tool was picked, report previews — plus a presence heartbeat ("online now").
 * Events are batched; nothing is sent while a platform admin inspects
 * someone else's study.
 */

/** InspectionMode.orgId used when a platform admin opens a user's study. */
export const PLATFORM_INSPECT = 'platform';

type Kind = 'page' | 'tool.select' | 'viewer3d.open' | 'report.preview' | 'compare.open' | 'calibrate';
interface Pending { kind: Kind; detail?: Record<string, unknown>; patientId?: string | null; studyId?: string | null; contextId?: string | null }

let queue: Pending[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let page = '/';

// Platform admins aren't monitored (MON-04), nor anything done while inspecting a user's study.
const inspecting = () => {
    const s = useAppStore.getState();
    return !!s.user?.isPlatformAdmin || s.inspectionMode?.orgId === PLATFORM_INSPECT;
};

function caseRefs() {
    const s = useAppStore.getState();
    const ctx = s.contexts.find((c) => c.id === s.activeContextId);
    return { patientId: s.activePatientId ?? null, contextId: s.activeContextId ?? null, studyId: ctx?.studyIds?.[0] ?? null };
}

function flush() {
    flushTimer = null;
    const token = useAppStore.getState().token;
    if (!token || !queue.length) { queue = []; return; }
    const events = queue.splice(0, 50);
    void fetch(`${API_BASE}/api/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ events }),
        keepalive: true,
    }).catch(() => { /* monitoring must never disturb the user */ });
    if (queue.length) flushTimer = setTimeout(flush, 1000);
}

/** Record a UI action (sent within a few seconds). */
export function track(kind: Kind, detail?: Record<string, unknown>) {
    if (!useAppStore.getState().token || inspecting()) return;
    queue.push({ kind, detail, ...caseRefs() });
    if (!flushTimer) flushTimer = setTimeout(flush, 3000);
}

function heartbeat(leaving = false) {
    const s = useAppStore.getState();
    if (!s.token || inspecting()) return;
    if (!leaving && document.visibilityState !== 'visible') return;
    void fetch(`${API_BASE}/api/activity/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
        body: JSON.stringify({ page, tool: s.activeTool, patientId: s.activePatientId, contextId: s.activeContextId, leaving }),
        keepalive: true,
    }).catch(() => {});
}

/** Route changes (called by <ActivityTracker/> in App). */
export function trackPage(pathname: string, search: string) {
    const tab = new URLSearchParams(search).get('tab');
    const next = pathname === '/workspace' && tab ? `${pathname}?tab=${tab}` : pathname;
    if (next === page) return;
    page = next;
    if (pathname.startsWith('/platform')) { heartbeat(); return; } // the monitor itself isn't usage
    track('page', { path: next });
    if (pathname === '/compare') track('compare.open');
    heartbeat();
}

let started = false;
/** Start store watchers + heartbeat once per app load. */
export function startActivityTracking() {
    if (started) return;
    started = true;
    useAppStore.subscribe((s, prev) => {
        if (s.activeTool && s.activeTool !== prev.activeTool) {
            track('tool.select', { tool: s.activeTool, view: s.activeCanvasSide === 'right' ? 'imageB' : 'main' });
            heartbeat();
        }
        if (s.isDicomMode && !prev.isDicomMode) track('viewer3d.open', { series: s.dicomSeries?.length ?? 0 });
        if (s.canvas?.calibrationApplied && !prev.canvas?.calibrationApplied && s.activeContextId === prev.activeContextId) {
            track('calibrate', { pixelToMm: s.canvas.pixelToMm ?? null });
        }
        if (s.token && !prev.token) heartbeat();
    });
    setInterval(() => heartbeat(), 30_000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') heartbeat(); });
    window.addEventListener('pagehide', () => { flush(); heartbeat(true); });
}
