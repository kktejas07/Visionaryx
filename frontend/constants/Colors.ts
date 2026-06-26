import { Stitch } from './stitchTheme';

/** Legacy brand accents — still used for status / light mode */
export const Brand = {
  primary: '#2065D1',
  primaryAccent: Stitch.primary,
  success: '#00AB55',
  warning: '#FFAB00',
  danger: '#FF5630',
} as const;

const tintColorLight = Brand.primary;
const outlineSoft = 'rgba(66, 71, 83, 0.35)';

export default {
  light: {
    text: '#111827',
    textSecondary: '#6B7280',
    background: '#F4F6F8',
    card: '#FFFFFF',
    border: '#E5E7EB',
    tint: tintColorLight,
    tabIconDefault: '#9CA3AF',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: Stitch.onSurface,
    textSecondary: Stitch.onSurfaceVariant,
    background: Stitch.surface,
    card: Stitch.surfaceContainerHigh,
    /** Ghost edge — avoid heavy 1px lines (Stitch DESIGN.md) */
    border: 'rgba(66, 71, 83, 0.28)',
    tint: Stitch.primary,
    tabIconDefault: '#8c909f',
    tabIconSelected: Stitch.primary,
  },
};
