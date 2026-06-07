/* Settings static UI config. The PACS connections, org member list, and storage stats are now LIVE
   (the /org endpoints). What remains is `settingsTabs` — the left-rail tab definitions, which are
   UI configuration, not data. */
export interface SettingsTab {
  key: string;
  label: string;
  icon: string;
  locked?: boolean;
}

export const settingsTabs: SettingsTab[] = [
  { key: 'general', label: 'General', icon: 'user' },
  { key: 'dicom', label: 'DICOM & PACS', icon: 'database' },
  { key: 'workspace', label: 'Workspace', icon: 'monitor' },
  { key: 'library', label: 'Library & Reports', icon: 'file' },
  { key: 'instr', label: 'Instrumentation Library', icon: 'implant', locked: true },
  { key: 'admin', label: 'Administration', icon: 'shield' },
];
