/**
 * Reusable command-center background — subtle grid + corner brackets
 * + radial glow. Place at the root of a screen, behind all content.
 *
 * Theme-aware: reads `useColors()` so light mode swaps the deep void for
 * a soft mist on native too (web already gets this via CSS variables).
 */
import { memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Svg, Defs, Pattern, Path, Rect, Stop, RadialGradient } from 'react-native-svg';
import { PaletteDark } from '@/constants/visionTheme';
import { useColors } from '@/contexts/ThemeContext';

interface Props {
  /** Background color underneath the grid. Defaults to active theme bg. */
  color?: string;
  /** Show top-radial glow */
  glow?: boolean;
}

export const CommandBackground = memo(function CommandBackground({
  color,
  glow = true,
}: Props) {
  const colors = useColors();
  const bg = color ?? colors.bg ?? PaletteDark.bg;
  return (
    <View
      style={[StyleSheet.absoluteFillObject, { backgroundColor: bg }]}
      pointerEvents="none"
      testID="command-bg"
    >
      <Svg
        width="100%"
        height="100%"
        // @ts-ignore — RN-Web accepts style
        style={Platform.OS === 'web' ? { position: 'absolute', inset: 0 } : undefined}
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <Pattern id="vxGrid" width="36" height="36" patternUnits="userSpaceOnUse">
            <Path
              d="M 36 0 L 0 0 0 36"
              fill="none"
              stroke={colors.primary}
              strokeOpacity={0.05}
              strokeWidth={0.5}
            />
          </Pattern>
          {glow ? (
            <RadialGradient id="vxGlow" cx="50%" cy="0%" r="55%">
              <Stop offset="0%" stopColor={colors.primary} stopOpacity={0.22} />
              <Stop offset="50%" stopColor={colors.primaryActive} stopOpacity={0.06} />
              <Stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        <Rect width="100%" height="100%" fill="url(#vxGrid)" />
        {glow ? <Rect width="100%" height="100%" fill="url(#vxGlow)" /> : null}
      </Svg>
    </View>
  );
});
