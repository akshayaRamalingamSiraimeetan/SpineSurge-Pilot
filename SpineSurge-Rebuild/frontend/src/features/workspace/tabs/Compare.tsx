/* Compare tab — dual viewports (Current vs Selected) with date selectors + swap, and a right-hand
   Measurement Comparison table (Current | Selected | Change) grouped by region (DESIGN.md §4.3). */
import { Icon } from '@/components/Icon';
import { DicomSlot } from '@/components/ImageSlot';
import { ViewerDock } from '../components';
import { compare } from '../data';

function ComparePane({ label, date, tag }: { label: string; date: string; tag: string }) {
  return (
    <div className="cmp-pane">
      <DicomSlot caption="Drop X-ray / DICOM image" tag={tag} style={{ width: '100%', height: '100%' }} />
      <div className="cmp-pane-label">
        <div className="t">{label}</div>
        <div className="d">{date}</div>
      </div>
      <ViewerDock />
    </div>
  );
}

export function Compare() {
  return (
    <div className="ws-body" style={{ gridTemplateColumns: '1fr 360px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="compare-top">
          <div className="cmp-select">
            <span className="field-label">Left (Current)</span>
            <select className="select" style={{ height: 38 }} defaultValue={compare.left.date}>
              <option>{compare.left.date}</option>
              <option>Feb 15, 2024</option>
            </select>
          </div>
          <button className="icon-btn" style={{ border: '1px solid var(--border-2)', marginBottom: 1 }}>
            <Icon name="swap" />
          </button>
          <div className="cmp-select">
            <span className="field-label">Right (Selected)</span>
            <select className="select" style={{ height: 38 }} defaultValue={compare.right.date}>
              <option>{compare.right.date}</option>
              <option>May 10, 2024</option>
            </select>
          </div>
        </div>
        <div className="cmp-viewers">
          <ComparePane label="Current Study" date={compare.left.date} tag="EOS LAT" />
          <ComparePane label="Selected Study" date={compare.right.date} tag="EOS LAT" />
        </div>
      </div>

      <div className="ws-panel right">
        <div className="ws-panel-head">
          <h3>Measurement Comparison</h3>
        </div>
        <div className="ws-panel-scroll" style={{ padding: '0 18px 18px' }}>
          <div className="cmp-table-head">
            <span className="cmp-th">Parameter</span>
            <span className="cmp-th" style={{ textAlign: 'right' }}>
              Current<div className="ds">{compare.left.date}</div>
            </span>
            <span className="cmp-th" style={{ textAlign: 'right' }}>
              Selected<div className="ds">{compare.right.date}</div>
            </span>
            <span className="cmp-th" style={{ textAlign: 'right' }}>
              Change
            </span>
          </div>
          {compare.groups.map((g, gi) => (
            <div className="mgroup" key={gi} style={{ marginTop: 14 }}>
              <div className="mgroup-name">{g.name}</div>
              {g.rows.map((r, i) => (
                <div className="cmp-row" key={i}>
                  <span className="cl">{r.label}</span>
                  <span className="cval a">{r.a}</span>
                  <span className="cval b">{r.b}</span>
                  <span className={'cval d-' + r.tone}>{r.d}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
