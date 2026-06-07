/* Right-rail properties for the selected screw/rod: size (from the level catalog), trajectory
 * angles, and insertion depth. Edits flow through the planningStore, which keeps diameter/length
 * consistent with the parity-locked ScrewDefaults catalog. */
import { getLevelDefaults } from '@/features/measurements/planning/ScrewDefaults';
import { usePlanningStore } from './planningStore';
import { AngleControls } from './PedicleWizard';

export function ImplantPropertiesPanel() {
  const selectedId = usePlanningStore((s) => s.selectedImplantId);
  const implant = usePlanningStore((s) => s.implants.find((i) => i.id === s.selectedImplantId));
  const updateScrewProps = usePlanningStore((s) => s.updateScrewProps);
  const updateImplant = usePlanningStore((s) => s.updateImplant);

  if (!implant || !selectedId) {
    return (
      <div className="ws-panel-scroll">
        <div className="ws-panel-head"><h3>Implant Properties</h3></div>
        <div style={{ padding: '0 18px' }}>
          <div className="pw-empty">Select a screw to edit its properties.</div>
        </div>
      </div>
    );
  }

  const level = implant.level ?? 'L4';
  const defaults = getLevelDefaults(level);
  const lengthsForDiameter =
    defaults.measurements.find((m) => m.diameter === implant.properties.diameter)?.lengths ?? [];

  return (
    <div className="ws-panel-scroll">
      <div className="ws-panel-head">
        <h3>Implant Properties</h3>
      </div>
      <div style={{ padding: '0 18px 18px' }}>
        <div className="pw-prop-id">
          <span className="dot" style={{ background: implant.properties.color }} />
          <span className="mono" style={{ fontWeight: 700 }}>{level}{implant.side} screw</span>
          <span className="badge">{defaults.region}</span>
        </div>

        <div className="mgroup-name" style={{ marginTop: 14 }}>Geometry</div>
        <div className="pw-grid2">
          <label className="pw-field">
            <span>Ø Diameter</span>
            <select
              className="mini-select"
              value={implant.properties.diameter}
              onChange={(e) => updateScrewProps(selectedId, { diameter: Number(e.target.value) })}
            >
              {defaults.measurements.map((m) => (
                <option key={m.diameter} value={m.diameter}>{m.diameter.toFixed(1)} mm</option>
              ))}
            </select>
          </label>
          <label className="pw-field">
            <span>Length</span>
            <select
              className="mini-select"
              value={implant.properties.length}
              onChange={(e) => updateScrewProps(selectedId, { length: Number(e.target.value) })}
            >
              {lengthsForDiameter.map((l) => <option key={l} value={l}>{l} mm</option>)}
            </select>
          </label>
        </div>

        <div className="mgroup-name" style={{ marginTop: 16 }}>Trajectory</div>
        <AngleControls
          direction={implant.direction}
          onChange={(direction) => updateImplant(selectedId, { direction })}
        />

        <div className="pw-angle" style={{ marginTop: 4 }}>
          <div className="pw-angle-head">
            <span>Insertion depth</span>
            <span className="mono accent">{Math.round(implant.properties.depth ?? implant.properties.length)} mm</span>
          </div>
          <input
            type="range" min={10} max={90} step={1}
            value={implant.properties.depth ?? implant.properties.length}
            onChange={(e) => updateScrewProps(selectedId, { depth: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
