/* Dashboard (Home) — design ported from the Claude Design build (frontend/SS/app/dashboard.jsx).
   Tokens/classes match the design exactly. Data is LIVE: the recent/unfinished/continue-working
   feeds + tasks come from GET /dashboard (aggregated over the org's real patients/studies/contexts).
   `importSources` stays a static UI config (it describes import options, not data). */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { DicomSlot } from '@/components/ImageSlot';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useDashboard } from '@/lib/api/hooks';
import type { DashboardTask } from '@/lib/api/types';
import { formatDate, relativeTime } from '@/lib/utils';
import { importSources } from './data';

function NewStudyModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ width: 760, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '26px 30px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Create New Study</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Import images to create a new study and start planning.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="scroll-y" style={{ padding: '22px 30px 6px' }}>
          <div style={{ marginBottom: 14, color: 'var(--text-2)', fontSize: 14, fontWeight: 700 }}>Choose Import Source</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {importSources.map((s, i) => (
              <button key={i} className="import-card">
                <span className="import-ico">
                  <Icon name={s.icon} size={26} />
                </span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 16 }}>{s.title}</span>
                  <span className="muted" style={{ display: 'block', fontSize: 13.5, marginTop: 2 }}>
                    {s.desc}
                  </span>
                  <span className="import-tags">
                    {s.tags.map((t, j) => (
                      <span key={j} className="import-tag">
                        {t}
                      </span>
                    ))}
                  </span>
                </span>
                <Icon name="chevRight" size={20} style={{ color: 'var(--text-3)' }} />
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 30px',
            borderTop: '1px solid var(--border)',
            marginTop: 14,
          }}
        >
          <span className="muted-3" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <Icon name="info" size={16} style={{ color: 'var(--accent)' }} /> Supported: DICOM, JPG, PNG, TIFF, BMP and more.
          </span>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TasksDropdown({ tasks, onClose }: { tasks: DashboardTask[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [onClose]);

  return (
    <div className="dropdown pop" ref={ref}>
      <div className="dropdown-head">
        <h3>
          Tasks{' '}
          <span className="bell-badge" style={{ position: 'static', border: 'none' }}>
            {tasks.length}
          </span>
        </h3>
        <button className="icon-btn">
          <Icon name="settings" size={17} style={{ color: 'var(--accent)' }} />
        </button>
      </div>
      <div className="scroll-y" style={{ maxHeight: 440 }}>
        {tasks.length === 0 && (
          <div className="muted" style={{ padding: '24px 18px', textAlign: 'center', fontSize: 13.5 }}>
            You're all caught up — no pending tasks.
          </div>
        )}
        {tasks.map((t, i) => (
          <div className="task-row" key={i}>
            <span className={'task-ico ' + t.tone}>
              <Icon name={t.icon} size={19} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="task-group">{t.group}</div>
              <div className="tt">{t.title}</div>
              <div className="ts">{t.sub}</div>
              <div className="tm" style={t.meta.startsWith('Missing') ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                {t.meta}
              </div>
            </div>
            <Icon name="chevRight" size={18} style={{ color: 'var(--text-3)', alignSelf: 'center' }} />
          </div>
        ))}
      </div>
      <button className="link-accent" style={{ width: '100%', justifyContent: 'center', padding: 15 }}>
        View all tasks <Icon name="arrowRight" size={16} />
      </button>
    </div>
  );
}

function greeting(email: string | null | undefined): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const local = email?.split('@')[0] ?? 'Doctor';
  const name = local.charAt(0).toUpperCase() + local.slice(1);
  return `Good ${part}, Dr. ${name}`;
}

export function Dashboard() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useDashboard();
  const [newStudy, setNewStudy] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);

  const c = data?.continue_working ?? null;
  const recentStudies = data?.recent_studies ?? [];
  const unfinished = data?.unfinished ?? [];
  const tasks = data?.tasks ?? [];

  /** Open the workspace for a study; falls back to the patient list when no study exists yet. */
  const open = (studyId: string | null | undefined, patientId?: string) =>
    navigate(studyId ? `/workspace/${studyId}` : patientId ? `/patients` : '/patients');

  return (
    <div className="page-scroll">
      <div className="topbar">
        <div className="topbar-greet">
          <h1>{greeting(me?.email)}</h1>
          <p>Let's continue your work</p>
        </div>
        <div className="topbar-actions">
          <div className="bell-wrap">
            <button className="icon-btn" onClick={() => setTasksOpen((t) => !t)}>
              <Icon name="bell" size={21} />
            </button>
            {tasks.length > 0 && <span className="bell-badge">{tasks.length}</span>}
            {tasksOpen && <TasksDropdown tasks={tasks} onClose={() => setTasksOpen(false)} />}
          </div>
          <button className="btn btn-outline" onClick={() => setNewStudy(true)}>
            <Icon name="plus" /> New Study
          </button>
          <button className="icon-btn" style={{ border: '1px solid var(--border-2)' }}>
            <Icon name="moreV" />
          </button>
        </div>
      </div>

      <div className="page-pad">
        {/* hero — most recently edited workspace */}
        {c ? (
          <div className="card hero-card">
            <DicomSlot caption="Drop AP X-ray" tag={c.modality} style={{ width: 280, height: 230, borderRadius: 'var(--r-lg)', flex: 'none' }} />
            <div className="hero-mid">
              <span className="hero-eyebrow">Continue Working</span>
              <span className="hero-name">{c.name}</span>
              <span className="hero-sub">
                {c.stage} <span className="dot" style={{ background: 'var(--text-3)', width: 4, height: 4 }} /> {formatDate(c.date)}
              </span>
              {c.tag && (
                <span className="badge badge-soft" style={{ alignSelf: 'flex-start', marginTop: 2 }}>
                  {c.tag}
                </span>
              )}
              <button className="btn btn-outline" style={{ alignSelf: 'flex-start', marginTop: 10 }} onClick={() => open(c.study_id, c.patient_id)}>
                Open Workspace <Icon name="arrowRight" size={17} />
              </button>
            </div>
            <div className="hero-meta">
              <div className="hero-meta-row">
                <Icon name="calendar" size={17} /> Last opened
              </div>
              <div className="hero-meta-row">
                <Icon name="clock" size={17} /> {relativeTime(c.last_opened)}
              </div>
              <div className="hero-meta-row">
                <Icon name="layers" size={17} /> {c.studies} studies
              </div>
              <div className="hero-meta-row">
                <span className="dot dot-red" /> {c.status}
              </div>
            </div>
          </div>
        ) : (
          <div className="card hero-card" style={{ justifyContent: 'center' }}>
            <div className="hero-mid" style={{ alignItems: 'flex-start' }}>
              <span className="hero-eyebrow">Get started</span>
              <span className="hero-name">{isLoading ? 'Loading your workspace…' : 'No active workspace yet'}</span>
              <span className="hero-sub">Create a study to begin assessment and planning.</span>
              <button className="btn btn-outline" style={{ alignSelf: 'flex-start', marginTop: 10 }} onClick={() => setNewStudy(true)}>
                <Icon name="plus" size={16} /> New Study
              </button>
            </div>
          </div>
        )}

        {/* recent */}
        <div className="section-head">
          <h2>Recent Studies</h2>
          <a className="link-accent" onClick={() => navigate('/patients')} style={{ cursor: 'pointer' }}>View all</a>
        </div>
        {recentStudies.length === 0 ? (
          <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>
            {isLoading ? 'Loading…' : 'No studies yet. Create a study to see it here.'}
          </div>
        ) : (
          <div className="study-grid">
            {recentStudies.map((s) => (
              <div className="card study-card" key={s.study_id} onClick={() => open(s.study_id, s.patient_id)}>
                <DicomSlot caption="Drop" tag={s.modality} style={{ width: 92, height: 92, borderRadius: 'var(--r-md)', flex: 'none' }} />
                <div className="study-info">
                  <span className="nm">{s.name}</span>
                  <span className="dx">{s.dx ?? '—'}</span>
                  <span className="dt">{formatDate(s.date)}</span>
                  <span className="badge badge-soft" style={{ alignSelf: 'flex-start', height: 22, marginTop: 6 }}>
                    {s.studies} Studies
                  </span>
                </div>
                <button className="icon-btn" onClick={(e) => e.stopPropagation()}>
                  <Icon name="moreV" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* unfinished */}
        <div className="section-head">
          <h2>Unfinished Studies</h2>
          <a className="link-accent" onClick={() => navigate('/patients')} style={{ cursor: 'pointer' }}>View all</a>
        </div>
        {unfinished.length === 0 ? (
          <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>
            {isLoading ? 'Loading…' : 'No in-progress workspaces.'}
          </div>
        ) : (
          <div className="card un-table">
            {unfinished.map((u) => (
              <div className="un-row" key={u.context_id}>
                <div className="un-patient">
                  <DicomSlot caption="" tag={null} style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{u.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {u.modality ?? '—'} · {formatDate(u.date)}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="col-label">Diagnosis</div>
                  <div className="col-val">{u.dx ?? '—'}</div>
                </div>
                <div>
                  <div className="col-label">Last edited</div>
                  <div className="col-val">{relativeTime(u.edited)}</div>
                </div>
                <div>
                  <div className="col-label">Status</div>
                  <div className="status status-prog">
                    <span className="dot dot-red" /> In Progress
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => open(u.study_id, u.patient_id)}>
                    Open Workspace
                  </button>
                  <button className="icon-btn">
                    <Icon name="moreV" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="dash-footer">
          <a className="link-accent" onClick={() => navigate('/patients')} style={{ fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            View all in-progress studies <Icon name="arrowRight" size={18} />
          </a>
        </div>
      </div>
      {newStudy && <NewStudyModal onClose={() => setNewStudy(false)} />}
    </div>
  );
}
