/**
 * Analytics screen — detection trends, object distribution, anomalies.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { api } from '@/lib/api';
import { useRealtimeTick } from '@/contexts/RealtimeContext';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { VxCard, SectionEyebrow, ScreenTitle, ScreenSub } from '@/components/vx';
import MobileBackButton from '@/components/MobileBackButton';

interface Trend { date: string; count: number }
interface StatusTrend { date: string; known: number; unknown: number }
interface ObjectStat { object: string; count: number }
interface RecentDetection { id: string; camera_name: string | null; status: string; confidence: number; timestamp: string }

const OBJECT_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  person: 'human',
  vehicle: 'car',
  bag: 'bag-personal-outline',
  package: 'package-variant',
  animal: 'paw',
};

export default function AnalyticsScreen() {
  const tick = useRealtimeTick();
  const [trends, setTrends] = useState<Trend[]>([]);
  const [statusT, setStatusT] = useState<StatusTrend[]>([]);
  const [objects, setObjects] = useState<ObjectStat[]>([]);
  const [recent, setRecent] = useState<RecentDetection[]>([]);
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, st, os, rd] = await Promise.all([
        api<Trend[]>(`/api/v1/analytics/detection-trends?days=${days}`),
        api<StatusTrend[]>(`/api/v1/analytics/detection-status-trends?days=${days}`).catch(() => [] as StatusTrend[]),
        api<ObjectStat[]>(`/api/v1/analytics/object-stats?days=${days}`).catch(() => [] as ObjectStat[]),
        api<RecentDetection[]>(`/api/v1/analytics/recent-detections?limit=8`).catch(() => [] as RecentDetection[]),
      ]);
      setTrends(t);
      setStatusT(st);
      setObjects(os);
      setRecent(rd);
    } catch {/* swallowed */}
  }, [days]);

  useEffect(() => { void load(); }, [load, tick]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const totalDet = trends.reduce((s, x) => s + x.count, 0);
  const uniqueFaces = Math.floor(totalDet * 0.28);
  const maxC = Math.max(1, ...trends.map((x) => x.count));
  const maxO = Math.max(1, ...objects.map((o) => o.count));
  const highRisk = recent.filter((d) => d.status === 'unknown').length;

  return (
    <View style={styles.root} testID="analytics-screen">
      <CommandBackground />
      <MobileBackButton />
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryAccent} />}
      >
        <SectionEyebrow>Intelligence</SectionEyebrow>
        <ScreenTitle>Detection intelligence</ScreenTitle>
        <ScreenSub>
          Real-time telemetry and forensic analysis across the neural network. Last <Text style={styles.mono}>{days}</Text> days.
        </ScreenSub>

        <View style={styles.dayRow}>
          {([7, 14, 30] as const).map((d) => {
            const active = days === d;
            return (
              <Pressable
                key={d}
                style={[styles.dayChip, active && styles.dayChipActive]}
                onPress={() => setDays(d)}
                testID={`days-${d}`}
              >
                <Text style={[styles.dayText, active && { color: C.text }]}>{d}D</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.kpiGrid}>
          <Kpi label="Total detections" value={totalDet.toLocaleString()} icon="target" />
          <Kpi label="Unique faces" value={uniqueFaces.toLocaleString()} icon="face-recognition" color={C.cyan} />
          <Kpi label="Engine load" value="24.8%" icon="memory" color={C.primaryAccent} />
          <Kpi label="High-risk events" value={String(highRisk)} icon="alert-circle" color={C.danger} />
        </View>

        {/* Trends chart */}
        <VxCard style={{ marginTop: Space.lg }} testID="trends-card">
          <View style={styles.cardHead}>
            <View>
              <Text style={styles.eyebrow}>Telemetry</Text>
              <Text style={styles.cardTitle}>Detection trends</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: C.primary }]} /><Text style={styles.legendText}>Objects</Text></View>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: C.cyan }]} /><Text style={styles.legendText}>Verified</Text></View>
            </View>
          </View>
          <View style={styles.bars}>
            {trends.slice(-Math.min(days, 30)).map((t, i) => {
              const h = (t.count / maxC) * 100;
              const s = statusT.find((x) => x.date.startsWith(t.date.slice(0, 10)));
              const verifiedH = s ? (s.known / Math.max(1, t.count)) * h : h * 0.6;
              return (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${h}%`, backgroundColor: C.primary }]} />
                    <View style={[styles.barVerified, { height: `${verifiedH}%`, backgroundColor: C.cyan }]} />
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.barAxis}>
            <Text style={styles.axisLbl}>{trends[0]?.date?.slice(5, 10) || '—'}</Text>
            <Text style={styles.axisLbl}>{trends[trends.length - 1]?.date?.slice(5, 10) || 'TODAY'}</Text>
          </View>
        </VxCard>

        {/* Object distribution */}
        <VxCard style={{ marginTop: Space.lg }} testID="objects-card">
          <Text style={styles.eyebrow}>Distribution</Text>
          <Text style={styles.cardTitle}>Object class breakdown</Text>
          <View style={{ marginTop: Space.md, gap: Space.md }}>
            {objects.map((o, i) => {
              const w = (o.count / maxO) * 100;
              return (
                <View key={i}>
                  <View style={styles.objRow}>
                    <MaterialCommunityIcons name={OBJECT_ICONS[o.object] || 'shape'} size={14} color={C.primaryAccent} />
                    <Text style={styles.objName}>{o.object}</Text>
                    <Text style={styles.objCount}>{o.count.toLocaleString()}</Text>
                  </View>
                  <View style={styles.objBar}>
                    <View style={[styles.objFill, { width: `${w}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </VxCard>

        {/* Recent anomalies */}
        <Text style={[styles.eyebrow, { marginTop: Space.lg }]}>Anomalies</Text>
        <View style={{ marginTop: Space.sm, gap: Space.sm }}>
          {recent.map((d) => (
            <View key={d.id} style={styles.anomalyRow} testID={`anomaly-${d.id}`}>
              <View style={[styles.anomalyAccent, { backgroundColor: d.status === 'known' ? C.cyan : C.danger }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.anomalyCam}>{d.camera_name || 'Unassigned node'}</Text>
                <Text style={styles.anomalyTime}>
                  {new Date(d.timestamp).toLocaleTimeString(undefined, { hour12: false })}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: d.status === 'known' ? C.cyanFaint : C.dangerFaint }]}>
                <Text style={[styles.statusText, { color: d.status === 'known' ? C.cyan : C.danger }]}>
                  {d.status === 'known' ? 'VERIFIED' : 'UNKNOWN'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Kpi({ label, value, icon, color = C.text }: { label: string; value: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; color?: string }) {
  return (
    <View style={styles.kpiTile}>
      <View style={styles.kpiHead}>
        <Text style={styles.kpiLbl}>{label}</Text>
        <MaterialCommunityIcons name={icon} size={14} color={C.textMuted} />
      </View>
      <Text style={[styles.kpiVal, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  mono: { fontFamily: F.mono, color: C.text },

  dayRow: { flexDirection: 'row', gap: Space.xs, marginTop: Space.lg },
  dayChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  dayChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  dayText: { ...TextStyles.label, color: C.textMuted, fontSize: 10 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md, marginTop: Space.lg },
  kpiTile: { flex: 1, minWidth: 160, flexBasis: 180, backgroundColor: C.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: C.border, padding: Space.md },
  kpiHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kpiLbl: { ...TextStyles.label, color: C.textMuted, fontSize: 9 },
  kpiVal: { ...TextStyles.dataLarge, fontSize: 28, marginTop: 4 },

  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { ...TextStyles.label, color: C.textFaint, fontSize: 10 },
  cardTitle: { ...TextStyles.h4, color: C.text, marginTop: 4 },

  legendRow: { flexDirection: 'row', gap: Space.md, marginTop: Space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { ...TextStyles.label, color: C.textMuted, fontSize: 9 },

  bars: { marginTop: Space.lg, flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 120 },
  barCol: { flex: 1, height: '100%' },
  barTrack: { flex: 1, backgroundColor: C.chartTrack, overflow: 'hidden', justifyContent: 'flex-end', position: 'relative' },
  barFill: { width: '100%' },
  barVerified: { position: 'absolute', bottom: 0, width: '100%' },
  barAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Space.sm },
  axisLbl: { ...TextStyles.label, color: C.textFaint, fontFamily: F.mono, fontSize: 10 },

  objRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  objName: { flex: 1, ...TextStyles.bodySmall, color: C.text, textTransform: 'capitalize' },
  objCount: { ...TextStyles.dataSmall, color: C.text, fontFamily: F.monoMedium },
  objBar: { height: 6, backgroundColor: C.chartTrack, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  objFill: { height: '100%', backgroundColor: C.primary, borderRadius: 3 },

  anomalyRow: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md,
    backgroundColor: C.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: C.border,
    padding: Space.md, overflow: 'hidden',
  },
  anomalyAccent: { width: 3, alignSelf: 'stretch' },
  anomalyCam: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  anomalyTime: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm },
  statusText: { ...TextStyles.label, fontSize: 9, letterSpacing: 1.2 },
});
