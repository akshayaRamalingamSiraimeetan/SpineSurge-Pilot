/* SpineSurge Pro — app shell: sidebar, theme, shared components */
const { useState, useEffect, useRef, createContext, useContext } = React;

/* ---------- theme ---------- */
function useThemeState() {
  const [theme, setThemeRaw] = useState(() => localStorage.getItem('ss-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ss-theme', theme);
  }, [theme]);
  return [theme, setThemeRaw];
}

/* ---------- sidebar rail ---------- */
function Sidebar({ route, go, onSettings, theme, setTheme }) {
  const items = [
    { key: 'dashboard', icon: 'home', label: 'Home' },
    { key: 'workspace', icon: 'workspace', label: 'Workspace' },
    { key: 'patients', icon: 'patients', label: 'Patients' },
    { key: 'library', icon: 'library', label: 'Library' },
  ];
  return (
    <nav className="rail">
      <div className="rail-logo"><Logo size={34} /></div>
      <div className="rail-nav">
        {items.map(it => (
          <button key={it.key} className={'rail-btn' + (route === it.key ? ' active' : '')} onClick={() => go(it.key)}>
            <Icon name={it.icon} />
            <span className="rail-tip">{it.label}</span>
          </button>
        ))}
      </div>
      <button className="rail-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        <Icon name={theme === 'light' ? 'moon' : 'sun'} />
        <span className="rail-tip">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
      </button>
      <button className="rail-btn" onClick={onSettings}>
        <Icon name="settings" />
        <span className="rail-tip">Settings</span>
      </button>
      <div className="rail-avatar">
        <image-slot id="user-avatar" shape="circle" style={{ width: '40px', height: '40px' }} placeholder="Photo"></image-slot>
      </div>
    </nav>
  );
}

/* ---------- shared bits ---------- */
function Avatar({ initials, size = 40, tone = 'plain' }) {
  return (
    <span className={'avatar-initials tone-' + tone} style={{ width: size, height: size, fontSize: size * .36 }}>
      {initials}
    </span>
  );
}

function MoreBtn({ onClick }) {
  return <button className="icon-btn" onClick={onClick}><Icon name="moreV" /></button>;
}

function useOutside(ref, onClose) {
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
}

function ModalShell({ children, onClose, width = 720, pad = true }) {
  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal" style={{ width, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onMouseDown={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* collapsible section header used across panels */
function Collapse({ title, badge, defaultOpen = true, children, accent }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapse">
      <button className="collapse-head" onClick={() => setOpen(o => !o)}>
        <span className="collapse-title" style={accent ? { color: 'var(--accent)' } : null}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {badge != null && <span className="collapse-badge">{badge}</span>}
          <Icon name={open ? 'chevUp' : 'chevDown'} size={17} style={{ color: 'var(--text-3)' }} />
        </span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

/* viewer image area with floating tool dock */
const VIEWER_TOOLS = ['cursor','pencil','ruler','textT','eraser','sep','fullscreen','undo','redo','camera'];
function ViewerDock({ tools = VIEWER_TOOLS }) {
  const [active, setActive] = useState('cursor');
  return (
    <div className="viewer-dock">
      {tools.map((t, i) => t === 'sep'
        ? <div key={i} className="dock-sep" />
        : <button key={t} className={'dock-btn' + (active === t ? ' on' : '')}
            onClick={() => ['cursor','pencil','ruler','textT','eraser'].includes(t) && setActive(t)}>
            <Icon name={t} size={18} />
          </button>
      )}
    </div>
  );
}

function ViewSelect({ value, onChange, options = ['AP','Lateral','Oblique'] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useOutside(ref, () => setOpen(false));
  return (
    <div className="view-select" ref={ref}>
      <button className="view-select-btn" onClick={() => setOpen(o => !o)}>
        <span className="vs-tag">{value === 'Lateral' ? 'L' : value === 'AP' ? 'AP' : 'OB'}</span>
        {value}
        <Icon name="chevDown" size={15} />
      </button>
      {open && (
        <div className="view-select-menu pop">
          {options.map(o => (
            <button key={o} className={o === value ? 'on' : ''} onClick={() => { onChange(o); setOpen(false); }}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* DICOM image slot — always on black */
function DicomSlot({ id, caption = 'Drop X-ray / DICOM', tag, style }) {
  return (
    <div className="dicom-wrap" style={style}>
      <image-slot id={id} fit="contain" radius="0" placeholder={caption}
        style={{ width: '100%', height: '100%', background: 'var(--viewer-bg)' }}></image-slot>
      {tag && <span className="modality-tag">{tag}</span>}
    </div>
  );
}

Object.assign(window, { useThemeState, Sidebar, Avatar, MoreBtn, useOutside, ModalShell, Collapse, ViewerDock, ViewSelect, DicomSlot });
