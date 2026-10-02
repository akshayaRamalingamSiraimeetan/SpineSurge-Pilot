import { Outlet, useLocation } from 'react-router-dom';
import DashboardSidebar from './DashboardSidebar';
import DashboardHeader from './DashboardHeader';
import { ShareDialog } from '@/features/navigation/ShareDialog';

/**
 * DashboardLayout
 * Wraps all /dashboard/* routes.
 * Completely separate from MainLayout (canvas workspace).
 */
const DashboardLayout = () => {
  // The Patients page is a full-height two-pane view: no greeting header, and
  // each pane scrolls on its own (list on the left, studies on the right).
  const isPatientsPage = useLocation().pathname === '/patients';
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)]">
      <DashboardSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {!isPatientsPage && <DashboardHeader />}

        <main className={isPatientsPage ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 overflow-y-auto px-8 py-6'}>
          <Outlet />
        </main>
      </div>
      <ShareDialog />
    </div>
  );
};

export default DashboardLayout;
