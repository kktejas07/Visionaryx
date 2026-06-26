import { Redirect } from 'expo-router';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { PaletteDark as C, FontFamily as F, Space, TextStyles, Brand } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { VisionaryXLogo } from '@/components/VisionaryXLogo';

export default function Index() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <View style={styles.root} testID="boot-screen">
        <CommandBackground />
        <View style={styles.center}>
          <VisionaryXLogo size={72} variant="stacked" />
          <ActivityIndicator size="small" color={C.primaryAccent} style={{ marginTop: Space.xl }} />
          <Text style={styles.line}>{Brand.tagline}</Text>
        </View>
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  line: {
    ...TextStyles.label,
    color: C.textMuted,
    marginTop: Space.md,
    fontFamily: F.mono,
    letterSpacing: 1.4,
  },
});
