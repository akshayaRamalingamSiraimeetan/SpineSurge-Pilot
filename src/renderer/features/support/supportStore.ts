import { create } from 'zustand';
import { API_BASE } from '@/lib/api';
import { useAppStore } from '@/lib/store/index';

/**
 * Help & feedback chat state (HELP-01).
 * Users: their conversation with the SpineSurge team + unread replies.
 * Platform admins: only the number of unread user messages (they answer in
 * Monitor → Feedback).
 */
export type SupportKind = 'question' | 'stuck' | 'bug' | 'like' | 'dislike' | 'idea';

export interface SupportMessage {
    id: string;
    userId: string;
    fromAdmin: boolean;
    kind: SupportKind | null;
    body: string;
    page: string | null;
    readAt: string | null;
    createdAt: string;
}

interface SupportState {
    open: boolean;
    unread: number;
    messages: SupportMessage[];
    loaded: boolean;
    setOpen: (open: boolean) => void;
    refreshUnread: () => Promise<void>;
    loadThread: () => Promise<void>;
    send: (body: string, kind: SupportKind, page: string, context: Record<string, unknown>) => Promise<void>;
}

const auth = () => {
    const s = useAppStore.getState();
    return { token: s.token, admin: !!s.user?.isPlatformAdmin };
};
const headers = (token: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

export const useSupport = create<SupportState>((set, get) => ({
    open: false,
    unread: 0,
    messages: [],
    loaded: false,
    setOpen: (open) => {
        set({ open });
        if (open) void get().loadThread();
    },
    refreshUnread: async () => {
        const { token, admin } = auth();
        if (!token) return;
        try {
            const r = await fetch(`${API_BASE}/api/${admin ? 'platform/support' : 'support'}/unread`, { headers: headers(token) });
            if (!r.ok) return;
            const { unread } = await r.json();
            const before = get().unread;
            set({ unread });
            // a new reply while the panel is open → show it
            if (!admin && get().open && unread > 0 && unread !== before) void get().loadThread();
        } catch { /* offline: try again later */ }
    },
    loadThread: async () => {
        const { token, admin } = auth();
        if (!token || admin) return;
        try {
            const r = await fetch(`${API_BASE}/api/support`, { headers: headers(token) });
            if (!r.ok) return;
            set({ messages: await r.json(), loaded: true, unread: 0 });
        } catch { /* keep what we have */ }
    },
    send: async (body, kind, page, context) => {
        const { token } = auth();
        if (!token) throw new Error('Please sign in again.');
        const r = await fetch(`${API_BASE}/api/support`, { method: 'POST', headers: headers(token), body: JSON.stringify({ body, kind, page, context }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? 'Could not send your message. Please try again.');
        set((s) => ({ messages: [...s.messages, d as SupportMessage] }));
    },
}));
