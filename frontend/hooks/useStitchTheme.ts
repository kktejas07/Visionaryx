import { useColorScheme } from '@/components/useColorScheme';
import Colors, { Brand } from '@/constants/Colors';
import { Stitch, FontFamily } from '@/constants/stitchTheme';

/**
 * Sentinel / Stitch tokens for dark; light mode keeps readable MUI-like grays.
 */
export function useStitchTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return {
    isDark,
    FontFamily,
    Stitch,
    bg: isDark ? Stitch.surface : Colors.light.background,
    card: isDark ? Stitch.surfaceContainerHigh : Colors.light.card,
    cardLow: isDark ? Stitch.surfaceContainerLow : '#f3f4f6',
    cardMid: isDark ? Stitch.surfaceContainer : Colors.light.card,
    /** Ghost border per DESIGN.md — outline-variant ~20% */
    borderHair: isDark ? 'rgba(66, 71, 83, 0.32)' : Colors.light.border,
    text: isDark ? Stitch.onSurface : Colors.light.text,
    textMuted: isDark ? Stitch.onSurfaceVariant : Colors.light.textSecondary,
    /** Headlines / icons — light blue accent */
    accent: isDark ? Stitch.primary : Brand.primary,
    /** Buttons / strong emphasis */
    accentCta: Stitch.primaryContainer,
    onAccent: Stitch.onPrimaryContainer,
    success: Stitch.secondary,
    /** Space for floating glass dock (tabs use absolute positioning in dark). */
    tabBarPadBottom: 112,
  };
}

export type StitchTheme = ReturnType<typeof useStitchTheme>;
