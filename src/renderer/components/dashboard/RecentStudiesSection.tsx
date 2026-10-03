import { useMemo } from 'react';
import { FolderOpen, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';
import { StudyCard } from '@/components/StudyCard';
import { visibleStudies } from '@/lib/studies';
import { destroyCornerstone } from '@/lib/cornerstone/initCornerstone';
import EmptyStateCard from './EmptyStateCard';

/**
 * Recent Studies — the 6 newest studies from the same list as the Patients
 * page, drawn with the same StudyCard (UI9-01).
 */
const RecentStudiesSection = () => {
  const navigate = useNavigate();
  const patients = useAppStore((state) => state.patients);
  const recent = useMemo(() => visibleStudies(patients).slice(0, 6), [patients]);

  const openStudy = async (patientId: string, studyId: string) => {
    if (useAppStore.getState().isDicomMode) destroyCornerstone();
    await useAppStore.getState().openStudy(patientId, studyId);
    navigate('/workspace');
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">Recent Studies</h2>
        {recent.length > 0 && (
          <button onClick={() => navigate('/patients')} className="text-xs text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
            View all
          </button>
        )}
      </div>

      {recent.length === 0 ? (
        <EmptyStateCard
          icon={<FolderOpen className="h-6 w-6" />}
          title="No studies yet"
          description="Upload your first study to get started."
          actionLabel="New Study"
          onAction={() => {
            useAppStore.getState().resetWorkspace();
            navigate('/workspace');
          }}
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {recent.map(({ patient, study }) => (
            <StudyCard
              key={study.id}
              study={study}
              patientId={patient.id}
              onOpenWorkspace={() => void openStudy(patient.id, study.id)}
            />
          ))}
          <button
            onClick={() => {
              useAppStore.getState().resetWorkspace();
              navigate('/workspace');
            }}
            className="flex min-h-[80px] items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-transparent p-4 text-[var(--text-3)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-2)]"
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
