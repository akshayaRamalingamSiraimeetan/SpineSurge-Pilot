/**
 * Should a canvas/viewer keyboard shortcut (Delete, Ctrl+Z, Enter, Esc…) be
 * ignored? Yes while typing in a field, while a dialog is open, and on the
 * Report tab — where the canvas/3D viewer stay mounted but hidden (UI11-22).
 */
export function shortcutsBlocked(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
        || /^(combobox|slider|textbox|spinbutton|listbox|menuitem)$/.test(t.getAttribute('role') ?? ''))) return true;
    if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]')) return true;
    return /[?&]tab=report\b/.test(window.location.hash);
}
