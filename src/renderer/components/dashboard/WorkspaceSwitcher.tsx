import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Building2, User, Plus, Mail, LogOut, X } from 'lucide-react';
import { useAppStore } from '@/lib/store/index';

interface SwitchConfirmModalProps {
  orgName:  string;
  orgId:    string;
  onCancel: () => void;
  onSwitch: (orgId: string) => void;
}

/** Confirmation modal shown before switching to an org workspace. */
const SwitchConfirmModal = ({ orgName, orgId, onCancel, onSwitch }: SwitchConfirmModalProps) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-2xl border border-[#242427] bg-[#141416] p-6 shadow-2xl">
      <h3 className="text-base font-semibold text-[#F5F5F7]">Switch Workspace</h3>
      <p className="mt-2 text-sm text-[#9CA3AF]">
        Do you want to switch to{' '}
        <span className="font-medium text-[#F5F5F7]">{orgName}</span> workspace?
      </p>
      <div className="mt-5 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-[#242427] bg-transparent py-2 text-sm font-medium text-[#9CA3AF] hover:bg-[#242427] hover:text-[#F5F5F7] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSwitch(orgId)}
          className="flex-1 rounded-lg bg-[#FF453A] py-2 text-sm font-semibold text-white hover:bg-[#e03d33] transition-colors"
        >
          Switch
        </button>
      </div>
    </div>
  </div>
);

interface WorkspaceSwitcherProps {
  isOpen:  boolean;
  onClose: () => void;
}

/**
 * WorkspaceSwitcher — slide-out panel from the left.
 *
 * Workspace state is pure frontend: stored in Zustand + localStorage.
 * No server calls are made when switching workspace.
 *
 * Sections:
 * 1. User profile card
 * 2. Personal Workspace
 * 3. Joined Organizations  (orgs the user is a member of but did not create)
 * 4. Created Organizations (orgs where orgs.created_by = current user)
 * 5. Add / Create Organization
 * 6. Pending Invitations (with badge)
 * 7. Logout
 */
const WorkspaceSwitcher = ({ isOpen, onClose }: WorkspaceSwitcherProps) => {
  const navigate = useNavigate();

  const user              = useAppStore((state) => state.user);
  const activeWorkspace   = useAppStore((state) => state.activeWorkspace);
  const setActiveWorkspace = useAppStore((state) => state.setActiveWorkspace);
  const joinedOrgs        = useAppStore((state) => state.joinedOrgs);
  const createdOrgs       = useAppStore((state) => state.createdOrgs);
  const clearAuth         = useAppStore((state) => state.clearAuth);
  const fetchOrgLists     = useAppStore((state) => state.fetchOrgLists);
  const token             = useAppStore((state) => state.token);

  // Derived helpers
  const isPersonal        = activeWorkspace.type === 'personal';
  const activeOrgId       = activeWorkspace.type === 'organization' ? activeWorkspace.orgId : null;

  // Pending invitation badge count
  const [pendingCount, setPendingCount] = useState(0);

  // Confirm-switch modal
  const [confirmOrg, setConfirmOrg] = useState<{ id: string; name: string } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch org lists + pending count when panel opens
  useEffect(() => {
    if (!isOpen) return;
    fetchOrgLists();

    if (token) {
      fetch('http://localhost:3001/invitations/pending', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data: unknown) => setPendingCount(Array.isArray(data) ? data.length : 0))
        .catch(() => setPendingCount(0));
    }
  }, [isOpen, fetchOrgLists, token]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleSwitchToPersonal = () => {
    if (isPersonal) { onClose(); return; }
    setActiveWorkspace({ type: 'personal' });
    onClose();
    navigate('/dashboard');
  };

  const handleOrgClick = (orgId: string, orgName: string) => {
    if (activeOrgId === orgId) { onClose(); return; }
    setConfirmOrg({ id: orgId, name: orgName });
  };

  const handleConfirmSwitch = (orgId: string) => {
    setConfirmOrg(null);
    setActiveWorkspace({ type: 'organization', orgId });
    onClose();
    navigate('/dashboard');
  };

  const handleLogout = () => {
    clearAuth();
    onClose();
    navigate('/login');
  };

  const displayName  = user?.name ?? user?.email ?? 'User';
  const displayEmail = user?.email ?? '';
  const avatarUrl    = user?.avatarUrl;
  const initials     = displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  // Joined = member but did NOT create
  const joinedOnly = joinedOrgs.filter((o) => !createdOrgs.some((c) => c.orgId === o.orgId));

  const addOrgLabel = createdOrgs.length === 0 ? 'Create Organization' : 'Add Organization';

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          'fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm transition-opacity duration-200',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        aria-hidden="true"
      />

      {/* Slide-out panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace Switcher"
        className={[
          'fixed left-0 top-0 z-[110] flex h-full w-72 flex-col',
          'bg-[#0F0F11] border-r border-[#242427] shadow-2xl',
          'transition-transform duration-[250ms] ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-[#6B7280] hover:bg-[#242427] hover:text-[#F5F5F7] transition-colors"
          aria-label="Close workspace switcher"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Profile card ────────────────────────────────────── */}
        <div className="flex items-center gap-3 border-b border-[#242427] px-4 py-5 pr-10">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#FF453A] text-white font-semibold text-sm overflow-hidden">
            {avatarUrl ? (
              <img
                src={`http://localhost:3001${avatarUrl}`}
                alt={displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#F5F5F7]">{displayName}</p>
            <p className="truncate text-xs text-[#6B7280]">{displayEmail}</p>
          </div>
        </div>

        {/* ── Scrollable list ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto py-2">

          {/* WORKSPACES header */}
          <div className="px-4 pt-2 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4B5563]">
              Workspaces
            </p>
          </div>

          {/* Personal Workspace */}
          <button
            onClick={handleSwitchToPersonal}
            className={[
              'flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors',
              isPersonal
                ? 'bg-[#1C1C1F] text-[#F5F5F7]'
                : 'text-[#9CA3AF] hover:bg-[#1C1C1F] hover:text-[#F5F5F7]',
            ].join(' ')}
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#242427]">
              <User className="h-3.5 w-3.5 text-[#9CA3AF]" />
            </div>
            <span className="flex-1 text-left truncate">Personal Workspace</span>
            {isPersonal && <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#FF453A]" />}
          </button>

          {/* ── JOINED ORGANIZATIONS ── */}
          {joinedOnly.length > 0 && (
            <>
              <div className="mt-3 px-4 pt-2 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4B5563]">
                  Joined Organizations
                </p>
              </div>
              {joinedOnly.map((org) => (
                <OrgRow
                  key={org.orgId}
                  orgId={org.orgId}
                  orgName={org.name}
                  isActive={activeOrgId === org.orgId}
                  onClick={() => handleOrgClick(org.orgId, org.name)}
                />
              ))}
            </>
          )}

          {/* ── CREATED ORGANIZATIONS ── */}
          {createdOrgs.length > 0 && (
            <>
              <div className="mt-3 px-4 pt-2 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4B5563]">
                  Created Organizations
                </p>
              </div>
              {createdOrgs.map((org) => (
                <OrgRow
                  key={org.orgId}
                  orgId={org.orgId}
                  orgName={org.name}
                  isActive={activeOrgId === org.orgId}
                  onClick={() => handleOrgClick(org.orgId, org.name)}
                />
              ))}
            </>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div className="border-t border-[#242427] py-2">

          {/* Add / Create Organization */}
          <button
            onClick={() => { onClose(); navigate('/create-org'); }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#9CA3AF] hover:bg-[#1C1C1F] hover:text-[#F5F5F7] transition-colors"
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#242427]">
              <Plus className="h-3.5 w-3.5" />
            </div>
            {addOrgLabel}
          </button>

          {/* Pending Invitations */}
          <button
            onClick={() => { onClose(); navigate('/pending-invitations'); }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#9CA3AF] hover:bg-[#1C1C1F] hover:text-[#F5F5F7] transition-colors"
          >
            <div className="relative flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#242427]">
              <Mail className="h-3.5 w-3.5" />
              {pendingCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#FF453A] text-[9px] font-bold text-white">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </div>
            <span className="flex-1 text-left">Pending Invitations</span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-[#FF453A]/20 px-2 py-0.5 text-xs font-semibold text-[#FF453A]">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#9CA3AF] hover:bg-[#1C1C1F] hover:text-[#FF453A] transition-colors"
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#242427]">
              <LogOut className="h-3.5 w-3.5" />
            </div>
            Logout
          </button>
        </div>
      </div>

      {/* Switch confirmation modal */}
      {confirmOrg && (
        <SwitchConfirmModal
          orgName={confirmOrg.name}
          orgId={confirmOrg.id}
          onCancel={() => setConfirmOrg(null)}
          onSwitch={handleConfirmSwitch}
        />
      )}
    </>
  );
};

/** Single organization row. */
interface OrgRowProps {
  orgId:    string;
  orgName:  string;
  isActive: boolean;
  onClick:  () => void;
}

const OrgRow = ({ orgId: _orgId, orgName, isActive, onClick }: OrgRowProps) => (
  <button
    onClick={onClick}
    className={[
      'flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors',
      isActive
        ? 'bg-[#1C1C1F] text-[#F5F5F7]'
        : 'text-[#9CA3AF] hover:bg-[#1C1C1F] hover:text-[#F5F5F7]',
    ].join(' ')}
  >
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#242427]">
      <Building2 className="h-3.5 w-3.5 text-[#9CA3AF]" />
    </div>
    <span className="flex-1 text-left truncate">{orgName}</span>
    {isActive && <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#FF453A]" />}
  </button>
);

export default WorkspaceSwitcher;
