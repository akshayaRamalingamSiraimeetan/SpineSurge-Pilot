import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, UserMinus, Ban, Users, Mail, X, Plus, RefreshCw, ExternalLink } from 'lucide-react';
import { useAppStore } from '@/lib/store/index';
import { API_BASE } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id:        string;
  userId:    string;
  email:     string;
  fullName:  string | null;
  avatarUrl: string | null;
  role:      string;
  status:    'active' | 'removed' | 'blacklisted';
  joinedAt:  string;
}

interface Invitation {
  id:           string;
  invitedEmail: string;
  role:         string;
  status:       string;
  createdAt:    string;
  acceptedAt:   string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


/** 'viewer' is the stored role of every non-admin member — shown as Member (UI12-10). */
const roleLabel = (role: string) => (role === 'admin' ? 'Admin' : 'Member');
const STATUS_COLORS: Record<string, string> = {
  active:      'bg-emerald-500/10 text-emerald-400',
  removed:     'bg-[#FF453A]/10 text-[#FF453A]',
  blacklisted: 'bg-orange-500/10 text-orange-400',
  pending:     'bg-yellow-500/10 text-yellow-400',
  accepted:    'bg-emerald-500/10 text-emerald-400',
  declined:    'bg-[#FF453A]/10 text-[#FF453A]',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
};

function getInitials(name: string | null, email: string): string {
  const src = name ?? email;
  return src.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Invite Modal (admin only) ────────────────────────────────────────────────

interface InviteModalProps {
  orgId: string; token: string; onClose: () => void; onSent: () => void;
}

const InviteModal = ({ orgId, token, onClose, onSent }: InviteModalProps) => {
  const [inputValue, setInputValue] = useState('');
  const [chips, setChips]           = useState<string[]>([]);
  const [error, setError]           = useState('');
  const [sending, setSending]       = useState(false);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const addChip = () => {
    const t = inputValue.trim().toLowerCase();
    if (!t) return;
    if (!EMAIL_RE.test(t)) { setError('Invalid email address'); return; }
    if (chips.includes(t)) { setError('Already added'); return; }
    setChips(p => [...p, t]); setInputValue(''); setError('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(); }
    if (e.key === 'Backspace' && !inputValue && chips.length > 0) setChips(p => p.slice(0, -1));
  };

  const handleSend = async () => {
    const all = [...chips];
    if (inputValue.trim() && EMAIL_RE.test(inputValue.trim())) all.push(inputValue.trim().toLowerCase());
    if (all.length === 0) { setError('Add at least one email'); return; }
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ org_id: orgId, emails: all, role: 'viewer' }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Failed'); return; }
      onSent(); onClose();
    } catch { setError('Network error'); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text)]">Invite Members</h3>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Email Addresses</label>
        <div
          className="flex min-h-[44px] flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--sidebar)] px-3 py-2 focus-within:border-[#FF453A] transition-colors cursor-text"
          onClick={() => (document.getElementById('invite-email-input') as HTMLInputElement)?.focus()}
        >
          {chips.map(e => (
            <span key={e} className="flex items-center gap-1 rounded-md bg-[var(--surface-3)] px-2 py-0.5 text-xs text-[var(--text)]">
              {e}
              <button type="button" onClick={() => setChips(p => p.filter(c => c !== e))} className="text-[var(--text-3)] hover:text-[#FF453A]"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <input id="invite-email-input" type="email" value={inputValue}
            onChange={e => { setInputValue(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown} onBlur={addChip}
            placeholder={chips.length === 0 ? 'name@hospital.com, …' : ''}
            className="flex-1 min-w-[140px] bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)]" />
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-3)]">Press Enter or comma to add multiple emails.</p>
        {error && <p className="mt-1 text-xs text-[#FF453A]">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-[var(--border)] bg-transparent py-2.5 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors">Cancel</button>
          <button onClick={handleSend} disabled={sending} className="flex-1 rounded-lg bg-[#FF453A] py-2.5 text-sm font-semibold text-white hover:bg-[#e03d33] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {sending ? 'Sending…' : 'Send Invitations'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Confirm Modal ────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string; body: string; action: string; variant: 'danger' | 'warning';
  onConfirm: () => void; onCancel: () => void;
}

const ConfirmModal = ({ title, body, action, variant, onConfirm, onCancel }: ConfirmModalProps) => (
  <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--text-2)]">{body}</p>
      <div className="mt-5 flex gap-3">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-[var(--border)] bg-transparent py-2 text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors">Cancel</button>
        <button onClick={onConfirm} className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white transition-colors ${variant === 'danger' ? 'bg-[#FF453A] hover:bg-[#e03d33]' : 'bg-orange-500 hover:bg-orange-600'}`}>{action}</button>
      </div>
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

/**
 * OrgMembersPage
 *
 * Permission model:
 *   All active members → can view the member list (active members only visible to non-admins)
 *   Admins only        → can invite, remove, blacklist, see all statuses, see Invitations tab
 *
 * Route: /members  (inside DashboardLayout)
 */
const OrgMembersPage = () => {
  const navigate        = useNavigate();
  const activeWorkspace = useAppStore(s => s.activeWorkspace);
  const token           = useAppStore(s => s.token);
  const user            = useAppStore(s => s.user);

  const orgId = activeWorkspace.type === 'organization' ? activeWorkspace.orgId : null;

  const [tab,           setTab]           = useState<'members' | 'invitations'>('members');
  const [members,       setMembers]       = useState<Member[]>([]);
  const [invitations,   setInvitations]   = useState<Invitation[]>([]);
  const [isAdmin,       setIsAdmin]       = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [search,        setSearch]        = useState('');
  const [showInvite,    setShowInvite]    = useState(false);
  const [confirm,       setConfirm]       = useState<{ membershipId: string; memberName: string; action: 'removed' | 'blacklisted' } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  // Reset on org change, ignore stale responses, surface errors (BUGS NAV-20).
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchSeq = useRef(0);
  const fetchData = async () => {
    if (!orgId || !token) return;
    const seq = ++fetchSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const membersRes = await fetch(`${API_BASE}/orgs/${orgId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (seq !== fetchSeq.current) return;
      if (!membersRes.ok) {
        setMembers([]);
        setIsAdmin(false);
        setLoadError(membersRes.status === 403 ? 'You no longer have access to this organization.' : 'Could not load members.');
        return;
      }
      const data = await membersRes.json();
      if (seq !== fetchSeq.current) return;
      if (Array.isArray(data)) {
        setMembers(data);
      } else {
        setMembers(data.members ?? []);
        setIsAdmin(data.isAdmin ?? false);
      }

      const invitesRes = await fetch(`${API_BASE}/invitations/org/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (seq !== fetchSeq.current) return;
      setInvitations(invitesRes.ok ? await invitesRes.json() : []);
    } catch {
      if (seq === fetchSeq.current) setLoadError('Network error — please try again.');
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    setMembers([]);
    setInvitations([]);
    setIsAdmin(false);
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, token]);

  // ── Member action (admin only) ────────────────────────────────────────────
  const handleMemberAction = async (membershipId: string, status: 'removed' | 'blacklisted') => {
    if (!orgId || !token || !isAdmin) return;
    setActionLoading(membershipId);
    try {
      const res = await fetch(`${API_BASE}/orgs/${orgId}/members/${membershipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setMembers(prev => prev.map(m => m.id === membershipId ? { ...m, status } : m));
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? d.message ?? 'Could not update this member.');
      }
    } catch {
      alert('Network error — please try again.');
    } finally {
      setActionLoading(null);
      setConfirm(null);
    }
  };

  // ── Filtering ─────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filteredMembers     = members.filter(m => !q || (m.fullName ?? '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  const filteredInvitations = invitations.filter(i => !q || i.invitedEmail.toLowerCase().includes(q));

  // ── Guard: personal workspace ─────────────────────────────────────────────
  if (!orgId) {
    return (
      <div className="mx-auto max-w-5xl pt-16 text-center">
        <Users className="mx-auto mb-4 h-12 w-12 text-[var(--text-3)]" />
        <h2 className="text-lg font-semibold text-[var(--text)]">No Organization Selected</h2>
        <p className="mt-2 text-sm text-[var(--text-3)]">Switch to an organization workspace to view its members.</p>
        <button onClick={() => navigate('/dashboard')} className="mt-6 rounded-lg bg-[#FF453A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e03d33] transition-colors">Back to Dashboard</button>
      </div>
    );
  }

  // ── Tabs available ────────────────────────────────────────────────────────
  // Non-admins only see Members tab; Invitations tab is admin-only
  const availableTabs = isAdmin
    ? (['members', 'invitations'] as const)
    : (['members'] as const);

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text)]">Organization Members</h1>
            <p className="text-sm text-[var(--text-3)]">{isAdmin ? 'Admin view — manage members and invitations' : 'Member view'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loading} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-50 transition-colors" aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {/* Invite button — admin only */}
          {isAdmin && (
            <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 rounded-lg bg-[#FF453A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e03d33] transition-colors">
              <Plus className="h-4 w-4" /> Invite Members
            </button>
          )}
        </div>
      </div>

      {/* ── Who can do what (UI12-10) ─────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { t: 'Admin / owner', d: "Everything a member can do, plus: invite and remove members, and open every member's studies in this organization view-only (eye icon → View workspace). Can't change their plans." },
          { t: 'Member', d: "Their own patients and studies — fully theirs to edit. Sees other people's studies only when shared with them (Patients → Shared with me), with view or edit rights." },
        ].map(({ t, d }) => (
          <div key={t} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="text-xs font-semibold text-[var(--text)]">{t}</div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">{d}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 w-fit">
        {availableTabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-[var(--surface-3)] text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'}`}>
            {t === 'members' ? `Members (${members.length})` : `Invitations (${invitations.length})`}
          </button>
        ))}
      </div>

      {/* ── Search ──────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'members' ? 'Search by name or email…' : 'Search by email…'}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-10 pr-4 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-3)] focus:border-[#FF453A] transition-colors" />
      </div>

      {/* ── Members Table ────────────────────────────────────────── */}
      {tab === 'members' && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {/* Column headers — show Actions col only for admins */}
          <div className={`grid ${isAdmin ? 'grid-cols-[2.5fr_2fr_1fr_1fr_1.5fr_auto]' : 'grid-cols-[2.5fr_2fr_1fr_1fr_1.5fr]'} gap-4 border-b border-[var(--border)] px-5 py-3`}>
            {['Profile', 'Email', 'Role', 'Status', 'Joined On', ...(isAdmin ? ['Actions'] : [])].map(col => (
              <span key={col} className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">{col}</span>
            ))}
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-[var(--text-3)]">Loading…</div>
          ) : loadError ? (
            <div className="py-12 text-center text-sm text-[#FF453A]">{loadError}</div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--text-3)]">{search ? 'No members match your search.' : 'No members yet.'}</div>
          ) : (
            filteredMembers.map((member, idx) => {
              const isSelf    = member.userId === user?.id;
              const isLoading = actionLoading === member.id;
              return (
                <div key={member.id} className={`grid ${isAdmin ? 'grid-cols-[2.5fr_2fr_1fr_1fr_1.5fr_auto]' : 'grid-cols-[2.5fr_2fr_1fr_1fr_1.5fr]'} gap-4 items-center px-5 py-3.5 transition-colors hover:bg-[var(--surface-2)] ${idx < filteredMembers.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>

                  {/* Profile */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#FF453A] text-white text-xs font-semibold overflow-hidden">
                      {member.avatarUrl
                        ? <img src={`${API_BASE}${member.avatarUrl}`} alt="" className="h-full w-full object-cover" />
                        : getInitials(member.fullName, member.email)}
                    </div>
                    <span className="truncate text-sm font-medium text-[var(--text)]">
                      {member.fullName ?? '—'}
                      {isSelf && <span className="ml-1.5 text-xs text-[var(--text-3)]">(you)</span>}
                    </span>
                  </div>

                  {/* Email */}
                  <span className="truncate text-sm text-[var(--text-2)]">{member.email}</span>

                  {/* Role */}
                  <span className="text-sm text-[var(--text-2)]">{roleLabel(member.role)}</span>

                  {/* Status */}
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[member.status] ?? ''}`}>
                    {capitalize(member.status)}
                  </span>

                  {/* Joined On */}
                  <span className="text-sm text-[var(--text-2)]">{formatDate(member.joinedAt)}</span>

                  {/* Actions — admin only */}
                  {isAdmin && (
                    <div className="flex items-center gap-1.5">
                      {/* View Workspace — always visible to admins for any member */}
                      <button
                        onClick={() => navigate(`/members/${member.userId}/workspace`)}
                        title="View this member's studies (view only)"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:border-[var(--border-strong)] hover:text-[var(--text)] transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>

                      {!isSelf && member.status === 'active' ? (
                        <>
                          <button
                            onClick={() => setConfirm({ membershipId: member.id, memberName: member.fullName ?? member.email, action: 'removed' })}
                            disabled={isLoading}
                            title="Remove member"
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:border-[#FF453A] hover:text-[#FF453A] disabled:opacity-50 transition-colors"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirm({ membershipId: member.id, memberName: member.fullName ?? member.email, action: 'blacklisted' })}
                            disabled={isLoading}
                            title="Blacklist member"
                            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)] hover:border-orange-500 hover:text-orange-400 disabled:opacity-50 transition-colors"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        !isSelf && <span className="text-xs text-[var(--text-3)]">—</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Invitations Table (admin only) ───────────────────────── */}
      {tab === 'invitations' && isAdmin && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr] gap-4 border-b border-[var(--border)] px-5 py-3">
            {['Email', 'Role', 'Invited On', 'Status'].map(col => (
              <span key={col} className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">{col}</span>
            ))}
          </div>
          {loading ? (
            <div className="py-12 text-center text-sm text-[var(--text-3)]">Loading…</div>
          ) : filteredInvitations.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--text-3)]">{search ? 'No invitations match your search.' : 'No invitations sent yet.'}</div>
          ) : (
            filteredInvitations.map((inv, idx) => (
              <div key={inv.id} className={`grid grid-cols-[2fr_1fr_1.5fr_1fr] gap-4 items-center px-5 py-3.5 transition-colors hover:bg-[var(--surface-2)] ${idx < filteredInvitations.length - 1 ? 'border-b border-[var(--border)]' : ''}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)]">
                    <Mail className="h-3.5 w-3.5 text-[var(--text-3)]" />
                  </div>
                  <span className="truncate text-sm text-[var(--text)]">{inv.invitedEmail}</span>
                </div>
                <span className="text-sm text-[var(--text-2)]">{roleLabel(inv.role)}</span>
                <span className="text-sm text-[var(--text-2)]">{formatDate(inv.createdAt)}</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium w-fit ${STATUS_COLORS[inv.status] ?? 'text-[var(--text-2)]'}`}>
                  {capitalize(inv.status)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────── */}
      {showInvite && isAdmin && orgId && token && (
        <InviteModal orgId={orgId} token={token} onClose={() => setShowInvite(false)} onSent={fetchData} />
      )}

      {confirm && isAdmin && (
        <ConfirmModal
          title={confirm.action === 'removed' ? 'Remove Member' : 'Blacklist Member'}
          body={confirm.action === 'removed'
            ? `Remove ${confirm.memberName} from this organization? They lose access immediately. The record is kept for audit history.`
            : `Blacklist ${confirm.memberName}? They will be permanently blocked from this organization.`}
          action={confirm.action === 'removed' ? 'Remove' : 'Blacklist'}
          variant={confirm.action === 'removed' ? 'danger' : 'warning'}
          onConfirm={() => handleMemberAction(confirm.membershipId, confirm.action)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default OrgMembersPage;
