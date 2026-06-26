/**
 * Enrollment — operator-friendly face enrollment.
 *
 * - Web: shows guided steps (Front/Left/Right) with file upload (the actual
 *   browser camera API is enabled per-platform; using upload keeps it
 *   working in all browsers).
 * - Native: would use `expo-camera` (deferred — UI shown as "Open camera"
 *   call-to-action that we wire in a follow-up).
 *
 * Submits a multipart form to `/api/v1/enroll/upload-session`.
 */
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/contexts/AuthContext';
import { getStoredToken } from '@/lib/api';
import { getApiBase } from '@/lib/config';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { VisionaryXLogo } from '@/components/VisionaryXLogo';
import { VxButton, SectionEyebrow, ScreenTitle, ScreenSub, VxCard, ErrorBanner } from '@/components/vx';

interface Step {
  key: 'front' | 'left' | 'right';
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

const STEPS: Step[] = [
  { key: 'front', label: 'Front pose', description: 'Look straight at the camera. Keep your face centered and well-lit.', icon: 'face-recognition' },
  { key: 'left',  label: 'Left pose',  description: 'Turn your face ~30° to the left. Keep both eyes visible.',          icon: 'arrow-left' },
  { key: 'right', label: 'Right pose', description: 'Turn your face ~30° to the right. Keep both eyes visible.',         icon: 'arrow-right' },
];

export default function EnrollScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [captured, setCaptured] = useState<Record<string, File | { uri: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Web: hidden <input> file picker per step.
  const webPick = (key: string) => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'user';
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) setCaptured((c) => ({ ...c, [key]: f }));
    };
    input.click();
  };

  const onCapture = (key: string) => {
    if (Platform.OS === 'web') {
      webPick(key);
    } else {
      Alert.alert(
        'Open camera',
        'Native camera capture for face enrollment opens here. (Implementation deferred to next iteration.)',
      );
    }
  };

  const submit = async () => {
    const missing = STEPS.filter((s) => !captured[s.key]);
    if (missing.length > 0) {
      setError(`Capture remaining: ${missing.map((m) => m.label).join(', ')}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getStoredToken();
      const fd = new FormData();
      Object.entries(captured).forEach(([key, val]) => {
        if (val instanceof File) {
          fd.append('files', val, `${key}.jpg`);
        } else {
          // Native blob (deferred)
          // @ts-ignore
          fd.append('files', { uri: val.uri, type: 'image/jpeg', name: `${key}.jpg` });
        }
      });
      const res = await fetch(`${getApiBase()}/api/v1/enroll/upload-session`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <View style={styles.root} testID="enroll-screen">
        <CommandBackground />
        <View style={styles.successPad}>
          <VisionaryXLogo variant="stacked" size={64} />
          <View style={styles.successIcon}>
            <MaterialCommunityIcons name="check-circle" size={48} color={C.cyan} />
          </View>
          <Text style={styles.successTitle}>Enrollment captured</Text>
          <Text style={styles.successSub}>
            Sentinel pipeline will index your face shortly. You can close this screen.
          </Text>
          <View style={{ marginTop: Space.xl, width: '100%', maxWidth: 320 }}>
            <VxButton
              label="Back to overview"
              fullWidth
              onPress={() => router.replace('/(tabs)')}
              testID="enroll-done"
            />
          </View>
        </View>
      </View>
    );
  }

  const completedCount = Object.keys(captured).length;

  return (
    <View style={styles.root} testID="enroll-screen">
      <CommandBackground />
      <ScrollView contentContainerStyle={styles.pad}>
        <SectionEyebrow>Biometric · Onboarding</SectionEyebrow>
        <ScreenTitle>Face enrollment</ScreenTitle>
        <ScreenSub>
          Capture three poses so VisionaryX can recognise you across the perimeter. Photos are processed and stored encrypted on the Sentinel index.
        </ScreenSub>

        <View style={styles.progressRow} testID="enroll-progress">
          <Text style={styles.progressLabel}>PROGRESS</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(completedCount / STEPS.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressVal}>{completedCount}/{STEPS.length}</Text>
        </View>

        <ErrorBanner message={error} />

        <View style={{ marginTop: Space.lg, gap: Space.md }}>
          {STEPS.map((step, idx) => {
            const done = !!captured[step.key];
            return (
              <VxCard key={step.key} style={styles.stepCard} testID={`enroll-step-${step.key}`}>
                <View style={styles.stepHead}>
                  <View style={[styles.stepIcon, done && { backgroundColor: C.cyanFaint }]}>
                    {done ? (
                      <MaterialCommunityIcons name="check" size={20} color={C.cyan} />
                    ) : (
                      <MaterialCommunityIcons name={step.icon} size={20} color={C.primaryAccent} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepIdx}>STEP {idx + 1}</Text>
                    <Text style={styles.stepLabel}>{step.label}</Text>
                  </View>
                  {done ? (
                    <Text style={styles.stepDoneText}>CAPTURED</Text>
                  ) : null}
                </View>
                <Text style={styles.stepDesc}>{step.description}</Text>
                <View style={{ marginTop: Space.md }}>
                  <VxButton
                    label={done ? 'Retake' : 'Capture'}
                    variant={done ? 'secondary' : 'primary'}
                    onPress={() => onCapture(step.key)}
                    icon={<MaterialCommunityIcons name="camera-outline" size={14} color={done ? C.text : '#fff'} />}
                    testID={`enroll-capture-${step.key}`}
                  />
                </View>
              </VxCard>
            );
          })}
        </View>

        <View style={{ marginTop: Space.xl }}>
          <VxButton
            label="Submit enrollment"
            fullWidth
            busy={busy}
            onPress={submit}
            disabled={completedCount < STEPS.length}
            testID="enroll-submit"
            trailingIcon={<MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />}
          />
        </View>

        <Text style={styles.footer}>
          {user?.email} · Photos transit over TLS · processed by VisionaryX Neural Pipeline.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 720, width: '100%', alignSelf: 'center' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.xl, marginBottom: Space.md },
  progressLabel: { ...TextStyles.label, color: C.textFaint, fontSize: 10 },
  progressTrack: { flex: 1, height: 4, backgroundColor: C.surface2, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.primaryAccent },
  progressVal: { ...TextStyles.dataSmall, color: C.text, fontFamily: F.monoSemibold },

  stepCard: {},
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  stepIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primaryFaint, alignItems: 'center', justifyContent: 'center' },
  stepIdx: { ...TextStyles.label, color: C.textFaint, fontSize: 9 },
  stepLabel: { ...TextStyles.bodyLarge, color: C.text, fontFamily: F.bodySemibold },
  stepDoneText: { ...TextStyles.label, color: C.cyan, fontSize: 9 },
  stepDesc: { ...TextStyles.bodySmall, color: C.textMuted, marginTop: Space.sm },

  footer: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono, marginTop: Space.xl, textAlign: 'center' },

  successPad: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Space.lg },
  successIcon: { marginTop: Space.xxl, marginBottom: Space.md },
  successTitle: { ...TextStyles.h2, color: C.text, fontSize: 32, textAlign: 'center' },
  successSub: { ...TextStyles.body, color: C.textMuted, marginTop: Space.md, textAlign: 'center', maxWidth: 420 },
});
