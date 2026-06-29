/**
 * MobileNavDrawer — slide-in drawer for mobile users (≤768px). Provides
 * access to all routes that the desktop side-nav exposes. The trigger is a
 * floating hamburger pill anchored at the top-left of the screen.
 *
 * The component renders nothing on desktop because <DesktopShell> already
 * shows a persistent 260px side-nav at width ≥ 1024.
 *
 * Hidden when no authenticated user (e.g. /login, /pair).
 */
import { useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/contexts/ThemeContext';
import { isEnrolleeRole } from '@/lib/roles';
import { Breakpoint, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';

type Entry = {
  href: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  testID: string;
  hideForEnrollee?: boolean;
  adminOnly?: boolean;
};

const SECTIONS: Array<{ title: string; items: Entry[] }> = [
  {
    title: 'OPERATIONS',
    items: [
      { href: '/detections', label: 'Detections', icon: 'account-search', testID: 'drawer-detections', hideForEnrollee: true },
      { href: '/analytics', label: 'Analytics', icon: 'chart-line', testID: 'drawer-analytics', hideForEnrollee: true },
      { href: '/reports', label: 'Reports', icon: 'file-chart-outline', testID: 'drawer-reports', hideForEnrollee: true },
      { href: '/docs', label: 'Documentation', icon: 'book-open-page-variant-outline', testID: 'drawer-docs' },
      { href: '/users', label: 'Users', icon: 'account-group-outline', testID: 'drawer-users', adminOnly: true },
      { href: '/audit', label: 'Audit log', icon: 'history', testID: 'drawer-audit', adminOnly: true },
      { href: '/settings', label: 'Settings', icon: 'cog-outline', testID: 'drawer-settings' },
    ],
  },
  {
    title: 'AI · STUDIO',
    items: [
      { href: '/ai', label: 'AI Studio', icon: 'auto-fix', testID: 'drawer-ai-studio', hideForEnrollee: true },
      { href: '/ai/chat', label: 'Bot Reply', icon: 'chat-outline', testID: 'drawer-bot-reply', hideForEnrollee: true },
      { href: '/ai/agents', label: 'Agents', icon: 'robot-outline', testID: 'drawer-agents', hideForEnrollee: true },
      { href: '/ai/automations', label: 'Automations', icon: 'sitemap-outline', testID: 'drawer-automations', hideForEnrollee: true },
      { href: '/ai/models', label: 'Models', icon: 'shape-outline', testID: 'drawer-models', hideForEnrollee: true },
      { href: '/ai/rag', label: 'RAG', icon: 'database-search', testID: 'drawer-rag', hideForEnrollee: true },
      { href: '/ai/mcp', label: 'MCP Servers', icon: 'connection', testID: 'drawer-mcp', hideForEnrollee: true },
    ],
  },
];

export function MobileNavDrawer() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoint.desktop;
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const c = useColors();
  const [open, setOpen] = useState(false);

  // Hide on desktop (side-nav is already there) or when not logged in.
  if (isDesktop || !user) return null;
  // Don't show on the public pair page.
  if (pathname?.startsWith('/pair')) return null;

  const isEnrollee = isEnrolleeRole(user.role);
  const isAdmin = user.role === 'admin';

  const visible = (e: Entry) => {
    if (e.adminOnly && !isAdmin) return false;
    if (e.hideForEnrollee && isEnrollee) return false;
    return true;
  };

  const go = (href: string) => {
    setOpen(false);
    // small delay so the modal closes before navigation triggers a re-render.
    setTimeout(() => router.push(href as never), 80);
  };

  return (
    <>
      <Pressable
        style={[styles.fab, { backgroundColor: c.surface, borderColor: c.border }]}
        onPress={() => setOpen(true)}
        testID="mobile-nav-trigger"
        accessibilityLabel="Open navigation"
      >
        <MaterialCommunityIcons name="menu" size={20} color={c.text} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} testID="mobile-nav-scrim">
          <Pressable
            style={[styles.drawer, { backgroundColor: c.surface, borderColor: c.border }]}
            onPress={(e) => e.stopPropagation?.()}
            testID="mobile-nav-drawer"
          >
            <View style={styles.head}>
              <View style={[styles.brandSquare, { backgroundColor: c.primaryAccent }]}>
                <MaterialCommunityIcons name="hexagon-outline" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.brand, { color: c.text }]}>Visionary X</Text>
                <Text style={[styles.brandSub, { color: c.textMuted }]}>NAVIGATION</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={12} testID="mobile-nav-close">
                <MaterialCommunityIcons name="close" size={20} color={c.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: Space.lg }}
              showsVerticalScrollIndicator={false}
            >
              {SECTIONS.map((sec) => {
                const items = sec.items.filter(visible);
                if (items.length === 0) return null;
                return (
                  <View key={sec.title} style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: c.textFaint }]}>{sec.title}</Text>
                    {items.map((e) => {
                      const active = pathname === e.href;
                      return (
                        <Pressable
                          key={e.href}
                          onPress={() => go(e.href)}
                          style={[
                            styles.row,
                            active && { backgroundColor: c.primaryFaint, borderColor: c.primaryAccent },
                          ]}
                          testID={e.testID}
                        >
                          <MaterialCommunityIcons
                            name={e.icon}
                            size={18}
                            color={active ? c.primaryAccent : c.textMuted}
                          />
                          <Text style={[styles.rowLabel, { color: active ? c.text : c.textMuted }]}>
                            {e.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>

            <Text style={[styles.footer, { color: c.textFaint }]}>
              {user.email} · {user.role?.toUpperCase()}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 14 : 48,
    left: 14,
    width: 40, height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 50,
    // shadow web/native
    shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 6,
  },
  scrim: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row',
  },
  drawer: {
    width: '78%', maxWidth: 320, height: '100%',
    borderRightWidth: 1,
    paddingTop: Space.xl, paddingHorizontal: Space.lg, paddingBottom: Space.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginBottom: Space.lg },
  brandSquare: { width: 30, height: 30, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  brand: { ...TextStyles.h4, fontSize: 16 },
  brandSub: { ...TextStyles.label, fontSize: 9, letterSpacing: 1.4 },
  section: { marginTop: Space.lg },
  sectionTitle: { ...TextStyles.label, fontSize: 9, letterSpacing: 1.6, marginBottom: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Space.sm,
    paddingVertical: 10, paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
    borderWidth: 1, borderColor: 'transparent',
  },
  rowLabel: { ...TextStyles.body, fontSize: 14, fontFamily: F.body },
  footer: {
    ...TextStyles.label, fontSize: 9, letterSpacing: 1.4,
    textAlign: 'center', marginTop: Space.md,
  },
});
