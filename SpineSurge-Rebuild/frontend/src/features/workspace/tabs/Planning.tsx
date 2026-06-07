/* Planning tab — two steps: (1) Target Correction (alignment goals, current vs target) and
   (2) Simulation (osteotomy + instrumentation). In the Simulation step the centre viewer becomes the
   interactive osteotomy canvas: the osteotomy tool buttons arm the parity-locked CanvasManager engine
   (cut / move / rotate / wedge) over the loaded radiograph. Right panel shows the Current Plan. */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { ToolGlyph } from '@/components/primitives';
import { planning } from '../data';
import { ViewerStage, ViewSelect } from '../components';
import { OsteotomyCanvas, type WedgeKind } from '@/features/canvas/OsteotomyCanvas';
import { StudyVolumeViewer } from '@/features/dicom/StudyVolumeViewer';
import type { VolumeInfo } from '@/features/dicom/DicomVolumeViewer';
import { PedicleWizard } from '@/features/dicom/planning/PedicleWizard';
import { ImplantPropertiesPanel } from '@/features/dicom/planning/ImplantPropertiesPanel';
import { useStudy } from '@/lib/api/hooks';
import { useWorkspaceStore } from '@/lib/store/workspace';

type Step = 'target' | 'sim';
type CanvasTool = 'select' | 'cut' | 'wedge';

/** Maps a planning osteotomy abbreviation to the engine's WEDGE_OSTEOTOMY `type`. */
const WEDGE_OF: Record<string, string> = { PSO: 'PSO', SPO: 'SPO', VCR: 'VCR', Open: 'Open' };

function StepToggle({ step, setStep }: { step: Step; setStep: (s: Step) => void }) {
  return (
    <div className="plan-step">
      <button className={step === 'target' ? 'on' : ''} onClick={() => setStep('target')}>
        <span className="num">1</span> Target Correction
      </button>
      <button className={step === 'sim' ? 'on' : ''} onClick={() => setStep('sim')}>
        <span className="num">2</span> Simulation
      </button>
    </div>
  );
}

function TargetGoals() {
  return (
    <>
      <div className="mgroup-name" style={{ margin: '4px 0 6px' }}>Alignment Goals</div>
      {planning.targets.map((g, i) => (
        <div className="goal" key={i}>
          <div className="goal-name">{g.label}</div>
          <div className="goal-row">
            <span className="goal-cur">
              Current <b>{g.current}</b>
            </span>
            <div className="goal-target">
              <span className="field-label">Target</span>
              <select className="mini-select" defaultValue={g.target}>
                {g.opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function SimulationTools({
  canvasTool,
  setCanvasTool,
  wedgeAbbr,
  armWedge,
}: {
  canvasTool: CanvasTool;
  setCanvasTool: (t: CanvasTool) => void;
  wedgeAbbr: string | null;
  armWedge: (abbr: string) => void;
}) {
  return (
    <>
      <div className="mgroup-name" style={{ margin: '14px 0 6px' }}>Manipulation</div>
      <div className="tool-list">
        {(['select', 'cut'] as CanvasTool[]).map((t) => (
          <button
            key={t}
            className={'tool-item' + (canvasTool === t ? ' on' : '')}
            onClick={() => setCanvasTool(t)}
          >
            <ToolGlyph abbr={t === 'select' ? 'Mv' : 'Ct'} tone={canvasTool === t ? 'accent' : 'plain'} />
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span className="ti-name" style={{ display: 'block' }}>
                {t === 'select' ? 'Select / Move' : 'Cut'}
              </span>
              <span className="ti-desc" style={{ display: 'block' }}>
                {t === 'select' ? 'Drag fragments; rotate/delete below' : 'Click two points to split a fragment'}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="mgroup-name" style={{ margin: '14px 0 6px' }}>Osteotomy</div>
      <div className="tool-list">
        {planning.osteotomies.map((it) => {
          const on = canvasTool === 'wedge' && wedgeAbbr === it.abbr;
          return (
            <button key={it.abbr} className={'tool-item' + (on ? ' on' : '')} onClick={() => armWedge(it.abbr)}>
              <ToolGlyph abbr={it.abbr} tone={on ? 'accent' : 'plain'} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="ti-name" style={{ display: 'block' }}>{it.abbr}</span>
                <span className="ti-desc" style={{ display: 'block' }}>{it.name}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mgroup-name" style={{ margin: '14px 0 6px' }}>Instrumentation</div>
      <div className="tool-list">
        {planning.instrumentation.map((it) => (
          <button key={it.abbr} className="tool-item" title="Screw/rod planning arrives with the 3D workspace (Step 8)">
            <ToolGlyph abbr={it.abbr} tone="plain" />
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span className="ti-name" style={{ display: 'block' }}>{it.abbr}</span>
              <span className="ti-desc" style={{ display: 'block' }}>{it.name}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function CurrentPlan({ step }: { step: Step }) {
  const p = planning.currentPlan;
  return (
    <div className="ws-panel-scroll">
      <div className="ws-panel-head">
        <h3>{step === 'sim' ? 'Current Plan (Simulation)' : 'Current Plan'}</h3>
      </div>
      <div style={{ padding: '0 18px 18px' }}>
        <div className="mgroup-name">Target Correction</div>
        {p.correction.map((c, i) => (
          <div className="plan-line" key={i}>
            <span className="pll">{c.label}</span>
            <span className="plv">
              <span className="from">{c.from}</span>
              <Icon name="arrowRight" size={14} className="arrow" />
              <span className="to">{c.to}</span>
            </span>
          </div>
        ))}

        {step === 'sim' && (
          <>
            <div className="mgroup-name" style={{ marginTop: 16 }}>Osteotomy</div>
            <div className="plan-line">
              <span className="pll">{p.simOsteotomy.name}</span>
              <span className="plv">
                <span className="badge" style={{ background: 'var(--success-soft)', color: 'var(--success)', height: 22 }}>
                  {p.simOsteotomy.status}
                </span>
              </span>
            </div>
            <div className="mgroup-name" style={{ marginTop: 16 }}>Instrumentation</div>
            {p.simInstr.map((it, i) => (
              <div className="plan-line" key={i}>
                <span className="pll" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span className={'dot dot-' + (it.dot === 'teal' ? 'green' : it.dot)} />
                  {it.label}
                </span>
                <span className="plv" style={{ fontWeight: 600, color: 'var(--text-2)' }}>{it.value}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <div style={{ padding: '0 18px 18px', marginTop: 'auto' }}>
        <button className="btn btn-outline" style={{ width: '100%' }}>
          <Icon name="trash" size={16} /> Clear Plan
        </button>
      </div>
    </div>
  );
}

export function Planning() {
  const [step, setStep] = useState<Step>('target');
  const [view, setView] = useState('Lateral');
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select');
  const [wedgeAbbr, setWedgeAbbr] = useState<string | null>(null);
  const [status, setStatus] = useState<{ fragments: number; hint: string }>({ fragments: 1, hint: '' });
  const imageSrc = useWorkspaceStore((s) => s.imageSrc);

  // A CT study (volume in Orthanc) unlocks the 4-quadrant 3D view. The study query is cached by the
  // shell's persistence hook, so this is a free read of the same key.
  const { studyId } = useParams();
  const study = useStudy(studyId);
  const studyUID = study.data?.orthanc_study_uid ?? null;
  const viewOptions = studyUID ? ['AP', 'Lateral', 'Oblique', '3D'] : ['AP', 'Lateral', 'Oblique'];
  const show3D = view === '3D' && !!studyUID;
  const [volumeInfo, setVolumeInfo] = useState<VolumeInfo | null>(null);

  const armWedge = (abbr: string) => {
    setWedgeAbbr(abbr);
    setCanvasTool('wedge');
  };
  const wedge: WedgeKind = { abbr: wedgeAbbr ?? 'PSO', type: WEDGE_OF[wedgeAbbr ?? 'PSO'] ?? 'PSO' };
  const guide = step === 'target' ? { text: 'Set targets according to the case', step: 1 } : undefined;

  // 3D/CT planning workspace (DESIGN §4.3): pedicle wizard ◂ 4-quadrant volume ▸ implant properties.
  if (show3D && studyUID) {
    return (
      <div className="ws-body">
        <div className="ws-panel">
          <PedicleWizard volumeId={volumeInfo?.volumeId ?? null} sliceCount={volumeInfo?.sliceCount ?? 0} />
        </div>
        <div className="ws-viewer">
          <div className="viewer-stage" style={{ position: 'relative' }}>
            <StudyVolumeViewer studyUID={studyUID} onReady={setVolumeInfo} />
            <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 50 }}>
              <ViewSelect value={view} onChange={setView} options={viewOptions} />
            </div>
          </div>
        </div>
        <div className="ws-panel right">
          <ImplantPropertiesPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="ws-body">
      <div className="ws-panel">
        <div className="ws-panel-head">
          <h3>Planning Tools</h3>
        </div>
        <div className="ws-panel-scroll" style={{ padding: '0 18px 18px' }}>
          <StepToggle step={step} setStep={setStep} />
          {step === 'target' ? (
            <TargetGoals />
          ) : (
            <SimulationTools
              canvasTool={canvasTool}
              setCanvasTool={(t) => {
                setCanvasTool(t);
                if (t !== 'wedge') setWedgeAbbr(null);
              }}
              wedgeAbbr={wedgeAbbr}
              armWedge={armWedge}
            />
          )}
        </div>
      </div>

      <div className="ws-viewer">
        {step === 'sim' ? (
          <div className="viewer-stage" style={{ position: 'relative' }}>
            <OsteotomyCanvas
              imageSrc={imageSrc}
              tool={canvasTool}
              wedge={wedge}
              onStatus={(s) => setStatus({ fragments: s.fragments, hint: s.hint })}
            />
            {status.hint && (
              <div className="pop" style={statusPill}>
                {status.hint}
              </div>
            )}
          </div>
        ) : (
          <ViewerStage view={view} setView={setView} viewOptions={viewOptions} tag="EOS LAT" guide={guide} />
        )}
      </div>

      <div className="ws-panel right">
        <CurrentPlan step={step} />
      </div>
    </div>
  );
}

const statusPill: CSSProperties = {
  position: 'absolute',
  top: 14,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 6,
  padding: '7px 12px',
  borderRadius: 999,
  background: 'rgba(17,24,39,0.92)',
  color: '#fff',
  fontSize: 12.5,
  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
};
