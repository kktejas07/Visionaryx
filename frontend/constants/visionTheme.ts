/**
 * VisionaryX Design System v2 — Deep Space Glassmorphism (official user-supplied design).
 *
 * Palette pivots from indigo (v1) → **Electric Violet + Neon Cyan + Lavender on Deep Void**.
 * Surfaces use translucent glass (`rgba(255,255,255,0.04-0.06)` + 16-24px backdrop blur).
 */

export const Brand = {
  name: 'VisionaryX',
  fullName: 'VisionaryX AI',
  tagline: 'INTELLIGENT · SECURITY · SURVEILLANCE',
  shortTagline: 'Vision that watches, recognises and protects.',
  copyright: '© VisionaryX AI',
} as const;

// ---------------------------------------------------------------------------
// Deep Space palette (dark-first).
// ---------------------------------------------------------------------------
export const PaletteDark = {
  // Surfaces (deepest → highest elevation)
  bg: '#07070B',              // deep-void
  surface: '#10131a',         // surface
  surfaceLow: '#0b0e14',      // space-navy / container-lowest
  surface2: '#1d2026',        // container
  surface3: '#272a31',        // container-high
  surface4: '#32353c',        // container-highest
  // Text
  text: '#E1E2EB',            // on-surface
  textMuted: '#CBC3D7',       // on-surface-variant
  textFaint: '#7d758a',
  // Borders
  border: '#494454',          // outline-variant
  borderStrong: '#958ea0',    // outline
  // Brand primary — VIOLET on dark (single primary, no lavender)
  primary: '#8B5CF6',
  primaryHover: '#7C3AED',
  primaryActive: '#A078FF',
  primaryAccent: '#8B5CF6',
  primaryAccent2: '#818CF8',
  electricViolet: '#8B5CF6',
  indigoFlare: '#818CF8',
  primaryGradStart: '#8B5CF6',
  primaryGradEnd: '#7C3AED',
  onPrimary: '#FFFFFF',
  primaryFaint: 'rgba(139, 92, 246, 0.18)',
  // Live cyan — secondary accent
  cyan: '#06B6D4',            // neon-cyan
  cyanLight: '#4CD7F6',
  cyanFaint: 'rgba(6, 182, 212, 0.16)',
  // Tertiary
  tertiary: '#C3C0FF',
  tertiaryFaint: 'rgba(195, 192, 255, 0.14)',
  // Status
  success: '#06B6D4',
  successFaint: 'rgba(6, 182, 212, 0.16)',
  warning: '#FFB66B',
  warningFaint: 'rgba(255, 182, 107, 0.16)',
  danger: '#FFB4AB',          // error
  dangerHover: '#FF9C8E',
  dangerFaint: 'rgba(255, 180, 171, 0.16)',
  info: '#818CF8',
  // Glass / overlays
  scrim: 'rgba(0, 0, 0, 0.7)',
  glass: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassHi: 'rgba(255, 255, 255, 0.08)',
  innerGlow: 'rgba(255, 255, 255, 0.06)',
  // Chart palette
  chartPrimary: '#8B5CF6',
  chartActive: '#D0BCFF',
  chartTrack: 'rgba(139, 92, 246, 0.16)',
  chartLive: '#06B6D4',
} as const;

export const PaletteLight = PaletteDark; // dark-only for v2; light pending

export const BrandGradient = {
  start: '#8B5CF6',
  end: '#818CF8',
  primary: ['#8B5CF6', '#818CF8'],
  cyan: ['#06B6D4', '#4CD7F6'],
  logo: ['#8B5CF6', '#06B6D4'],
} as const;

// ---------------------------------------------------------------------------
// Spacing & radius
// ---------------------------------------------------------------------------
export const Space = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  huge: 96,
} as const;

export const Radius = {
  none: 0,
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  squircle: 28,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Typography — Geist + Inter + JetBrains Mono.
// ---------------------------------------------------------------------------
export const FontFamily = {
  display: 'SpaceGrotesk_700Bold',
  heading: 'SpaceGrotesk_600SemiBold',
  headingMedium: 'SpaceGrotesk_500Medium',
  body: 'Roboto_400Regular',
  bodyMedium: 'Roboto_500Medium',
  bodySemibold: 'Roboto_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
} as const;

export const TextStyles = {
  h1: { fontFamily: FontFamily.display, fontSize: 48, lineHeight: 56, letterSpacing: -1 },
  h2: { fontFamily: FontFamily.display, fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  h3: { fontFamily: FontFamily.heading, fontSize: 24, lineHeight: 32, letterSpacing: -0.4 },
  h4: { fontFamily: FontFamily.heading, fontSize: 20, lineHeight: 28, letterSpacing: -0.2 },
  bodyLarge: { fontFamily: FontFamily.body, fontSize: 18, lineHeight: 28 },
  body: { fontFamily: FontFamily.body, fontSize: 16, lineHeight: 24 },
  bodySmall: { fontFamily: FontFamily.body, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 16 },
  label: {
    fontFamily: FontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  dataLarge: { fontFamily: FontFamily.monoMedium, fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  dataMedium: { fontFamily: FontFamily.monoMedium, fontSize: 20, lineHeight: 28 },
  dataSmall: { fontFamily: FontFamily.mono, fontSize: 13, lineHeight: 18 },
} as const;

export const Motion = {
  fast: 150,
  base: 250,
  slow: 400,
  easing: {
    snappy: 'cubic-bezier(0.16, 1, 0.3, 1)',
    smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
    entrance: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
  },
} as const;

export const Breakpoint = {
  mobile: 360,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

// Glass blur values (only honored by RN-Web on web; native silently ignores).
export const Blur = {
  light: 12,
  medium: 16,
  strong: 24,
} as const;

export type ColorPalette = typeof PaletteDark;
export type ThemeName = 'dark' | 'light';

export interface VisionTheme {
  name: ThemeName;
  colors: ColorPalette;
  space: typeof Space;
  radius: typeof Radius;
  text: typeof TextStyles;
  motion: typeof Motion;
  font: typeof FontFamily;
}

export const ThemeDark: VisionTheme = {
  name: 'dark', colors: PaletteDark, space: Space, radius: Radius, text: TextStyles, motion: Motion, font: FontFamily,
};
export const ThemeLight: VisionTheme = ThemeDark;
export const Theme = ThemeDark;
