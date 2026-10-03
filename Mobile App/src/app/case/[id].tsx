import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { Case, Measurement, Pt, ToolId } from '@/lib/types';
import { TOOL_HINTS, TOOL_LABEL, TOOL_POINTS } from '@/lib/types';
import { formatValue, measure } from '@/lib/geometry';
import { getCase, newId, saveCase } from '@/lib/storage';
import { useTheme } from '@/lib/theme';
import { MeasureCanvas, type PointRef } from '@/components/MeasureCanvas';
import { AnnotatedImage } from '@/components/AnnotatedImage';

const TOOLS: ToolId[] = ['calibrate', 'distance', 'angle', 'cobb'];
const NAMES: Record<Measurement['type'], string> = { distance: 'Distance', angle: 'Angle', cobb: 'Cobb angle' };

/** Measure one image: calibrate, place distance/angle/Cobb, auto-saved on every change. */
export default function MeasureScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<Case | null>(() => getCase(id) ?? null);
  const [tool, setTool] = useState<ToolId | null>(null);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [calPending, setCalPending] = useState<[Pt, Pt] | null>(null);
  const [calMm, setCalMm] = useState('');
  const [labelFor, setLabelFor] = useState<Measurement | null>(null);
  const [labelText, setLabelText] = useState('');
  const [sharing, setSharing] = useState(false);
  const history = useRef<Case[]>([]);
  const shareRef = useRef<View>(null);
  const dragStart = useRef<Case | null>(null); // snapshot at drag start → one undo step

  // Patient details may have been edited on the details screen.
  useFocusEffect(useCallback(() => {
    const fresh = getCase(id);
    if (fresh) setC((cur) => (cur ? { ...cur, patient: fresh.patient } : fresh));
  }, [id]));

  // First visit without calibration → guide the user to calibrate.
  useEffect(() => {
    if (c && !c.calibration && c.measurements.length === 0) setTool('calibrate');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) {
    return <View style={[styles.center, { backgroundColor: t.bg }]}><Text style={{ color: t.text2 }}>Assessment not found.</Text></View>;
  }

  /** Apply a change, keep an undo snapshot, and persist (final changes only). */
  const commit = (next: Case, persist = true, snapshot = true) => {
    if (snapshot) history.current = [...history.current.slice(-29), c];
    setC(persist ? saveCase(next) : next);
  };

  const onAddPoint = (p: Pt) => {
    if (!tool) return;
    const pts = [...draft, p];
    if (pts.length < TOOL_POINTS[tool]) { setDraft(pts); return; }
    setDraft([]);
    if (tool === 'calibrate') {
      setCalPending([pts[0], pts[1]]);
      setCalMm(c.calibration ? String(c.calibration.mm) : '');
      return;
    }
    const m: Measurement = { id: newId(), type: tool, points: pts, createdAt: Date.now() };
    commit({ ...c, measurements: [...c.measurements, m] });
    setSelected(m.id);
    setTool(null);
  };

  const onMovePoint = (ref: PointRef, p: Pt, final: boolean) => {
    if (ref.kind === 'draft') {
      setDraft((d) => d.map((q, i) => (i === ref.index ? p : q)));
      return;
    }
    if (!dragStart.current) dragStart.current = c;
    let next: Case = c;
    if (ref.kind === 'calibration' && c.calibration) {
      const pts = [...c.calibration.points] as [Pt, Pt];
      pts[ref.index] = p;
      next = { ...c, calibration: { ...c.calibration, points: pts } };
    } else if (ref.kind === 'measurement') {
      next = { ...c, measurements: c.measurements.map((m) => (m.id === ref.id ? { ...m, points: m.points.map((q, i) => (i === ref.index ? p : q)) } : m)) };
      setSelected(ref.id);
    }
    if (final) {
      // one undo step for the whole drag
      history.current = [...history.current.slice(-29), dragStart.current ?? c];
      dragStart.current = null;
      setC(saveCase(next));
    } else {
      setC(next);
    }
  };

  const undo = () => {
    if (draft.length) { setDraft((d) => d.slice(0, -1)); return; }
    const prev = history.current.pop();
    if (prev) setC(saveCase(prev));
  };

  const removeSelected = () => {
    if (!selected) return;
    commit({ ...c, measurements: c.measurements.filter((m) => m.id !== selected) });
    setSelected(null);
  };

  const confirmCalibration = () => {
    const mm = parseFloat(calMm.replace(',', '.'));
    if (!calPending || !(mm > 0)) return;
    commit({ ...c, calibration: { points: calPending, mm } });
    setCalPending(null);
    setTool(null);
  };

  const share = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing is not available on this device'); return; }
      const uri = await captureRef(shareRef, { format: 'jpg', quality: 0.92, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: `${c.patient.name} — measurements`, UTI: 'public.jpeg' });
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSharing(false);
    }
  };

  const pickTool = (id: ToolId) => {
    setDraft([]);
    setSelected(null);
    setTool((cur) => (cur === id ? null : id));
  };

  const hint = tool
    ? TOOL_HINTS[tool][Math.min(draft.length, TOOL_HINTS[tool].length - 1)]
    : !c.calibration
      ? 'Not calibrated — distances are in pixels. Tap “Calibrate”.'
      : selected
        ? 'Drag the points to adjust. Pinch to zoom.'
        : 'Pick a tool, then tap on the image. Pinch to zoom, drag to pan.';

  const sel = c.measurements.find((m) => m.id === selected) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: c.patient.name,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable hitSlop={10} onPress={() => router.push({ pathname: '/new', params: { id: c.id } })}>
                <Text style={{ color: t.text2, fontWeight: '600' }}>Details</Text>
              </Pressable>
              <Pressable hitSlop={10} onPress={() => setSharing(true)}>
                <Text style={{ color: t.accent, fontWeight: '700' }}>Share</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      <MeasureCanvas
        image={c.image}
        measurements={c.measurements}
        calibration={c.calibration}
        activeTool={tool}
        draft={draft}
        selectedId={selected}
        onAddPoint={onAddPoint}
        onMovePoint={onMovePoint}
        onSelect={setSelected}
      />

      <View style={[styles.hint, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={{ color: tool ? t.accent : !c.calibration ? '#F59E0B' : t.text2, fontSize: 13, fontWeight: '600' }}>{hint}</Text>
      </View>

      {/* Results */}
      <ScrollView style={{ maxHeight: 170, backgroundColor: t.surface }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 6 }}>
        {c.calibration && (
          <View style={[styles.row, { borderColor: t.border }]}>
            <Text style={[styles.rowName, { color: t.text2 }]}>Calibration</Text>
            <Text style={[styles.rowValue, { color: t.text }]}>{c.calibration.mm} mm</Text>
          </View>
        )}
        {c.measurements.length === 0 && (
          <Text style={{ color: t.text3, fontSize: 12, paddingVertical: 6 }}>No measurements yet.</Text>
        )}
        {c.measurements.map((m, i) => (
          <Pressable
            key={m.id}
            onPress={() => setSelected(m.id === selected ? null : m.id)}
            onLongPress={() => { setLabelFor(m); setLabelText(m.label ?? ''); }}
            style={[styles.row, { borderColor: m.id === selected ? t.accent : t.border, backgroundColor: m.id === selected ? t.accentSoft : 'transparent' }]}
          >
            <Text style={[styles.rowName, { color: t.text }]} numberOfLines={1}>
              {i + 1}. {NAMES[m.type]}{m.label ? ` · ${m.label}` : ''}
            </Text>
            <Text style={[styles.rowValue, { color: t.text }]}>{formatValue(measure(m, c.calibration))}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tools + actions */}
      <View style={[styles.toolbar, { backgroundColor: t.surface, borderColor: t.border, paddingBottom: 10 + insets.bottom }]}>
        {TOOLS.map((id) => (
          <Pressable
            key={id}
            onPress={() => pickTool(id)}
            style={[styles.tool, { backgroundColor: tool === id ? t.accent : t.surface3 }]}
          >
            <Text style={{ color: tool === id ? '#fff' : t.text, fontWeight: '700', fontSize: 13 }}>{TOOL_LABEL[id]}</Text>
          </Pressable>
        ))}
        <View style={styles.actions}>
          <Pressable onPress={undo} style={[styles.action, { borderColor: t.border }]}>
            <Text style={{ color: t.text2, fontWeight: '600' }}>Undo</Text>
          </Pressable>
          {sel && (
            <>
              <Pressable onPress={() => { setLabelFor(sel); setLabelText(sel.label ?? ''); }} style={[styles.action, { borderColor: t.border }]}>
                <Text style={{ color: t.text2, fontWeight: '600' }}>Label</Text>
              </Pressable>
              <Pressable onPress={removeSelected} style={[styles.action, { borderColor: t.danger }]}>
                <Text style={{ color: t.danger, fontWeight: '700' }}>Delete</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* Calibration length */}
      <Modal visible={!!calPending} transparent animationType="fade" onRequestClose={() => setCalPending(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>Known length</Text>
            <Text style={{ color: t.text2, fontSize: 13 }}>Real length between the two points you tapped (e.g. the calibration marker).</Text>
            <TextInput
              autoFocus
              keyboardType="decimal-pad"
              value={calMm}
              onChangeText={setCalMm}
              placeholder="Length in mm"
              placeholderTextColor={t.text3}
              style={[styles.sheetInput, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
            />
            <View style={styles.sheetButtons}>
              <Pressable onPress={() => setCalPending(null)} style={styles.sheetBtn}><Text style={{ color: t.text2, fontWeight: '600' }}>Cancel</Text></Pressable>
              <Pressable onPress={confirmCalibration} style={[styles.sheetBtn, { backgroundColor: t.accent }]}><Text style={{ color: '#fff', fontWeight: '700' }}>Calibrate</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Label / level for a measurement */}
      <Modal visible={!!labelFor} transparent animationType="fade" onRequestClose={() => setLabelFor(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>Label</Text>
            <TextInput
              autoFocus
              value={labelText}
              onChangeText={setLabelText}
              placeholder="e.g. T5–T12, L4–L5"
              placeholderTextColor={t.text3}
              style={[styles.sheetInput, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
            />
            <View style={styles.sheetButtons}>
              <Pressable onPress={() => setLabelFor(null)} style={styles.sheetBtn}><Text style={{ color: t.text2, fontWeight: '600' }}>Cancel</Text></Pressable>
              <Pressable
                onPress={() => {
                  if (labelFor) commit({ ...c, measurements: c.measurements.map((m) => (m.id === labelFor.id ? { ...m, label: labelText.trim() || undefined } : m)) });
                  setLabelFor(null);
                }}
                style={[styles.sheetBtn, { backgroundColor: t.accent }]}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share preview: what you see is what gets shared */}
      <Modal visible={sharing} animationType="slide" onRequestClose={() => setSharing(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
          <ScrollView contentContainerStyle={{ padding: 16, alignItems: 'center' }}>
            <View ref={shareRef} collapsable={false} style={styles.card}>
              <Text style={styles.cardBrand}>SpineSurge Measure</Text>
              <Text style={styles.cardName}>{c.patient.name}</Text>
              <Text style={styles.cardMeta}>
                {[c.patient.patientId && `ID ${c.patient.patientId}`, c.patient.age && `${c.patient.age} yrs`, c.patient.sex, new Date(c.updatedAt).toLocaleDateString()].filter(Boolean).join('  ·  ')}
              </Text>
              <View style={{ marginVertical: 10 }}><AnnotatedImage c={c} width={328} /></View>
              {c.measurements.map((m, i) => (
                <View key={m.id} style={styles.cardRow}>
                  <Text style={styles.cardRowName}>{i + 1}. {NAMES[m.type]}{m.label ? ` · ${m.label}` : ''}</Text>
                  <Text style={styles.cardRowValue}>{formatValue(measure(m, c.calibration))}</Text>
                </View>
              ))}
              <Text style={styles.cardFoot}>{c.calibration ? `Calibrated: ${c.calibration.mm} mm reference` : 'Not calibrated — distances in pixels'}</Text>
              {c.patient.notes ? <Text style={styles.cardNotes}>{c.patient.notes}</Text> : null}
            </View>
          </ScrollView>
          <View style={[styles.sheetButtons, { padding: 16, paddingBottom: 16 + insets.bottom }]}>
            <Pressable onPress={() => setSharing(false)} style={[styles.sheetBtn, { flex: 1, borderWidth: 1, borderColor: t.border }]}><Text style={{ color: t.text2, fontWeight: '600' }}>Close</Text></Pressable>
            <Pressable onPress={share} style={[styles.sheetBtn, { flex: 1, backgroundColor: t.accent }]}><Text style={{ color: '#fff', fontWeight: '700' }}>Share image</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600', marginRight: 8 },
  rowValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  toolbar: { borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tool: { flexGrow: 1, flexBasis: '22%', height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8, width: '100%' },
  action: { flex: 1, height: 38, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 420, borderRadius: 18, borderWidth: 1, padding: 18, gap: 10 },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetInput: { height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 16 },
  sheetButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  sheetBtn: { minWidth: 96, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  // Share card is always light so it reads well in chats / print.
  card: { width: 360, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  cardBrand: { color: '#EC3327', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  cardName: { color: '#17171A', fontSize: 20, fontWeight: '800', marginTop: 4 },
  cardMeta: { color: '#58585F', fontSize: 12, marginTop: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  cardRowName: { color: '#17171A', fontSize: 14, flex: 1 },
  cardRowValue: { color: '#17171A', fontSize: 14, fontWeight: '800' },
  cardFoot: { color: '#8A8A93', fontSize: 11, marginTop: 8 },
  cardNotes: { color: '#58585F', fontSize: 12, marginTop: 6 },
});
