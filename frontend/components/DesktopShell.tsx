/**
 * Desktop shell — renders the VisionaryX 260px side-nav alongside route
 * content on viewports ≥ 1024px. Used by `app/_layout.tsx` so that ALL
 * authenticated routes (tab routes AND top-level routes like /detections,
 * /analytics, /users, /audit, /settings) get a persistent left rail.
 *
 * On viewports < 1024 it renders only the children so the bottom-tab bar
 * (owned by `app/(tabs)/_layout.tsx`) takes over.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeConnected } from '@/contexts/RealtimeContext';
import { useColorMode } from '@/contexts/ThemeContext';
import { isEnrolleeRole } from '@/lib/roles';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles, Breakpoint, Brand } from '@/constants/visionTheme';
import { VisionaryXLogo } from '@/components/VisionaryXLogo';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  iconActive?: IconName;
  testID: string;
  hideForEnrollee?: boolean;
  enrolleeOnly?: boolean;
}

const PRIMARY: NavItem[] = [
  { href: '/(tabs)', label: 'Overview', icon: 'view-dashboard-outline', iconActive: 'view-dashboard', testID: 'nav-overview' },
  { href: '/(tabs)/live', label: 'Live grid', icon: 'video-outline', iconActive: 'video', testID: 'nav-live', hideForEnrollee: true },
  { href: '/(tabs)/cameras', label: 'Cameras', icon: 'cctv', testID: 'nav-cameras', hideForEnrollee: true },
  { href: '/(tabs)/alerts', label: 'Alerts', icon: 'bell-outline', iconActive: 'bell-ring', testID: 'nav-alerts', hideForEnrollee: true },
  { href: '/(tabs)/enroll', label: 'Enrollment', icon: 'face-recognition', testID: 'nav-enroll', enrolleeOnly: true },
  { href: '/(tabs)/more', label: 'More', icon: 'dots-horizontal', testID: 'nav-more' },
];

const SECONDARY: NavItem[] = [
  { href: '/detections', label: 'Detections', icon: 'account-search', testID: 'nav-detections', hideForEnrollee: true },
  { href: '/analytics', label: 'Analytics', icon: 'chart-line', testID: 'nav-analytics', hideForEnrollee: true },
  { href: '/users', label: 'Users', icon: 'account-group-outline', testID: 'nav-users', hideForEnrollee: true },
  { href: '/audit', label: 'Audit log', icon: 'clipboard-text-clock-outline', testID: 'nav-audit', hideForEnrollee: true },
  { href: '/settings', label: 'Settings', icon: 'cog-outline', testID: 'nav-settings', hideForEnrollee: true },
];

const AI_NAV: NavItem[] = [
  { href: '/ai', label: 'AI Studio', icon: 'auto-fix', testID: 'nav-ai-studio', hideForEnrollee: true },
  { href: '/ai/chat', label: 'Bot Reply', icon: 'chat-processing', testID: 'nav-ai-chat', hideForEnrollee: true },
  { href: '/ai/agents', label: 'Agents', icon: 'robot-happy', testID: 'nav-ai-agents', hideForEnrollee: true },
  { href: '/ai/automations', label: 'Automations', icon: 'sitemap', testID: 'nav-ai-automations', hideForEnrollee: true },
  { href: '/ai/models', label: 'Models', icon: 'shape', testID: 'nav-ai-models', hideForEnrollee: true },
  { href: '/ai/rag', label: 'RAG', icon: 'database-search', testID: 'nav-ai-rag', hideForEnrollee: true },
  { href: '/ai/mcp', label: 'MCP Servers', icon: 'connection', testID: 'nav-ai-mcp', hideForEnrollee: true },
];

export function DesktopShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const { user, loading } = useAuth();
  const isDesktop = width >= Breakpoint.desktop;

  // Only wrap when desktop AND authenticated. Login / boot screens render full-bleed.
  if (!isDesktop || !user || loading) {
    return <>{children}</>;
  }

  return (
    <View style={styles.shell}>
      <SideNav />
      <View style={styles.main}>{children}</View>
    </View>
  );
}

function SideNav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const connected = useRealtimeConnected();
  const isEnrollee = isEnrolleeRole(user?.role);

  if (!user) return null;

  const currentPath = '/' + (segments as string[]).filter(Boolean).join('/');

  function isActive(href: string): boolean {
    if (href === '/(tabs)') {
      // Active when on /(tabs) or /(tabs)/index (Overview).
      return currentPath === '/(tabs)' || currentPath === '/(tabs)/index' || currentPath === '/(tabs)/';
    }
    return currentPath === href || currentPath.startsWith(href + '/');
  }

  const visiblePrimary = PRIMARY.filter(
    (n) => (!n.hideForEnrollee || !isEnrollee) && (!n.enrolleeOnly || isEnrollee),
  );
  const visibleSecondary = SECONDARY.filter((n) => !n.hideForEnrollee || !isEnrollee);
  const visibleAi = AI_NAV.filter((n) => !n.hideForEnrollee || !isEnrollee);

  return (
    <View style={styles.side} testID="desk-sidenav">
      {/* Brand */}
      <View style={styles.brand}>
        <VisionaryXLogo variant="wordmark" size={32} testID="sidenav-logo" />
      </View>
      <Text style={styles.tagline}>{Brand.tagline}</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Space.lg }}>
        <Text style={styles.sectionLbl}>WORKSPACE</Text>
        {visiblePrimary.map((item) => {
          const active = isActive(item.href);
          return (
            <Pressable
              key={item.href}
              style={[styles.navRow, active && styles.navRowActive]}
              onPress={() => router.push(item.href as any)}
              testID={item.testID}
            >
              {active ? <View style={styles.activeBar} /> : null}
              <View style={[styles.navIconBox, active && styles.navIconBoxActive]}>
                <MaterialCommunityIcons
                  name={(active && item.iconActive) || item.icon}
                  size={16}
                  color={active ? C.primaryAccent : C.textMuted}
                />
              </View>
              <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}

        {!isEnrollee && visibleSecondary.length > 0 ? (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLbl}>OPERATIONS</Text>
            {visibleSecondary.map((item) => {
              const active = isActive(item.href);
              return (
                <Pressable
                  key={item.href}
                  style={[styles.navRow, active && styles.navRowActive]}
                  onPress={() => router.push(item.href as any)}
                  testID={item.testID}
                >
                  {active ? <View style={styles.activeBar} /> : null}
                  <View style={[styles.navIconBox, active && styles.navIconBoxActive]}>
                    <MaterialCommunityIcons name={item.icon} size={16} color={active ? C.primaryAccent : C.textMuted} />
                  </View>
                  <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}

            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLbl}>AI · STUDIO</Text>
            {visibleAi.map((item) => {
              const active = isActive(item.href);
              return (
                <Pressable
                  key={item.href}
                  style={[styles.navRow, active && styles.navRowActive]}
                  onPress={() => router.push(item.href as any)}
                  testID={item.testID}
                >
                  {active ? <View style={styles.activeBar} /> : null}
                  <View style={[styles.navIconBox, active && styles.navIconBoxActive]}>
                    <MaterialCommunityIcons name={item.icon} size={16} color={active ? C.primaryAccent : C.textMuted} />
                  </View>
                  <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      {/* User pill */}
      <View style={styles.userPill} testID="sidenav-userpill">
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>{(user.name || user.email).charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: Space.sm, overflow: 'hidden' }}>
          <Text style={styles.userName} numberOfLines={1}>{user.name || user.email}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.dot, { backgroundColor: connected ? C.cyan : C.warning }]} />
            <Text style={styles.meta}>{(user.role || 'operator').toUpperCase()} · {connected ? 'LIVE' : 'IDLE'}</Text>
          </View>
        </View>
        <ThemeToggleButton />
        <Pressable
          onPress={() => logout().then(() => router.replace('/login'))}
          style={styles.logoutBtn}
          testID="sidenav-logout"
          hitSlop={8}
        >
          <MaterialCommunityIcons name="logout" size={16} color={C.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

function ThemeToggleButton() {
  const { mode, toggle } = useColorMode();
  return (
    <Pressable
      onPress={toggle}
      style={styles.logoutBtn}
      testID="sidenav-theme-toggle"
      hitSlop={8}
      accessibilityLabel="Toggle light or dark theme"
    >
      <MaterialCommunityIcons
        name={mode === 'dark' ? 'weather-sunny' : 'weather-night'}
        size={16}
        color={C.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  main: { flex: 1, overflow: 'hidden' },
  side: {
    width: 260,
    backgroundColor: C.surface,
    borderRightWidth: 1,
    borderRightColor: C.border,
    paddingHorizontal: Space.md,
    paddingTop: Space.xl,
    paddingBottom: Space.md,
  },
  brand: { paddingHorizontal: Space.sm, marginBottom: Space.sm },
  tagline: {
    ...TextStyles.label,
    color: C.textFaint,
    fontSize: 9,
    marginTop: Space.sm,
    marginLeft: Space.sm,
    marginBottom: Space.xl,
  },
  sectionLbl: { ...TextStyles.label, color: C.textFaint, fontSize: 9, paddingHorizontal: Space.sm, marginBottom: Space.sm, marginTop: Space.xs },
  sectionDivider: { height: 1, backgroundColor: C.border, marginVertical: Space.md, marginHorizontal: Space.sm, opacity: 0.6 },
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: Space.sm,
    paddingHorizontal: Space.sm, paddingVertical: 8,
    borderRadius: Radius.sm, marginBottom: 2, position: 'relative',
  },
  navRowActive: { backgroundColor: C.primaryFaint },
  activeBar: { position: 'absolute', left: -Space.md, top: 6, bottom: 6, width: 3, backgroundColor: C.primaryAccent, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  navIconBox: {
    width: 28, height: 28, borderRadius: Radius.sm,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  navIconBoxActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
  },
  navText: { ...TextStyles.bodySmall, color: C.textMuted, fontFamily: F.bodyMedium, fontSize: 13 },
  navTextActive: { color: C.text },

  userPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface2, borderRadius: Radius.md,
    paddingHorizontal: Space.sm, paddingVertical: Space.sm,
    borderWidth: 1, borderColor: C.border,
  },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { ...TextStyles.bodySmall, color: '#fff', fontFamily: F.heading },
  userName: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  meta: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8 },
  logoutBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
});
