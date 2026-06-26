/**
 * Legacy compat shim — exports the OLD `Stitch` and `FontFamily` tokens
 * mapped onto the new VisionaryX design system, so existing screens keep
 * compiling while we incrementally migrate them to import from
 * `@/constants/visionTheme` directly.
 */
import { PaletteDark, FontFamily as VxFonts } from './visionTheme';

export const Stitch = {
  // Surfaces
  surface: PaletteDark.surface,
  surfaceContainerLowest: PaletteDark.bg,
  surfaceContainerLow: PaletteDark.surfaceLow,
  surfaceContainer: PaletteDark.surface2,
  surfaceContainerHigh: PaletteDark.surface2,
  surfaceContainerHighest: PaletteDark.surface3,
  // Text
  onSurface: PaletteDark.text,
  onSurfaceVariant: PaletteDark.textMuted,
  outline: PaletteDark.textMuted,
  outlineVariant: PaletteDark.borderStrong,
  // Tab
  tabInactive: 'rgba(140, 155, 179, 0.55)',
  // Primary
  primary: PaletteDark.primaryAccent,
  primaryContainer: PaletteDark.primary,
  onPrimaryContainer: PaletteDark.onPrimary,
  onPrimary: '#FFFFFF',
  // Secondary (success / accent)
  secondary: PaletteDark.success,
  secondaryContainer: '#00aa54',
  onSecondaryContainer: '#dcffe7',
  // Tertiary (warning)
  tertiary: PaletteDark.warning,
  // Error
  error: PaletteDark.danger,
  errorContainer: '#5b0a08',
  onErrorContainer: '#ffdad6',
} as const;

export const FontFamily = {
  headline: VxFonts.heading,
  headlineBlack: VxFonts.display,
  body: VxFonts.body,
  labelMedium: VxFonts.bodyMedium,
  labelSemibold: VxFonts.bodySemibold,
  // Mono extensions used by new VisionaryX screens
  mono: VxFonts.mono,
  monoMedium: VxFonts.monoMedium,
} as const;
