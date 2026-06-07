/* Live collaborators presence (Step 9). Shows a stacked avatar for each peer currently in the same
   workspace room, plus a small "live" dot when connected. Purely presentational — fed by useCollab. */
import type { CollabPeer } from '@/lib/collab/useCollab';

function initials(name: string): string {
  const parts = name.trim().split(/[\s.@]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function PresenceBar({ connected, peers }: { connected: boolean; peers: CollabPeer[] }) {
  if (!connected && peers.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Live collaborators">
      <span
        style={{
          width: 7, height: 7, borderRadius: '50%',
          background: connected ? 'var(--ok, #16a34a)' : 'var(--text-3)',
          boxShadow: connected ? '0 0 0 3px color-mix(in srgb, #16a34a 25%, transparent)' : 'none',
        }}
      />
      {peers.length === 0 ? (
        <span className="ws-sub" style={{ fontSize: 12 }}>Live</span>
      ) : (
        <div style={{ display: 'flex' }}>
          {peers.slice(0, 5).map((p, i) => (
            <span
              key={p.peerId}
              title={`${p.name} · ${p.role}`}
              style={{
                width: 26, height: 26, borderRadius: '50%', background: p.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, border: '2px solid var(--bg, #fff)',
                marginLeft: i === 0 ? 0 : -8,
              }}
            >
              {initials(p.name)}
            </span>
          ))}
          {peers.length > 5 && (
            <span className="ws-sub" style={{ fontSize: 12, marginLeft: 4, alignSelf: 'center' }}>
              +{peers.length - 5}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
