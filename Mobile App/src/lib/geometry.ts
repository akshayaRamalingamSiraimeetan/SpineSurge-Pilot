import type { Calibration, Measurement, Pt } from './types';

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** mm per image pixel from a calibration, or null. */
export function mmPerPx(cal: Calibration | null): number | null {
  if (!cal) return null;
  const d = dist(cal.points[0], cal.points[1]);
  return d > 0 && cal.mm > 0 ? cal.mm / d : null;
}

/** Angle at vertex v between v→a and v→b, 0–180°. */
export function angleAt(a: Pt, v: Pt, b: Pt): number {
  const ux = a.x - v.x, uy = a.y - v.y, wx = b.x - v.x, wy = b.y - v.y;
  const lu = Math.hypot(ux, uy), lw = Math.hypot(wx, wy);
  if (!lu || !lw) return 0;
  const c = Math.max(-1, Math.min(1, (ux * wx + uy * wy) / (lu * lw)));
  return (Math.acos(c) * 180) / Math.PI;
}

/**
 * Cobb angle between two endplate lines (a1→a2, b1→b2), 0–180°.
 * Both lines are oriented left→right first, so click direction doesn't
 * matter and curves above 90° are reported correctly (same rule as the
 * SpineSurge web app).
 */
export function cobbAngle(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  const orient = (p: Pt, q: Pt) => {
    let x = q.x - p.x, y = q.y - p.y;
    if (x < 0 || (x === 0 && y > 0)) { x = -x; y = -y; }
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };
  const u = orient(a1, a2), w = orient(b1, b2);
  const c = Math.max(-1, Math.min(1, u.x * w.x + u.y * w.y));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Numeric value + unit of a finished measurement. */
export function measure(m: Pick<Measurement, 'type' | 'points'>, cal: Calibration | null): { value: number; unit: string } | null {
  const p = m.points;
  if (m.type === 'distance' && p.length >= 2) {
    const r = mmPerPx(cal);
    const d = dist(p[0], p[1]);
    return r ? { value: d * r, unit: 'mm' } : { value: d, unit: 'px' };
  }
  if (m.type === 'angle' && p.length >= 3) return { value: angleAt(p[0], p[1], p[2]), unit: '°' };
  if (m.type === 'cobb' && p.length >= 4) return { value: cobbAngle(p[0], p[1], p[2], p[3]), unit: '°' };
  return null;
}

export function formatValue(v: { value: number; unit: string } | null): string {
  if (!v) return '—';
  return v.unit === '°' ? `${v.value.toFixed(1)}°` : `${v.value.toFixed(v.unit === 'mm' ? 1 : 0)} ${v.unit}`;
}

/** Where to draw a measurement's label (image coords). */
export function labelAnchor(m: Pick<Measurement, 'type' | 'points'>): Pt | null {
  const p = m.points;
  if (m.type === 'distance' && p.length >= 2) return mid(p[0], p[1]);
  if (m.type === 'angle' && p.length >= 3) return p[1];
  if (m.type === 'cobb' && p.length >= 4) return mid(mid(p[0], p[1]), mid(p[2], p[3]));
  return null;
}
