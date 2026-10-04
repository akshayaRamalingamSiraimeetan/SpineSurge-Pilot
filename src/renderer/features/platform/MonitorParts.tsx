import { type FeedEvent, describe, kindTone, timeAgo } from './monitor';

/** Live status pill and one activity row of the platform monitor (MON-01). */
export const LiveBadge = ({ status }: { status: 'connecting' | 'live' | 'offline' }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        status === 'live' ? 'bg-[#30D158]/15 text-[#30D158]' : status === 'connecting' ? 'bg-[var(--surface-2)] text-[var(--text-3)]' : 'bg-[#FF453A]/10 text-[#FF453A]'}`}>
        <span className={`h-2 w-2 rounded-full ${status === 'live' ? 'animate-pulse bg-[#30D158]' : status === 'connecting' ? 'bg-[var(--text-3)]' : 'bg-[#FF453A]'}`} />
        {status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </span>
);

export const EventRow = ({ e, onUser, showWho = true }: { e: FeedEvent; onUser?: (id: string) => void; showWho?: boolean }) => (
    <div className="flex gap-3 border-b border-[var(--border)] px-4 py-2 text-xs last:border-0">
        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: kindTone(e.kind) }} />
        <div className="min-w-0 flex-1">
            <div className="text-[var(--text-2)]">
                {showWho && (
                    <button disabled={!e.userId || !onUser} onClick={() => e.userId && onUser?.(e.userId)}
                        className="font-medium text-[var(--text)] hover:underline disabled:no-underline">
                        {e.who ?? 'Someone'}
                    </button>
                )}{showWho ? ' ' : ''}{describe(e)}
            </div>
            {(e.patientName || e.studyName) && (
                <div className="truncate text-[11px] text-[var(--text-3)]">
                    {e.patientName ?? ''}{e.studyName ? ` · ${e.studyName}` : e.modality ? ` · ${e.modality}` : ''}
                </div>
            )}
        </div>
        <span className="flex-shrink-0 tabular-nums text-[var(--text-3)]" title={new Date(e.at).toLocaleString()}>{timeAgo(e.at)}</span>
    </div>
);
