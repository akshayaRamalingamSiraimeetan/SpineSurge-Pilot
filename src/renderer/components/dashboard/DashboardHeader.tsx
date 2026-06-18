import { Bell, ChevronDown, Plus, Users } from 'lucide-react';
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
  const user = useAppStore((state) => state.user);
  const navigate = useNavigate();

  const displayName = user?.name ?? user?.email ?? 'Doctor';

  return (
    <header className="flex items-center justify-between px-8 py-5 border-b border-[#242427] bg-[#0A0A0B]">
      {/* Left: greeting */}
      <div>
        <h1 className="text-xl font-semibold text-[#F5F5F7] tracking-tight">
          {getGreeting()}
        </h1>
        <p className="mt-0.5 text-sm text-[#6B7280]">
          Let's continue your work{displayName ? `, ${displayName}` : ''}.
        </p>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* View Members */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/members')}
          className="h-9 gap-2 rounded-lg border-[#242427] bg-[#141416] text-[#9CA3AF] hover:bg-[#242427] hover:text-[#F5F5F7] text-sm"
        >
          <Users className="h-4 w-4" />
          View Members
        </Button>

        {/* Notification bell */}
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#242427] bg-[#141416] text-[#9CA3AF] hover:bg-[#242427] hover:text-[#F5F5F7] transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* New Study */}
        <Button
          size="sm"
          className="h-9 gap-2 rounded-lg bg-[#FF453A] text-white font-semibold hover:bg-[#e03d33] text-sm"
          onClick={() => navigate('/workspace')}
        >
          <Plus className="h-4 w-4" />
          New Study
        </Button>

        {/* More actions */}
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#242427] bg-[#141416] text-[#9CA3AF] hover:bg-[#242427] hover:text-[#F5F5F7] transition-colors"
          aria-label="More actions"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;
