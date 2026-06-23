import { CheckCircle2, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, getStudyDisplayName } from '@/lib/store/index';
import EmptyStateCard from './EmptyStateCard';

interface UnfinishedRow {
  id:          string;
  studyName:   string;
  diagnosis:   string;
  lastEdited:  string;
  status:      string;
  patientId:   string;
  contextId:   string;
}

/**
 * UnfinishedStudiesSection
 * Surfaces contexts whose mode is 'plan' — these represent in-progress
 * planning sessions the user hasn't finalized. Falls back to empty state.
 */
const UnfinishedStudiesSection = () => {
  const navigate   = useNavigate();
  const patients   = useAppStore((state) => state.patients);
  const contexts   = useAppStore((state) => state.contexts);

  // Build a quick lookup: patientId → patient
  const patientMap = new Map(patients.map((p) => [p.id, p]));

  // Contexts in 'plan' mode are "unfinished"
  const rows: UnfinishedRow[] = contexts
    .filter((c) => c.mode === 'plan')
    .map((c) => {
      const patient = patientMap.get(c.patientId);
      const visit   = patient?.visits?.find((v) => v.id === c.visitId);
      const linkedStudy = patient?.studies?.find(s => c.studyIds?.includes(s.id))
        || patient?.visits?.flatMap(v => v.studies || []).find(s => c.studyIds?.includes(s.id));
      return {
        id:         c.id,
        studyName:  linkedStudy ? getStudyDisplayName(linkedStudy) : (c.name || 'Untitled Study'),
        diagnosis:  visit?.diagnosis || '—',
        lastEdited: c.lastModified || '—',
        status:     linkedStudy?.status || 'In Progress',
        patientId:  c.patientId,
        contextId:  c.id,
      };
    })
    .slice(0, 10);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#F5F5F7] uppercase tracking-wide">
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
        <div className="overflow-hidden rounded-xl border border-[#242427] bg-[#141416]">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 border-b border-[#242427] px-5 py-3">
            {['Study Name', 'Diagnosis', 'Last Edited', 'Status', 'Action'].map((col) => (
              <span key={col} className="text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                {col}
              </span>
            ))}
          </div>

          {/* Table rows */}
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className={[
                'grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 items-center px-5 py-3.5 transition-colors hover:bg-[#1B1B1E]',
                idx < rows.length - 1 ? 'border-b border-[#1E1E21]' : '',
              ].join(' ')}
            >
              {/* Study Name */}
              <span className="truncate text-sm font-medium text-[#F5F5F7]">
                {row.studyName}
              </span>

              {/* Diagnosis */}
              <span className="truncate text-sm text-[#9CA3AF]">{row.diagnosis}</span>

              {/* Last Edited */}
              <span className="text-sm text-[#9CA3AF]">{row.lastEdited}</span>

              {/* Status badge */}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF453A]/10 px-2.5 py-0.5 text-xs font-medium text-[#FF453A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FF453A]" />
                {row.status}
              </span>

              {/* Action */}
              <button
                onClick={() => navigate(`/workspace?patientId=${row.patientId}&contextId=${row.contextId}`)}
                className="flex items-center gap-1.5 rounded-md border border-[#242427] bg-[#1B1B1E] px-3 py-1.5 text-xs text-[#9CA3AF] transition-colors hover:bg-[#242427] hover:text-[#F5F5F7]"
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
