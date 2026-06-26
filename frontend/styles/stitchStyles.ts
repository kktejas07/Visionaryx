import { StyleSheet } from 'react-native';
import { Stitch, FontFamily } from '@/constants/stitchTheme';

/** Shared Stitch typography + surfaces (matches repo stitch HTML exports). */
export const stitchStyles = StyleSheet.create({
  /** overview: "System Status" — text-xs uppercase tracking-[0.1em] */
  heroEyebrow: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Stitch.primary,
    marginBottom: 8,
  },
  /** Headline — font-extrabold ~text-4xl on mobile we use 28–30 */
  heroTitle: {
    fontFamily: FontFamily.headlineBlack,
    fontSize: 30,
    color: Stitch.onSurface,
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  heroSub: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Stitch.onSurfaceVariant,
    marginTop: 12,
    lineHeight: 22,
    maxWidth: 400,
  },
  /** live_grid: "Live Monitoring" — text-[10px] uppercase tracking-[0.15em] */
  screenEyebrow: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: Stitch.primary,
    marginBottom: 4,
  },
  /** live_grid h2 */
  liveScreenTitle: {
    fontFamily: FontFamily.headlineBlack,
    fontSize: 28,
    color: Stitch.onSurface,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  /** camera_list: "Network Management" */
  screenEyebrowWide: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 12,
    letterSpacing: 3.2,
    textTransform: 'uppercase',
    color: Stitch.primary,
    opacity: 0.85,
    marginBottom: 8,
  },
  /** camera_list h2 */
  screenH1: {
    fontFamily: FontFamily.headlineBlack,
    fontSize: 32,
    color: Stitch.onSurface,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  sectionLabel: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Stitch.onSurfaceVariant,
    marginTop: 20,
    marginBottom: 10,
  },
  kpiCard: {
    backgroundColor: Stitch.surfaceContainerHigh,
    borderRadius: 14,
    padding: 22,
    minHeight: 148,
    justifyContent: 'space-between',
  },
  kpiLabel: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: Stitch.onSurfaceVariant,
  },
  kpiValue: {
    fontFamily: FontFamily.headlineBlack,
    fontSize: 34,
    color: Stitch.onSurface,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginTop: 8,
  },
  screenTitle: {
    fontFamily: FontFamily.headlineBlack,
    fontSize: 22,
    color: Stitch.primary,
    letterSpacing: -0.4,
  },
  /** alerts page — massive headline */
  alertsHero: {
    fontFamily: FontFamily.headlineBlack,
    fontSize: 36,
    color: Stitch.onSurface,
    letterSpacing: -1,
    lineHeight: 40,
  },
});
