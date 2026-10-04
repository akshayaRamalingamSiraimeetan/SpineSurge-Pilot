import type { Patient, Study } from '@/lib/store/types';

export const isQuickAnalysisPatient = (id?: string) => (id || '').startsWith('quick-');

/**
 * Studies the user can see — the same set on the Patients page and the Home
 * page (UI9-01): no quick-analysis or archived patients; studies listed on the
 * patient or under a visit are merged once. Newest first.
 */
export function visibleStudies(patients: Patient[], via: NonNullable<Study['via']> = 'own'): { patient: Patient; study: Study }[] {
    const out: { patient: Patient; study: Study }[] = [];
    for (const p of patients) {
        if (isQuickAnalysisPatient(p.id) || (p.isArchived && via === 'own')) continue;
        const all = [...(p.studies ?? []), ...(p.visits ?? []).flatMap((v) => v.studies ?? [])];
        const unique = Array.from(new Map(all.map((s) => [s.id, s])).values());
        // Own lists never show shared or team studies (UI12-10)
        unique.filter((s) => (s.via ?? 'own') === via).forEach((study) => out.push({ patient: p, study }));
    }
    return out.sort((a, b) => (Date.parse(b.study.acquisitionDate) || 0) - (Date.parse(a.study.acquisitionDate) || 0));
}

/** Scan type used for a CT/MR study's 3D screenshot (shown on cards and reports). */
export const THUMBNAIL_SCAN_TYPE = 'Thumbnail' as const;
const VOLUME = new Set(['CT', 'MRI', 'MR', 'PET', 'PT', 'NM']);

/** The study's real images (series files / X-rays) — never the 3D thumbnail. */
export const imageScans = (study: Pick<Study, 'scans'>) => (study.scans ?? []).filter((s) => s.type !== THUMBNAIL_SCAN_TYPE);

/** Picture for a study card: the 3D screenshot for CT/MR, else the first image. */
export function studyThumbnail(study: Pick<Study, 'scans' | 'modality'>): string | undefined {
    const thumb = (study.scans ?? []).find((s) => s.type === THUMBNAIL_SCAN_TYPE)?.imageUrl;
    if (thumb) return thumb;
    if (VOLUME.has((study.modality ?? '').toUpperCase())) return undefined; // DICOM files can't be shown as <img>
    const first = imageScans(study)[0]?.imageUrl;
    return first && !first.toLowerCase().endsWith('.dcm') ? first : undefined;
}

/**
 * Date of birth after an age edit: a real DOB that already gives this age is
 * kept; otherwise an approximate 1 January date is used (UI11-13).
 */
export function dobForAge(age: number, currentDob?: string | null): string {
    const now = new Date();
    if (currentDob) {
        const d = new Date(currentDob);
        if (!isNaN(d.getTime())) {
            let a = now.getFullYear() - d.getFullYear();
            if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
            if (Math.abs(a - age) <= 1 && !currentDob.endsWith('-01-01')) return currentDob;
        }
    }
    return `${now.getFullYear() - age}-01-01`;
}
