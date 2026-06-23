import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AuthProvider } from '@/contexts/AuthContext';
import { RealtimeProvider } from '@/contexts/RealtimeContext';
import { PaletteDark, FontFamily as Fonts } from '@/constants/visionTheme';
import { DesktopShell } from '@/components/DesktopShell';

export { ErrorBoundary } from 'expo-router';
export const unstable_settings = { initialRouteName: 'index' };
SplashScreen.preventAutoHideAsync().catch(() => undefined);

const VxNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: PaletteDark.primary,
    background: PaletteDark.bg,
    card: PaletteDark.surface,
    text: PaletteDark.text,
    border: PaletteDark.border,
    notification: PaletteDark.danger,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  useEffect(() => {
    if (error) console.warn('Font load error', error);
  }, [error]);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <AuthProvider>
      <RealtimeProvider>
        <ThemeProvider value={VxNavTheme}>
          <DesktopShell>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: PaletteDark.surface, borderBottomWidth: 0 },
                headerTintColor: PaletteDark.text,
                headerTitleStyle: { fontFamily: Fonts.heading, fontSize: 18 },
                contentStyle: { backgroundColor: PaletteDark.bg },
                headerBackTitle: 'Back',
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="camera/[id]" options={{ title: 'Live view' }} />
              <Stack.Screen name="analytics" options={{ headerShown: false }} />
              <Stack.Screen name="detections" options={{ headerShown: false }} />
              <Stack.Screen name="audit" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ headerShown: false }} />
              <Stack.Screen name="users" options={{ headerShown: false }} />
              <Stack.Screen name="ai/index" options={{ headerShown: false }} />
              <Stack.Screen name="ai/chat" options={{ headerShown: false }} />
              <Stack.Screen name="ai/agents" options={{ headerShown: false }} />
              <Stack.Screen name="ai/automations" options={{ headerShown: false }} />
              <Stack.Screen name="ai/models" options={{ headerShown: false }} />
              <Stack.Screen name="ai/rag" options={{ headerShown: false }} />
              <Stack.Screen name="ai/mcp" options={{ headerShown: false }} />
            </Stack>
          </DesktopShell>
        </ThemeProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}
