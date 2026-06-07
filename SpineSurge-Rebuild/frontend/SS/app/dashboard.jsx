/* SpineSurge Pro — Dashboard */

function NewStudyModal({ onClose }) {
  return (
    <ModalShell onClose={onClose} width={760}>
      <div style={{ padding: '26px 30px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Create New Study</h2>
          <p className="muted" style={{ marginTop: 6 }}>Import images to create a new study and start planning.</p>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="scroll-y" style={{ padding: '22px 30px 6px' }}>
        <div className="eyebrow" style={{ marginBottom: 14, color: 'var(--text-2)', fontSize: 14, fontWeight: 700, letterSpacing: 0, textTransform: 'none' }}>Choose Import Source</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SS.importSources.map((s, i) => (
            <button key={i} className="import-card">
              <span className="import-ico"><Icon name={s.icon} size={26} /></span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 16 }}>{s.title}</span>
                <span className="muted" style={{ display: 'block', fontSize: 13.5, marginTop: 2 }}>{s.desc}</span>
                <span className="import-tags">{s.tags.map((t, j) => <span key={j} className="import-tag">{t}</span>)}</span>
              </span>
              <Icon name="chevRight" size={20} style={{ color: 'var(--text-3)' }} />
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 30px', borderTop: '1px solid var(--border)', marginTop: 14 }}>
        <span className="muted-3" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Icon name="info" size={16} style={{ color: 'var(--accent)' }} /> Supported: DICOM, JPG, PNG, TIFF, BMP and more.
        </span>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </ModalShell>
  );
}

function TasksDropdown({ onClose }) {
  const ref = useRef();
  useOutside(ref, onClose);
  return (
    <div className="dropdown pop" ref={ref}>
      <div className="dropdown-head">
        <h3>Tasks <span className="bell-badge" style={{ position: 'static', border: 'none' }}>{SS.tasks.length + 1}</span></h3>
        <button className="icon-btn"><Icon name="settings" size={17} style={{ color: 'var(--accent)' }} /></button>
      </div>
      <div className="scroll-y" style={{ maxHeight: 440 }}>
        {SS.tasks.map((t, i) => (
          <div className="task-row" key={i}>
            <span className={'task-ico ' + t.tone}><Icon name={t.icon} size={19} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="task-group">{t.group}</div>
              <div className="tt">{t.title}</div>
              <div className="ts">{t.sub}</div>
              <div className="tm" style={t.meta.startsWith('Missing') ? { color: 'var(--danger)', fontWeight: 600 } : null}>{t.meta}</div>
            </div>
            <Icon name="chevRight" size={18} style={{ color: 'var(--text-3)', alignSelf: 'center' }} />
          </div>
        ))}
      </div>
      <button className="link-accent" style={{ width: '100%', justifyContent: 'center', padding: '15px' }}>
        View all tasks <Icon name="arrowRight" size={16} />
      </button>
    </div>
  );
}

function DashTopbar({ onNewStudy }) {
  const [tasks, setTasks] = useState(false);
  return (
    <div className="topbar">
      <div className="topbar-greet">
        <h1>Good morning, Dr. Smith</h1>
        <p>Let's continue your work</p>
      </div>
      <div className="topbar-actions">
        <div className="bell-wrap">
          <button className="icon-btn" onClick={() => setTasks(t => !t)}>
            <Icon name="bell" size={21} />
          </button>
          <span className="bell-badge">3</span>
          {tasks && <TasksDropdown onClose={() => setTasks(false)} />}
        </div>
        <button className="btn btn-outline" onClick={onNewStudy}><Icon name="plus" /> New Study</button>
        <button className="icon-btn" style={{ border: '1px solid var(--border-2)' }}><Icon name="moreV" /></button>
      </div>
    </div>
  );
}

function Dashboard({ go }) {
  const [newStudy, setNewStudy] = useState(false);
  const c = SS.continueWorking;
  return (
    <div className="page-scroll">
      <DashTopbar onNewStudy={() => setNewStudy(true)} />
      <div className="page-pad">
        {/* hero */}
        <div className="card hero-card">
          <DicomSlot id="dash-hero" caption="Drop AP X-ray" tag={c.modality} style={{ width: 280, height: 230, borderRadius: 'var(--r-lg)', flex: 'none' }} />
          <div className="hero-mid">
            <span className="hero-eyebrow">Continue Working</span>
            <span className="hero-name">{c.name}</span>
            <span className="hero-sub">{c.stage} <span className="dot" style={{ background: 'var(--text-3)', width: 4, height: 4 }} /> {c.date}</span>
            <span className="badge badge-soft" style={{ alignSelf: 'flex-start', marginTop: 2 }}>{c.tag}</span>
            <button className="btn btn-outline" style={{ alignSelf: 'flex-start', marginTop: 10 }} onClick={() => go('workspace')}>
              Open Workspace <Icon name="arrowRight" size={17} />
            </button>
          </div>
          <div className="hero-meta">
            <div className="hero-meta-row"><Icon name="calendar" size={17} /> Last opened</div>
            <div className="hero-meta-row"><Icon name="clock" size={17} /> {c.lastOpened}</div>
            <div className="hero-meta-row"><Icon name="layers" size={17} /> {c.studies} studies</div>
            <div className="hero-meta-row"><span className="dot dot-red" /> {c.status}</div>
          </div>
        </div>

        {/* recent */}
        <div className="section-head"><h2>Recent Studies</h2><a className="link-accent">View all</a></div>
        <div className="study-grid">
          {SS.recentStudies.map((s, i) => (
            <div className="card study-card" key={i} onClick={() => go('workspace')}>
              <DicomSlot id={'dash-recent-' + i} caption="Drop" tag={s.modality} style={{ width: 92, height: 92, borderRadius: 'var(--r-md)', flex: 'none' }} />
              <div className="study-info">
                <span className="nm">{s.name}</span>
                <span className="dx">{s.dx}</span>
                <span className="dt">{s.date}</span>
                <span className="badge badge-soft" style={{ alignSelf: 'flex-start', height: 22, marginTop: 6 }}>{s.studies} Studies</span>
              </div>
              <MoreBtn />
            </div>
          ))}
        </div>

        {/* unfinished */}
        <div className="section-head"><h2>Unfinished Studies</h2><a className="link-accent">View all</a></div>
        <div className="card un-table">
          {SS.unfinished.map((u, i) => (
            <div className="un-row" key={i}>
              <div className="un-patient">
                <DicomSlot id={'dash-un-' + i} caption="" tag={null} style={{ width: 44, height: 44, borderRadius: 'var(--r-sm)', flex: 'none' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{u.name}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{u.modality} · {u.date}</div>
                </div>
              </div>
              <div><div className="col-label">Diagnosis</div><div className="col-val">{u.dx}</div></div>
              <div><div className="col-label">Last edited</div><div className="col-val">{u.edited}</div></div>
              <div><div className="col-label">Status</div><div className="status status-prog"><span className="dot dot-red" /> In Progress</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => go('workspace')}>Open Workspace</button>
                <MoreBtn />
              </div>
            </div>
          ))}
        </div>

        <div className="dash-footer">
          <a className="link-accent" style={{ fontSize: 15, fontWeight: 700 }}>View all in-progress studies <Icon name="arrowRight" size={18} /></a>
        </div>
      </div>
      {newStudy && <NewStudyModal onClose={() => setNewStudy(false)} />}
    </div>
  );
}

Object.assign(window, { Dashboard, NewStudyModal, TasksDropdown });
