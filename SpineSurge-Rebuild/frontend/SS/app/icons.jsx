/* SpineSurge Pro — icon set (line icons, 24x24, stroke=currentColor) */
const ICON_PATHS = {
  home: 'M3 10.5 12 4l9 6.5M5.5 9.5V20h13V9.5',
  workspace: 'M4 5h16v11H4zM4 16l4-4 3 3 4-5 5 6M9 9.5a1 1 0 1 0 .001 0',
  patients: 'M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a5.5 5.5 0 0 1 11 0M16 11a3 3 0 1 0-1.2-5.7M15 14.5c2.8.3 5 2.4 5 5.5',
  library: 'M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5zM20 5.5C20 4.7 19.3 4 18.5 4H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z__M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6 19.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3.3 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H8a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V8a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
  more: 'M12 6.5a.6.6 0 1 0 0-.1ZM12 12.5a.6.6 0 1 0 0-.1ZM12 18.5a.6.6 0 1 0 0-.1Z',
  moreV: 'M12 5.5a1 1 0 1 0 .01 0ZM12 11.5a1 1 0 1 0 .01 0ZM12 17.5a1 1 0 1 0 .01 0Z',
  chevDown: 'M5 9l7 7 7-7',
  chevRight: 'M9 5l7 7-7 7',
  chevLeft: 'M15 5l-7 7 7 7',
  chevUp: 'M5 15l7-7 7 7',
  arrowRight: 'M4 12h16M14 6l6 6-6 6',
  arrowLeft: 'M20 12H4M10 6l-6 6 6 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  filter: 'M3 5h18l-7 8v5l-4 2v-7z',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
  edit: 'M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3ZM14.5 7.5l3 3',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l5 5 9-11',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 7.5h.01',
  warning: 'M12 3 2.5 20h19zM12 9v5M12 17.5h.01',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  cloud: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9.5a3.5 3.5 0 0 1-.5 8.5zM12 15V9M9.5 11l2.5-2.5L14.5 11',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3ZM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  monitor: 'M3 5h18v11H3zM9 20h6M12 16v4',
  file: 'M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v4h4',
  fileText: 'M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v4h4M8 13h8M8 16.5h5',
  shield: 'M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z',
  implant: 'M10 3h4v4l-1 1v8l1 1v3h-4v-3l1-1V8l-1-1z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  sort: 'M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3',
  swap: 'M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13',
  undo: 'M9 7H5V3M5 7a8 8 0 1 1-2 5',
  redo: 'M15 7h4V3M19 7a8 8 0 1 0 2 5',
  camera: 'M4 8a1 1 0 0 1 1-1h2l1.5-2h7L18 7h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  cursor: 'M5 3l14 7-6 1.5L9 18z',
  pencil: 'M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3ZM14.5 7.5l3 3',
  ruler: 'M3 9l6-6 12 12-6 6zM8 8l1.5 1.5M11 5l2 2M5 11l2 2',
  angle: 'M5 19h14M5 19V7M5 19l11-9',
  textT: 'M5 5h14M12 5v14',
  eraser: 'M5 16 14 7l5 5-7 7H8zM10 11l5 5',
  fullscreen: 'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4',
  hand: 'M7 11V5.5a1.5 1.5 0 0 1 3 0V11M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V5.5a1.5 1.5 0 0 1 3 0V13M16 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.5-2L4 14.5a1.6 1.6 0 0 1 2.3-2.2L7.5 13.5',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5M8 11h6',
  refresh: 'M20 11a8 8 0 1 0-.5 4M20 5v6h-6',
  link: 'M9 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M15 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
  lock: 'M6 11h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1ZM8 11V8a4 4 0 0 1 8 0v3',
  sliders: 'M4 8h10M18 8h2M4 16h2M10 16h10M14 5v6M6 13v6',
  clipboard: 'M9 4h6v3H9zM7 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1M8.5 12h7M8.5 16h4',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  cube: 'M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h.01',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M10 4h6M8 20h6M14 4 10 20',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 21h14',
  listBullet: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  listNum: 'M10 6h10M10 12h10M10 18h10M4 6h1.5v3M4 9h3M4 17.5h2.5v-1H4v-1h2.5',
  indent: 'M4 6h16M10 12h10M10 18h10M4 10v4l3-2z',
  minus: 'M5 12h14',
  plusCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v8M8 12h8',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z',
  pin: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  flag: 'M5 21V4M5 4h11l-2 3 2 3H5',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  rotate: 'M4 4v6h6M4 10a8 8 0 1 1 1.5 6',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 4v4h4',
  spine: 'M12 3v18M9 5h6M9 9h6M9 13h6M9 17h6',
  plug: 'M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5',
};

function Icon({ name, size = 20, fill = false, style, strokeWidth = 1.7, className }) {
  const d = ICON_PATHS[name];
  const segs = d ? d.split('__') : [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={style} className={className} aria-hidden="true">
      {segs.map((s, i) => <path key={i} d={s} />)}
    </svg>
  );
}

/* SpineSurge S-mark — clean geometric vertebral mark in brand red */
function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="SpineSurge">
      <path d="M22 8.5C20.2 6.8 17.8 6 15.2 6.6 11.6 7.4 9.4 10.8 10.6 13.8c.9 2.3 3.4 3.1 6.2 3.6 2.8.5 4.4 1.2 4.9 2.6.7 1.9-.8 4-3.6 4.6-2.2.5-4.4-.1-6-1.6"
        stroke="var(--accent)" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9.5" cy="22.5" r="1.9" fill="var(--accent)"/>
    </svg>
  );
}

function Wordmark({ size = 17 }) {
  return (
    <span style={{ fontWeight: 800, fontSize: size, letterSpacing: '-.02em', display: 'inline-flex' }}>
      <span style={{ color: 'var(--text)' }}>Spine</span><span style={{ color: 'var(--accent)' }}>Surge</span>
    </span>
  );
}

/* abbreviation tile for measurement tools (avoids hand-drawn medical glyphs) */
function ToolGlyph({ abbr, tone = 'plain', size = 38 }) {
  const short = abbr.length > 4 ? abbr.slice(0, 4) : abbr;
  return (
    <span className={'tool-glyph tone-' + tone} style={{ width: size, height: size }}>
      {short}
    </span>
  );
}

Object.assign(window, { Icon, Logo, Wordmark, ToolGlyph });
