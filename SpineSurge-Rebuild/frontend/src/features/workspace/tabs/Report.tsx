/* Report tab — Report Builder (toggleable/reorderable sections) on the left, a paginated WYSIWYG
   document in the center, and Section Properties on the right (DESIGN.md §4.3 Report).
   The rich-text editor (TipTap) and drag-reorder (dnd-kit) are wired in Step 10; here the structure,
   toolbar, section toggles, and live document preview are built and render from state. */
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { activeCase, alignmentSummary, reportSections } from '../data';

const TOOLBAR = ['bold', 'italic', 'underline', 'sep', 'listBullet', 'listNum', 'indent', 'sep', 'link', 'image'];

export function Report() {
  const [sections, setSections] = useState(reportSections);
  const [selected, setSelected] = useState('measurement');
  const [propTab, setPropTab] = useState<'content' | 'style'>('content');

  const toggle = (id: string) => setSections((s) => s.map((x) => (x.id === id ? { ...x, on: !x.on } : x)));
  const enabled = sections.filter((s) => s.on);

  return (
    <div className="ws-body" style={{ gridTemplateColumns: '300px 1fr 320px' }}>
      {/* left: builder */}
      <div className="ws-panel">
        <div className="ws-panel-head">
          <h3>Report Builder</h3>
        </div>
        <div className="ws-panel-scroll" style={{ padding: '0 12px 12px' }}>
          {sections.map((s) => (
            <button
              key={s.id}
              className={'rb-section' + (s.id === selected ? ' on' : '')}
              onClick={() => setSelected(s.id)}
            >
              <span className="rb-grip">
                <Icon name="grip" size={16} />
              </span>
              <span
                className={'rb-check' + (s.on ? ' ck' : '')}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(s.id);
                }}
              >
                {s.on && <Icon name="check" size={13} />}
              </span>
              <span className="rb-label">{s.label}</span>
            </button>
          ))}
          <button className="btn btn-outline" style={{ width: '100%', marginTop: 12 }}>
            <Icon name="plus" size={15} /> Add Section
          </button>
        </div>
      </div>

      {/* center: document */}
      <div className="ws-viewer" style={{ background: 'var(--bg-2)', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div className="rb-toolbar">
          <select className="rb-tb-sel" defaultValue="Normal Text">
            <option>Normal Text</option>
            <option>Heading 1</option>
            <option>Heading 2</option>
          </select>
          {TOOLBAR.map((t, i) =>
            t === 'sep' ? (
              <span key={i} className="vdivider" style={{ height: 20, margin: '0 4px' }} />
            ) : (
              <button key={t} className="rb-tb-btn">
                <Icon name={t === 'image' ? 'camera' : t} size={16} />
              </button>
            ),
          )}
        </div>
        <div className="page-scroll" style={{ flex: 1 }}>
          <div className="rb-page">
            <div className="rb-doc-head">
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.01em' }}>Surgical Planning Report</div>
                <div style={{ color: '#666', fontSize: 12.5, marginTop: 2 }}>SpineSurge Pro · Generated May 30, 2024</div>
              </div>
              <div style={{ fontWeight: 800, color: 'var(--accent)' }}>SpineSurge</div>
            </div>

            {enabled.some((s) => s.id === 'patient') && (
              <Block num={1} title="Patient Summary">
                <Grid
                  rows={[
                    ['Name', activeCase.name],
                    ['MRN', activeCase.mrn],
                    ['Age / Sex', `${activeCase.age} / ${activeCase.sex === 'M' ? 'Male' : 'Female'}`],
                    ['Diagnosis', activeCase.dx],
                  ]}
                />
              </Block>
            )}

            {enabled.some((s) => s.id === 'alignment') && (
              <Block num={2} title="Alignment Summary">
                <Grid rows={alignmentSummary.map((a) => [a.label, a.value])} />
              </Block>
            )}

            {enabled.some((s) => s.id === 'measurement') && (
              <Block num={3} title="Measurement Table">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#666' }}>
                      <th style={{ padding: '6px 0' }}>Parameter</th>
                      <th style={{ padding: '6px 0', textAlign: 'right' }}>Value</th>
                      <th style={{ padding: '6px 0', textAlign: 'right' }}>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alignmentSummary.map((a, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                        <td style={{ padding: '6px 0' }}>{a.label}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700 }}>{a.value}</td>
                        <td style={{ padding: '6px 0', textAlign: 'right', color: '#15924f', fontWeight: 700 }}>{a.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Block>
            )}
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5, padding: '4px 0 24px' }}>
            Page 1 · {enabled.length} sections enabled · 100%
          </div>
        </div>
      </div>

      {/* right: section properties */}
      <div className="ws-panel right">
        <div className="rb-prop-tabs">
          <button className={'rb-prop-tab' + (propTab === 'content' ? ' on' : '')} onClick={() => setPropTab('content')}>
            Content
          </button>
          <button className={'rb-prop-tab' + (propTab === 'style' ? ' on' : '')} onClick={() => setPropTab('style')}>
            Style
          </button>
        </div>
        <div className="ws-panel-scroll" style={{ padding: 18 }}>
          <div className="mgroup-name">{sections.find((s) => s.id === selected)?.label ?? 'Section'}</div>
          {propTab === 'content' ? (
            <>
              <label className="field-label">Title</label>
              <input className="input" defaultValue={sections.find((s) => s.id === selected)?.label} style={{ marginBottom: 14 }} />
              <label className="field-label">Description</label>
              <textarea className="input" style={{ height: 80, padding: 10, marginBottom: 14 }} placeholder="Optional section description…" />
              <div className="mgroup-name" style={{ marginTop: 6 }}>Included Categories</div>
              {['Sagittal Alignment', 'Coronal Alignment', 'Pelvic Parameters', 'Global'].map((c) => (
                <label key={c} className="cs-row" style={{ cursor: 'pointer' }}>
                  <span className="csl">{c}</span>
                  <span className="rb-check ck">
                    <Icon name="check" size={13} />
                  </span>
                </label>
              ))}
            </>
          ) : (
            <>
              <div className="mgroup-name" style={{ marginTop: 6 }}>Display Options</div>
              <div className="cs-row">
                <span className="csl">Decimals</span>
                <select className="mini-select" defaultValue="1">
                  <option>0</option>
                  <option>1</option>
                  <option>2</option>
                </select>
              </div>
              <div className="cs-row">
                <span className="csl">Units</span>
                <span className="csv">° / mm</span>
              </div>
              <div className="mgroup-name" style={{ marginTop: 16 }}>Value Color Coding</div>
              {[
                ['Worsened', 'var(--val-bad)'],
                ['Improved', 'var(--val-good)'],
                ['In Range', 'var(--val-pelvic)'],
              ].map(([label, color]) => (
                <div className="cs-row" key={label}>
                  <span className="csl">
                    <span className="dot" style={{ background: color }} /> {label}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rb-block">
      <div className="rb-block-head">
        <span className="rb-block-num">{num}</span>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: '#17171a' }}>{title}</span>
      </div>
      <div style={{ padding: '12px 16px' }}>{children}</div>
    </div>
  );
}

function Grid({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, borderBottom: '1px solid #f0f0f2', paddingBottom: 6 }}>
          <span style={{ color: '#666' }}>{k}</span>
          <span style={{ fontWeight: 700, color: '#17171a' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
