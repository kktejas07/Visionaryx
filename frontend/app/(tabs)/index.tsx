/**
 * Overview / Dashboard screen — VisionaryX brand + MVVM (useDashboardViewModel).
 */
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useDashboardViewModel } from '@/viewmodels';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles, Brand } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { VxButton, VxCard, ScreenTitle, ScreenSub, SectionEyebrow, ErrorBanner } from '@/components/vx';
import { ActivityStream } from '@/components/ActivityStream';

function fmt(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString();
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function OverviewScreen() {
  const router = useRouter();
  const vm = useDashboardViewModel();

  if (vm.isEnrollee) {
    return (
      <View style={styles.root}>
        <CommandBackground />
        <ScrollView contentContainerStyle={styles.padEnrollee}>
          <SectionEyebrow>Welcome</SectionEyebrow>
          <ScreenTitle>Operator handshake required</ScreenTitle>
          <ScreenSub>
            Complete face enrollment using the link from your email, or open the Enrollment tab.
          </ScreenSub>
          <View style={{ marginTop: Space.xl }}>
            <VxButton
              testID="goto-enrollment-btn"
              label="Open enrollment"
              onPress={() => router.push('/(tabs)/enroll')}
              fullWidth
              trailingIcon={<MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="overview-screen">
      <CommandBackground />
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={
          <RefreshControl refreshing={vm.refreshing} onRefresh={vm.refresh} tintColor={C.primaryAccent} />
        }
      >
        {/* Hero */}
        <SectionEyebrow testID="hero-eyebrow">{Brand.tagline}</SectionEyebrow>
        <ScreenTitle testID="hero-title">All systems vigilant.</ScreenTitle>
        <ScreenSub testID="hero-sub">
          Autonomous threat detection active across <Text style={styles.mono}>{vm.nodes}</Text>{' '}
          nodes. Vision that watches, recognises and protects.
        </ScreenSub>

        {/* Shortcut row */}
        <View style={styles.shortcuts}>
          <Pressable style={styles.scTile} onPress={() => router.push('/(tabs)/live')} testID="sc-live">
            <MaterialCommunityIcons name="cctv" size={18} color={C.primaryAccent} />
            <Text style={styles.scText}>Live grid</Text>
          </Pressable>
          <Pressable style={styles.scTile} onPress={() => router.push('/detections')} testID="sc-detections">
            <MaterialCommunityIcons name="account-search" size={18} color={C.primaryAccent} />
            <Text style={styles.scText}>Detections</Text>
          </Pressable>
          <Pressable
            style={[styles.scTile, styles.scTilePrimary]}
            onPress={() => router.push('/(tabs)/alerts')}
            testID="sc-alerts"
          >
            <MaterialCommunityIcons name="bell-ring" size={18} color="#fff" />
            <Text style={[styles.scText, { color: '#fff' }]}>Alerts</Text>
          </Pressable>
        </View>

        <ErrorBanner message={vm.error} />

        {/* KPI grid */}
        <View style={styles.kpiGrid}>
          <Kpi
            testID="kpi-users"
            label="Total operators"
            value={fmt(vm.overview?.total_users)}
            icon="account-group"
            footer={
              <View style={styles.kpiFooterRow}>
                <MaterialCommunityIcons
                  name={(vm.overview?.detection_trend_7d ?? 0) >= 0 ? 'trending-up' : 'trending-down'}
                  size={12}
                  color={(vm.overview?.detection_trend_7d ?? 0) >= 0 ? C.success : C.danger}
                />
                <Text
                  style={[
                    styles.kpiFooter,
                    { color: (vm.overview?.detection_trend_7d ?? 0) >= 0 ? C.success : C.danger },
                  ]}
                >
                  {vm.overview?.detection_trend_7d != null
                    ? `${vm.overview.detection_trend_7d > 0 ? '+' : ''}${vm.overview.detection_trend_7d}% week-over-week`
                    : '—'}
                </Text>
              </View>
            }
          />
          <Kpi
            testID="kpi-cameras"
            label="Active cameras"
            value={fmt(vm.overview?.active_cameras)}
            icon="video"
            footer={
              <View style={styles.kpiFooterRow}>
                <View style={[styles.dot, { backgroundColor: C.success }]} />
                <Text style={styles.kpiFooter}>Stable connection</Text>
              </View>
            }
          />
          <Kpi
            testID="kpi-detections"
            label="Detections today"
            value={fmt(vm.overview?.detections_today)}
            icon="motion-sensor"
            footer={<Text style={[styles.kpiFooter, { color: C.primaryAccent, fontFamily: F.mono }]}>Updated {fmtTime(new Date().toISOString())}</Text>}
          />
          <Kpi
            testID="kpi-unknown"
            label="Unknown detections"
            value={fmt(vm.overview?.unknown_detections_today)}
            icon="account-question"
            danger
            footer={
              <View style={styles.kpiFooterRow}>
                <MaterialCommunityIcons name="alert-circle" size={12} color={C.danger} />
                <Text style={[styles.kpiFooter, { color: C.danger }]}>Requires review</Text>
              </View>
            }
          />
        </View>

        {/* Activity density + recent alerts */}
        <View style={styles.bottomGrid}>
          <VxCard style={styles.activityCard} testID="activity-card">
            <View style={styles.cardHead}>
              <View>
                <Text style={styles.cardEyebrow}>Telemetry</Text>
                <Text style={styles.cardTitle}>Activity density</Text>
              </View>
              <View style={styles.segCtrl}>
                {(['7', '30'] as const).map((d) => {
                  const active = vm.selectedDays === Number(d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => vm.setSelectedDays(Number(d) as 7 | 30)}
                      style={[styles.segItem, active && styles.segItemActive]}
                      testID={`seg-${d}d`}
                    >
                      <Text style={[styles.segText, active && { color: C.text }]}>{d}D</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.bars}>
              {vm.bars.map((h, i) => {
                const hot = h > 0.75;
                return (
                  <View key={i} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${Math.max(4, Math.round(h * 100))}%`,
                            backgroundColor: hot ? C.primaryAccent : C.primary,
                            opacity: hot ? 1 : 0.85,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.barAxis}>
              <Text style={styles.barAxisLbl}>{vm.selectedDays === 7 ? 'MON' : '−30D'}</Text>
              <Text style={styles.barAxisLbl}>{vm.selectedDays === 7 ? 'SUN' : 'TODAY'}</Text>
            </View>
          </VxCard>

          <VxCard style={styles.alertsCard} testID="recent-alerts-card">
            <Text style={styles.cardEyebrow}>Signals</Text>
            <Text style={styles.cardTitle}>Recent alerts</Text>

            {vm.recentAlerts.length === 0 ? (
              <Text style={styles.empty}>No recent alerts. Sentinel is quiet.</Text>
            ) : (
              <View style={{ gap: Space.sm, marginTop: Space.md }}>
                {vm.recentAlerts.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push('/(tabs)/alerts')}
                    style={styles.alertRow}
                    testID={`recent-alert-${a.id}`}
                  >
                    <View style={[styles.alertBorder, { backgroundColor: sevColor(a.severity) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertType} numberOfLines={1}>
                        {a.alert_type}
                      </Text>
                      <Text style={styles.alertMsg} numberOfLines={1}>
                        {a.message || a.camera_name || '—'}
                      </Text>
                    </View>
                    <Text style={styles.alertTime}>{fmtTime(a.timestamp)}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable
              onPress={() => router.push('/(tabs)/alerts')}
              style={styles.viewAll}
              testID="view-all-alerts"
            >
              <Text style={styles.viewAllText}>View all alerts →</Text>
            </Pressable>
          </VxCard>
        </View>

        {/* Unified activity stream */}
        <View style={{ marginTop: Space.lg }}>
          <ActivityStream limit={12} />
        </View>

        {/* Neural analysis status */}
        <View style={styles.neuralCard} testID="neural-card">
          <View style={{ flex: 1 }}>
            <Text style={styles.cardEyebrow}>Pipeline</Text>
            <Text style={styles.neuralTitle}>Neural analysis active</Text>
            <Text style={styles.neuralSub}>
              VisionaryX is processing <Text style={styles.mono}>1.2 TB/s</Text> of visual data across{' '}
              <Text style={styles.mono}>{vm.nodes}</Text> nodes.
            </Text>
          </View>
          <View style={styles.loadBadge}>
            <Text style={styles.loadLabel}>ENGINE LOAD</Text>
            <Text style={styles.loadValue}>24.8%</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function sevColor(sev: string | undefined): string {
  switch (sev?.toLowerCase()) {
    case 'critical':
    case 'high':
      return C.danger;
    case 'medium':
      return C.warning;
    case 'low':
      return C.primaryAccent;
    default:
      return C.success;
  }
}

interface KpiProps {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  footer?: React.ReactNode;
  danger?: boolean;
  testID?: string;
}
function Kpi({ label, value, icon, footer, danger, testID }: KpiProps) {
  return (
    <View style={[styles.kpiCard, danger && { borderColor: C.dangerFaint }]} testID={testID}>
      <View style={[styles.kpiAccent, danger && { backgroundColor: C.danger }]} />
      <View style={styles.kpiHead}>
        <Text style={styles.kpiLabel}>{label}</Text>
        <MaterialCommunityIcons name={icon} size={16} color={danger ? C.danger : C.textMuted} />
      </View>
      <Text style={[styles.kpiValue, danger && { color: C.danger }]}>{value}</Text>
      {footer ? <View style={{ marginTop: Space.sm }}>{footer}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: {
    padding: Space.lg,
    paddingBottom: 120,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  padEnrollee: { padding: Space.lg, paddingTop: 80 },
  mono: { fontFamily: F.mono, color: C.text },
  shortcuts: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg },
  scTile: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  scTilePrimary: { backgroundColor: C.primary, borderColor: C.primary },
  scText: { ...TextStyles.label, color: C.text, fontSize: 11 },

  // KPI grid — 2 cols on mobile, 4 on desktop via flex-wrap.
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    marginTop: Space.lg,
  },
  kpiCard: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: Space.lg,
    minWidth: 150,
    flexGrow: 1,
    flexBasis: 180,
    position: 'relative',
    overflow: 'hidden',
  },
  kpiAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    backgroundColor: C.primaryAccent, opacity: 0.7,
  },
  kpiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiLabel: { ...TextStyles.label, color: C.textMuted, fontSize: 10 },
  kpiValue: {
    ...TextStyles.dataLarge,
    color: C.text,
    fontSize: 36,
    marginTop: Space.sm,
  },
  kpiFooterRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  kpiFooter: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.bodyMedium },
  dot: { width: 6, height: 6, borderRadius: 3 },

  bottomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md, marginTop: Space.lg },
  activityCard: { flexGrow: 2, flexBasis: 320, minWidth: 280 },
  alertsCard: { flexGrow: 1, flexBasis: 280, minWidth: 280 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardEyebrow: { ...TextStyles.label, color: C.textFaint, fontSize: 10 },
  cardTitle: { ...TextStyles.h4, color: C.text, marginTop: 4 },

  segCtrl: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: Radius.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: C.border,
  },
  segItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 },
  segItemActive: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  segText: { ...TextStyles.label, color: C.textMuted, fontSize: 10 },

  bars: {
    marginTop: Space.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 96,
  },
  barCol: { flex: 1, height: '100%' },
  barTrack: {
    width: '100%',
    height: '100%',
    backgroundColor: C.chartTrack,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderRadius: 3,
  },
  barFill: { width: '100%', borderRadius: 3 },
  barAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Space.sm },
  barAxisLbl: { ...TextStyles.label, color: C.textFaint, fontFamily: F.mono, fontSize: 10 },

  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
    backgroundColor: C.surfaceLow,
    position: 'relative',
    overflow: 'hidden',
  },
  alertBorder: { width: 3, height: '100%', position: 'absolute', left: 0, top: 0 },
  alertType: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodyMedium, marginLeft: Space.sm },
  alertMsg: { ...TextStyles.caption, color: C.textMuted, marginLeft: Space.sm, marginTop: 2 },
  alertTime: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono },
  empty: { ...TextStyles.bodySmall, color: C.textMuted, marginTop: Space.md },
  viewAll: { marginTop: Space.md, alignSelf: 'flex-start' },
  viewAllText: { ...TextStyles.label, color: C.primaryAccent, fontSize: 10 },

  neuralCard: {
    marginTop: Space.lg,
    padding: Space.lg,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
  },
  neuralTitle: { ...TextStyles.h3, color: C.text, fontSize: 22, marginTop: 4 },
  neuralSub: { ...TextStyles.bodySmall, color: C.textMuted, marginTop: Space.xs },
  loadBadge: {
    backgroundColor: C.primaryFaint,
    borderColor: C.primary,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  loadLabel: { ...TextStyles.label, color: C.primaryAccent, fontSize: 9 },
  loadValue: { ...TextStyles.dataMedium, color: C.text, fontSize: 22, marginTop: 2 },
});
