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
      className="group flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition-all hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF453A]"
    >
      {/* Icon container */}
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-3)] text-[var(--text-2)] group-hover:text-[#FF453A] transition-colors">
        {icon}
      </div>

      {/* Text */}
      <div className="flex-1">
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--text-3)]">{description}</p>
      </div>

      {/* Arrow */}
      <ArrowRight className="h-4 w-4 text-[var(--text-3)] group-hover:text-[#FF453A] transition-colors self-end" />
    </button>
  );
};

export default QuickActionCard;
