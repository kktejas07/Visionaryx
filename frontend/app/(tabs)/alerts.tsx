/**
 * Alerts screen — VisionaryX brand + MVVM (useAlertsViewModel).
 */
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAlertsViewModel, SEVERITY_OPTIONS, type SeverityFilter } from '@/viewmodels';
import type { AlertModel } from '@/viewmodels/models';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, VxButton } from '@/components/vx';

function sevColor(sev: string): string {
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

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export default function AlertsScreen() {
  const vm = useAlertsViewModel();

  const Header = useMemo(
    () => (
      <View>
        <SectionEyebrow testID="alerts-eyebrow">System Monitoring</SectionEyebrow>
        <ScreenTitle testID="alerts-title">Security alerts</ScreenTitle>

        <View style={styles.statRow}>
          <View>
            <Text style={styles.statLbl}>UNREAD</Text>
            <Text style={[styles.statVal, { color: C.warning }]}>
              {vm.unread.toString().padStart(2, '0')}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View>
            <Text style={styles.statLbl}>TOTAL</Text>
            <Text style={styles.statVal}>{vm.total.toString().padStart(2, '0')}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <VxButton
            label="Mark all read"
            size="md"
            variant="secondary"
            busy={vm.busy}
            onPress={() => void vm.markAllRead()}
            icon={<MaterialCommunityIcons name="check-all" size={14} color={C.text} />}
            testID="mark-all-read-btn"
          />
        </View>

        {/* Severity chips */}
        <View style={styles.chips}>
          {SEVERITY_OPTIONS.map((sev) => {
            const active = vm.severity === sev;
            return (
              <Pressable
                key={sev}
                onPress={() => vm.setSeverity(sev as SeverityFilter)}
                style={[styles.chip, active && styles.chipActive]}
                testID={`sev-chip-${sev.toLowerCase()}`}
              >
                <Text style={[styles.chipText, active && { color: C.text }]}>{sev}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={vm.toggleTodayOnly}
            style={[styles.chip, vm.todayOnly && styles.chipActive]}
            testID="today-only-chip"
          >
            <MaterialCommunityIcons name="calendar-today" size={12} color={vm.todayOnly ? C.text : C.textMuted} />
            <Text style={[styles.chipText, vm.todayOnly && { color: C.text }]}>Today</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={16} color={C.textMuted} />
          <TextInput
            placeholder="Search alerts, messages…"
            placeholderTextColor={C.textFaint}
            style={styles.searchInput}
            value={vm.query}
            onChangeText={vm.setQuery}
            testID="alerts-search"
          />
        </View>
      </View>
    ),
    [vm.unread, vm.total, vm.severity, vm.todayOnly, vm.query, vm.busy], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <View style={styles.root} testID="alerts-screen">
      <CommandBackground />
      <FlatList
        data={vm.items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={Header}
        refreshControl={
          <RefreshControl refreshing={vm.loading} onRefresh={vm.refresh} tintColor={C.primaryAccent} />
        }
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        renderItem={({ item }) => <AlertRow item={item} onRead={() => vm.markRead(item.id)} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {vm.loading ? 'Loading sentinel log…' : 'No alerts match the current filters.'}
          </Text>
        }
      />
    </View>
  );
}

function AlertRow({ item, onRead }: { item: AlertModel; onRead: () => void }) {
  const color = sevColor(item.severity as string);
  return (
    <Pressable
      onPress={() => !item.is_read && onRead()}
      style={[styles.row, !item.is_read && styles.rowUnread]}
      testID={`alert-row-${item.id}`}
    >
      <View style={[styles.rowSev, { backgroundColor: color }]} />
      <View style={{ flex: 1, marginLeft: Space.md }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowType} numberOfLines={1}>
            {item.alert_type}
          </Text>
          <Text style={styles.rowTime}>{fmtTime(item.timestamp)}</Text>
        </View>
        <Text style={styles.rowMsg} numberOfLines={2}>
          {item.message}
        </Text>
        <View style={styles.rowMetaRow}>
          <Text style={styles.rowMeta}>{(item.severity || 'info').toUpperCase()}</Text>
          {item.camera_name ? <Text style={styles.rowMeta}>· {item.camera_name}</Text> : null}
          {!item.is_read ? (
            <View style={[styles.unreadDot, { backgroundColor: C.primaryAccent }]} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  list: { padding: Space.lg, paddingBottom: 120, maxWidth: 1200, width: '100%', alignSelf: 'center' },

  statRow: { flexDirection: 'row', alignItems: 'center', gap: Space.lg, marginTop: Space.lg },
  statLbl: { ...TextStyles.label, color: C.textFaint, fontSize: 10 },
  statVal: { ...TextStyles.dataLarge, color: C.text, fontSize: 32, marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: C.border },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, marginTop: Space.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primaryFaint, borderColor: C.primary },
  chipText: { ...TextStyles.label, color: C.textMuted, fontSize: 10 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
    paddingHorizontal: Space.md,
    paddingVertical: 4,
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 14, paddingVertical: 10 },

  row: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    minHeight: 78,
  },
  rowUnread: { backgroundColor: C.surfaceLow },
  rowSev: { width: 3, alignSelf: 'stretch' },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Space.md },
  rowType: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold, flex: 1 },
  rowTime: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, marginLeft: Space.sm, marginRight: Space.md },
  rowMsg: { ...TextStyles.caption, color: C.textMuted, marginTop: 4, marginRight: Space.md },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, marginTop: Space.sm, paddingBottom: Space.md },
  rowMeta: { ...TextStyles.label, color: C.textFaint, fontSize: 9, fontFamily: F.mono },
  unreadDot: { width: 6, height: 6, borderRadius: 3, marginLeft: Space.xs },
  empty: { ...TextStyles.body, color: C.textMuted, textAlign: 'center', padding: Space.xxl },
});
