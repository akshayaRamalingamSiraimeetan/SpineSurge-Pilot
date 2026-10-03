import { Directory, File, Paths } from 'expo-file-system';
import type { Case, Patient } from './types';

/**
 * On-device storage (works offline, nothing leaves the phone unless the user
 * shares it):
 *   <documents>/cases.json        — array of Case (metadata + measurements)
 *   <documents>/images/<id>.<ext> — the case image, copied in on import
 */

const imagesDir = () => {
  const d = new Directory(Paths.document, 'images');
  if (!d.exists) d.create();
  return d;
};
const indexFile = () => new File(Paths.document, 'cases.json');

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function loadCases(): Case[] {
  const f = indexFile();
  if (!f.exists) return [];
  try {
    const list = JSON.parse(f.textSync()) as Case[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeCases(list: Case[]) {
  const f = indexFile();
  if (!f.exists) f.create();
  f.write(JSON.stringify(list));
}

export function getCase(id: string): Case | undefined {
  return loadCases().find((c) => c.id === id);
}

export function saveCase(next: Case) {
  const list = loadCases();
  const i = list.findIndex((c) => c.id === next.id);
  const stamped = { ...next, updatedAt: Date.now() };
  if (i >= 0) list[i] = stamped;
  else list.unshift(stamped);
  writeCases(list);
  return stamped;
}

export function deleteCase(id: string) {
  const list = loadCases();
  const c = list.find((x) => x.id === id);
  if (c) {
    try {
      const img = new File(c.image.uri);
      if (img.exists) img.delete();
    } catch { /* already gone */ }
  }
  writeCases(list.filter((x) => x.id !== id));
}

/** Copy a picked/captured image into app storage and create the case. */
export function createCase(patient: Patient, picked: { uri: string; width: number; height: number }): Case {
  const id = newId();
  const ext = (picked.uri.split('?')[0].match(/\.(jpe?g|png|heic|webp)$/i)?.[1] ?? 'jpg').toLowerCase();
  const dest = new File(imagesDir(), `${id}.${ext}`);
  new File(picked.uri).copy(dest);
  const now = Date.now();
  return saveCase({
    id,
    createdAt: now,
    updatedAt: now,
    patient,
    image: { uri: dest.uri, width: picked.width, height: picked.height },
    calibration: null,
    measurements: [],
  });
}
