import { Outlet } from 'react-router-dom';
import DashboardSidebar from './DashboardSidebar';
import DashboardHeader from './DashboardHeader';

/**
 * DashboardLayout
 * Wraps all /dashboard/* routes.
 * Completely separate from MainLayout (canvas workspace).
 */
const DashboardLayout = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0A0A0B]">
      <DashboardSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader />

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
