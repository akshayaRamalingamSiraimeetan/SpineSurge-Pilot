import { Server, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import QuickActionCard from '@/components/dashboard/QuickActionCard';
import RecentStudiesSection from '@/components/dashboard/RecentStudiesSection';
import UnfinishedStudiesSection from '@/components/dashboard/UnfinishedStudiesSection';

/**
 * DashboardPage
 * Personal landing page after onboarding completes.
 * Shown after Create Organization or Join Organization.
 *
 * Route: /dashboard
 * Guards: RequireAuth → RequireVerified → RequireProfile → RequireOrg → DashboardLayout
 */
const DashboardPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* ── Quick Action Cards ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold text-[#F5F5F7] uppercase tracking-wide">
          Get Started
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <QuickActionCard
            icon={<Server className="h-5 w-5" />}
            title="Configure PACS"
            description="Connect your imaging system"
            onClick={() => {
              // Placeholder — PACS configuration not yet implemented
              console.log('[DashboardPage] Configure PACS clicked — stub');
            }}
          />
          <QuickActionCard
            icon={<UserPlus className="h-5 w-5" />}
            title="Invite Members"
            description="Add your team to get started"
            onClick={() => navigate('/members')}
          />
        </div>
      </section>

      {/* ── Recent Studies ─────────────────────────────────────────── */}
      <RecentStudiesSection />

      {/* ── Unfinished Studies ─────────────────────────────────────── */}
      <UnfinishedStudiesSection />
    </div>
  );
};

export default DashboardPage;
