import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';
import { KINDS, kindLabel } from '@/features/support/kinds';
import { useSupport, type SupportMessage } from '@/features/support/supportStore';
import { getJson, pageName, timeAgo } from './monitor';

/**
 * Monitor → Feedback (HELP-01): every user's help & feedback conversation,
 * what they're stuck on / like / dislike, and a reply box. Replies reach the
 * user in their "?" panel (count on the ?; in-app only, no email).
 */
interface Conversation {
    userId: string; who: string; email: string; active: boolean; messages: number; unread: number;
    lastAt: string; lastBody: string; lastFromAdmin: boolean; kinds: Record<string, number>;
}
type Thread = (SupportMessage & { context?: Record<string, unknown> | null })[];

const card = 'rounded-xl border border-[var(--border)] bg-[var(--surface)]';

/** One user's conversation + reply box (also on the user's monitor page). */
export function ConversationThread({ token, userId, refreshKey, className }: { token: string | null; userId: string; refreshKey: number; className?: string }) {
    const [thread, setThread] = useState<Thread | null>(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            setThread(await getJson<Thread>(`/support/${userId}`, token));
            void useSupport.getState().refreshUnread(); // opening marks them read → Monitor icon count
        } catch { setError('Could not load the conversation.'); }
    }, [token, userId]);
    useEffect(() => { void load(); }, [load, refreshKey]);
    useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [thread]);

    const reply = async () => {
        const body = text.trim();
        if (!body || busy) return;
        setBusy(true);
        setError(null);
        try {
            const r = await fetch(`${API_BASE}/api/platform/support/${userId}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ body }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error ?? 'Could not send the reply');
            setThread((t) => [...(t ?? []), d]);
            setText('');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not send the reply');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={cn('flex min-h-0 flex-col', className)}>
            <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                {thread?.length === 0 && <p className="py-8 text-center text-xs text-[var(--text-3)]">No messages from this user yet. You can still write to them.</p>}
                {thread?.map((m) => (
                    <div key={m.id} className={cn('flex flex-col', m.fromAdmin ? 'items-end' : 'items-start')}>
                        {!m.fromAdmin && (
                            <span className="mb-0.5 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-2)]">
                                {kindLabel(m.kind)}{m.page ? ` · ${pageName(m.page)}` : ''}{m.context?.tool ? ` · tool: ${String(m.context.tool)}` : ''}
                            </span>
                        )}
                        <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-snug',
                            m.fromAdmin ? 'rounded-br-sm bg-[var(--accent)] text-white' : 'rounded-bl-sm bg-[var(--surface-2)] text-[var(--text)]')}>
                            {m.body}
                        </div>
                        <div className="mt-0.5 px-1 text-[10px] text-[var(--text-3)]">
                            {m.fromAdmin ? `You · ${m.readAt ? 'seen' : 'not seen yet'} · ` : ''}{new Date(m.createdAt).toLocaleString()}
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-end gap-2 border-t border-[var(--border)] p-3">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000}
                    placeholder="Reply — the user sees it in their ? (Help) panel"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void reply(); } }}
                    className="max-h-32 min-h-[44px] flex-1 resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[var(--accent)]" />
                <button onClick={() => void reply()} disabled={busy || !text.trim()} aria-label="Send reply"
                    className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-white disabled:opacity-40">
                    <Send className="h-4 w-4" />
                </button>
            </div>
            {error && <p className="px-3 pb-2 text-[11px] text-[#FF453A]">{error}</p>}
        </div>
    );
}

export function FeedbackPanel({ token, selected, onSelect, refreshKey, onOpenUser }: {
    token: string | null; selected: string | null; onSelect: (userId: string) => void; refreshKey: number; onOpenUser: (userId: string) => void;
}) {
    const [data, setData] = useState<{ conversations: Conversation[]; totals: Record<string, number> } | null>(null);
    const [filter, setFilter] = useState<string | null>(null);
    useEffect(() => {
        getJson<{ conversations: Conversation[]; totals: Record<string, number> }>('/support', token).then(setData).catch(() => {});
    }, [token, refreshKey]);

    const list = (data?.conversations ?? []).filter((c) => !filter || (c.kinds?.[filter] ?? 0) > 0);
    const current = data?.conversations.find((c) => c.userId === selected) ?? null;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
                <button onClick={() => setFilter(null)} className={cn(card, 'px-4 py-2.5 text-left', !filter && 'border-[var(--accent)]')}>
                    <div className="text-lg font-bold tabular-nums text-[var(--text)]">{data?.totals.received ?? 0}</div>
                    <div className="text-[11px] text-[var(--text-3)]">All messages{data?.totals.unread ? ` · ${data.totals.unread} new` : ''}</div>
                </button>
                {KINDS.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setFilter(filter === key ? null : key)} title={`Show conversations with "${label}"`}
                        className={cn(card, 'px-4 py-2.5 text-left', filter === key && 'border-[var(--accent)]')}>
                        <div className="flex items-center gap-1.5 text-lg font-bold tabular-nums text-[var(--text)]"><Icon className="h-3.5 w-3.5 text-[var(--text-3)]" />{data?.totals[key] ?? 0}</div>
                        <div className="text-[11px] text-[var(--text-3)]">{label}</div>
                    </button>
                ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <div className={`${card} max-h-[600px] overflow-y-auto`}>
                    {data && list.length === 0 && <p className="px-4 py-12 text-center text-xs text-[var(--text-3)]">No feedback yet. Users send it with the ? button.</p>}
                    {list.map((c) => (
                        <button key={c.userId} onClick={() => onSelect(c.userId)}
                            className={cn('flex w-full gap-3 border-b border-[var(--border)] px-4 py-3 text-left last:border-0 hover:bg-[var(--surface-2)]', selected === c.userId && 'bg-[var(--surface-2)]')}>
                            <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--text-3)]" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className={cn('truncate text-xs', c.unread ? 'font-semibold text-[var(--text)]' : 'font-medium text-[var(--text-2)]')}>{c.who}</span>
                                    <span className="flex-shrink-0 text-[10px] text-[var(--text-3)]">{timeAgo(c.lastAt)}</span>
                                </div>
                                <div className="truncate text-[11px] text-[var(--text-3)]">{c.lastFromAdmin ? 'You: ' : ''}{c.lastBody}</div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {Object.entries(c.kinds ?? {}).map(([k, n]) => (
                                        <span key={k} className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-2)]">{kindLabel(k)} {n}</span>
                                    ))}
                                    {c.unread > 0 && <span className="rounded-full bg-[#FF453A] px-1.5 py-0.5 text-[10px] font-bold text-white">{c.unread} new</span>}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                <div className={`${card} flex h-[600px] flex-col lg:col-span-2`}>
                    {selected ? (
                        <>
                            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-[var(--text)]">{current?.who ?? 'Conversation'}</div>
                                    <div className="truncate text-[11px] text-[var(--text-3)]">{current?.email}{current && !current.active ? ' · blocked' : ''}</div>
                                </div>
                                <button onClick={() => onOpenUser(selected)} className="flex-shrink-0 text-xs text-[var(--accent)] hover:underline">See their work →</button>
                            </div>
                            <ConversationThread key={selected} token={token} userId={selected} refreshKey={refreshKey} className="flex-1" />
                        </>
                    ) : (
                        <div className="grid flex-1 place-items-center text-xs text-[var(--text-3)]">Choose a conversation on the left.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
