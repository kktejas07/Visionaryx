/**
 * Settings — admin SMTP configuration + test.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useColorMode } from '@/contexts/ThemeContext';
import { isAdminRole } from '@/lib/roles';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, ScreenSub, VxButton, VxInput, VxCard } from '@/components/vx';
import { EnrollMyFace } from '@/components/EnrollMyFace';

interface EmailSettings {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  use_ssl: boolean;
  public_base_url: string;
  password_configured: boolean;
  public_dashboard_url_default: string;
}

export default function SettingsScreen() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [s, setS] = useState<EmailSettings | null>(null);
  const [form, setForm] = useState({
    enabled: false, host: '', port: '587', user: '', smtp_password: '',
    from_email: '', from_name: '', use_tls: true, use_ssl: false, public_base_url: '',
  });
  const [testTo, setTestTo] = useState('');

  const load = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return; }
    try {
      const data = await api<EmailSettings>('/api/v1/settings/email');
      setS(data);
      setForm({
        enabled: data.enabled, host: data.host, port: String(data.port || 587),
        user: data.user, smtp_password: '', from_email: data.from_email, from_name: data.from_name,
        use_tls: data.use_tls, use_ssl: data.use_ssl, public_base_url: data.public_base_url,
      });
    } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.host.trim() || !form.from_email.trim()) {
      Alert.alert('Validation', 'Host and from email are required'); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        enabled: form.enabled, host: form.host.trim(), port: parseInt(form.port, 10) || 587,
        user: form.user.trim(), from_email: form.from_email.trim(), from_name: form.from_name.trim(),
        use_tls: form.use_tls, use_ssl: form.use_ssl, public_base_url: form.public_base_url.trim(),
      };
      if (form.smtp_password) payload.smtp_password = form.smtp_password;
      await api('/api/v1/settings/email', { method: 'PATCH', body: JSON.stringify(payload) });
      await load();
      Alert.alert('Saved', 'SMTP settings updated.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const test = async () => {
    if (!testTo.trim()) { Alert.alert('Validation', 'Enter a test email'); return; }
    setTesting(true);
    try {
      await api('/api/v1/settings/email/test', { method: 'POST', body: JSON.stringify({ to: testTo.trim() }) });
      Alert.alert('Sent', `Test email dispatched to ${testTo}`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to send');
    } finally { setTesting(false); }
  };

  if (!isAdmin) {
    return (
      <View style={styles.root}>
        <CommandBackground />
        <ScrollView contentContainerStyle={styles.pad}>
          <SectionEyebrow>Workspace</SectionEyebrow>
          <ScreenTitle>Settings</ScreenTitle>
          <ScreenSub>Adjust your personal display preferences.</ScreenSub>
          <AppearanceCard />

          <View style={{ marginTop: Space.xl }}>
            <SectionEyebrow>Account · Biometrics</SectionEyebrow>
          </View>
          <View style={{ marginTop: Space.md }}>
            <EnrollMyFace />
          </View>

          <View style={{ marginTop: Space.xl }}>
            <SectionEyebrow>Access</SectionEyebrow>
          </View>
          <ScreenTitle>SMTP — admin only</ScreenTitle>
          <ScreenSub>Contact your administrator to configure system email.</ScreenSub>
        </ScrollView>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <CommandBackground />
        <ActivityIndicator color={C.primaryAccent} />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="settings-screen">
      <CommandBackground />
      <ScrollView contentContainerStyle={styles.pad}>
        <SectionEyebrow>Workspace</SectionEyebrow>
        <ScreenTitle>Settings</ScreenTitle>
        <ScreenSub>Workspace appearance and notification preferences.</ScreenSub>

        {/* Appearance */}
        <AppearanceCard />

        <View style={{ marginTop: Space.xl }}>
          <SectionEyebrow>Account · Biometrics</SectionEyebrow>
        </View>
        <View style={{ marginTop: Space.md }}>
          <EnrollMyFace />
        </View>

        <View style={{ marginTop: Space.xl }}>
          <SectionEyebrow>System · SMTP</SectionEyebrow>
        </View>
        <ScreenTitle>Email configuration</ScreenTitle>
        <ScreenSub>Configure outgoing SMTP for alert notifications and operator invites.</ScreenSub>

        {/* Enable toggle */}
        <VxCard style={{ marginTop: Space.lg }}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLbl}>Enable SMTP</Text>
              <Text style={styles.toggleDesc}>Send notifications for alerts and operator invites</Text>
            </View>
            <Switch
              value={form.enabled}
              onValueChange={(v) => setForm({ ...form, enabled: v })}
              trackColor={{ false: C.surface3, true: C.primary }}
              thumbColor="#fff"
              testID="smtp-enabled-toggle"
            />
          </View>
        </VxCard>

        {/* Server */}
        <VxCard style={{ marginTop: Space.md, gap: Space.md }}>
          <Text style={styles.sectionTitle}>Server</Text>
          <VxInput label="SMTP host" placeholder="smtp.gmail.com" value={form.host} onChangeText={(v) => setForm({ ...form, host: v })} autoCapitalize="none" testID="smtp-host" />
          <VxInput label="Port" placeholder="587" value={form.port} onChangeText={(v) => setForm({ ...form, port: v })} keyboardType="number-pad" testID="smtp-port" />
          <VxInput label="Username" placeholder="you@company.com" value={form.user} onChangeText={(v) => setForm({ ...form, user: v })} autoCapitalize="none" testID="smtp-user" />
          <VxInput
            label={`Password${s?.password_configured ? ' (configured)' : ''}`}
            placeholder={s?.password_configured ? '••••••••' : 'Enter password'}
            value={form.smtp_password}
            onChangeText={(v) => setForm({ ...form, smtp_password: v })}
            secureTextEntry
            testID="smtp-password"
          />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLbl}>Use TLS</Text>
            <Switch
              value={form.use_tls}
              onValueChange={(v) => setForm({ ...form, use_tls: v, use_ssl: v ? false : form.use_ssl })}
              trackColor={{ false: C.surface3, true: C.primary }} thumbColor="#fff" testID="smtp-tls"
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLbl}>Use SSL</Text>
            <Switch
              value={form.use_ssl}
              onValueChange={(v) => setForm({ ...form, use_ssl: v, use_tls: v ? false : form.use_tls })}
              trackColor={{ false: C.surface3, true: C.primary }} thumbColor="#fff" testID="smtp-ssl"
            />
          </View>
        </VxCard>

        {/* Email */}
        <VxCard style={{ marginTop: Space.md, gap: Space.md }}>
          <Text style={styles.sectionTitle}>Identity</Text>
          <VxInput label="From email" placeholder="noreply@visionaryx.dev" value={form.from_email} onChangeText={(v) => setForm({ ...form, from_email: v })} autoCapitalize="none" keyboardType="email-address" testID="smtp-from-email" />
          <VxInput label="From name" placeholder="VisionaryX Alerts" value={form.from_name} onChangeText={(v) => setForm({ ...form, from_name: v })} testID="smtp-from-name" />
          <VxInput label="Public base URL" placeholder={s?.public_dashboard_url_default || 'https://visionaryx.app'} value={form.public_base_url} onChangeText={(v) => setForm({ ...form, public_base_url: v })} autoCapitalize="none" testID="smtp-base-url" />
        </VxCard>

        <View style={{ marginTop: Space.lg }}>
          <VxButton label="Save settings" onPress={save} busy={saving} fullWidth testID="save-settings" icon={<MaterialCommunityIcons name="content-save-outline" size={14} color="#fff" />} />
        </View>

        {/* Test */}
        <VxCard style={{ marginTop: Space.lg, gap: Space.md }}>
          <Text style={styles.sectionTitle}>Test connection</Text>
          <View style={{ flexDirection: 'row', gap: Space.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <VxInput label="Send test to" placeholder="ops@visionaryx.dev" value={testTo} onChangeText={setTestTo} keyboardType="email-address" autoCapitalize="none" testID="test-email" />
            </View>
            <VxButton label="Send" onPress={test} busy={testing} variant="secondary" testID="test-send" />
          </View>
        </VxCard>
      </ScrollView>
    </View>
  );
}

function AppearanceCard() {
  const { mode, setMode } = useColorMode();
  return (
    <VxCard style={{ marginTop: Space.lg, gap: Space.md }} testID="appearance-card">
      <View>
        <Text style={appearanceStyles.title}>Appearance</Text>
        <Text style={appearanceStyles.sub}>Choose between deep space dark or soft mist light.</Text>
      </View>
      <View style={appearanceStyles.row}>
        {(['dark', 'light'] as const).map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[appearanceStyles.opt, active && appearanceStyles.optActive]}
              testID={`appearance-${m}`}
            >
              <View style={[appearanceStyles.swatch, m === 'light' ? appearanceStyles.swatchLight : appearanceStyles.swatchDark]}>
                <MaterialCommunityIcons
                  name={m === 'dark' ? 'weather-night' : 'weather-sunny'}
                  size={16}
                  color={m === 'dark' ? '#E1E2EB' : '#0F0F17'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={appearanceStyles.optLbl}>{m === 'dark' ? 'Deep space dark' : 'Soft mist light'}</Text>
                <Text style={appearanceStyles.optDesc}>
                  {m === 'dark'
                    ? 'Electric violet on a void background. Best for control rooms.'
                    : 'Violet on a paper-soft background. Best for daylight reviews.'}
                </Text>
              </View>
              <View style={[appearanceStyles.check, active && appearanceStyles.checkActive]}>
                {active ? <MaterialCommunityIcons name="check" size={12} color="#fff" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </VxCard>
  );
}

const appearanceStyles = StyleSheet.create({
  title: { ...TextStyles.h4, color: C.text },
  sub: { ...TextStyles.caption, color: C.textMuted, marginTop: 2 },
  row: { gap: Space.sm },
  opt: {
    flexDirection: 'row', alignItems: 'center', gap: Space.sm,
    padding: Space.sm + 2, borderRadius: Radius.md,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2,
  },
  optActive: { borderColor: C.primary, backgroundColor: C.primaryFaint },
  swatch: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  swatchDark: { backgroundColor: '#0F0F17', borderColor: '#272A31' },
  swatchLight: { backgroundColor: '#F4F4F8', borderColor: '#D8D6E0' },
  optLbl: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  optDesc: { ...TextStyles.caption, color: C.textMuted, marginTop: 2 },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkActive: { borderColor: C.primary, backgroundColor: C.primary },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  center: { justifyContent: 'center', alignItems: 'center' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 720, width: '100%', alignSelf: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Space.xs },
  toggleLbl: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  toggleDesc: { ...TextStyles.caption, color: C.textMuted, marginTop: 2 },
  sectionTitle: { ...TextStyles.label, color: C.primaryAccent, marginBottom: 4 },
});
