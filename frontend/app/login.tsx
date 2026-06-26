/**
 * Login screen — official VisionaryX AI brand, MVVM via `useLoginViewModel`.
 */
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useLoginViewModel } from '@/viewmodels';
import { publicApi } from '@/lib/api';
import { fetchPublicApiUrl, getApiBase } from '@/lib/config';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles, Brand } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { VisionaryXLogo } from '@/components/VisionaryXLogo';
import { VxButton, VxInput, ErrorBanner } from '@/components/vx';

export default function LoginScreen() {
  const router = useRouter();
  const vm = useLoginViewModel();
  const [apiVersion, setApiVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void publicApi<{ backend_version?: string }>('/api/v1/meta/version')
      .then((r) => {
        if (!cancelled && r.backend_version) setApiVersion(r.backend_version);
      })
      .catch(() => undefined);
    void fetchPublicApiUrl();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async () => {
    const ok = await vm.submit();
    if (ok) router.replace('/(tabs)');
  };

  const onRecover = async () => {
    const msg = await vm.recover();
    if (msg) Alert.alert('Password recovery', msg);
  };

  return (
    <View style={styles.root}>
      <CommandBackground />
      <StatusBar style="light" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandRow} testID="login-brand-row">
            <VisionaryXLogo variant="wordmark" size={44} />
          </View>

          <View style={styles.hero}>
            <Text style={styles.eyebrow} testID="login-eyebrow">
              {Brand.tagline}
            </Text>
            <Text style={styles.h1} testID="login-headline">
              <Text style={styles.h1Grad}>Vision</Text> that{'\n'}watches.
            </Text>
            <Text style={styles.sub}>
              Real-time perimeter intelligence built for operators. Sign in to monitor cameras,
              review detections and command the VisionaryX pipeline.
            </Text>
          </View>

          <View style={styles.card}>
            <ErrorBanner message={vm.error} testID="login-error" />

            {/* Demo credentials hint — one-tap autofill for testing. */}
            <Pressable
              onPress={() => {
                vm.setEmail('admin@visionaryx.dev');
                vm.setPassword('VisionX2025!');
              }}
              style={styles.demoHint}
              testID="login-demo-hint"
            >
              <View style={styles.demoHintIcon}>
                <MaterialCommunityIcons name="flask-outline" size={14} color={C.primaryAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.demoHintLabel}>DEMO · TAP TO AUTOFILL</Text>
                <Text style={styles.demoHintCreds}>admin@visionaryx.dev · VisionX2025!</Text>
                <Text style={styles.demoHintAlt}>operator@visionaryx.dev · Operator2025!</Text>
              </View>
              <MaterialCommunityIcons name="cursor-default-click-outline" size={14} color={C.textFaint} />
            </Pressable>

            <View style={{ gap: Space.md, marginTop: Space.md }}>
              <VxInput
                testID="login-email-input"
                label="Operator email"
                placeholder="name@company.com"
                value={vm.email}
                onChangeText={vm.setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                leading={<MaterialCommunityIcons name="at" size={18} color={C.textMuted} />}
              />

              <VxInput
                testID="login-password-input"
                label="Access key"
                placeholder="••••••••"
                value={vm.password}
                onChangeText={vm.setPassword}
                secureTextEntry={!vm.showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                leading={<MaterialCommunityIcons name="key-variant" size={18} color={C.textMuted} />}
                trailing={
                  <Pressable
                    onPress={vm.toggleShowPassword}
                    testID="login-toggle-password"
                    hitSlop={10}
                  >
                    <MaterialCommunityIcons
                      name={vm.showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={C.textMuted}
                    />
                  </Pressable>
                }
              />

              <View style={styles.rowBetween}>
                <Pressable
                  testID="login-remember-toggle"
                  onPress={vm.toggleRemember}
                  style={styles.checkRow}
                  hitSlop={6}
                >
                  <View
                    style={[
                      styles.checkbox,
                      vm.rememberMe && { backgroundColor: C.primary, borderColor: C.primary },
                    ]}
                  >
                    {vm.rememberMe ? (
                      <MaterialCommunityIcons name="check" size={12} color="#fff" />
                    ) : null}
                  </View>
                  <Text style={styles.checkText}>Trusted device · 30 days</Text>
                </Pressable>

                <Pressable onPress={onRecover} testID="login-recover-link" hitSlop={8}>
                  <Text style={styles.link}>Recovery</Text>
                </Pressable>
              </View>

              <VxButton
                testID="login-submit-button"
                label="Sign in"
                onPress={onSubmit}
                busy={vm.busy}
                fullWidth
                trailingIcon={
                  <MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />
                }
              />
            </View>
          </View>

          <View style={styles.footer} testID="login-footer">
            <View style={styles.metaCell}>
              <Text style={styles.metaLbl}>API</Text>
              <Text style={styles.metaVal}>{apiVersion ? `v${apiVersion}` : '—'}</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaCell}>
              <Text style={styles.metaLbl}>System</Text>
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: apiVersion ? C.cyan : C.danger },
                  ]}
                />
                <Text style={styles.metaVal}>{apiVersion ? 'Online' : 'Offline'}</Text>
              </View>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaCell}>
              <Text style={styles.metaLbl}>Endpoint</Text>
              <Text
                style={[styles.metaVal, { fontFamily: F.mono, fontSize: 11 }]}
                numberOfLines={1}
                selectable
              >
                {getApiBase().replace(/^https?:\/\//, '')}
              </Text>
            </View>
          </View>

          <Text style={styles.copyright}>{Brand.copyright} · {new Date().getFullYear()}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  hero: { marginTop: Space.xxl },
  eyebrow: { ...TextStyles.label, color: C.primaryAccent },
  h1: {
    ...TextStyles.h1,
    color: C.text,
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -1.5,
    marginTop: Space.md,
  },
  h1Grad: Platform.OS === 'web' ? ({
    backgroundImage: 'linear-gradient(120deg, #8B5CF6 0%, #06B6D4 100%)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  } as any) : { color: C.electricViolet },
  sub: {
    ...TextStyles.body,
    color: C.textMuted,
    marginTop: Space.md,
    maxWidth: 460,
  },
  card: {
    marginTop: Space.xxl,
    padding: Space.lg,
    backgroundColor: 'rgba(15, 15, 23, 0.78)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...(Platform.OS === 'web' ? ({
      backdropFilter: 'blur(18px) saturate(180%)',
      WebkitBackdropFilter: 'blur(18px) saturate(180%)',
    } as any) : {}),
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.xs,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { ...TextStyles.bodySmall, color: C.textMuted },
  link: { ...TextStyles.label, color: C.primaryAccent },

  footer: {
    marginTop: Space.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
    gap: Space.md,
  },
  metaCell: { flex: 1 },
  metaLbl: { ...TextStyles.label, color: C.textFaint, marginBottom: 2 },
  metaVal: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.mono },
  metaDivider: { width: 1, height: 24, backgroundColor: C.border },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  copyright: {
    marginTop: Space.xl,
    ...TextStyles.caption,
    color: C.textFaint,
    textAlign: 'center',
    fontFamily: F.body,
  },

  // Demo-credentials hint
  demoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: C.primaryFaint,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(208, 188, 255, 0.25)',
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.md,
  },
  demoHintIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  demoHintLabel: { ...TextStyles.label, color: C.primaryAccent, fontSize: 9 },
  demoHintCreds: { ...TextStyles.caption, color: C.text, fontFamily: F.mono, marginTop: 2 },
  demoHintAlt: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, fontSize: 11, marginTop: 1 },
});
