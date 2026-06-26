/**
 * Tabs layout — owns the bottom tab-bar on mobile/tablet (<1024).
 * On desktop (≥1024) the tab-bar is hidden because `app/_layout.tsx`
 * wraps everything in `<DesktopShell>` with a persistent 260px side-nav.
 */
import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/contexts/ThemeContext';
import { isEnrolleeRole } from '@/lib/roles';
import { PaletteDark as C, FontFamily as F, Breakpoint } from '@/constants/visionTheme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { loading, user } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoint.desktop;
  const isEnrollee = isEnrolleeRole(user?.role);
  const c = useColors();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <View style={[styles.boot, { backgroundColor: c.bg }]} testID="tabs-boot">
        <ActivityIndicator size="large" color={c.primaryAccent} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primaryAccent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: isDesktop
          ? { display: 'none' }
          : {
              backgroundColor: c.surface,
              borderTopColor: c.border,
              borderTopWidth: 1,
              height: 60 + Math.max(insets.bottom, 8),
              paddingBottom: Math.max(insets.bottom, 8),
              paddingTop: 6,
            },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: F.mono,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginTop: -2,
        },
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isEnrollee ? 'Home' : 'Overview',
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons
              name={focused ? 'view-dashboard' : 'view-dashboard-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live',
          href: isEnrollee ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons name={focused ? 'video' : 'video-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cameras"
        options={{
          title: 'Cameras',
          href: isEnrollee ? null : undefined,
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cctv" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          href: isEnrollee ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <MaterialCommunityIcons name={focused ? 'bell-ring' : 'bell-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="enroll"
        options={{
          title: 'Enroll',
          href: !isEnrollee ? null : undefined,
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="face-recognition" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="dots-horizontal" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
});
