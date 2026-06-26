/**
 * Glassmorphism primitives — `GlassCard`, `GlowOrb`, `DataStream`.
 * On web, applies `backdrop-filter: blur(...)`. On native, falls back to
 * solid translucent surface (RN doesn't natively support backdrop-filter).
 */
import { ReactNode } from 'react';
import { Platform, StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { PaletteDark as C, Radius, Space, Blur } from '@/constants/visionTheme';
import { useColors } from '@/contexts/ThemeContext';

interface GlassProps extends ViewProps {
  blur?: keyof typeof Blur;
  radius?: keyof typeof Radius;
  pad?: keyof typeof Space;
  border?: boolean;
  fill?: string;
  children?: ReactNode;
}

export function GlassCard({
  blur = 'medium',
  radius = 'lg',
  pad = 'lg',
  border = true,
  fill,
  style,
  children,
  ...rest
}: GlassProps) {
  const colors = useColors();
  const webStyle =
    Platform.OS === 'web'
      ? ({
          backdropFilter: `blur(${Blur[blur]}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${Blur[blur]}px) saturate(180%)`,
        } as ViewStyle)
      : undefined;
  return (
    <View
      {...rest}
      style={[
        {
          borderColor: colors.glassBorder,
          backgroundColor: fill ?? colors.glass,
          borderRadius: Radius[radius],
          padding: Space[pad],
          borderWidth: border ? 1 : 0,
        },
        webStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

interface OrbProps {
  size?: number;
  color?: string;
  opacity?: number;
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
}

export function GlowOrb({
  size = 320,
  color = C.electricViolet,
  opacity = 0.25,
  top,
  left,
  right,
  bottom,
}: OrbProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          backgroundColor: color,
          opacity,
          top: top as any,
          left: left as any,
          right: right as any,
          bottom: bottom as any,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    borderRadius: 9999,
    // huge blur on web; native gets a softer fall-back via opacity.
    ...(Platform.OS === 'web' ? ({ filter: 'blur(80px)' } as any) : {}),
  },
});
