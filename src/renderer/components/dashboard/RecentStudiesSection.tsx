import { FolderOpen, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, getStudyDisplayName } from '@/lib/store/index';
import EmptyStateCard from './EmptyStateCard';

interface StudyRow {
  id: string;
  patientId: string;
  patientName: string;
  studyTitle: string;
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
        patientId:       p.id,
        patientName:     p.name,
        studyTitle:      getStudyDisplayName(s),
        modality:        s.modality,
        acquisitionDate: s.acquisitionDate ?? '—',
      }))
    )
    // Newest first by parsed date (mixed "Mar 05, 2025" / ISO formats — NAV-31)
    .sort((a, b) => (Date.parse(b.acquisitionDate) || 0) - (Date.parse(a.acquisitionDate) || 0))
    .slice(0, 5);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">
          Recent Studies
        </h2>
        {recentStudies.length > 0 && (
          <button
            onClick={() => navigate('/patients')}
            className="text-xs text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
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
          onAction={() => {
            useAppStore.getState().resetWorkspace();
            navigate('/workspace');
          }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recentStudies.map((study) => (
            <button
              key={study.id}
              onClick={async () => {
                // Open THIS study, not whatever was loaded last (NAV-15)
                await useAppStore.getState().openStudy(study.patientId, study.id);
                navigate('/workspace');
              }}
              className="group flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--surface-3)]">
                  <FolderOpen className="h-4 w-4 text-[var(--text-2)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">
                    {study.studyTitle}
                  </p>
                  <p className="text-xs text-[var(--text-3)]">{study.patientName} · {study.modality}</p>
                </div>
              </div>
              <p className="text-xs text-[var(--text-3)]">{study.acquisitionDate}</p>
            </button>
          ))}
          {/* Add new study tile */}
          <button
            onClick={() => {
              useAppStore.getState().resetWorkspace();
              navigate('/workspace');
            }}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-transparent p-4 text-[var(--text-3)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-2)]"
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
