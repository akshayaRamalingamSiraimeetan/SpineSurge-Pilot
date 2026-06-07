/* Settings modal (DESIGN.md §4.6) — left tabs + right content. The General tab's profile reads the
   real signed-in identity (/auth/me) and the theme preference is wired live to the UI store. The
   PACS panel (configured Orthanc), the Admin user list (org members), and Storage & Usage (real
   counts) are now LIVE via the /org endpoints. */
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useTheme } from '@/lib/theme/useTheme';
import { Toggle } from '@/components/ui/Toggle';
import { useOrgMembers, useOrgStats, usePacsConnections } from '@/lib/api/hooks';
import { settingsTabs } from './data';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function GeneralTab() {
  const { me, orgName } = useAuth();
  const { theme, setTheme } = useTheme();
  return (
    <>
      <div className="mgroup-name">Profile</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
        <Field label="Email">
          <input className="input" value={me?.email ?? ''} readOnly />
        </Field>
        <Field label="Role">
          <input className="input" value={me?.role ?? ''} readOnly style={{ textTransform: 'capitalize' }} />
        </Field>
        <Field label="Organization">
          <input className="input" value={orgName ?? ''} readOnly />
        </Field>
        <Field label="Department">
          <input className="input" placeholder="Orthopaedic Surgery" />
        </Field>
      </div>
      <div className="mgroup-name" style={{ marginTop: 8 }}>Preferences</div>
      <Field label="Theme">
        <div className="seg" style={{ width: 'fit-content' }}>
          <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>
            Light
          </button>
          <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>
            Dark
          </button>
        </div>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
        <Field label="Language">
          <select className="select" defaultValue="English">
            <option>English</option>
            <option>Español</option>
          </select>
        </Field>
        <Field label="Date Format">
          <select className="select" defaultValue="MMM D, YYYY">
            <option>MMM D, YYYY</option>
            <option>DD/MM/YYYY</option>
          </select>
        </Field>
      </div>
    </>
  );
}

function PacsTab() {
  const { data: pacsConnections = [], isLoading } = usePacsConnections();
  return (
    <>
      <div className="cs-row" style={{ paddingTop: 0 }}>
        <span className="csl">Auto-read DICOM metadata on import</span>
        <Toggle defaultOn />
      </div>
      <div className="mgroup-name" style={{ marginTop: 14 }}>PACS Connections</div>
      <table className="set-table">
        <thead>
          <tr>
            <th>Server</th>
            <th>AE Title</th>
            <th>Host</th>
            <th>Port</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pacsConnections.map((p) => (
            <tr key={p.ae}>
              <td style={{ fontWeight: 600 }}>{p.server}</td>
              <td className="mono">{p.ae}</td>
              <td className="mono">{p.host}</td>
              <td className="mono">{p.port}</td>
              <td>
                <span className="status">
                  <span className={'dot ' + (p.status === 'Configured' ? 'dot-green' : 'dot-red')} />
                  {p.status}
                </span>
              </td>
            </tr>
          ))}
          {!isLoading && pacsConnections.length === 0 && (
            <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 16 }}>No PACS configured.</td></tr>
          )}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn btn-outline btn-sm">
          <Icon name="plus" size={15} /> Add PACS
        </button>
        <button className="btn btn-ghost btn-sm">
          <Icon name="plug" size={15} /> Test All Connections
        </button>
      </div>
    </>
  );
}

function WorkspaceTab() {
  const rows: [string, React.ReactNode][] = [
    ['Default view', <select className="mini-select" defaultValue="Lateral"><option>AP</option><option>Lateral</option><option>3D</option></select>],
    ['Units', <select className="mini-select" defaultValue="° / mm"><option>° / mm</option><option>rad / cm</option></select>],
    ['Auto-save interval', <select className="mini-select" defaultValue="30s"><option>15s</option><option>30s</option><option>60s</option></select>],
    ['Reference lines on by default', <Toggle defaultOn />],
    ['Warn before discarding changes', <Toggle defaultOn />],
  ];
  return (
    <>
      <div className="mgroup-name">Workspace Defaults</div>
      {rows.map(([label, control], i) => (
        <div className="cs-row" key={i} style={i ? { borderTop: '1px solid var(--border)' } : undefined}>
          <span className="csl">{label}</span>
          <span className="csv">{control}</span>
        </div>
      ))}
    </>
  );
}

function AdminTab() {
  const { me } = useAuth();
  const isAdmin = me?.role === 'admin' || me?.role === 'owner';
  const { data: members = [], isLoading, isError } = useOrgMembers(isAdmin);
  const { data: stats } = useOrgStats();

  const statCards: [string, string, string][] = [
    ['Patients', stats ? String(stats.patients) : '—', 'Active'],
    ['Studies', stats ? String(stats.studies) : '—', 'Total'],
    ['Reports', stats ? String(stats.reports) : '—', 'Total'],
    ['Collections', stats ? String(stats.collections) : '—', 'Total'],
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="mgroup-name" style={{ margin: 0 }}>Users</div>
        <button className="btn btn-outline btn-sm">
          <Icon name="plus" size={15} /> Invite User
        </button>
      </div>
      {!isAdmin ? (
        <div className="muted" style={{ padding: '14px 0', fontSize: 13.5 }}>
          Only administrators can view the organisation's member list.
        </div>
      ) : (
        <table className="set-table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((u) => (
              <tr key={u.user_id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td className="muted">{u.email ?? '—'}</td>
                <td>
                  <span className="badge badge-soft">{u.role}</span>
                </td>
                <td>
                  <span className="status">
                    <span className="dot dot-green" />
                    {u.status}
                  </span>
                </td>
              </tr>
            ))}
            {isLoading && (
              <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 16 }}>Loading…</td></tr>
            )}
            {isError && (
              <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 16 }}>Could not load members.</td></tr>
            )}
          </tbody>
        </table>
      )}
      <div className="mgroup-name" style={{ marginTop: 18 }}>Storage & Usage</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {statCards.map(([label, value, sub]) => (
          <div className="card" key={label} style={{ padding: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 2px' }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function LockedTab() {
  return (
    <div className="state-block">
      <span className="sb-ico">
        <Icon name="lock" size={24} />
      </span>
      <div className="sb-title">Instrumentation Library</div>
      <div className="sb-sub">This module is locked. Contact your administrator to enable the implant catalog.</div>
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState('general');
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ width: 940, maxWidth: '95vw', height: 620, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>Settings</h2>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ width: 230, borderRight: '1px solid var(--border)', padding: 12, flexShrink: 0 }}>
            {settingsTabs.map((t) => (
              <button
                key={t.key}
                className={'side-link' + (t.key === tab ? ' active' : '')}
                onClick={() => setTab(t.key)}
              >
                <Icon name={t.icon} />
                <span style={{ flex: 1 }}>{t.label}</span>
                {t.locked && <Icon name="lock" size={15} style={{ color: 'var(--text-3)' }} />}
              </button>
            ))}
          </div>
          <div className="scroll-y" style={{ flex: 1, padding: 24 }}>
            {tab === 'general' && <GeneralTab />}
            {tab === 'dicom' && <PacsTab />}
            {tab === 'workspace' && <WorkspaceTab />}
            {tab === 'library' && <WorkspaceTab />}
            {tab === 'instr' && <LockedTab />}
            {tab === 'admin' && <AdminTab />}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <span className="badge badge-soft">SpineSurge Pro · v0.1.0</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose}>
              Reset to Defaults
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
