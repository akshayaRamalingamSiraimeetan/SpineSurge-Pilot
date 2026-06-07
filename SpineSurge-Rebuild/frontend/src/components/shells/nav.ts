/* Shared nav model for both shells. `Reports` is intentionally absent — the PDF annotation strikes
   the top-level Reports item; reporting lives inside the workspace Report tab (DESIGN.md §3). */
export interface NavItem {
  to: string;
  icon: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: 'home', label: 'Home' },
  { to: '/workspace', icon: 'workspace', label: 'Workspace' },
  { to: '/patients', icon: 'patients', label: 'Patients' },
  { to: '/library', icon: 'library', label: 'Library' },
];
