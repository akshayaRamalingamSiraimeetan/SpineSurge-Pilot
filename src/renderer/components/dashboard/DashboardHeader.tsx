import { Bell, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';
import { Button } from '@/components/ui/button';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning!';
  if (hour < 17) return 'Good afternoon!';
  return 'Good evening!';
}

const DashboardHeader = () => {
  const user            = useAppStore((state) => state.user);
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const joinedOrgs      = useAppStore((state) => state.joinedOrgs);
  const createdOrgs     = useAppStore((state) => state.createdOrgs);
  const navigate        = useNavigate();

  const displayName = user?.name ?? user?.email ?? 'Doctor';

  // Resolve workspace display name
  const workspaceLabel = (() => {
    if (activeWorkspace.type === 'personal') return 'Personal Workspace';
    const allOrgs = [...joinedOrgs, ...createdOrgs];
    return allOrgs.find(o => o.orgId === activeWorkspace.orgId)?.name ?? 'Organization';
  })();

  const isOrgWorkspace = activeWorkspace.type === 'organization';

  return (
    <header className="flex items-center justify-between px-8 py-5 border-b border-[var(--border)] bg-[var(--bg)]">
      {/* Left: greeting + workspace badge */}
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)] tracking-tight">
          {getGreeting()}
        </h1>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="text-sm text-[var(--text-3)]">
            Let's continue your work{displayName ? `, ${displayName}` : ''}.
          </p>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-2)]">
            {workspaceLabel}
          </span>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* View Members — visible to all active org members */}
        {isOrgWorkspace && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/members')}
            className="h-9 gap-2 rounded-lg border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] text-sm"
          >
            <Users className="h-4 w-4" />
            View Members
          </Button>
        )}

        {/* Notification bell */}
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

      </div>
    </header>
  );
};

export default DashboardHeader;
