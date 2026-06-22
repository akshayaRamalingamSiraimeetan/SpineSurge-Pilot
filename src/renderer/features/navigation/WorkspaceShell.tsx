/**
 * WorkspaceShell — Re-exported for backward compatibility.
 * The actual tab header (Assessment/Planning/Compare/Report) is rendered
 * inline inside MainLayout as WorkspaceShellHeader to avoid prop-drilling
 * and keep the Outlet/BottomToolbar structure intact.
 *
 * This file is kept as a barrel so any future feature components can import
 * from this path without touching MainLayout.
 */
export { WorkspaceShell } from './WorkspaceShellImpl';
