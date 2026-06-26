/**
 * Theme variable injection for web.
 *
 * The visionTheme palette emits its foundational surface + text tokens as
 * `var(--vx-<token>, fallback)` on web (see `constants/visionTheme.ts`).
 * This component injects the dark + light values of those CSS variables
 * scoped on the `<html>` element via `[data-vx-theme]`, so swapping the
 * attribute live recolors every StyleSheet-emitted surface without a
 * single per-screen refactor.
 *
 * On native this component renders nothing.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';

const STYLE_ID = 'vx-theme-vars';

const CSS = `
/* Defaults (dark) */
:root,
[data-vx-theme="dark"] {
  --vx-bg: #07070B;
  --vx-surface: #10131a;
  --vx-surfaceLow: #0b0e14;
  --vx-surface2: #1d2026;
  --vx-surface3: #272a31;
  --vx-surface4: #32353c;
  --vx-text: #E1E2EB;
  --vx-textMuted: #CBC3D7;
  --vx-textFaint: #7d758a;
  --vx-border: #494454;
  --vx-borderStrong: #958ea0;
  --vx-glass: rgba(255, 255, 255, 0.05);
  --vx-glassBorder: rgba(255, 255, 255, 0.08);
  --vx-glassHi: rgba(255, 255, 255, 0.08);
  color-scheme: dark;
}

/* Light — soft mist on paper */
[data-vx-theme="light"] {
  --vx-bg: #F4F4F8;
  --vx-surface: #FFFFFF;
  --vx-surfaceLow: #FAFAFE;
  --vx-surface2: #EEEEF5;
  --vx-surface3: #E5E5EE;
  --vx-surface4: #DCDCE6;
  --vx-text: #0F0F17;
  --vx-textMuted: #3F3D4A;
  --vx-textFaint: #8A8493;
  --vx-border: #D8D6E0;
  --vx-borderStrong: #7D758A;
  --vx-glass: rgba(255, 255, 255, 0.86);
  --vx-glassBorder: rgba(15, 15, 23, 0.08);
  --vx-glassHi: rgba(255, 255, 255, 0.94);
  color-scheme: light;
}

/* Page baseline */
html, body { background-color: var(--vx-bg); color: var(--vx-text); }

/* Soften the deep-space command-background grid + glow in light mode. */
[data-vx-theme="light"] [data-testid="command-bg"] {
  opacity: 0.22 !important;
}

/* Smooth swap */
html, body, body * {
  transition-property: background-color, color, border-color;
  transition-duration: 220ms;
  transition-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
}
`;

export function VxThemeStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }, []);
  return null;
}
