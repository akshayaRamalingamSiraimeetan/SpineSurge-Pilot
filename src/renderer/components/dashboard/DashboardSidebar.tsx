import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, Settings } from 'lucide-react';
import { useAppStore } from '@/lib/store/index';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { resolveAssetUrl } from '@/lib/api';
import { SettingsDialog } from '@/components/SettingsDialog';

// Only routes that exist (Studies/Resources/Settings had no pages — BUGS NAV-14).
const NAV_ITEMS = [
  { icon: Home,       label: 'Home',      to: '/dashboard' },
  { icon: Users,      label: 'Patients',  to: '/patients'  },
] as const;

/**
 * DashboardSidebar
 *
 * Narrow icon-only sidebar (w-16).
 * Profile avatar at the bottom opens the WorkspaceSwitcher slide-out panel.
 */
interface DashboardSidebarProps {
  collapsible?: boolean;
}

const DashboardSidebar = ({ collapsible = false }: DashboardSidebarProps) => {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const user            = useAppStore((state) => state.user);
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const joinedOrgs      = useAppStore((state) => state.joinedOrgs);
  const createdOrgs     = useAppStore((state) => state.createdOrgs);

  const displayName = user?.name ?? user?.email ?? 'User';
  const avatarUrl   = user?.avatarUrl;
  const initials    = displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  // Tooltip label for the avatar button
  const workspaceLabel = (() => {
    if (activeWorkspace.type === 'personal') return 'Personal Workspace';
    const allOrgs = [...joinedOrgs, ...createdOrgs];
    return allOrgs.find((o) => o.orgId === activeWorkspace.orgId)?.name ?? 'Organization';
  })();

  return (
    <>
      <div className={`group relative h-full z-[100] transition-[width] duration-300 flex-shrink-0 ${collapsible ? 'w-0' : 'w-16'}`}>
        {/* Invisible hover trigger area that activates group-hover */}
        {collapsible && (
          <div className="absolute top-0 left-0 h-full w-4 z-40" />
        )}
        <aside className={`absolute top-0 left-0 h-full w-16 bg-[var(--sidebar)] border-r border-[var(--border)] flex flex-col items-center py-5 gap-1 transition-transform duration-300 ${collapsible ? '-translate-x-full group-hover:translate-x-0' : 'translate-x-0'}`}>
          {/* Brand dot */}
          <img src="/spinesurge.png" alt="SpineSurge" className="mb-4 h-9 w-9 object-contain select-none" draggable={false} />

          {/* Nav icons */}
          <nav className="flex flex-col items-center gap-1 flex-1">
            {NAV_ITEMS.map(({ icon: Icon, label, to }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/dashboard'}
                className={({ isActive }) =>
                  [
                    'group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'bg-[#FF453A]/15 text-[#FF453A]'
                      : 'text-[var(--text-3)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]',
                  ].join(' ')
                }
                aria-label={label}
              >
                <Icon className="h-5 w-5" />
                {/* Tooltip */}
                <span className="pointer-events-none absolute left-14 z-50 hidden whitespace-nowrap rounded-md bg-[var(--surface-3)] px-2 py-1 text-xs text-[var(--text)] shadow-lg group-hover:block">
                  {label}
                </span>
              </NavLink>
            ))}
          </nav>

          {/* Light / dark mode */}
          <ThemeToggle className="mt-auto mb-2" />

          {/* Settings — above the profile */}
          <div className="group relative mb-2">
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              className="grid place-items-center h-8 w-8 rounded-lg border border-[var(--border-2)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors"
            >
              <Settings className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute left-14 top-1 z-50 hidden whitespace-nowrap rounded-md bg-[var(--surface-3)] px-2 py-1 text-xs text-[var(--text)] shadow-lg group-hover:block">
              Settings
            </span>
          </div>

          {/* Profile avatar — click to open workspace switcher */}
          <div className="group relative">
            <button
              onClick={() => setSwitcherOpen(true)}
              aria-label="Open workspace switcher"
              className="flex h-10 w-10 items-center justify-center rounded-full overflow-hidden border-2 border-transparent hover:border-[#FF453A] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF453A]"
            >
              {avatarUrl ? (
                <img
                  src={resolveAssetUrl(avatarUrl)}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-[#FF453A] text-white text-xs font-semibold">
                  {initials}
                </div>
              )}
            </button>
            {/* Workspace tooltip */}
            <span className="pointer-events-none absolute left-14 bottom-0 z-50 hidden whitespace-nowrap rounded-md bg-[var(--surface-3)] px-2 py-1 text-xs text-[var(--text)] shadow-lg group-hover:block">
              {workspaceLabel}
            </span>
          </div>
        </aside>
      </div>

      {/* Workspace Switcher slide-out panel */}
      <WorkspaceSwitcher
        isOpen={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
};

export default DashboardSidebar;
