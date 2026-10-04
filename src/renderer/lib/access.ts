import type { AppState } from '@/lib/store';
import type { Access, Study } from '@/lib/store/types';

/**
 * Access to the open case (UI12-10). The server decides; the client only uses
 * it to hide tools and skip saves the server would refuse anyway.
 *   owner — own study · edit — shared with edit rights · view — shared
 *   view-only, or an org admin looking at a member's study.
 */
export function findStudy(state: Pick<AppState, 'patients'>, patientId: string | null | undefined, studyId: string | null | undefined): Study | undefined {
    if (!patientId || !studyId) return undefined;
    const p = state.patients.find((x) => x.id === patientId);
    return p?.studies.find((s) => s.id === studyId) ?? p?.visits.flatMap((v) => v.studies ?? []).find((s) => s.id === studyId);
}

export function contextAccess(state: Pick<AppState, 'contexts' | 'patients'>, contextId: string | null | undefined): Access {
    const ctx = contextId ? state.contexts.find((c) => c.id === contextId) : undefined;
    if (!ctx) return 'owner'; // untitled / local work
    if (ctx.access) return ctx.access;
    return findStudy(state, ctx.patientId, ctx.studyIds?.[0])?.access ?? 'owner';
}

export const caseAccess = (state: Pick<AppState, 'contexts' | 'patients' | 'activeContextId'>) =>
    contextAccess(state, state.activeContextId);

/** View-only case: no tools, no saves. */
export const isReadOnlyCase = (state: Pick<AppState, 'contexts' | 'patients' | 'activeContextId'>) =>
    caseAccess(state) === 'view';

export const canWrite = (a: Access | undefined | null) => a !== 'view';

/**
 * Role in the active workspace: personal → 'owner' (it's all theirs);
 * organization → 'admin' for its admins/creator, else 'member'.
 */
export function workspaceRole(state: Pick<AppState, 'activeWorkspace' | 'joinedOrgs' | 'createdOrgs'>): 'owner' | 'admin' | 'member' {
    const ws = state.activeWorkspace;
    if (ws.type !== 'organization') return 'owner';
    if (state.createdOrgs.some((o) => o.orgId === ws.orgId)) return 'admin';
    return state.joinedOrgs.find((o) => o.orgId === ws.orgId)?.role === 'admin' ? 'admin' : 'member';
}
