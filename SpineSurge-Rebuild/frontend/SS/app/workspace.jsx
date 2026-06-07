/* SpineSurge Pro — Workspace shell + Assessment */

function WsHeader({ tab, setTab, go, actions }) {
  const c = SS.activeCase;
  const tabs = ['Assessment', 'Planning', 'Compare', 'Report'];
  return (
    <div className="ws-header">
      <div className="ws-back">
        <button className="icon-btn" onClick={() => go('dashboard')}><Icon name="arrowLeft" /></button>
        <div>
          <div className="ws-title">{c.name}</div>
          <div className="ws-sub">{c.age}{c.sex} · MRN {c.mrn} · {c.dx}</div>
        </div>
      </div>
      <div className="ws-tabs">
        {tabs.map(t => (
          <button key={t} className={'ws-tab' + (tab === t.toLowerCase() ? ' on' : '')} onClick={() => setTab(t.toLowerCase())}>{t}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {actions || <button className="btn btn-ghost"><Icon name="fileText" /> View Report</button>}
        <button className="icon-btn" style={{ border: '1px solid var(--border-2)' }}><Icon name="moreV" /></button>
      </div>
    </div>
  );
}

function WorkspaceLayout({ left, center, right }) {
  return (
    <div className="ws-body">
      <div className="ws-panel">{left}</div>
      <div className="ws-viewer">{center}</div>
      <div className="ws-panel right">{right}</div>
    </div>
  );
}

function ViewerStage({ slotId, view, setView, viewOptions, tag, guide, children }) {
  return (
    <div className="viewer-stage">
      <DicomSlot id={slotId} caption="Drop X-ray / DICOM image" tag={tag} />
      {setView && <ViewSelect value={view} onChange={setView} options={viewOptions} />}
      <ViewerDock />
      {guide && <GuideCard {...guide} />}
      {children}
    </div>
  );
}

function GuideCard({ label, text, step = 1, total = 4 }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <div className="guide-card">
      <div className="guide-eyebrow">Step-by-step guide <button onClick={() => setClosed(true)} style={{ color: '#fff', display: 'grid' }}><Icon name="close" size={15} /></button></div>
      <div className="guide-text">{label && <span style={{ opacity: .9 }}>[{label}] </span>}{text}</div>
      <div className="guide-dots">{Array.from({ length: total }).map((_, i) => <i key={i} className={i === step - 1 ? 'on' : ''} />)}</div>
    </div>
  );
}

/* ---------- right panel pieces ---------- */
function CaseSummary({ defaultOpen = false }) {
  const c = SS.activeCase;
  const rows = [
    ['user', 'Patient Name', c.name], ['file', 'MRN', c.mrn], ['clock', 'Age', c.age + ' yrs'],
    ['user', 'Sex', c.sex === 'M' ? 'Male' : 'Female'], ['sliders', 'Height', c.height + ' cm'], ['sliders', 'Weight', c.weight + ' kg'],
  ];
  return (
    <Collapse title="Case Summary" defaultOpen={defaultOpen}>
      <div className="cs-row" style={{ paddingTop: 0 }}>
        <span className="csl">Study Imported</span>
        <span className="csv" style={{ color: 'var(--text-2)' }}><Icon name="calendar" size={15} /> {c.imported}</span>
      </div>
      {rows.map((r, i) => (
        <div className="cs-row" key={i} style={{ borderTop: '1px solid var(--border)' }}>
          <span className="csl"><Icon name={r[0]} size={16} /> {r[1]}</span>
          <span className="csv">{r[2]} <button className="cs-edit"><Icon name="edit" size={15} /></button></span>
        </div>
      ))}
    </Collapse>
  );
}

function MeasurementGroups({ groups }) {
  const visible = groups.filter(g => g.items && g.items.length);
  if (!visible.length) return (
    <div className="empty-state">
      <span className="es-ico"><Icon name="ruler" size={22} /></span>
      <span className="es-t">No measurements yet</span>
      <span className="es-s">Select a measurement tool and start analyzing the image.</span>
    </div>
  );
  return (
    <>
      {visible.map((g, gi) => (
        <div className="mgroup" key={gi}>
          <div className="mgroup-name">{g.name}</div>
          {g.items.map((it, i) => (
            <div key={i}>
              <div className="mrow">
                <span className="ml">{it.dot && <span className={'dot dot-' + it.dot} />}{it.label}</span>
                {it.chevron
                  ? <Icon name="chevRight" size={16} style={{ color: 'var(--text-3)' }} />
                  : it.value ? <span className={'mv ' + (it.tone || 'plain')}>{it.value}</span> : null}
              </div>
              {it.sub && (
                <div className="msub">
                  {it.sub.map((s, si) => (
                    <div className="mrow" key={si}>
                      <span className="ml">{s.label}</span>
                      <span className={'mv ' + (s.tone || 'plain')} style={!s.tone ? { color: 'var(--text-2)' } : null}>{s.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function RefLinesPanel({ lines }) {
  if (!lines || !lines.length) return null;
  return (
    <div className="mgroup">
      <div className="mgroup-name">Reference Lines</div>
      {lines.map((l, i) => (
        <div className="mrow" key={i}>
          <span className="ml">{l.abbr}</span>
          <span className="mv good">{l.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Assessment ---------- */
function AssessmentTools({ tabKey, setTabKey, plane, setPlane, activeTool, setActiveTool }) {
  const tabDef = SS.assessment.tabs.find(t => t.key === tabKey);
  const planar = tabDef.planes;
  const data = planar ? tabDef[plane] : tabDef;
  const refLines = data.refLines || [];
  return (
    <>
      <div className="ws-panel-head"><h3>Measurement Tools</h3></div>
      <div className="ws-panel-scroll" style={{ padding: '0 18px 18px' }}>
        <div className="adpm">
          {SS.assessment.tabs.map(t => (
            <button key={t.key} className={'adpm-tile' + (t.key === tabKey ? ' on' : '')} onClick={() => { setTabKey(t.key); setActiveTool(null); }}>
              <span className="lt">{t.short}</span><span className="lb">{t.label}</span>
            </button>
          ))}
        </div>
        {planar && (
          <div className="plane-toggle">
            <button className={plane === 'coronal' ? 'on' : ''} onClick={() => setPlane('coronal')}>Coronal</button>
            <button className={plane === 'sagittal' ? 'on' : ''} onClick={() => setPlane('sagittal')}>Sagittal</button>
          </div>
        )}
        <div className="tool-list">
          {data.tools.map((t, i) => (
            <button key={i} className={'tool-item' + (activeTool === t.abbr ? ' on' : '')} onClick={() => setActiveTool(t.abbr)}>
              <ToolGlyph abbr={t.abbr} tone={activeTool === t.abbr ? 'accent' : tabKey === 'pathology' ? 'violet' : 'plain'} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="ti-name" style={{ display: 'block' }}>{t.label !== t.abbr ? t.abbr : t.label}</span>
                <span className="ti-desc" style={{ display: 'block' }}>{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
        <button className="calib-btn"><Icon name="ruler" size={17} /> Calibration</button>
      </div>
      {refLines.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <Collapse title={<span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>Reference Lines <span className="badge" style={{ height: 20, background: 'var(--success-soft)', color: 'var(--success)' }}>Active</span></span>} defaultOpen={true}>
            {refLines.map((l, i) => (
              <div className="refline-item" key={i}>
                <span className="refline-dot" />
                <span className="refline-mark"><Icon name="spine" size={16} /></span>
                <span style={{ flex: 1 }}>
                  <span className="refline-name" style={{ display: 'block' }}>{l.abbr}</span>
                  <span className="refline-desc" style={{ display: 'block' }}>{l.name}</span>
                </span>
              </div>
            ))}
          </Collapse>
        </div>
      )}
    </>
  );
}

function Assessment() {
  const [tabKey, setTabKey] = useState('alignment');
  const [plane, setPlane] = useState('coronal');
  const [activeTool, setActiveTool] = useState(null);
  const [view, setView] = useState('Lateral');

  const tabDef = SS.assessment.tabs.find(t => t.key === tabKey);
  const data = tabDef.planes ? tabDef[plane] : tabDef;

  const guide = tabKey === 'deformity'
    ? { label: plane === 'coronal' ? 'Coronal' : 'Sagittal', text: plane === 'coronal' ? 'Select Cobb Multi-Curve (CMC)' : 'Select T1 Pelvic Angle (TPA)', step: 2 }
    : null;

  return (
    <WorkspaceLayout
      left={<AssessmentTools tabKey={tabKey} setTabKey={setTabKey} plane={plane} setPlane={setPlane} activeTool={activeTool} setActiveTool={setActiveTool} />}
      center={<ViewerStage slotId="ws-assess" view={view} setView={setView} viewOptions={['AP','Lateral','Oblique']} tag={view === 'AP' ? 'EOS AP' : 'EOS LAT'} guide={guide} />}
      right={
        <>
          <div className="ws-panel-head" style={{ paddingBottom: 0 }} />
          <div className="ws-panel-scroll">
            <CaseSummary defaultOpen={false} />
            <Collapse title="Current Measurements" defaultOpen={true}>
              <MeasurementGroups groups={data.groups} />
              <RefLinesPanel lines={data.refLines} />
            </Collapse>
          </div>
        </>
      }
    />
  );
}

Object.assign(window, { WsHeader, WorkspaceLayout, ViewerStage, GuideCard, CaseSummary, MeasurementGroups, RefLinesPanel, AssessmentTools, Assessment });
