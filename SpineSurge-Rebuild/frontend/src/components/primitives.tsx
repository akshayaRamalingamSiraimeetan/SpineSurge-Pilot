/* Small reusable design-system pieces shared across screens (ported from shell.jsx / icons.jsx). */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

/** Collapsible panel section with an optional badge (right panels, tool panels). */
export function Collapse({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapse">
      <button className="collapse-head" onClick={() => setOpen((o) => !o)}>
        <span className="collapse-title">{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {badge != null && <span className="collapse-badge">{badge}</span>}
          <Icon name={open ? 'chevUp' : 'chevDown'} size={17} style={{ color: 'var(--text-3)' }} />
        </span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

/** Monospace abbreviation tile for measurement tools (avoids hand-drawn medical glyphs). */
export function ToolGlyph({
  abbr,
  tone = 'plain',
  size = 38,
}: {
  abbr: string;
  tone?: 'plain' | 'accent' | 'pelvic' | 'violet';
  size?: number;
}) {
  const short = abbr.length > 4 ? abbr.slice(0, 4) : abbr;
  return (
    <span className={'tool-glyph tone-' + tone} style={{ width: size, height: size }}>
      {short}
    </span>
  );
}
