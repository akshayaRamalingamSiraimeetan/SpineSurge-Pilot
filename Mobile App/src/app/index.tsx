import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Case } from '@/lib/types';
import { deleteCase, loadCases } from '@/lib/storage';
import { useTheme } from '@/lib/theme';

/** Home: saved assessments (newest first), search, and "New". */
export default function CasesScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [cases, setCases] = useState<Case[]>([]);
  const [q, setQ] = useState('');

  useFocusEffect(useCallback(() => {
    setCases(loadCases().sort((a, b) => b.updatedAt - a.updatedAt));
  }, []));

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? cases.filter((c) => `${c.patient.name} ${c.patient.patientId ?? ''}`.toLowerCase().includes(s)) : cases;
  }, [cases, q]);

  const confirmDelete = (c: Case) =>
    Alert.alert('Delete assessment?', `${c.patient.name} — the image and its measurements will be removed from this phone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteCase(c.id); setCases((l) => l.filter((x) => x.id !== c.id)); } },
    ]);

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={[styles.search, { backgroundColor: t.surface, borderColor: t.border }]}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search patient name or ID"
          placeholderTextColor={t.text3}
          style={[styles.searchInput, { color: t.text }]}
        />
      </View>

      <FlatList
        data={shown}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: t.text }]}>{q ? 'No matches' : 'No assessments yet'}</Text>
            <Text style={{ color: t.text2, textAlign: 'center' }}>
              {q ? 'Try another name or ID.' : 'Tap “New” to import an X-ray, calibrate it and start measuring.'}
            </Text>
          </View>
        }
        renderItem={({ item: c }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/case/[id]', params: { id: c.id } })}
            onLongPress={() => confirmDelete(c)}
            style={({ pressed }) => [styles.card, { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Image source={{ uri: c.image.uri }} style={styles.thumb} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.name, { color: t.text }]}>{c.patient.name}</Text>
              <Text numberOfLines={1} style={{ color: t.text2, fontSize: 12 }}>
                {[c.patient.patientId && `ID ${c.patient.patientId}`, c.patient.age && `${c.patient.age}${c.patient.sex ?? ''}`].filter(Boolean).join(' · ') || '—'}
              </Text>
              <Text style={{ color: t.text3, fontSize: 12, marginTop: 4 }}>
                {new Date(c.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                {' · '}{c.measurements.length} measurement{c.measurements.length === 1 ? '' : 's'}
                {c.calibration ? ' · calibrated' : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <Pressable
        onPress={() => router.push('/new')}
        style={({ pressed }) => [styles.fab, { backgroundColor: t.accent, bottom: 24 + insets.bottom, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={styles.fabText}>＋ New</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  search: { margin: 16, marginBottom: 0, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  searchInput: { height: 44, fontSize: 15 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, borderWidth: 1 },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#000' },
  name: { fontSize: 16, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  fab: { position: 'absolute', right: 20, paddingHorizontal: 22, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
