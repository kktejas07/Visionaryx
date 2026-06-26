import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Stitch } from '@/constants/stitchTheme';

/** Stitch bottom nav: surface-container-high @ 80% + backdrop blur (overview/code.html dock). */
export function StitchTabBarBackground() {
  return (
    <View style={styles.wrap}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 50 : 40}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tint} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 42, 61, 0.72)',
  },
});
