/**
 * Reports — Filterable detection records + analytics + Excel/CSV export.
 *
 * Charts use lightweight inline SVG (no extra deps). Excel export writes
 * a CSV with a `.xlsx`-compatible content-type so Excel + Numbers open it
 * natively (full xlsx requires sheetjs which adds ~500KB; keeping it lean).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { api } from '@/lib/api';
import { useColors } from '@/contexts/ThemeContext';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, ScreenSub, VxButton, VxInput, VxCard } from '@/components/vx';

interface Detection {
  id: string;
  timestamp: string;
  alert_type: string;
  severity: string;
  message: string;
  camera_name: string | null;
  status: 'known' | 'unknown';
  confidence: number | null;
}

interface Summary {
  totals: { total: number; known: number; unknown: number; known_pct: number };
  timeseries: Array<{ date: string; known: number; unknown: number; total: number }>;
  top_cameras: Array<{ camera: string; count: number }>;
  top_persons: Array<{ person: string; count: number }>;
  by_severity: Array<{ severity: string; count: number }>;
  hourly: Array<{ hour: number; count: number }>;
}

const WINDOW_OPTS = [7, 30, 90] as const;

export default function ReportsScreen() {
  const colors = useColors();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [person, setPerson] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'known' | 'unknown'>('all');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
      const params = new URLSearchParams({ start: since, limit: '500' });
      if (person.trim()) params.set('person', person.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const [s, d] = await Promise.all([
        api<Summary>(`/api/v1/reports/summary?days=${days}`),
        api<{ items: Detection[]; total: number }>(`/api/v1/reports/detections?${params}`),
      ]);
      setSummary(s);
      setItems(d.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
      setSummary(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [days, person, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const exportExcel = useCallback(() => {
    if (Platform.OS !== 'web' || items.length === 0) return;
    const rows: string[][] = [
      ['timestamp', 'alert_type', 'severity', 'status', 'camera_name', 'confidence', 'message'],
      ...items.map((i) => [
        i.timestamp, i.alert_type, i.severity, i.status,
        i.camera_name ?? '', i.confidence != null ? String(i.confidence) : '',
        i.message,
      ]),
    ];
    const csv = '\uFEFF' + rows.map((r) =>
      r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csv], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vx-detections-${new Date().toISOString().slice(0, 10)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }, [items]);

  return (
    <View style={styles.root} testID="reports-screen">
      <CommandBackground />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.pad}
        ListHeaderComponent={
          <View>
            <View style={styles.headRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <SectionEyebrow>Reports · Analytics</SectionEyebrow>
                <ScreenTitle>Detection reports</ScreenTitle>
                <ScreenSub>Filterable detection records with timeseries + Excel export.</ScreenSub>
              </View>
              {Platform.OS === 'web' && items.length > 0 ? (
                <VxButton
                  label="Export Excel"
                  onPress={exportExcel}
                  variant="secondary"
                  icon={<MaterialCommunityIcons name="microsoft-excel" size={14} color={colors.text} />}
                  testID="reports-export-excel"
                />
              ) : null}
            </View>

            {/* Window selector + filters */}
            <View style={styles.filterRow}>
              <View style={{ flexBasis: 200 }}>
                <Text style={[styles.lbl, { color: colors.textFaint }]}>WINDOW</Text>
                <View style={styles.chipRow}>
                  {WINDOW_OPTS.map((d) => {
                    const active = days === d;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => setDays(d)}
                        style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surfaceLow }, active && { borderColor: colors.primary, backgroundColor: colors.primaryFaint }]}
                        testID={`report-window-${d}`}
                      >
                        <Text style={[styles.chipText, active && { color: colors.primary }]}>{d}d</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={{ flexBasis: 200 }}>
                <Text style={[styles.lbl, { color: colors.textFaint }]}>STATUS</Text>
                <View style={styles.chipRow}>
                  {(['all', 'known', 'unknown'] as const).map((s) => {
                    const active = statusFilter === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => setStatusFilter(s)}
                        style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surfaceLow }, active && { borderColor: colors.primary, backgroundColor: colors.primaryFaint }]}
                        testID={`report-status-${s}`}
                      >
                        <Text style={[styles.chipText, active && { color: colors.primary }]}>{s.toUpperCase()}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={{ flexBasis: 280, flexGrow: 1 }}>
                <VxInput
                  label="Search (person / camera / message)"
                  placeholder="e.g. Front Gate, John, Unrecognized…"
                  value={person}
                  onChangeText={setPerson}
                  testID="report-search"
                />
              </View>
            </View>

            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.dangerFaint, borderColor: colors.danger }]} testID="reports-error">
                <MaterialCommunityIcons name="alert-circle-outline" size={14} color={colors.danger} />
                <Text style={[styles.errorText, { color: colors.danger }]} numberOfLines={2}>{error}</Text>
              </View>
            ) : null}

            {/* KPI row */}
            {summary ? (
              <View style={styles.kpiGrid}>
                <Kpi label="TOTAL" value={summary.totals.total} color={colors.text} />
                <Kpi label="KNOWN" value={summary.totals.known} color={colors.success} />
                <Kpi label="UNKNOWN" value={summary.totals.unknown} color={colors.danger} />
                <Kpi label="KNOWN %" value={`${summary.totals.known_pct}%`} color={colors.electricViolet} />
              </View>
            ) : null}

            {/* Timeseries chart */}
            {summary && summary.timeseries.length > 0 ? (
              <VxCard style={{ marginTop: Space.lg }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Detections over time</Text>
                <TimeseriesChart data={summary.timeseries} />
              </VxCard>
            ) : null}

            {/* Top cameras + hourly side-by-side */}
            <View style={[styles.twoCol, { marginTop: Space.lg }]}>
              {summary && summary.top_cameras.length > 0 ? (
                <View style={styles.col}>
                  <VxCard>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Top cameras</Text>
                    {summary.top_cameras.slice(0, 8).map((c) => (
                      <BarRow key={c.camera} label={c.camera} value={c.count} max={summary.top_cameras[0].count} color={colors.primaryAccent} />
                    ))}
                  </VxCard>
                </View>
              ) : null}
              {summary ? (
                <View style={styles.col}>
                  <VxCard>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Hourly distribution</Text>
                    <HourlyChart data={summary.hourly} />
                  </VxCard>
                </View>
              ) : null}
            </View>

            <Text style={[styles.tableHead, { color: colors.textFaint }]}>
              {loading ? 'Loading…' : `Detection records · ${items.length}`}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: item.status === 'known' ? colors.success : colors.danger }]} testID={`report-row-${item.id}`}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>{item.alert_type}</Text>
              <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>{item.message}</Text>
              <View style={styles.rowMeta}>
                <Text style={[styles.metaText, { color: colors.textFaint }]}>{new Date(item.timestamp).toLocaleString()}</Text>
                {item.camera_name ? <Text style={[styles.metaText, { color: colors.textFaint }]}>· {item.camera_name}</Text> : null}
                {item.confidence != null ? <Text style={[styles.metaText, { color: colors.primaryAccent }]}>· {(item.confidence * 100).toFixed(0)}%</Text> : null}
              </View>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: Space.xs }} />}
        ListEmptyComponent={!loading ? <Text style={[styles.empty, { color: colors.textMuted }]}>No detections in this window.</Text> : null}
      />
    </View>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.kpi, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.kpiAccent, { backgroundColor: color, opacity: 0.6 }]} />
      <Text style={[styles.kpiLbl, { color: colors.textFaint }]}>{label}</Text>
      <Text style={[styles.kpiVal, { color }]}>{value}</Text>
    </View>
  );
}

function TimeseriesChart({ data }: { data: Summary['timeseries'] }) {
  const colors = useColors();
  const W = 760, H = 140, P = 24;
  const max = Math.max(1, ...data.map((d) => d.total));
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(1, data.length - 1);
  const y = (v: number) => H - P - (v * (H - P * 2)) / max;
  const path = (key: 'known' | 'unknown') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');
  return (
    <View style={{ marginTop: Space.sm }}>
      {Platform.OS === 'web' ? (
        // @ts-expect-error — DOM element
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto' }}>
          <path d={path('known')} fill="none" stroke={colors.success} strokeWidth={2} />
          <path d={path('unknown')} fill="none" stroke={colors.danger} strokeWidth={2} />
        </svg>
      ) : null}
      <View style={{ flexDirection: 'row', gap: Space.md, marginTop: 4 }}>
        <Text style={[styles.legend, { color: colors.success }]}>● known</Text>
        <Text style={[styles.legend, { color: colors.danger }]}>● unknown</Text>
      </View>
    </View>
  );
}

function HourlyChart({ data }: { data: Summary['hourly'] }) {
  const colors = useColors();
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 100, marginTop: Space.sm }}>
      {data.map((d) => (
        <View key={d.hour} style={{ flex: 1, height: `${(d.count / max) * 100}%`, backgroundColor: d.count > 0 ? colors.primaryAccent : colors.surface2, borderRadius: 2, minHeight: 2 }} />
      ))}
    </View>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLbl, { color: colors.text }]} numberOfLines={1}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: colors.surface2 }]}>
        <View style={{ width: `${(value / max) * 100}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={[styles.barVal, { color: colors.textMuted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.md, flexWrap: 'wrap' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md, marginTop: Space.md },
  lbl: { ...TextStyles.label, fontSize: 10, marginBottom: 4 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderWidth: 1 },
  chipText: { ...TextStyles.label, color: C.textMuted, fontFamily: F.mono, fontSize: 10 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, marginTop: Space.lg },
  kpi: { flexBasis: 140, flexGrow: 1, padding: Space.md, borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  kpiAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  kpiLbl: { ...TextStyles.label, fontSize: 10 },
  kpiVal: { ...TextStyles.h3, fontFamily: F.mono, marginTop: 6 },
  cardTitle: { ...TextStyles.h4, fontFamily: F.heading, marginBottom: Space.sm },
  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  col: { flexBasis: 320, flexGrow: 1 },
  tableHead: { ...TextStyles.label, fontSize: 10, marginTop: Space.xl, marginBottom: Space.sm },
  row: { flexDirection: 'row', borderRadius: Radius.sm, borderWidth: 1, borderLeftWidth: 3, padding: Space.sm + 2 },
  rowTitle: { ...TextStyles.bodySmall, fontFamily: F.bodySemibold },
  rowSub: { ...TextStyles.caption, marginTop: 2 },
  rowMeta: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  metaText: { ...TextStyles.caption, fontFamily: F.mono, fontSize: 10 },
  empty: { ...TextStyles.body, padding: Space.xxl, textAlign: 'center' },
  legend: { ...TextStyles.label, fontFamily: F.mono, fontSize: 10 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, padding: Space.sm, borderRadius: Radius.sm, borderWidth: 1, marginTop: Space.md },
  errorText: { ...TextStyles.caption, fontFamily: F.mono, flex: 1 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: 6 },
  barLbl: { ...TextStyles.caption, fontFamily: F.mono, fontSize: 11, flexBasis: 140, flexShrink: 0 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barVal: { ...TextStyles.caption, fontFamily: F.mono, fontSize: 11, minWidth: 30, textAlign: 'right' },
});
