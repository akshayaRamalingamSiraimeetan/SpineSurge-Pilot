import { CheckCircle2, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, getStudyDisplayName } from '@/lib/store/index';
import EmptyStateCard from './EmptyStateCard';
import { visibleStudies } from '@/lib/studies';
import { destroyCornerstone } from '@/lib/cornerstone/initCornerstone';

interface UnfinishedRow {
  id:          string;
  studyName:   string;
  diagnosis:   string;
  lastEdited:  string;
  status:      string;
  patientId:   string;
  studyId:     string;
}

const DONE = new Set(['Completed', 'Archived']);

/**
 * UnfinishedStudiesSection
 * Studies across ALL loaded patients that are not Completed/Archived.
 * (Previously built from `contexts`, which only holds the active patient's
 * sessions — so the list was empty after every refresh. BUGS NAV-16.)
 */
const UnfinishedStudiesSection = () => {
  const navigate   = useNavigate();
  const patients   = useAppStore((state) => state.patients);
  const openStudy  = useAppStore((state) => state.openStudy);

  // Same study list as the Patients page / Recent Studies (UI9-01)
  const rows: UnfinishedRow[] = visibleStudies(patients)
    .filter(({ study: s }) => !DONE.has(String(s.status ?? 'Draft')))
    .map(({ patient: p, study: s }) => ({
      id:         s.id,
      studyName:  `${getStudyDisplayName(s)} · ${p.name || p.id}`,
      diagnosis:  p.visits?.find((v) => v.id === s.visitId)?.diagnosis || '—',
      lastEdited: s.acquisitionDate || '—',
      status:     String(s.status ?? 'Draft'),
      patientId:  p.id,
      studyId:    s.id,
    }))
    .sort((a, b) => (Date.parse(b.lastEdited) || 0) - (Date.parse(a.lastEdited) || 0))
    .slice(0, 10);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">
          Unfinished Studies
        </h2>
      </div>

      {rows.length === 0 ? (
        <EmptyStateCard
          icon={<ClipboardList className="h-6 w-6" />}
          title="No unfinished studies"
          description="You're all caught up. Start a new study to begin planning."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 border-b border-[var(--border)] px-5 py-3">
            {['Study Name', 'Diagnosis', 'Study Date', 'Status', 'Action'].map((col) => (
              <span key={col} className="text-xs font-medium text-[var(--text-3)] uppercase tracking-wide">
                {col}
              </span>
            ))}
          </div>

          {/* Table rows */}
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className={[
                'grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 items-center px-5 py-3.5 transition-colors hover:bg-[var(--surface-2)]',
                idx < rows.length - 1 ? 'border-b border-[var(--border)]' : '',
              ].join(' ')}
            >
              {/* Study Name */}
              <span className="truncate text-sm font-medium text-[var(--text)]">
                {row.studyName}
              </span>

              {/* Diagnosis */}
              <span className="truncate text-sm text-[var(--text-2)]">{row.diagnosis}</span>

              {/* Study date (UI11-43) */}
              <span className="text-sm text-[var(--text-2)]">{row.lastEdited}</span>

              {/* Status badge */}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF453A]/10 px-2.5 py-0.5 text-xs font-medium text-[#FF453A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FF453A]" />
                {row.status}
              </span>

              {/* Action */}
              <button
                onClick={async () => {
                  // Leaving a CT/MR viewer: release its GPU resources first (UI11-43)
                  if (useAppStore.getState().isDicomMode) destroyCornerstone();
                  await openStudy(row.patientId, row.studyId);
                  navigate('/workspace');
                }}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-2)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resume
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default UnfinishedStudiesSection;
