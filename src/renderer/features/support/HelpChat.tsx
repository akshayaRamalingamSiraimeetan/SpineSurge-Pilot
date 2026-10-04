import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, HelpCircle, Send, X } from 'lucide-react';
import { useAppStore } from '@/lib/store/index';
import { cn } from '@/lib/utils';
import { type SupportKind, useSupport } from './supportStore';
import { KINDS, kindLabel } from './kinds';

/**
 * Help & feedback (HELP-01): the "?" button opens a chat panel in the corner.
 * Users ask questions or tell the team where they're stuck and what they
 * like or don't; the team replies from Monitor → Feedback. The bell shows
 * unread replies (users) or unread user messages (platform admins).
 */
const btn = 'relative grid place-items-center h-8 w-8 rounded-lg border border-[var(--border-2)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors';
const Badge = ({ n }: { n: number }) => (n > 0 ? (
    <span className="absolute -right-1.5 -top-1.5 min-w-[16px] rounded-full bg-[#FF453A] px-1 text-center text-[10px] font-bold leading-4 text-white">{n > 9 ? '9+' : n}</span>
) : null);

/** "?" — opens the help & feedback chat (not shown to platform admins). */
export function HelpButton({ className }: { className?: string }) {
    const isAdmin = useAppStore((s) => !!s.user?.isPlatformAdmin);
    const setOpen = useSupport((s) => s.setOpen);
    const open = useSupport((s) => s.open);
    const unread = useSupport((s) => s.unread);
    if (isAdmin) return null;
    return (
        <button onClick={() => setOpen(!open)} title={unread ? 'Help & feedback — new reply' : 'Help & feedback'} aria-label="Help & feedback" className={cn(btn, className)}>
            <HelpCircle className="h-4 w-4" />
            {unread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#FF453A]" />}
        </button>
    );
}

/** Bell — unread replies (users: opens the chat) or unread feedback (admins: Monitor → Feedback). */
export function NotificationBell({ className }: { className?: string }) {
    const navigate = useNavigate();
    const isAdmin = useAppStore((s) => !!s.user?.isPlatformAdmin);
    const unread = useSupport((s) => s.unread);
    const setOpen = useSupport((s) => s.setOpen);
    const title = isAdmin
        ? (unread ? `${unread} new feedback message${unread === 1 ? '' : 's'}` : 'No new feedback')
        : (unread ? `${unread} new repl${unread === 1 ? 'y' : 'ies'} from the SpineSurge team` : 'No new notifications');
    return (
        <button title={title} aria-label={title} className={cn(btn, className)}
            onClick={() => (isAdmin ? navigate('/platform?view=feedback') : setOpen(true))}>
            <Bell className="h-4 w-4" />
            <Badge n={unread} />
        </button>
    );
}

const time = (v: string) => {
    const d = new Date(v);
    return d.toDateString() === new Date().toDateString()
        ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

/** Mounted once in App: the chat panel + unread polling. */
export function HelpChat() {
    const location = useLocation();
    const navigate = useNavigate();
    const token = useAppStore((s) => s.token);
    const isAdmin = useAppStore((s) => !!s.user?.isPlatformAdmin);
    const { open, messages, loaded, setOpen, refreshUnread, loadThread, send } = useSupport();
    const [kind, setKind] = useState<SupportKind>('question');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Unread count: now, every 30 s while the tab is visible, and when it comes back
    useEffect(() => {
        if (!token) return;
        void refreshUnread();
        const t = setInterval(() => { if (document.visibilityState === 'visible') void refreshUnread(); }, 30_000);
        const onVisible = () => { if (document.visibilityState === 'visible') void refreshUnread(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
    }, [token, isAdmin, refreshUnread]);

    // While the panel is open, check for replies more often
    useEffect(() => {
        if (!open) return;
        const t = setInterval(() => { if (document.visibilityState === 'visible') void loadThread(); }, 15_000);
        return () => clearInterval(t);
    }, [open, loadThread]);

    // Deep link that opens the chat: /#/dashboard?help=1
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (!params.has('help') || !token) return;
        params.delete('help');
        const rest = params.toString();
        navigate({ pathname: location.pathname, search: rest ? `?${rest}` : '' }, { replace: true });
        if (!isAdmin) setOpen(true);
    }, [location.search, location.pathname, navigate, token, isAdmin, setOpen]);

    useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, open]);
    useEffect(() => { if (!token) setOpen(false); }, [token, setOpen]);

    if (!token || isAdmin || !open) return null;

    const submit = async () => {
        const body = text.trim();
        if (!body || busy) return;
        setBusy(true);
        setError(null);
        try {
            const s = useAppStore.getState();
            const ctx = s.contexts.find((c) => c.id === s.activeContextId);
            const tab = new URLSearchParams(location.search).get('tab');
            const page = `${location.pathname}${tab ? `?tab=${tab}` : ''}`;
            await send(body, kind, page, {
                patientId: s.activePatientId, studyId: ctx?.studyIds?.[0] ?? null, contextId: s.activeContextId,
                tool: s.activeTool, view3d: s.isDicomMode || undefined,
            });
            setText('');
            setKind('question');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not send your message.');
        } finally {
            setBusy(false);
        }
    };
    const current = KINDS.find((k) => k.key === kind)!;

    return (
        <div role="dialog" aria-label="Help & feedback"
            className="fixed bottom-4 right-4 z-[300] flex h-[min(560px,calc(100vh-2rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <div>
                    <div className="text-sm font-semibold text-[var(--text)]">Help & feedback</div>
                    <div className="text-[11px] leading-snug text-[var(--text-3)]">Ask a question, or tell us where you got stuck and what you like or don't. The SpineSurge team replies here — the bell shows new replies.</div>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                {loaded && messages.length === 0 && (
                    <div className="space-y-2 px-2 py-6 text-center text-xs text-[var(--text-3)]">
                        <HelpCircle className="mx-auto h-6 w-6 text-[var(--accent)]" />
                        <p>Hi! How is SpineSurge working for you?</p>
                        <p>Pick a topic below and write a message — we read every one.</p>
                    </div>
                )}
                {messages.map((m) => (
                    <div key={m.id} className={cn('flex flex-col', m.fromAdmin ? 'items-start' : 'items-end')}>
                        <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-snug',
                            m.fromAdmin ? 'rounded-bl-sm bg-[var(--surface-2)] text-[var(--text)]' : 'rounded-br-sm bg-[var(--accent)] text-white')}>
                            {m.body}
                        </div>
                        <div className="mt-0.5 px-1 text-[10px] text-[var(--text-3)]">
                            {m.fromAdmin ? 'SpineSurge team · ' : m.kind && m.kind !== 'question' ? `${kindLabel(m.kind)} · ` : ''}{time(m.createdAt)}
                        </div>
                    </div>
                ))}
            </div>

            <div className="space-y-2 border-t border-[var(--border)] p-3">
                <div className="flex flex-wrap gap-1">
                    {KINDS.map(({ key, label, icon: Icon }) => (
                        <button key={key} onClick={() => setKind(key)}
                            className={cn('flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors',
                                kind === key ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]')}>
                            <Icon className="h-3 w-3" />{label}
                        </button>
                    ))}
                </div>
                <div className="flex items-end gap-2">
                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} placeholder={current.hint}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
                        className="max-h-32 min-h-[44px] flex-1 resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--accent)]" />
                    <button onClick={() => void submit()} disabled={busy || !text.trim()} aria-label="Send"
                        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-white disabled:opacity-40">
                        <Send className="h-4 w-4" />
                    </button>
                </div>
                {error ? <p className="text-[11px] text-[#FF453A]">{error}</p>
                    : <p className="text-[10px] text-[var(--text-3)]">Enter to send · Shift+Enter for a new line · we attach the page you're on.</p>}
            </div>
        </div>
    );
}
