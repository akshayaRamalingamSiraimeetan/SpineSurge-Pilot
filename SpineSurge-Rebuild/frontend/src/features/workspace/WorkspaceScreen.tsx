/* Workspace shell — back + patient header, segmented tabs (Assessment · Planning · Compare ·
   Report), and per-tab actions. Renders inside the global icon-rail shell. The tab state is local
   UI state. The patient header uses placeholder case data until the study/patient is loaded from
   the API in the Step 7/8 port (studyId is available from the route). */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { useGenerateReport } from '@/lib/api/hooks';
import { activeCase } from './data';
import { Assessment } from './tabs/Assessment';
import { Planning } from './tabs/Planning';
import { Compare } from './tabs/Compare';
import { Report } from './tabs/Report';
import { useWorkspacePersistence } from './useWorkspacePersistence';
import { useCollabSync } from './useCollabSync';
import { PresenceBar } from './PresenceBar';

type Tab = 'assessment' | 'planning' | 'compare' | 'report';
const TABS: Tab[] = ['assessment', 'planning', 'compare', 'report'];

export function WorkspaceScreen() {
  const [tab, setTab] = useState<Tab>('assessment');
  const navigate = useNavigate();
  const { studyId } = useParams();
  const { patient, saving } = useWorkspacePersistence(studyId);
  const { connected, peers } = useCollabSync(studyId);
  const generate = useGenerateReport();
  // Real patient header from the loaded patient detail; falls back to placeholder until it arrives.
  const p = patient.data;

  /** Generate the PDF server-side from the patient's saved measurements, then open it. */
  const exportPdf = () => {
    if (!p?.id) return;
    generate.mutate(
      { patient_id: p.id },
      {
        onSuccess: (report) => {
          if (report.url) window.open(report.url, '_blank', 'noopener');
        },
      },
    );
  };
  const c = {
    ...activeCase,
    name: p?.name ?? activeCase.name,
    age: p?.age ?? activeCase.age,
    sex: p?.gender ?? activeCase.sex,
    mrn: p?.contact ?? activeCase.mrn,
    dx: p?.visits?.[0]?.diagnosis ?? activeCase.dx,
  };

  return (
    <div className="ws">
      <div className="ws-header">
        <div className="ws-back">
          <button className="icon-btn" onClick={() => navigate('/dashboard')}>
            <Icon name="arrowLeft" />
          </button>
          <div>
            <div className="ws-title">{c.name}</div>
            <div className="ws-sub">
              {c.age}
              {c.sex} · MRN {c.mrn} · {c.dx}
            </div>
          </div>
        </div>
        <div className="ws-tabs">
          {TABS.map((t) => (
            <button key={t} className={'ws-tab' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PresenceBar connected={connected} peers={peers} />
          {saving && (
            <span className="ws-sub" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="cloud" size={14} /> Saving…
            </span>
          )}
          {tab === 'report' ? (
            <>
              <button className="btn btn-ghost" disabled={!p?.id || generate.isPending} onClick={exportPdf}>
                <Icon name="eye" size={16} /> Preview PDF
              </button>
              <button className="btn btn-primary" disabled={!p?.id || generate.isPending} onClick={exportPdf}>
                <Icon name="download" size={16} /> {generate.isPending ? 'Generating…' : 'Export PDF'}
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={() => setTab('report')}>
              <Icon name="fileText" size={16} /> View Report
            </button>
          )}
          <button className="icon-btn" style={{ border: '1px solid var(--border-2)' }}>
            <Icon name="moreV" />
          </button>
        </div>
      </div>

      {tab === 'assessment' && <Assessment />}
      {tab === 'planning' && <Planning />}
      {tab === 'compare' && <Compare />}
      {tab === 'report' && <Report />}
    </div>
  );
}
