/* Assessment tab — measurement tool panel (A/D/P/M + plane toggle) on the left,
   canvas viewer in the centre, case summary + live measurements on the right.
   Canvas rendering is handled by CanvasWorkspace (canvas-based, from old version).
   The SVG overlay approach is replaced; tools are drawn directly on the canvas. */
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Collapse, ToolGlyph } from '@/components/primitives';
import { assessmentTabs } from '../data';
import { AnnotationList, CaseSummary, ComputedMeasurements, MeasurementGroups, RefLinesPanel, ViewerDock } from '../components';
import { CanvasWorkspace } from '@/features/canvas/CanvasWorkspace';
import { useWorkspaceStore } from '@/lib/store/workspace';

type Plane = 'coronal' | 'sagittal';

export function Assessment() {
  const [tabKey, setTabKey] = useState<string>('alignment');
  const [plane, setPlane] = useState<Plane>('coronal');
  const activeTool = useWorkspaceStore((s) => s.activeTool);
  const setActiveTool = useWorkspaceStore((s) => s.setActiveTool);
  const pixelToMm = useWorkspaceStore((s) => s.calibration.pixelToMm);

  const tabDef = assessmentTabs.find((t) => t.key === tabKey)!;
  const data = tabDef.planes ? tabDef[plane]! : { tools: tabDef.tools ?? [], groups: tabDef.groups ?? [], refLines: tabDef.refLines ?? [] };

  return (
    <div className="ws-body">
      {/* left: tools */}
      <div className="ws-panel">
        <div className="ws-panel-head">
          <h3>Measurement Tools</h3>
        </div>
        <div className="ws-panel-scroll" style={{ padding: '0 18px 18px' }}>
          {/* A / D / P / M tab switcher */}
          <div className="adpm">
            {assessmentTabs.map((t) => (
              <button
                key={t.key}
                className={'adpm-tile' + (t.key === tabKey ? ' on' : '')}
                onClick={() => { setTabKey(t.key); setActiveTool(null); }}
              >
                <span className="lt">{t.short}</span>
                <span className="lb">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Coronal / Sagittal plane toggle (Deformity tab only) */}
          {tabDef.planes && (
            <div className="plane-toggle">
              <button className={plane === 'coronal' ? 'on' : ''} onClick={() => setPlane('coronal')}>Coronal</button>
              <button className={plane === 'sagittal' ? 'on' : ''} onClick={() => setPlane('sagittal')}>Sagittal</button>
            </div>
          )}

          {/* Tool list */}
          <div className="tool-list">
            {data.tools.map((t, i) => (
              <button
                key={i}
                className={'tool-item' + (activeTool === t.abbr ? ' on' : '')}
                onClick={() => setActiveTool(activeTool === t.abbr ? null : t.abbr)}
              >
                <ToolGlyph abbr={t.abbr} tone={activeTool === t.abbr ? 'accent' : tabKey === 'morphology' ? 'violet' : 'plain'} />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span className="ti-name" style={{ display: 'block' }}>
                    {t.label !== t.abbr ? t.abbr : t.label}
                  </span>
                  <span className="ti-desc" style={{ display: 'block' }}>{t.desc}</span>
                </span>
                {/* Green dot = live canvas tool */}
                <span
                  title="Click to arm · place points on the image"
                  style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--success)', flex: '0 0 auto' }}
                />
              </button>
            ))}
          </div>

          {/* Calibration button — arms the canvas calibration mode */}
          <button
            className={'calib-btn' + (activeTool === 'calibration' ? ' on' : '')}
            onClick={() => setActiveTool(activeTool === 'calibration' ? null : 'calibration')}
          >
            <Icon name="ruler" size={17} />{' '}
            {activeTool === 'calibration'
              ? 'Click two points…'
              : pixelToMm
                ? `Calibrated · ${(1 / pixelToMm).toFixed(1)} px/mm`
                : 'Calibration'}
          </button>
        </div>

        {/* Reference lines section */}
        {data.refLines.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <Collapse
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  Reference Lines{' '}
                  <span className="badge" style={{ height: 20, background: 'var(--success-soft)', color: 'var(--success)' }}>Active</span>
                </span>
              }
              defaultOpen
            >
              {data.refLines.map((l, i) => (
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
      </div>

      {/* centre: canvas — image + measurements drawn directly */}
      <div className="ws-viewer">
        <div className="viewer-stage" style={{ position: 'relative', display: 'flex', flex: 1, minHeight: 0 }}>
          <CanvasWorkspace showCalibration />
          <ViewerDock />
        </div>
      </div>

      {/* right: case summary + live measurement results */}
      <div className="ws-panel right">
        <div className="ws-panel-head" style={{ paddingBottom: 0 }} />
        <div className="ws-panel-scroll">
          <CaseSummary defaultOpen={false} />
          <Collapse title="Current Measurements" defaultOpen>
            <ComputedMeasurements />
            <AnnotationList />
            <MeasurementGroups groups={data.groups} />
            <RefLinesPanel lines={data.refLines} />
          </Collapse>
        </div>
      </div>
    </div>
  );
}
