import dicomParser from 'dicom-parser';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import type { Patient } from '@/lib/store/types';

/**
 * DICOM studies are stored like any other study (BUGS UI10-08): the series
 * files are uploaded as the study's scans, the study gets the real modality
 * (CT / MRI / X-Ray …) and empty patient fields are filled from the headers.
 */

export interface DicomInfo {
    modality: string | null;          // raw code: CT, MR, CR, DX…
    patientName: string | null;
    patientId: string | null;
    sex: 'M' | 'F' | 'O' | null;
    age: number | null;
    birthDate: string | null;         // yyyy-mm-dd
    studyDate: string | null;         // yyyy-mm-dd
    /** mm per pixel for single-image (2D) DICOM, from Pixel Spacing / Imager Pixel Spacing */
    pixelSpacing: number | null;
}

/** Human study modality from the DICOM code. */
export function modalityLabel(code: string | null | undefined): string {
    switch ((code ?? '').toUpperCase()) {
        case 'CT': return 'CT';
        case 'MR': return 'MRI';
        case 'PT': return 'PET';
        case 'NM': return 'NM';
        case 'US': return 'US';
        case 'CR': case 'DX': case 'DR': case 'RF': case 'XA': case 'RG': return 'X-Ray';
        default: return code ? code.toUpperCase() : 'CT';
    }
}
export const isVolumeModality = (m: string | null | undefined) => ['CT', 'MRI', 'MR', 'PET', 'PT', 'NM'].includes((m ?? '').toUpperCase());

const dicomDate = (s?: string) => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

/** Read the headers of one DICOM file (stops before pixel data). */
export async function readDicomInfo(file: File): Promise<DicomInfo | null> {
    try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const ds = dicomParser.parseDicom(buf, { untilTag: 'x7fe00010' });
        const str = (tag: string) => ds.string(tag)?.trim() || undefined;
        const name = str('x00100010')?.replace(/\^+/g, ' ').trim() || null;
        const sexRaw = str('x00100040')?.toUpperCase();
        const ageStr = str('x00101010'); // e.g. "045Y"
        const birthDate = dicomDate(str('x00100030'));
        let age: number | null = ageStr && /^\d{3}[DWMY]$/.test(ageStr)
            ? (ageStr.endsWith('Y') ? parseInt(ageStr) : 0) : null;
        if (!age && birthDate) age = new Date().getFullYear() - parseInt(birthDate.slice(0, 4));
        const spacing = str('x00280030') ?? str('x00181164'); // "row\\col" mm
        const ps = spacing ? parseFloat(spacing.split('\\')[0]) : NaN;
        return {
            modality: str('x00080060') ?? null,
            patientName: name,
            patientId: str('x00100020') ?? null,
            sex: sexRaw === 'M' || sexRaw === 'F' ? sexRaw : sexRaw === 'O' ? 'O' : null,
            age: age && age > 0 && age < 130 ? age : null,
            birthDate,
            studyDate: dicomDate(str('x00080020')),
            pixelSpacing: Number.isFinite(ps) && ps > 0 ? ps : null,
        };
    } catch {
        return null; // not DICOM (or unreadable) — callers fall back to defaults
    }
}

/** Fill only the patient fields the doctor hasn't filled in yet. */
export async function autofillPatientFromDicom(patientId: string, info: DicomInfo) {
    const st = useAppStore.getState();
    const p = st.patients.find((x) => x.id === patientId);
    if (!p) return;
    const next: Patient = { ...p };
    let changed = false;
    if (!p.name?.trim() && info.patientName) { next.name = info.patientName; changed = true; }
    if (!(p.age > 0) && info.age) { next.age = info.age; changed = true; }
    if (info.birthDate && (!p.dob || p.dob.endsWith('-01-01'))) { next.dob = info.birthDate; changed = true; }
    if (info.sex && (!p.gender || !p.name?.trim())) { next.gender = info.sex; changed = true; }
    // Keep the hospital ID visible in the record (MRN field) without changing our key.
    if (!p.contact?.trim() && info.patientId) { next.contact = info.patientId; changed = true; }
    if (changed) await st.updatePatient(next);
}

/**
 * Upload a series to a study (4 at a time), set the study's modality, then
 * reload the patient list once. Returns the uploaded URLs in file order.
 */
export async function uploadDicomSeries(
    patientId: string, studyId: string, files: File[], onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
    const st = useAppStore.getState();
    const info = files.length ? await readDicomInfo(files[0]) : null;
    const modality = modalityLabel(info?.modality);
    const date = info?.studyDate ?? new Date().toISOString().slice(0, 10);
    const urls: string[] = new Array(files.length);
    let next = 0, done = 0;
    const worker = async () => {
        while (next < files.length) {
            const i = next++;
            const { imageUrl } = await api.uploadScan(studyId, { id: `scan-${crypto.randomUUID()}`, type: 'Imported', date }, files[i], st.token);
            urls[i] = imageUrl;
            onProgress?.(++done, files.length);
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
    await st.updateStudy(patientId, studyId, { modality, acquisitionDate: date });
    if (info) await autofillPatientFromDicom(patientId, info);
    await st.refreshPatients();
    return urls;
}

// ── Upload progress (shown in the header) ──────────────────────────────────
export const useDicomUpload = create<{ done: number; total: number; error: string | null }>(() => ({ done: 0, total: 0, error: null }));

/** Upload in the background with progress in the header; errors are reported there too. */
export function persistSeriesInBackground(patientId: string, studyId: string, files: File[]) {
    useDicomUpload.setState({ done: 0, total: files.length, error: null });
    uploadDicomSeries(patientId, studyId, files, (done, total) => useDicomUpload.setState({ done, total }))
        .then(() => useDicomUpload.setState({ done: 0, total: 0 }))
        .catch((e) => useDicomUpload.setState({ error: e instanceof Error ? e.message : 'Series upload failed' }));
}
