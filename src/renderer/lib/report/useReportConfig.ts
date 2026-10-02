import { create } from 'zustand';
import { useAppStore } from '@/lib/store';
import type { AppState } from '@/lib/store';
import type { ReportConfig } from '@/lib/store/types';
import { normalizeReportConfig } from '@/features/report/defaultConfig';

/**
 * Report configuration for the active case. Saved with the context; for an
 * untitled session (no context yet) it lives in a draft until the study is saved.
 */
const useDraft = create<{ draft: ReportConfig | null; setDraft: (c: ReportConfig | null) => void }>((set) => ({
    draft: null,
    setDraft: (draft) => set({ draft }),
}));

export function getReportConfig(state: AppState): ReportConfig {
    const ctx = state.contextStates.find((c) => c.contextId === state.activeContextId);
    return normalizeReportConfig(ctx?.reportConfig ?? useDraft.getState().draft);
}

export function setReportConfig(next: ReportConfig) {
    const state = useAppStore.getState();
    if (state.activeContextId) void state.updateContextState(state.activeContextId, { reportConfig: next });
    else useDraft.getState().setDraft(next);
}

export function useReportConfig(): [ReportConfig, (next: ReportConfig) => void] {
    const ctxConfig = useAppStore((s) => s.contextStates.find((c) => c.contextId === s.activeContextId)?.reportConfig);
    const hasCtx = useAppStore((s) => !!s.activeContextId);
    const draft = useDraft((s) => s.draft);
    return [normalizeReportConfig(hasCtx ? ctxConfig : draft), setReportConfig];
}
