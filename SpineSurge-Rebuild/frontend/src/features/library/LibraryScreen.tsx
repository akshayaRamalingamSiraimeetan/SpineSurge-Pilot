/* Library — collections column + collection view (header, Studies/Details tabs, study grid)
   per DESIGN.md §4.5. Rendered inside the global icon rail. Collections are LIVE: list/detail come
   from /collections, and "New" creates a real collection. The Studies grid opens the workspace for
   the real study. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { DicomSlot } from '@/components/ImageSlot';
import { useCollection, useCollections, useCreateCollection } from '@/lib/api/hooks';
import { formatDate } from '@/lib/utils';

function NewCollectionModal({ onClose }: { onClose: () => void }) {
  const create = useCreateCollection();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), description: description.trim() || null, is_private: isPrivate },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" style={{ width: 460, maxWidth: '94vw' }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ padding: '24px 26px 0', display: 'flex', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 21, fontWeight: 700 }}>New Collection</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div style={{ padding: '18px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Name</span>
            <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="e.g. PSO Cases" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Description</span>
            <textarea className="input" value={description} rows={3}
              onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            <span style={{ fontSize: 14 }}>Private collection</span>
          </label>
          {create.isError && (
            <span style={{ color: 'var(--danger)', fontSize: 13 }}>Could not create collection.</span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 26px',
          borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!name.trim() || create.isPending} onClick={submit}>
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LibraryScreen() {
  const navigate = useNavigate();
  const { data: collections = [], isLoading } = useCollections();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<'studies' | 'details'>('studies');
  const [showNew, setShowNew] = useState(false);

  // Resolve the active collection without setting state in an effect: an explicit selection wins,
  // otherwise default to the first collection in the (server-ordered) list.
  const activeId = selectedId ?? collections[0]?.id;
  const setActiveId = setSelectedId;

  const { data: active } = useCollection(activeId);
  const sharedCount = collections.filter((c) => !c.is_private).length;

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {/* collections column */}
      <div className="list-col">
        <div className="list-col-head">
          <div className="lch-top">
            <h2>Library</h2>
            <button className="btn btn-outline btn-sm" onClick={() => setShowNew(true)}>
              <Icon name="plus" size={15} /> New
            </button>
          </div>
        </div>
        <div className="list-col-scroll">
          {[
            { id: '_all', name: 'Collections', count: collections.length, icon: 'library' },
            { id: '_shared', name: 'Shared with me', count: sharedCount, icon: 'link' },
            { id: '_recent', name: 'Recently added', count: collections.length, icon: 'clock' },
          ].map((c) => (
            <button key={c.id} className="coll-row">
              <Icon name={c.icon} size={18} style={{ color: 'var(--text-3)' }} />
              <span className="cr-name">{c.name}</span>
              <span className="cr-count">{c.count}</span>
            </button>
          ))}
          <div className="mgroup-name" style={{ padding: '14px 12px 6px' }}>My Collections</div>
          {isLoading && <div className="muted" style={{ padding: '8px 12px', fontSize: 13 }}>Loading…</div>}
          {!isLoading && collections.length === 0 && (
            <div className="muted" style={{ padding: '8px 12px', fontSize: 13 }}>
              No collections yet. Click “New” to create one.
            </div>
          )}
          {collections.map((c) => (
            <button key={c.id} className={'coll-row' + (c.id === activeId ? ' active' : '')} onClick={() => setActiveId(c.id)}>
              <Icon name="folder" size={18} style={{ color: c.id === activeId ? 'var(--accent)' : 'var(--text-3)' }} />
              <span className="cr-name">{c.name}</span>
              <span className="cr-count">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* collection view */}
      <div className="detail">
        {!active ? (
          <div className="detail-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            {collections.length === 0 ? 'Create a collection to get started.' : 'Select a collection.'}
          </div>
        ) : (
          <>
            <div className="detail-head" style={{ alignItems: 'flex-start' }}>
              <DicomSlot caption="" tag="X-RAY" style={{ width: 72, height: 72, borderRadius: 'var(--r-md)', flex: 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="dh-name">{active.name}</div>
                  {active.is_private && (
                    <span className="badge badge-line">
                      <Icon name="lock" size={13} /> Private
                    </span>
                  )}
                </div>
                <div className="dh-meta">{active.description ?? 'No description.'}</div>
                <div className="dh-meta">
                  <span>{active.count} studies</span>
                  {active.owner_name && (
                    <>
                      <span className="dot" style={{ background: 'var(--text-3)', width: 4, height: 4 }} />
                      <span>{active.owner_name}</span>
                    </>
                  )}
                  <span className="dot" style={{ background: 'var(--text-3)', width: 4, height: 4 }} />
                  <span>Created {formatDate(active.created_at)}</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm">
                <Icon name="edit" size={15} /> Edit Collection
              </button>
            </div>

            <div style={{ display: 'flex', gap: 4, padding: '12px 30px 0' }}>
              <button className={'ws-tab' + (tab === 'studies' ? ' on' : '')} onClick={() => setTab('studies')}>Studies</button>
              <button className={'ws-tab' + (tab === 'details' ? ' on' : '')} onClick={() => setTab('details')}>Details</button>
            </div>

            <div className="detail-body">
              {tab === 'studies' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span className="muted" style={{ fontWeight: 600 }}>{active.studies.length} Studies</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="icon-btn" style={{ border: '1px solid var(--border-2)' }}><Icon name="sort" size={17} /></button>
                      <button className="icon-btn" style={{ border: '1px solid var(--border-2)' }}><Icon name="filter" size={17} /></button>
                    </div>
                  </div>
                  {active.studies.length === 0 ? (
                    <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>
                      No studies in this collection yet.
                    </div>
                  ) : (
                    <div className="lib-grid">
                      {active.studies.map((s) => (
                        <div key={s.study_id} className="card lib-card" onClick={() => navigate(`/workspace/${s.study_id}`)}>
                          <DicomSlot caption="Drop" tag={s.modality} style={{ width: '100%', height: 140 }} />
                          <div className="lc-info">
                            <div className="lc-name">{s.name}</div>
                            <div className="lc-meta">{s.patient} · {s.sex}</div>
                            <div className="lc-meta">{formatDate(s.date)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ maxWidth: 520 }}>
                  <div className="mgroup-name">Collection Details</div>
                  {[
                    ['Name', active.name],
                    ['Visibility', active.is_private ? 'Private' : 'Shared'],
                    ['Owner', active.owner_name ?? '—'],
                    ['Created', formatDate(active.created_at)],
                    ['Studies', String(active.count)],
                  ].map(([k, v]) => (
                    <div className="cs-row" key={k} style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="csl">{k}</span>
                      <span className="csv">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {showNew && <NewCollectionModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
