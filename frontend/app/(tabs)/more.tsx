/**
 * "More" tab — user pill + quick links + sign-out.
 */
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeConnected } from '@/contexts/RealtimeContext';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles, Brand } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { VisionaryXLogo } from '@/components/VisionaryXLogo';
import { SectionEyebrow, VxButton } from '@/components/vx';
import { isAdminRole } from '@/lib/roles';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface QuickLink {
  href: string;
  label: string;
  desc: string;
  icon: IconName;
  adminOnly?: boolean;
  testID: string;
}

const LINKS: QuickLink[] = [
  { href: '/detections', label: 'Detections', desc: 'Forensic search across all events', icon: 'account-search', testID: 'more-detections' },
  { href: '/analytics', label: 'Analytics', desc: 'Trends, object distribution, anomalies', icon: 'chart-line', testID: 'more-analytics' },
  { href: '/users', label: 'User management', desc: 'Operators, enrollees, role control', icon: 'account-group-outline', adminOnly: true, testID: 'more-users' },
  { href: '/audit', label: 'Audit log', desc: 'Chronological admin activity', icon: 'clipboard-text-clock-outline', adminOnly: true, testID: 'more-audit' },
  { href: '/settings', label: 'Settings', desc: 'SMTP, brand, security, integrations', icon: 'cog-outline', adminOnly: true, testID: 'more-settings' },
];

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const connected = useRealtimeConnected();
  const isAdmin = isAdminRole(user?.role);

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const visible = LINKS.filter((l) => !l.adminOnly || isAdmin);

  return (
    <View style={styles.root} testID="more-screen">
      <CommandBackground />
      <ScrollView contentContainerStyle={styles.pad}>
        <SectionEyebrow>Profile · Settings</SectionEyebrow>

        {/* User pill */}
        <View style={styles.pillCard} testID="more-userpill">
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>
              {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: Space.md }}>
            <Text style={styles.userName}>{user?.name || user?.email}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.statusDot, { backgroundColor: connected ? C.cyan : C.warning }]} />
              <Text style={styles.userMeta}>
                {(user?.role || 'operator').toUpperCase()} · {connected ? 'CHANNEL LIVE' : 'CHANNEL IDLE'}
              </Text>
            </View>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* Quick links */}
        <Text style={[styles.sectionLabel, { marginTop: Space.xl }]}>SHORTCUTS</Text>
        <View style={{ gap: Space.sm }}>
          {visible.map((link) => (
            <Pressable
              key={link.href}
              style={styles.linkRow}
              onPress={() => router.push(link.href as any)}
              testID={link.testID}
            >
              <View style={styles.linkIcon}>
                <MaterialCommunityIcons name={link.icon} size={18} color={C.primaryAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkDesc}>{link.desc}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={C.textMuted} />
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <View style={{ marginTop: Space.xl }}>
          <VxButton
            label="Sign out"
            variant="danger"
            fullWidth
            onPress={onLogout}
            testID="more-logout"
            icon={<MaterialCommunityIcons name="logout" size={14} color="#fff" />}
          />
        </View>

        {/* Footer brand */}
        <View style={styles.footer}>
          <VisionaryXLogo variant="wordmark" size={20} />
          <Text style={styles.footerCopy}>{Brand.copyright}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 720, width: '100%', alignSelf: 'center' },

  pillCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: Radius.lg,
    padding: Space.lg, borderWidth: 1, borderColor: C.border,
    marginTop: Space.md,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { ...TextStyles.h3, color: '#fff', fontFamily: F.display },
  userName: { ...TextStyles.h4, color: C.text },
  userEmail: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  userMeta: { ...TextStyles.label, color: C.textMuted, fontSize: 9 },

  sectionLabel: { ...TextStyles.label, color: C.textFaint, marginBottom: Space.sm, fontSize: 10 },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md,
    backgroundColor: C.surface, borderRadius: Radius.md,
    padding: Space.md, borderWidth: 1, borderColor: C.border,
  },
  linkIcon: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: C.primaryFaint,
    alignItems: 'center', justifyContent: 'center',
  },
  linkLabel: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  linkDesc: { ...TextStyles.caption, color: C.textMuted, marginTop: 2 },

  footer: { marginTop: Space.xxl, alignItems: 'center', gap: Space.sm, opacity: 0.7 },
  footerCopy: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono },
});
