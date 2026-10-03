import type { Patient, Study } from '@/lib/store/types';

export const isQuickAnalysisPatient = (id?: string) => (id || '').startsWith('quick-');

/**
 * Studies the user can see — the same set on the Patients page and the Home
 * page (UI9-01): no quick-analysis or archived patients; studies listed on the
 * patient or under a visit are merged once. Newest first.
 */
export function visibleStudies(patients: Patient[]): { patient: Patient; study: Study }[] {
    const out: { patient: Patient; study: Study }[] = [];
    for (const p of patients) {
        if (isQuickAnalysisPatient(p.id) || p.isArchived) continue;
        const all = [...(p.studies ?? []), ...(p.visits ?? []).flatMap((v) => v.studies ?? [])];
        const unique = Array.from(new Map(all.map((s) => [s.id, s])).values());
        unique.forEach((study) => out.push({ patient: p, study }));
    }
    return out.sort((a, b) => (Date.parse(b.study.acquisitionDate) || 0) - (Date.parse(a.study.acquisitionDate) || 0));
}
