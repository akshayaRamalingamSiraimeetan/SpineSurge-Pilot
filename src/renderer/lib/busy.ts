import { create } from 'zustand';

/**
 * App-wide "something is loading" indicator (LAG-01). On the hosted demo each
 * server round-trip is slow, so a click that opens a study showed nothing until
 * it finished. `withBusy` shows the BusyOverlay at once and blocks double clicks.
 */
interface BusyState { label: string | null; count: number }
export const useBusy = create<BusyState>(() => ({ label: null, count: 0 }));

export async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<T> {
    useBusy.setState((s) => ({ label, count: s.count + 1 }));
    try {
        return await fn();
    } finally {
        useBusy.setState((s) => (s.count <= 1 ? { label: null, count: 0 } : { ...s, count: s.count - 1 }));
    }
}
