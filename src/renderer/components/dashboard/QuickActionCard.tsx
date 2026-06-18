import { ArrowRight } from 'lucide-react';

interface QuickActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

/**
 * QuickActionCard
 * Used for onboarding actions like Configure PACS and Invite Members.
 */
const QuickActionCard = ({ icon, title, description, onClick }: QuickActionCardProps) => {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-4 rounded-xl border border-[#242427] bg-[#141416] p-5 text-left transition-all hover:border-[#3A3A3E] hover:bg-[#1B1B1E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF453A]"
    >
      {/* Icon container */}
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#242427] text-[#9CA3AF] group-hover:text-[#FF453A] transition-colors">
        {icon}
      </div>

      {/* Text */}
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#F5F5F7]">{title}</p>
        <p className="mt-0.5 text-xs text-[#6B7280]">{description}</p>
      </div>

      {/* Arrow */}
      <ArrowRight className="h-4 w-4 text-[#6B7280] group-hover:text-[#FF453A] transition-colors self-end" />
    </button>
  );
};

export default QuickActionCard;
