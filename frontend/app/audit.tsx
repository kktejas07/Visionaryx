/**
 * Audit log — admin-only chronological action feed with filters + CSV export.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { api } from '@/lib/api';
import { useRealtimeTick } from '@/contexts/RealtimeContext';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, ScreenSub, VxButton, VxInput } from '@/components/vx';
import MobileBackButton from '@/components/MobileBackButton';

interface Row {
  id: string;
  actor_email: string | null;
  actor_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | number | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

const ACTION_PALETTE: Record<string, { color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  'auth.login': { color: C.cyan, icon: 'login-variant' },
  'auth.login.failed': { color: C.danger, icon: 'alert-circle-outline' },
  'users.create': { color: C.success, icon: 'account-plus-outline' },
  'users.update': { color: C.primary, icon: 'account-edit-outline' },
  'users.delete': { color: C.danger, icon: 'account-remove-outline' },
  'settings.email.update': { color: C.primary, icon: 'cog-outline' },
  'system.start': { color: C.textMuted, icon: 'power' },
};

function actionStyle(a: string) {
  return ACTION_PALETTE[a] ?? { color: C.textMuted, icon: 'shield-check-outline' as const };
}

export default function AuditScreen() {
  const tick = useRealtimeTick();
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actorFilter, setActorFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200', offset: '0' });
      if (actorFilter.trim()) params.set('actor', actorFilter.trim());
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      const r = await api<{ items: Row[]; total: number }>(`/api/v1/audit?${params.toString()}`);
      setItems(r.items);
      setTotal(r.total);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [actorFilter, actionFilter]);

  useEffect(() => { void load(); }, [load, tick]);

  const actionOptions = useMemo(() => Object.keys(ACTION_PALETTE), []);

  const exportCsv = useCallback(() => {
    const rows: string[][] = [
      ['created_at', 'action', 'actor_email', 'actor_id', 'resource_type', 'resource_id', 'ip', 'detail'],
      ...items.map((i) => [
        i.created_at,
        i.action,
        i.actor_email ?? '',
        i.actor_id ?? '',
        i.resource_type ?? '',
        i.resource_id != null ? String(i.resource_id) : '',
        i.ip ?? '',
        JSON.stringify(i.detail ?? {}),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vx-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [items]);

  return (
    <View style={styles.root} testID="audit-screen">
      <CommandBackground />
      <MobileBackButton />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.primaryAccent} />}
        ItemSeparatorComponent={() => <View style={{ height: Space.xs }} />}
        ListHeaderComponent={
          <View>
            <View style={styles.headRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <SectionEyebrow>Compliance</SectionEyebrow>
                <ScreenTitle>Audit log</ScreenTitle>
                <ScreenSub>
                  Chronological record of administrative actions.{' '}
                  {total > 0 ? <Text style={styles.mono}>{total}</Text> : null}
                  {total > 0 ? ' entries.' : ''}
                </ScreenSub>
              </View>
              {Platform.OS === 'web' && items.length > 0 ? (
                <VxButton
                  label="Export CSV"
                  onPress={exportCsv}
                  variant="secondary"
                  icon={<MaterialCommunityIcons name="download-outline" size={14} color={C.text} />}
                  testID="audit-export-csv"
                />
              ) : null}
            </View>

            {/* Filters */}
            <View style={styles.filterRow}>
              <View style={{ flexBasis: 240, flexGrow: 1 }}>
                <VxInput
                  label="Actor email"
                  placeholder="admin@…"
                  value={actorFilter}
                  onChangeText={setActorFilter}
                  testID="audit-filter-actor"
                  autoCapitalize="none"
                />
              </View>
              <View style={{ flexBasis: 240, flexGrow: 1 }}>
                <Text style={styles.lbl}>Action</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => setActionFilter('')}
                    style={[styles.chip, !actionFilter && styles.chipActive]}
                    testID="audit-filter-action-all"
                  >
                    <Text style={[styles.chipText, !actionFilter && styles.chipTextActive]}>ALL</Text>
                  </Pressable>
                  {actionOptions.map((a) => {
                    const active = actionFilter === a;
                    const meta = actionStyle(a);
                    return (
                      <Pressable
                        key={a}
                        onPress={() => setActionFilter(active ? '' : a)}
                        style={[styles.chip, active && styles.chipActive, active && { borderColor: meta.color }]}
                        testID={`audit-filter-action-${a}`}
                      >
                        <MaterialCommunityIcons name={meta.icon} size={10} color={active ? meta.color : C.textFaint} />
                        <Text style={[styles.chipText, active && { color: meta.color }]}>{a}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={{ marginTop: Space.lg }} />
          </View>
        }
        renderItem={({ item }) => {
          const meta = actionStyle(item.action);
          return (
            <View style={[styles.row, { borderLeftColor: meta.color }]} testID={`audit-row-${item.id}`}>
              <View style={[styles.iconBadge, { borderColor: meta.color, backgroundColor: `${meta.color}14` }]}>
                <MaterialCommunityIcons name={meta.icon} size={14} color={meta.color} />
              </View>
              <View style={{ flex: 1, marginLeft: Space.sm }}>
                <View style={styles.rowHead}>
                  <Text style={[styles.action, { color: meta.color }]}>{item.action}</Text>
                  <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
                </View>
                <Text style={styles.meta}>
                  {item.actor_email ?? 'system'}
                  {item.resource_type ? ` · ${item.resource_type}` : ''}
                  {item.resource_id != null ? ` #${String(item.resource_id).slice(0, 8)}` : ''}
                  {item.ip ? ` · ${item.ip}` : ''}
                </Text>
                {item.detail && Object.keys(item.detail).length > 0 ? (
                  <Text style={styles.detail} numberOfLines={1}>
                    {JSON.stringify(item.detail)}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{loading ? 'Loading…' : 'No audit entries match the filters.'}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  mono: { fontFamily: F.mono, color: C.text },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.md, flexWrap: 'wrap' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md, marginTop: Space.md },
  lbl: { ...TextStyles.label, color: C.textFaint, marginBottom: Space.xs, fontSize: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5,
    borderRadius: Radius.full, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.surfaceLow,
  },
  chipActive: { backgroundColor: C.primaryFaint, borderColor: C.primary },
  chipText: { ...TextStyles.label, color: C.textMuted, fontFamily: F.mono, fontSize: 9 },
  chipTextActive: { color: C.primary },

  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: C.border, borderLeftWidth: 3,
    padding: Space.sm + 2,
  },
  iconBadge: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Space.sm, flexWrap: 'wrap' },
  action: { ...TextStyles.bodySmall, fontFamily: F.mono, fontSize: 12, letterSpacing: 0.4 },
  meta: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, marginTop: 2, fontSize: 11 },
  detail: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono, marginTop: 2, fontSize: 10 },
  time: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono, fontSize: 10 },
  empty: { ...TextStyles.body, color: C.textMuted, padding: Space.xxl, textAlign: 'center' },
});
