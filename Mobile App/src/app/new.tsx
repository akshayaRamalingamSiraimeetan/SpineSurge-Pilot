import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { Patient } from '@/lib/types';
import { createCase, getCase, saveCase } from '@/lib/storage';
import { useTheme } from '@/lib/theme';

/**
 * New assessment: patient details + image (gallery or camera).
 * With ?id=… it edits the patient details of an existing assessment.
 */
export default function NewCaseScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = id ? getCase(id) : undefined;

  const [patient, setPatient] = useState<Patient>(existing?.patient ?? { name: '' });
  const [picked, setPicked] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);


  const pick = async (from: 'library' | 'camera') => {
    const perm = from === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', from === 'camera' ? 'Allow camera access to photograph an X-ray.' : 'Allow photo access to import an X-ray.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPicked({ uri: a.uri, width: a.width, height: a.height });
  };

  const set = (k: keyof Patient, v: string) => setPatient((p) => ({ ...p, [k]: v }));
  const canSave = patient.name.trim().length > 0 && (!!existing || !!picked) && !saving;

  const save = () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const clean: Patient = { ...patient, name: patient.name.trim() };
      if (existing) {
        saveCase({ ...existing, patient: clean });
        router.back();
      } else {
        const c = createCase(clean, picked!);
        router.replace({ pathname: '/case/[id]', params: { id: c.id } });
      }
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
      setSaving(false);
    }
  };

  const input = [styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: existing ? 'Patient details' : 'New assessment' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18 }} keyboardShouldPersistTaps="handled">
        {!existing && (
          <View style={{ gap: 10 }}>
            <Text style={[styles.section, { color: t.text3 }]}>IMAGE</Text>
            {picked ? (
              <Pressable onPress={() => pick('library')}>
                <Image source={{ uri: picked.uri }} style={[styles.preview, { aspectRatio: picked.width / picked.height }]} resizeMode="contain" />
                <Text style={{ color: t.text3, fontSize: 12, textAlign: 'center', marginTop: 6 }}>Tap to choose another image</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => pick('library')} style={[styles.pickBtn, { backgroundColor: t.surface, borderColor: t.border }]}>
                  <Text style={[styles.pickIcon, { color: t.accent }]}>🖼</Text>
                  <Text style={{ color: t.text, fontWeight: '600' }}>From photos</Text>
                </Pressable>
                <Pressable onPress={() => pick('camera')} style={[styles.pickBtn, { backgroundColor: t.surface, borderColor: t.border }]}>
                  <Text style={[styles.pickIcon, { color: t.accent }]}>📷</Text>
                  <Text style={{ color: t.text, fontWeight: '600' }}>Take photo</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <View style={{ gap: 10 }}>
          <Text style={[styles.section, { color: t.text3 }]}>PATIENT</Text>
          <TextInput style={input} placeholder="Name *" placeholderTextColor={t.text3} value={patient.name} onChangeText={(v) => set('name', v)} />
          <TextInput style={input} placeholder="Patient ID / MRN" placeholderTextColor={t.text3} value={patient.patientId ?? ''} onChangeText={(v) => set('patientId', v)} autoCapitalize="characters" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput style={[input, { flex: 1 }]} placeholder="Age" placeholderTextColor={t.text3} keyboardType="number-pad" value={patient.age ?? ''} onChangeText={(v) => set('age', v.replace(/[^0-9]/g, ''))} />
            <View style={{ flex: 2, flexDirection: 'row', gap: 6 }}>
              {(['M', 'F', 'O'] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setPatient((p) => ({ ...p, sex: p.sex === s ? undefined : s }))}
                  style={[styles.sex, { borderColor: patient.sex === s ? t.accent : t.border, backgroundColor: patient.sex === s ? t.accentSoft : t.surface }]}
                >
                  <Text style={{ color: patient.sex === s ? t.accent : t.text2, fontWeight: '700' }}>{s === 'M' ? 'Male' : s === 'F' ? 'Female' : 'Other'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <TextInput style={[input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]} multiline placeholder="Notes (diagnosis, level…)" placeholderTextColor={t.text3} value={patient.notes ?? ''} onChangeText={(v) => set('notes', v)} />
        </View>

        <Pressable onPress={save} disabled={!canSave} style={[styles.save, { backgroundColor: t.accent, opacity: canSave ? 1 : 0.4 }]}>
          <Text style={styles.saveText}>{existing ? 'Save details' : 'Start measuring'}</Text>
        </Pressable>
        {!existing && !picked && <Text style={{ color: t.text3, textAlign: 'center', fontSize: 12 }}>Choose an image and enter a name to continue.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  input: { height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  pickBtn: { flex: 1, height: 110, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  pickIcon: { fontSize: 28 },
  preview: { width: '100%', maxHeight: 320, borderRadius: 12, backgroundColor: '#000' },
  sex: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  save: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
