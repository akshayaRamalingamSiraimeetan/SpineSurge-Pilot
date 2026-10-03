import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import type { Calibration, Measurement, Pt, ToolId } from '@/lib/types';
import { formatValue, labelAnchor, measure, mid } from '@/lib/geometry';
import { useTheme } from '@/lib/theme';

/**
 * Image + measurement overlay with touch interaction:
 *  - 1 finger on a point          → drag it (loupe shows the exact position)
 *  - 1 finger with a tool active  → a new point follows the finger, placed on release
 *  - 1 finger elsewhere           → pan; a short tap selects the nearest measurement
 *  - 2 fingers                    → pinch-zoom + pan
 * All geometry is stored in IMAGE pixels; the view transform is only for display.
 */

export type PointRef =
  | { kind: 'measurement'; id: string; index: number }
  | { kind: 'calibration'; index: number }
  | { kind: 'draft'; index: number };

export interface Props {
  image: { uri: string; width: number; height: number };
  measurements: Measurement[];
  calibration: Calibration | null;
  activeTool: ToolId | null;
  draft: Pt[];
  selectedId: string | null;
  onAddPoint: (p: Pt) => void;
  onMovePoint: (ref: PointRef, p: Pt, final: boolean) => void;
  onSelect: (id: string | null) => void;
}

export interface View2D { s: number; tx: number; ty: number }
type Mode =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; base: View2D; moved: boolean }
  | { kind: 'pinch'; d0: number; c0: Pt; base: View2D }
  | { kind: 'drag'; ref: PointRef }
  | { kind: 'place' };

const HIT = 28;       // finger hit radius (screen px)
const LOUPE = 128;    // loupe size
const LOUPE_ZOOM = 2.5;

export const MeasureCanvas = forwardRef<View, Props>(function MeasureCanvas(props, ref) {
  const t = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View2D>({ s: 1, tx: 0, ty: 0 });
  const [cursor, setCursor] = useState<Pt | null>(null); // image coords under the finger (place/drag)
  const origin = useRef({ x: 0, y: 0 });                 // container position on screen
  const containerRef = useRef<View>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const propsRef = useRef(props);
  propsRef.current = props;
  const fitRef = useRef(1);

  // Fit the image whenever the canvas size or the image changes.
  useEffect(() => {
    if (!size.w || !size.h) return;
    const s = Math.min(size.w / props.image.width, size.h / props.image.height);
    fitRef.current = s;
    setView({ s, tx: (size.w - props.image.width * s) / 2, ty: (size.h - props.image.height * s) / 2 });
  }, [size.w, size.h, props.image.width, props.image.height, props.image.uri]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
    containerRef.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
  };

  const local = (e: GestureResponderEvent, i = 0) => {
    const tch = e.nativeEvent.touches[i] ?? e.nativeEvent;
    return { x: tch.pageX - origin.current.x, y: tch.pageY - origin.current.y };
  };
  const toImage = (p: Pt): Pt => {
    const v = viewRef.current;
    return { x: (p.x - v.tx) / v.s, y: (p.y - v.ty) / v.s };
  };
  const toScreen = (p: Pt, v: View2D = viewRef.current): Pt => ({ x: p.x * v.s + v.tx, y: p.y * v.s + v.ty });

  /** Nearest editable point under the finger. */
  const hitPoint = (sp: Pt): PointRef | null => {
    const { measurements, calibration, draft } = propsRef.current;
    let best: { ref: PointRef; d: number } | null = null;
    const consider = (p: Pt, r: PointRef) => {
      const q = toScreen(p);
      const d = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (d < HIT && (!best || d < best.d)) best = { ref: r, d };
    };
    draft.forEach((p, i) => consider(p, { kind: 'draft', index: i }));
    measurements.forEach((m) => m.points.forEach((p, i) => consider(p, { kind: 'measurement', id: m.id, index: i })));
    calibration?.points.forEach((p, i) => consider(p, { kind: 'calibration', index: i }));
    return (best as { ref: PointRef } | null)?.ref ?? null;
  };

  /** Measurement whose lines/label are nearest to a tap. */
  const hitMeasurement = (sp: Pt): string | null => {
    let best: { id: string; d: number } | null = null;
    const segD = (a: Pt, b: Pt) => {
      const A = toScreen(a), B = toScreen(b);
      const vx = B.x - A.x, vy = B.y - A.y;
      const u = Math.max(0, Math.min(1, ((sp.x - A.x) * vx + (sp.y - A.y) * vy) / (vx * vx + vy * vy || 1)));
      return Math.hypot(sp.x - (A.x + vx * u), sp.y - (A.y + vy * u));
    };
    for (const m of propsRef.current.measurements) {
      const p = m.points;
      const segs: [Pt, Pt][] = m.type === 'cobb' ? [[p[0], p[1]], [p[2], p[3]]] : m.type === 'angle' ? [[p[0], p[1]], [p[1], p[2]]] : [[p[0], p[1]]];
      for (const [a, b] of segs) {
        if (!a || !b) continue;
        const d = segD(a, b);
        if (d < 24 && (!best || d < best.d)) best = { id: m.id, d };
      }
    }
    return (best as { id: string } | null)?.id ?? null;
  };

  const mode = useRef<Mode>({ kind: 'none' });

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const touches = e.nativeEvent.touches;
      if (touches.length >= 2) return startPinch(e);
      const sp = local(e);
      const hit = hitPoint(sp);
      if (hit) {
        mode.current = { kind: 'drag', ref: hit };
        setCursor(toImage(sp));
      } else if (propsRef.current.activeTool) {
        mode.current = { kind: 'place' };
        setCursor(toImage(sp));
      } else {
        mode.current = { kind: 'pan', startX: sp.x, startY: sp.y, base: viewRef.current, moved: false };
      }
    },
    onPanResponderMove: (e) => {
      const touches = e.nativeEvent.touches;
      if (touches.length >= 2) {
        if (mode.current.kind !== 'pinch') startPinch(e);
        const m = mode.current as Extract<Mode, { kind: 'pinch' }>;
        const a = local(e, 0), b = local(e, 1);
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const fit = fitRef.current;
        const s = Math.max(fit * 0.5, Math.min(fit * 14, m.base.s * (d / m.d0)));
        // keep the image point under the initial pinch centre under the fingers
        const ix = (m.c0.x - m.base.tx) / m.base.s, iy = (m.c0.y - m.base.ty) / m.base.s;
        setView({ s, tx: c.x - ix * s, ty: c.y - iy * s });
        return;
      }
      const sp = local(e);
      const m = mode.current;
      if (m.kind === 'pan') {
        const dx = sp.x - m.startX, dy = sp.y - m.startY;
        if (Math.hypot(dx, dy) > 6) m.moved = true;
        setView({ s: m.base.s, tx: m.base.tx + dx, ty: m.base.ty + dy });
      } else if (m.kind === 'drag') {
        const ip = toImage(sp);
        setCursor(ip);
        propsRef.current.onMovePoint(m.ref, ip, false);
      } else if (m.kind === 'place') {
        setCursor(toImage(sp));
      }
    },
    onPanResponderRelease: (e) => {
      const m = mode.current;
      const sp = { x: e.nativeEvent.pageX - origin.current.x, y: e.nativeEvent.pageY - origin.current.y };
      if (m.kind === 'drag') propsRef.current.onMovePoint(m.ref, toImage(sp), true);
      else if (m.kind === 'place') propsRef.current.onAddPoint(toImage(sp));
      else if (m.kind === 'pan' && !m.moved) propsRef.current.onSelect(hitMeasurement(sp));
      mode.current = { kind: 'none' };
      setCursor(null);
    },
    onPanResponderTerminate: () => { mode.current = { kind: 'none' }; setCursor(null); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  function startPinch(e: GestureResponderEvent) {
    const a = local(e, 0), b = local(e, 1);
    mode.current = { kind: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, base: viewRef.current };
    setCursor(null);
  }

  // Loupe: magnified view around the finger, shown on the side away from it.
  const loupe = cursor && (() => {
    const L = view.s * LOUPE_ZOOM;
    const lv: View2D = { s: L, tx: LOUPE / 2 - cursor.x * L, ty: LOUPE / 2 - cursor.y * L };
    const fingerOnLeft = toScreen(cursor).x < size.w / 2;
    return (
      <View pointerEvents="none" style={[styles.loupe, { borderColor: t.annotate, [fingerOnLeft ? 'right' : 'left']: 12 }]}>
        <Image source={{ uri: props.image.uri }} style={{ position: 'absolute', left: lv.tx, top: lv.ty, width: props.image.width * L, height: props.image.height * L }} />
        <Svg width={LOUPE} height={LOUPE} style={StyleSheet.absoluteFill}>
          <Overlay {...props} view={lv} cursor={mode.current.kind === 'place' ? cursor : null} compact />
          <Line x1={LOUPE / 2 - 10} y1={LOUPE / 2} x2={LOUPE / 2 + 10} y2={LOUPE / 2} stroke="#fff" strokeWidth={1} />
          <Line x1={LOUPE / 2} y1={LOUPE / 2 - 10} x2={LOUPE / 2} y2={LOUPE / 2 + 10} stroke="#fff" strokeWidth={1} />
        </Svg>
      </View>
    );
  })();

  return (
    <View
      ref={(r) => {
        containerRef.current = r;
        if (typeof ref === 'function') ref(r);
        else if (ref) ref.current = r;
      }}
      collapsable={false}
      style={styles.root}
      onLayout={onLayout}
      {...responder.panHandlers}
    >
      <Image
        source={{ uri: props.image.uri }}
        style={{ position: 'absolute', left: view.tx, top: view.ty, width: props.image.width * view.s, height: props.image.height * view.s }}
      />
      <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Overlay {...props} view={view} cursor={mode.current.kind === 'place' ? cursor : null} />
      </Svg>
      {loupe}
    </View>
  );
});

/** Draws calibration, measurements, the in-progress draft and the placement cursor. */
export function Overlay(p: Props & { view: View2D; cursor: Pt | null; compact?: boolean }) {
  const t = useTheme();
  const S = (q: Pt) => ({ x: q.x * p.view.s + p.view.tx, y: q.y * p.view.s + p.view.ty });
  const sw = p.compact ? 1.5 : 2;
  const r = p.compact ? 3 : 5;

  const label = (at: Pt, text: string, key: string, color: string) => {
    const q = S(at);
    return (
      <G key={key}>
        <SvgText x={q.x + 8} y={q.y - 8} fontSize={p.compact ? 10 : 13} fontWeight="700" stroke="#000" strokeWidth={3} fill="#000">{text}</SvgText>
        <SvgText x={q.x + 8} y={q.y - 8} fontSize={p.compact ? 10 : 13} fontWeight="700" fill={color}>{text}</SvgText>
      </G>
    );
  };
  const seg = (a: Pt, b: Pt, key: string, color: string, dashed = false) => {
    const A = S(a), B = S(b);
    return <Line key={key} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={color} strokeWidth={sw} strokeDasharray={dashed ? '6 4' : undefined} />;
  };
  const dot = (q: Pt, key: string, color: string) => {
    const s = S(q);
    return <Circle key={key} cx={s.x} cy={s.y} r={r} fill="#fff" stroke={color} strokeWidth={sw} />;
  };

  const out: React.ReactNode[] = [];
  if (p.calibration) {
    const [a, b] = p.calibration.points;
    out.push(seg(a, b, 'cal', '#FBBF24', true), dot(a, 'cal0', '#FBBF24'), dot(b, 'cal1', '#FBBF24'));
    if (!p.compact) out.push(label(mid(a, b), `${p.calibration.mm} mm`, 'call', '#FBBF24'));
  }
  for (const m of p.measurements) {
    const color = m.id === p.selectedId ? t.accent : t.annotate;
    const q = m.points;
    if (m.type === 'distance') out.push(seg(q[0], q[1], `${m.id}s`, color));
    if (m.type === 'angle') out.push(seg(q[0], q[1], `${m.id}s1`, color), seg(q[1], q[2], `${m.id}s2`, color));
    if (m.type === 'cobb') out.push(seg(q[0], q[1], `${m.id}s1`, color), seg(q[2], q[3], `${m.id}s2`, color));
    q.forEach((pt, i) => out.push(dot(pt, `${m.id}p${i}`, color)));
    const at = labelAnchor(m);
    if (at && !p.compact) out.push(label(at, `${m.label ? `${m.label} ` : ''}${formatValue(measure(m, p.calibration))}`, `${m.id}l`, color));
  }
  // In-progress points (+ the cursor while placing) for the active tool
  const pts = [...p.draft, ...(p.cursor ? [p.cursor] : [])];
  if (p.activeTool && pts.length) {
    const color = p.activeTool === 'calibrate' ? '#FBBF24' : t.accent;
    const pairs: [number, number][] = p.activeTool === 'angle' ? [[0, 1], [1, 2]] : p.activeTool === 'cobb' ? [[0, 1], [2, 3]] : [[0, 1]];
    for (const [i, j] of pairs) if (pts[i] && pts[j]) out.push(seg(pts[i], pts[j], `d${i}${j}`, color, true));
    pts.forEach((pt, i) => out.push(dot(pt, `d${i}`, color)));
  }
  return <G>{out}</G>;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
  loupe: {
    position: 'absolute', top: 12, width: LOUPE, height: LOUPE, borderRadius: LOUPE / 2,
    overflow: 'hidden', borderWidth: 2, backgroundColor: '#000',
  },
});
