import { Button } from '@/components/ui/button';

interface EmptyStateCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * EmptyStateCard
 * Generic empty-state renderer used in Recent Studies and Unfinished Studies.
 */
const EmptyStateCard = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateCardProps) => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[#242427] bg-[#0F0F11] py-14 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#1B1B1E] text-[#6B7280]">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-[#F5F5F7]">{title}</p>
        <p className="mt-1 text-xs text-[#6B7280] max-w-xs mx-auto">{description}</p>
      </div>
      {actionLabel && onAction && (
        <Button
          size="sm"
          onClick={onAction}
          className="mt-1 h-8 rounded-md bg-[#FF453A] text-white text-xs font-semibold hover:bg-[#e03d33]"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export default EmptyStateCard;
