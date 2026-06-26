/** Shared glass / surface styles (Stitch HTML tokens) */
export const stitchGlassPaper = {
  bgcolor: '#171f33',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 -4px 40px rgba(175, 198, 255, 0.06), 0 16px 48px rgba(0, 0, 0, 0.45)',
} as const;

const authBg =
  'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(32, 101, 209, 0.22), transparent), linear-gradient(180deg, #060e20 0%, #0b1326 100%)';

export const stitchAuthBackdrop = {
  bgcolor: '#0b1326',
  backgroundImage: authBg,
} as const;

/** Chart axes / grid — `detailed_analytics` / dark Recharts */
export const stitchChart = {
  gridStroke: 'rgba(255, 255, 255, 0.08)',
  axisStroke: '#424753',
  tickFill: '#c2c6d5',
  tooltipBg: '#171f33',
  tooltipBorder: 'rgba(255, 255, 255, 0.08)',
} as const;

export const stitchSurfaceCard = '#222a3d';
