/* Pedicle Planning Suite — the 5-step surgical workflow (Load → Crop → Points → Screws → Grade),
 * ported from the old SpinePedicleWizard and rebuilt to the new design language. Drives the shared
 * planningStore; all geometry/sizing comes from the parity-locked planning math. The animated
 * stepper + step transitions are CSS (see screens.css `.pw-*`). */
import { Icon } from '@/components/Icon';
import { SPINAL_LEVELS } from '@/features/measurements/planning/ScrewDefaults';
import { anglesFromVector, vectorFromAngles } from '@/features/measurements/planning/SurgicalGeometry';
import { calculateBoneContact } from '@/features/measurements/planning/PedicleLogic';
import { usePlanningStore } from './planningStore';
import type { RoiCrop } from './types';

const STEPS = [
  { id: 1, label: 'Load', icon: 'cube' },
  { id: 2, label: 'Crop', icon: 'grid' },
  { id: 3, label: 'Points', icon: 'target' },
  { id: 4, label: 'Screws', icon: 'implant' },
  { id: 5, label: 'Grade', icon: 'shield' },
] as const;

export function PedicleWizard({ volumeId, sliceCount }: { volumeId: string | null; sliceCount: number }) {
  const step = usePlanningStore((s) => s.workflowStep);
  const setStep = usePlanningStore((s) => s.setWorkflowStep);

  return (
    <div className="pw">
      <div className="pw-head">
        <Icon name="spine" size={16} />
        <span>Pedicle Planning Suite</span>
      </div>

      <div className="pw-stepper">
        <div className="pw-stepper-track" />
        {STEPS.map((s) => {
          const state = step === s.id ? 'active' : step > s.id ? 'done' : 'idle';
          return (
            <button key={s.id} className={`pw-step ${state}`} onClick={() => setStep(s.id)}>
              <span className="pw-step-dot">
                {state === 'done' ? <Icon name="check" size={13} /> : s.id}
              </span>
              <span className="pw-step-label">{s.label}</span>
            </button>
          );
        })}
      </div>

      <div className="pw-body" key={step}>
        {step === 1 && <StepLoad sliceCount={sliceCount} onBegin={() => setStep(2)} />}
        {step === 2 && <StepCrop />}
        {step === 3 && <StepPoints />}
        {step === 4 && <StepScrews />}
        {step === 5 && <StepGrade volumeId={volumeId} />}
      </div>

      <div className="pw-nav">
        <button className="btn btn-outline" disabled={step === 1} onClick={() => setStep(step - 1)}>
          <Icon name="chevLeft" size={15} /> Back
        </button>
        <button className="btn btn-primary" disabled={step === 5} onClick={() => setStep(step + 1)}>
          Next <Icon name="chevRight" size={15} />
        </button>
      </div>
    </div>
  );
}

function StepLoad({ sliceCount, onBegin }: { sliceCount: number; onBegin: () => void }) {
  return (
    <div className="pw-section">
      <p className="pw-hint">Volume initialized. You're ready to begin the pedicle planning workflow.</p>
      <div className="pw-status">
        <div className="pw-status-label">Status</div>
        <div className="pw-status-row">
          <Icon name="check" size={15} className="ok" />
          <span>DICOM volume loaded ({sliceCount} slices)</span>
        </div>
      </div>
      <button className="btn btn-primary pw-wide" onClick={onBegin}>
        Begin Workflow <Icon name="chevRight" size={15} />
      </button>
    </div>
  );
}

function StepCrop() {
  const roiCrop = usePlanningStore((s) => s.roiCrop);
  const updateRoiCrop = usePlanningStore((s) => s.updateRoiCrop);
  const axes: Array<{ label: string; lo: keyof RoiCrop; hi: keyof RoiCrop; color: string }> = [
    { label: 'X Range', lo: 'x0', hi: 'x1', color: '#ef4444' },
    { label: 'Y Range', lo: 'y0', hi: 'y1', color: '#f97316' },
    { label: 'Z Range', lo: 'z0', hi: 'z1', color: '#22c55e' },
  ];
  return (
    <div className="pw-section">
      <div className="mgroup-name">ROI Bounding Box</div>
      {axes.map((a) => (
        <div className="pw-roi" key={a.label}>
          <div className="pw-roi-head">
            <span style={{ color: a.color }}>{a.label}</span>
            <span className="mono">{roiCrop[a.lo].toFixed(2)} – {roiCrop[a.hi].toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={1} step={0.01} value={roiCrop[a.lo]}
            onChange={(e) => updateRoiCrop({ [a.lo]: Math.min(Number(e.target.value), roiCrop[a.hi]) } as Partial<RoiCrop>)}
            style={{ accentColor: a.color }}
          />
          <input
            type="range" min={0} max={1} step={0.01} value={roiCrop[a.hi]}
            onChange={(e) => updateRoiCrop({ [a.hi]: Math.max(Number(e.target.value), roiCrop[a.lo]) } as Partial<RoiCrop>)}
            style={{ accentColor: a.color }}
          />
        </div>
      ))}
      <p className="pw-hint">Focus on the vertebral levels of interest — the MPR and 3D view update instantly.</p>
    </div>
  );
}

function StepPoints() {
  const simulations = usePlanningStore((s) => s.simulations);
  const level = usePlanningStore((s) => s.screwLevel);
  const setLevel = usePlanningStore((s) => s.setScrewLevel);
  return (
    <div className="pw-section">
      <div className="mgroup-name">Placement Points</div>
      <label className="pw-field">
        <span>Level</span>
        <select className="mini-select" value={level} onChange={(e) => setLevel(e.target.value)}>
          {SPINAL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <p className="pw-hint">Click on a pedicle in any 2D slice (axial / sagittal / coronal) to drop a point; a screw is seeded there.</p>
      <div className="pw-list">
        {simulations.length === 0 ? (
          <div className="pw-empty">No points placed yet.</div>
        ) : (
          simulations.map((sim) => (
            <div className="pw-list-row" key={sim.id}>
              <span className="dot dot-orange" />
              <span className="mono" style={{ fontWeight: 700 }}>{sim.label}</span>
              <span className="pw-tags">
                {sim.landmarks.VAP && <span>VAP</span>}
                {sim.landmarks.PIP_L && <span>L</span>}
                {sim.landmarks.PIP_R && <span>R</span>}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StepScrews() {
  const implants = usePlanningStore((s) => s.implants);
  const selectedId = usePlanningStore((s) => s.selectedImplantId);
  const select = usePlanningStore((s) => s.selectImplant);
  const removeImplant = usePlanningStore((s) => s.removeImplant);
  const screws = implants.filter((i) => i.type === 'screw');

  return (
    <div className="pw-section">
      <div className="mgroup-name">Active Trajectories</div>
      {screws.length === 0 ? (
        <div className="pw-empty">No screws yet — drop a point in step 3.</div>
      ) : (
        <div className="pw-list">
          {screws.map((sc) => (
            <button
              key={sc.id}
              className={'pw-list-row interactive' + (sc.id === selectedId ? ' on' : '')}
              onClick={() => select(sc.id)}
            >
              <span className="dot" style={{ background: sc.properties.color }} />
              <span className="mono" style={{ flex: 1, textAlign: 'left' }}>
                {sc.level}{sc.side} · {sc.properties.diameter.toFixed(1)}×{sc.properties.length}
              </span>
              <span
                className="pw-icon-btn"
                onClick={(e) => { e.stopPropagation(); removeImplant(sc.id); }}
                title="Remove"
              >
                <Icon name="trash" size={14} />
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="pw-hint">Select a screw to edit its size and trajectory in the properties panel →</p>
    </div>
  );
}

function StepGrade({ volumeId }: { volumeId: string | null }) {
  const implants = usePlanningStore((s) => s.implants);
  const setGrading = usePlanningStore((s) => s.setGrading);
  const screws = implants.filter((i) => i.type === 'screw');

  const grade = (position: [number, number, number], direction: [number, number, number], length: number, diameter: number, simId?: string, side?: 'L' | 'R') => {
    if (!volumeId) return;
    const pct = calculateBoneContact(volumeId, position, direction, length, diameter);
    if (simId) setGrading(simId, side === 'R' ? 'right' : 'left', pct);
  };

  return (
    <div className="pw-section">
      <div className="mgroup-name">Outcome Grading</div>
      <p className="pw-hint">Analyze volumetric contact between each screw and cortical/cancellous bone.</p>
      {screws.map((sc) => {
        const sim = usePlanningStore.getState().simulations.find((s) => s.id === sc.simulationId);
        const pct = sim?.grading?.[sc.side === 'R' ? 'right' : 'left'];
        return (
          <div className="pw-grade" key={sc.id}>
            <div className="pw-grade-head">
              <span className="mono">{sc.level}{sc.side}</span>
              <span className="pw-grade-val">{pct != null ? `${pct.toFixed(0)}% contact` : '—'}</span>
            </div>
            <div className="pw-grade-bar">
              <div className="pw-grade-fill" style={{ width: `${pct ?? 0}%` }} />
            </div>
            <button
              className="btn btn-outline pw-wide"
              disabled={!volumeId}
              onClick={() => grade(sc.position, sc.direction, sc.properties.length, sc.properties.diameter, sc.simulationId, sc.side)}
            >
              Grade Placement
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Pitch/yaw angle controls — exported for the implant-properties panel. */
export function AngleControls({ direction, onChange }: {
  direction: [number, number, number];
  onChange: (dir: [number, number, number]) => void;
}) {
  const { pitch, yaw } = anglesFromVector(direction);
  return (
    <>
      <AngleSlider label="Pitch (axial)" value={pitch} onChange={(v) => onChange(vectorFromAngles(v, yaw))} />
      <AngleSlider label="Yaw (sagittal)" value={yaw} onChange={(v) => onChange(vectorFromAngles(pitch, v))} />
    </>
  );
}

function AngleSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="pw-angle">
      <div className="pw-angle-head">
        <span>{label}</span>
        <span className="mono accent">{Math.round(value)}°</span>
      </div>
      <input type="range" min={-45} max={45} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
