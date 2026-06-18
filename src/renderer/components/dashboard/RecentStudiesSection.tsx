import { FolderOpen, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';
import EmptyStateCard from './EmptyStateCard';

interface StudyRow {
  id: string;
  patientName: string;
  modality: string;
  acquisitionDate: string;
}

/**
 * RecentStudiesSection
 * Reads from the Zustand patients store and surfaces the most recent
 * studies across all patients (up to 5). Falls back to empty state.
 */
const RecentStudiesSection = () => {
  const navigate = useNavigate();
  const patients = useAppStore((state) => state.patients);

  // Flatten all studies from all patients and sort by acquisitionDate desc
  const recentStudies: StudyRow[] = patients
    .flatMap((p) =>
      (p.studies ?? []).map((s) => ({
        id:              s.id,
        patientName:     p.name,
        modality:        s.modality,
        acquisitionDate: s.acquisitionDate ?? '—',
      }))
    )
    .sort((a, b) => {
      // Sort newest first; fall back to string comparison
      return b.acquisitionDate.localeCompare(a.acquisitionDate);
    })
    .slice(0, 5);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#F5F5F7] uppercase tracking-wide">
          Recent Studies
        </h2>
        {recentStudies.length > 0 && (
          <button
            onClick={() => navigate('/cases')}
            className="text-xs text-[#9CA3AF] hover:text-[#F5F5F7] transition-colors"
          >
            View all
          </button>
        )}
      </div>

      {recentStudies.length === 0 ? (
        <EmptyStateCard
          icon={<FolderOpen className="h-6 w-6" />}
          title="No studies yet"
          description="Upload your first study to get started."
          actionLabel="New Study"
          onAction={() => navigate('/workspace')}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recentStudies.map((study) => (
            <button
              key={study.id}
              onClick={() => navigate('/workspace')}
              className="group flex flex-col gap-2 rounded-xl border border-[#242427] bg-[#141416] p-4 text-left transition-colors hover:border-[#3A3A3E] hover:bg-[#1B1B1E]"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#242427]">
                  <FolderOpen className="h-4 w-4 text-[#9CA3AF]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#F5F5F7]">
                    {study.patientName}
                  </p>
                  <p className="text-xs text-[#6B7280]">{study.modality}</p>
                </div>
              </div>
              <p className="text-xs text-[#6B7280]">{study.acquisitionDate}</p>
            </button>
          ))}
          {/* Add new study tile */}
          <button
            onClick={() => navigate('/workspace')}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#242427] bg-transparent p-4 text-[#6B7280] transition-colors hover:border-[#3A3A3E] hover:text-[#9CA3AF]"
          >
            <Plus className="h-5 w-5" />
            <span className="text-xs">New Study</span>
          </button>
        </div>
      )}
    </section>
  );
};

export default RecentStudiesSection;
