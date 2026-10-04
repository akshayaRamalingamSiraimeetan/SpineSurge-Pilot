import { Server, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';
import QuickActionCard from '@/components/dashboard/QuickActionCard';
import RecentStudiesSection from '@/components/dashboard/RecentStudiesSection';
import UnfinishedStudiesSection from '@/components/dashboard/UnfinishedStudiesSection';

/**
 * DashboardPage
 *
 * Data is always scoped to the caller's own studies in the active workspace.
 * Admins see only their own studies here — member inspection is via View Members.
 *
 * Route: /dashboard
 */
const DashboardPage = () => {
  const navigate        = useNavigate();
  const activeWorkspace = useAppStore(s => s.activeWorkspace);
  const joinedOrgs      = useAppStore(s => s.joinedOrgs);
  const createdOrgs     = useAppStore(s => s.createdOrgs);

  const isOrgWorkspace = activeWorkspace.type === 'organization';

  // Derive the caller's role in the active org from the cached org lists
  const activeOrgRole = (() => {
    if (!isOrgWorkspace) return null;
    const orgId   = (activeWorkspace as { type: 'organization'; orgId: string }).orgId;
    const inJoined  = joinedOrgs.find(o => o.orgId === orgId);
    const inCreated = createdOrgs.find(o => o.orgId === orgId);
    return inCreated?.role ?? inJoined?.role ?? null;
  })();

  const isAdmin = activeOrgRole === 'admin';

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* ── Quick Action Cards — admin only (members don't configure PACS; UI12-10) ── */}
      {isOrgWorkspace && isAdmin && (
        <section>
          <h2 className="mb-4 text-sm font-semibold text-[var(--text)] uppercase tracking-wide">
            Get Started
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <QuickActionCard
              icon={<Server className="h-5 w-5" />}
              title="Configure PACS"
              description="Coming soon — connect your imaging system"
              onClick={() => alert('PACS configuration is coming soon. Contact support to connect your PACS.')}
            />
            {/* Invite Members — admin only */}
            {isAdmin && (
              <QuickActionCard
                icon={<UserPlus className="h-5 w-5" />}
                title="Invite Members"
                description="Add your team to get started"
                onClick={() => navigate('/members')}
              />
            )}
          </div>
        </section>
      )}

      {/* ── Recent Studies ─────────────────────────────────────────── */}
      <RecentStudiesSection />

      {/* ── Unfinished Studies ─────────────────────────────────────── */}
      <UnfinishedStudiesSection />
    </div>
  );
};

export default DashboardPage;
