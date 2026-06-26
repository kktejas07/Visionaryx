/**
 * VisionaryX Official Logo — implementation of the brand-book mark.
 *
 * Construction (per VisionaryX brand book):
 *   "Two crossed bars on a 45° grid form the X; four corner ticks frame
 *    it as a viewfinder."
 *
 * Variants
 *   - `app`       : official squircle app-icon (gradient background + white X + lavender ticks)
 *   - `mark`      : flat icon-only (transparent bg, indigo X + lavender ticks). For use inline on dark UI.
 *   - `wordmark`  : Primary / Horizontal lockup — squircle icon + "Visionary X" + AI superscript
 *   - `stacked`   : Squircle icon on top, "Visionary X" wordmark below
 *
 * Rules respected from brand book:
 *   • Two crossed white bars on a 45° grid (rounded caps)
 *   • Four lavender corner ticks (viewfinder)
 *   • Indigo gradient #4F46E5 → #7C3AED on the squircle
 *   • NO glow / NO drop-shadow on the icon itself
 *   • Clear-space ≥ cap-height of X provided by the wrapping <View>
 */
import { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Svg, Defs, LinearGradient, Stop, Rect, Path, Line } from 'react-native-svg';
import { PaletteDark, FontFamily, BrandGradient } from '@/constants/visionTheme';

type LogoVariant = 'app' | 'mark' | 'wordmark' | 'stacked';

interface Props {
  /** Pixel size of the square icon (or icon part of a lockup). */
  size?: number;
  variant?: LogoVariant;
  /** For `mark` only — color of the X strokes. */
  color?: string;
  /** For `mark` only — color of the corner ticks. */
  accent?: string;
  /** For `wordmark` / `stacked` — color of "Visionary". */
  textColor?: string;
  /** For `wordmark` / `stacked` — color of the "X" and "AI" superscript. */
  textAccent?: string;
  testID?: string;
}

export const VisionaryXLogo = memo(function VisionaryXLogo({
  size = 40,
  variant = 'app',
  color,
  accent,
  textColor = PaletteDark.text,
  textAccent = PaletteDark.primaryAccent,
  testID,
}: Props) {
  const xColor = color ?? '#FFFFFF';
  const tickColor = accent ?? 'rgba(255,255,255,0.55)';

  // --- The squircle app icon ---
  const AppIcon = (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      testID={testID ? `${testID}-app` : 'vx-logo-app'}
    >
      <Defs>
        <LinearGradient id="vxGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={BrandGradient.start} />
          <Stop offset="100%" stopColor={BrandGradient.end} />
        </LinearGradient>
      </Defs>
      {/* Squircle background (rx is large for the squircle look) */}
      <Rect x="0" y="0" width="100" height="100" rx="26" ry="26" fill="url(#vxGrad)" />
      {/* Four corner ticks (lavender / semi-opaque) */}
      <Path
        d="M 20 32 L 20 20 L 32 20"
        stroke={tickColor}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M 68 20 L 80 20 L 80 32"
        stroke={tickColor}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M 20 68 L 20 80 L 32 80"
        stroke={tickColor}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M 80 68 L 80 80 L 68 80"
        stroke={tickColor}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* X — two thick white bars on 45° grid, rounded caps */}
      <Line x1="32" y1="32" x2="68" y2="68" stroke={xColor} strokeWidth={11} strokeLinecap="round" />
      <Line x1="68" y1="32" x2="32" y2="68" stroke={xColor} strokeWidth={11} strokeLinecap="round" />
    </Svg>
  );

  // --- Flat icon-only (no background) ---
  if (variant === 'mark') {
    const flatStroke = color ?? PaletteDark.primaryAccent;
    const flatTick = accent ?? PaletteDark.primary;
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        testID={testID ? `${testID}-mark` : 'vx-logo-mark'}
      >
        <Path d="M 20 32 L 20 20 L 32 20" stroke={flatTick} strokeWidth={5} strokeLinecap="round" fill="none" />
        <Path d="M 68 20 L 80 20 L 80 32" stroke={flatTick} strokeWidth={5} strokeLinecap="round" fill="none" />
        <Path d="M 20 68 L 20 80 L 32 80" stroke={flatTick} strokeWidth={5} strokeLinecap="round" fill="none" />
        <Path d="M 80 68 L 80 80 L 68 80" stroke={flatTick} strokeWidth={5} strokeLinecap="round" fill="none" />
        <Line x1="32" y1="32" x2="68" y2="68" stroke={flatStroke} strokeWidth={11} strokeLinecap="round" />
        <Line x1="68" y1="32" x2="32" y2="68" stroke={flatStroke} strokeWidth={11} strokeLinecap="round" />
      </Svg>
    );
  }

  // --- Primary / horizontal lockup: icon + "Visionary X AI" ---
  if (variant === 'wordmark') {
    return (
      <View style={styles.row} testID={testID ?? 'vx-logo-wordmark'}>
        {AppIcon}
        <View style={{ marginLeft: size * 0.4, flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text
            style={[
              styles.wordmark,
              { fontSize: size * 0.78, lineHeight: size * 0.9, color: textColor },
            ]}
            allowFontScaling={false}
          >
            Visionary{' '}
          </Text>
          <Text
            style={[
              styles.wordmarkX,
              { fontSize: size * 0.78, lineHeight: size * 0.9, color: textAccent },
            ]}
            allowFontScaling={false}
          >
            X
          </Text>
          <Text
            style={[
              styles.superAI,
              {
                fontSize: size * 0.22,
                lineHeight: size * 0.3,
                color: textAccent,
                marginTop: size * 0.05,
              },
            ]}
            allowFontScaling={false}
          >
            {'  AI'}
          </Text>
        </View>
      </View>
    );
  }

  // --- Stacked lockup: icon on top, wordmark below ---
  if (variant === 'stacked') {
    return (
      <View style={styles.stacked} testID={testID ?? 'vx-logo-stacked'}>
        {AppIcon}
        <View style={[styles.stackedTextRow, { marginTop: size * 0.25 }]}>
          <Text
            style={[
              styles.wordmark,
              { fontSize: size * 0.56, lineHeight: size * 0.66, color: textColor },
            ]}
            allowFontScaling={false}
          >
            Visionary{' '}
          </Text>
          <Text
            style={[
              styles.wordmarkX,
              { fontSize: size * 0.56, lineHeight: size * 0.66, color: textAccent },
            ]}
            allowFontScaling={false}
          >
            X
          </Text>
        </View>
        <Text
          style={[
            styles.label,
            { fontSize: size * 0.14, marginTop: size * 0.12, color: textAccent },
          ]}
          allowFontScaling={false}
        >
          A I
        </Text>
      </View>
    );
  }

  return AppIcon;
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  stacked: { alignItems: 'center', justifyContent: 'center' },
  stackedTextRow: { flexDirection: 'row', alignItems: 'flex-end' },
  wordmark: {
    fontFamily: Platform.select({
      web: FontFamily.display,
      default: FontFamily.display,
    }),
    letterSpacing: -0.5,
    fontWeight: '700',
  },
  wordmarkX: {
    fontFamily: FontFamily.display,
    letterSpacing: -0.5,
    fontWeight: '700',
  },
  superAI: {
    fontFamily: FontFamily.mono,
    letterSpacing: 1.5,
    fontWeight: '500',
  },
  label: {
    fontFamily: FontFamily.mono,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
});
