/* The single application shell for all authenticated routes — a ~76px icon rail (DESIGN.md §3).
   Using one shell everywhere keeps navigation identical across screens (Dashboard, Workspace,
   Patients, Library). Screens that need a secondary list column (Patients, Library) render it as
   their own content. Settings opens as a modal; the rail avatar opens a profile/org popover. */
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Icon, Logo } from '@/components/Icon';
import { useTheme } from '@/lib/theme/useTheme';
import { useAuth } from '@/lib/auth/AuthProvider';
import { DEV_ORGS } from '@/lib/auth/devOrgs';
import { sessionStore } from '@/lib/auth/storage';
import { SettingsModal } from '@/features/settings/SettingsModal';
import { NAV_ITEMS } from './nav';

function ProfilePopover({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const { me, switchOrg, logout } = useAuth();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const activeOrgId = sessionStore.get()?.orgId;

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="dropdown pop"
      style={{ position: 'absolute', left: 64, bottom: 8, width: 256, top: 'auto', right: 'auto' }}
    >
      <div className="dropdown-head" style={{ gap: 11 }}>
        <span className="avatar-initials tone-accent" style={{ width: 36, height: 36, fontSize: 13 }}>
          {(me?.email ?? 'U').slice(0, 2).toUpperCase()}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{me?.email ?? 'Signed in'}</div>
          <div style={{ color: 'var(--text-3)', fontSize: 12, textTransform: 'capitalize' }}>{me?.role}</div>
        </div>
      </div>
      <div style={{ padding: 8 }}>
        <div className="mgroup-name" style={{ padding: '4px 8px' }}>Organization</div>
        {DEV_ORGS.map((org) => (
          <button
            key={org.id}
            className="side-link"
            onClick={() => {
              onClose();
              if (org.id !== activeOrgId) void switchOrg(org.id, org.name);
            }}
            style={org.id === activeOrgId ? { color: 'var(--accent)' } : undefined}
          >
            <Icon name="shield" />
            <span style={{ flex: 1 }}>{org.name}</span>
            {org.id === activeOrgId && <Icon name="check" size={16} />}
          </button>
        ))}
      </div>
      <button className="side-link" style={{ borderTop: '1px solid var(--border)', borderRadius: 0 }} onClick={() => { onClose(); onOpenSettings(); }}>
        <Icon name="settings" />
        <span>Settings</span>
      </button>
      <button
        className="side-link"
        style={{ borderTop: '1px solid var(--border)', borderRadius: 0, color: 'var(--danger)' }}
        onClick={() => {
          logout();
          navigate('/login');
        }}
      >
        <Icon name="external" />
        <span>Sign out</span>
      </button>
    </div>
  );
}

export function AppShell() {
  const { theme, toggleTheme } = useTheme();
  const { me, orgName } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const initials = (me?.email ?? 'DS').slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <nav className="rail">
        <div className="rail-logo">
          <Logo size={34} />
        </div>
        <div className="rail-nav">
          {NAV_ITEMS.map((it) => (
            <NavLink key={it.to} to={it.to} className={({ isActive }) => 'rail-btn' + (isActive ? ' active' : '')}>
              <Icon name={it.icon} />
              <span className="rail-tip">{it.label}</span>
            </NavLink>
          ))}
        </div>
        <button className="rail-btn" onClick={toggleTheme}>
          <Icon name={theme === 'light' ? 'moon' : 'sun'} />
          <span className="rail-tip">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
        </button>
        <button className={'rail-btn' + (settingsOpen ? ' active' : '')} onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" />
          <span className="rail-tip">Settings</span>
        </button>
        <div style={{ position: 'relative' }}>
          <button className="rail-avatar" onClick={() => setProfileOpen((o) => !o)} title={`${me?.email ?? ''} · ${orgName ?? ''}`}>
            <span className="avatar-initials" style={{ width: '100%', height: '100%', fontSize: 14, borderRadius: '50%' }}>
              {initials}
            </span>
          </button>
          {profileOpen && <ProfilePopover onClose={() => setProfileOpen(false)} onOpenSettings={() => setSettingsOpen(true)} />}
        </div>
      </nav>
      <div className="app-main">
        <Outlet />
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
