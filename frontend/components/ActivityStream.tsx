/**
 * Dashboard ActivityStream — unified chronological feed of audit + agent runs
 * + alerts.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { api } from '@/lib/api';
import { useColors } from '@/contexts/ThemeContext';
import { useRealtimeTick } from '@/contexts/RealtimeContext';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';

type Kind = 'alert' | 'audit' | 'agent_run';
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'warning' | 'danger';

interface Row {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string;
  severity: Severity;
  actor: string | null;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  ts: string;
  ref: string | number;
  duration_ms?: number;
  tool_calls?: number;
  ip?: string | null;
}

function color(kind: Kind, sev: Severity) {
  if (sev === 'critical' || sev === 'danger') return C.danger;
  if (sev === 'high' || sev === 'warning') return C.warning;
  if (kind === 'agent_run') return C.electricViolet;
  if (kind === 'audit') return C.cyan;
  return C.primaryAccent;
}

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export function ActivityStream({ limit = 12 }: { limit?: number }) {
  const router = useRouter();
  const tick = useRealtimeTick();
  const colors = useColors();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api<Row[]>(`/api/v1/activity?limit=${limit}`).then((r) => {
      if (active) { setRows(r); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [limit, tick]);

  const navTo = (row: Row) => {
    if (row.kind === 'alert') router.push('/(tabs)/alerts' as any);
    else if (row.kind === 'audit') router.push('/audit' as any);
    else if (row.kind === 'agent_run') router.push('/ai/agents' as any);
  };

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID="activity-stream"
    >
      <View style={styles.head}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primaryAccent }]}>SIGNALS · UNIFIED</Text>
          <Text style={[styles.title, { color: colors.text }]}>Activity stream</Text>
        </View>
        <View style={[styles.livePill, { borderColor: colors.cyan, backgroundColor: colors.cyanFaint }]}>
          <View style={[styles.dot, { backgroundColor: colors.cyan }]} />
          <Text style={[styles.liveText, { color: colors.cyan }]}>LIVE</Text>
        </View>
      </View>

      {loading && rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>Loading activity…</Text>
      ) : rows.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>No recent activity.</Text>
      ) : (
        <View style={{ gap: Space.xs }}>
          {rows.map((r) => {
            const accent = color(r.kind, r.severity);
            return (
              <Pressable
                key={r.id}
                onPress={() => navTo(r)}
                style={[
                  styles.row,
                  { borderLeftColor: accent, backgroundColor: colors.surfaceLow, borderColor: colors.border },
                ]}
                testID={`activity-row-${r.id}`}
              >
                <View style={[styles.iconBox, { borderColor: accent, backgroundColor: `${accent}14` }]}>
                  <MaterialCommunityIcons name={r.icon} size={13} color={accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.rowHead}>
                    <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={[styles.rowTime, { color: colors.textFaint }]}>
                      {relativeTime(r.ts)}
                    </Text>
                  </View>
                  {r.subtitle ? (
                    <Text style={[styles.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
                      {r.subtitle}
                    </Text>
                  ) : null}
                  <View style={styles.metaRow}>
                    <View style={[styles.kindChip, { borderColor: accent }]}>
                      <Text style={[styles.kindChipText, { color: accent }]}>{r.kind.toUpperCase()}</Text>
                    </View>
                    {r.actor ? (
                      <Text style={[styles.metaText, { color: colors.textFaint }]} numberOfLines={1}>
                        {r.actor}
                      </Text>
                    ) : null}
                    {r.duration_ms != null ? (
                      <Text style={[styles.metaText, { color: colors.textFaint }]}>
                        {r.duration_ms}ms
                      </Text>
                    ) : null}
                    {r.tool_calls ? (
                      <Text style={[styles.metaText, { color: colors.electricViolet }]}>
                        {r.tool_calls} tool
                      </Text>
                    ) : null}
                    {r.ip ? <Text style={[styles.metaText, { color: colors.textFaint }]}>{r.ip}</Text> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Space.lg,
    gap: Space.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...TextStyles.label, fontSize: 10 },
  title: { ...TextStyles.h3, marginTop: 2 },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1,
  },
  liveText: { ...TextStyles.label, fontSize: 9 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  empty: { ...TextStyles.body, padding: Space.lg, textAlign: 'center', fontStyle: 'italic' },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: Space.sm + 2,
  },
  iconBox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  rowHead: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm, flexWrap: 'wrap',
  },
  rowTitle: { ...TextStyles.bodySmall, fontFamily: F.bodySemibold, fontSize: 13, flex: 1, minWidth: 0 },
  rowTime: { ...TextStyles.caption, fontFamily: F.mono, fontSize: 10 },
  rowSub: { ...TextStyles.caption, marginTop: 2, fontSize: 11 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: 4, flexWrap: 'wrap' },
  kindChip: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: Radius.full, borderWidth: 1,
  },
  kindChipText: { ...TextStyles.label, fontSize: 8, letterSpacing: 1 },
  metaText: { ...TextStyles.caption, fontFamily: F.mono, fontSize: 10 },
});
