/**
 * Detections forensic table — MVVM via `useDetectionsViewModel`.
 */
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useDetectionsViewModel, type DetectionItem } from '@/viewmodels';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, ScreenSub } from '@/components/vx';
import MobileBackButton from '@/components/MobileBackButton';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', month: 'short', day: '2-digit', hour12: false });
}

export default function DetectionsScreen() {
  const vm = useDetectionsViewModel();

  return (
    <View style={styles.root} testID="detections-screen">
      <CommandBackground />
      <MobileBackButton />
      <FlatList
        data={vm.items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={vm.loading} onRefresh={vm.refresh} tintColor={C.primaryAccent} />}
        ListFooterComponent={
          vm.totalPages > 1 ? <PageNav page={vm.page} totalPages={vm.totalPages} onGo={(n) => vm.goToPage(n)} /> : null
        }
        ListHeaderComponent={
          <View>
            <SectionEyebrow>Forensics</SectionEyebrow>
            <ScreenTitle>Detection intelligence</ScreenTitle>
            <ScreenSub>
              Search across <Text style={styles.mono}>{vm.total}</Text> events. Filter by camera, identity or confidence.
            </ScreenSub>

            <View style={styles.searchRow}>
              <View style={styles.searchWrap}>
                <MaterialCommunityIcons name="magnify" size={16} color={C.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={vm.query}
                  onChangeText={vm.setQuery}
                  placeholder="Search by camera, name, id…"
                  placeholderTextColor={C.textFaint}
                  testID="detections-search"
                />
              </View>
            </View>

            <View style={styles.toolbar}>
              <View style={styles.statRow}>
                <View style={[styles.statChip, { backgroundColor: C.cyanFaint, borderColor: C.cyan }]}>
                  <View style={[styles.dot, { backgroundColor: C.cyan }]} />
                  <Text style={[styles.statText, { color: C.cyan }]}>KNOWN · {vm.knownCount}</Text>
                </View>
                <View style={[styles.statChip, { backgroundColor: C.dangerFaint, borderColor: C.danger }]}>
                  <View style={[styles.dot, { backgroundColor: C.danger }]} />
                  <Text style={[styles.statText, { color: C.danger }]}>UNKNOWN · {vm.unknownCount}</Text>
                </View>
              </View>
              <View style={styles.pageSizeBar}>
                <Text style={[styles.pageMeta, { color: C.textFaint }]}>
                  {vm.totalPages > 0 ? `Page ${vm.page + 1} of ${vm.totalPages}` : `${vm.total} records`}
                </Text>
                <View style={styles.chipRow}>
                  {([10, 25, 50] as const).map((s) => {
                    const active = vm.pageSize === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => vm.setPageSize(s)}
                        style={[styles.chip, active && styles.chipActive]}
                        testID={`det-page-size-${s}`}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        renderItem={({ item }) => <DetectionRow item={item} />}
        ListEmptyComponent={
          <Text style={styles.empty}>{vm.loading ? 'Loading sentinel log…' : 'No detections.'}</Text>
        }
      />
    </View>
  );
}

function DetectionRow({ item }: { item: DetectionItem }) {
  const isKnown = item.status === 'known';
  const high = item.confidence > 0.85;
  return (
    <View style={styles.row} testID={`det-row-${item.id}`}>
      <View style={[styles.rowAccent, { backgroundColor: isKnown ? C.cyan : C.danger }]} />
      <View style={[styles.rowIcon, { backgroundColor: isKnown ? C.cyanFaint : C.dangerFaint }]}>
        <MaterialCommunityIcons
          name={isKnown ? 'face-recognition' : 'account-question'}
          size={20}
          color={isKnown ? C.cyan : C.danger}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{item.user_name || 'Unknown signal'}</Text>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="cctv" size={11} color={C.textMuted} />
          <Text style={styles.rowMeta}>{item.camera_name || 'Unassigned node'}</Text>
          <Text style={styles.rowDot}>·</Text>
          <Text style={styles.rowTime}>{fmt(item.timestamp)}</Text>
        </View>
      </View>
      <View style={[styles.confBadge, { backgroundColor: high ? C.cyanFaint : C.warningFaint }]}>
        <Text style={[styles.confText, { color: high ? C.cyan : C.warning }]}>
          {(item.confidence * 100).toFixed(0)}%
        </Text>
      </View>
    </View>
  );
}

function PageNav({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (n: number) => void }) {
  return (
    <View style={styles.pageNav}>
      <Pressable
        style={[styles.pageNavBtn, { opacity: page > 0 ? 1 : 0.4 }]}
        onPress={() => { if (page > 0) onGo(page - 1); }}
        disabled={page === 0}
        testID="page-nav-prev"
      >
        <MaterialCommunityIcons name="chevron-left" size={14} color={C.textMuted} />
      </Pressable>
      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
        let pageNum: number;
        if (totalPages <= 7) {
          pageNum = i;
        } else if (page < 4) {
          pageNum = i;
        } else if (page > totalPages - 5) {
          pageNum = totalPages - 7 + i;
        } else {
          pageNum = page - 3 + i;
        }
        const active = pageNum === page;
        return (
          <Pressable
            key={pageNum}
            style={[styles.pageNumBtn, active && styles.pageNumBtnActive]}
            onPress={() => { if (pageNum !== page) onGo(pageNum); }}
            testID={`page-nav-${pageNum}`}
          >
            <Text style={[styles.pageNumText, active && styles.pageNumTextActive]}>{pageNum + 1}</Text>
          </Pressable>
        );
      })}
      <Pressable
        style={[styles.pageNavBtn, { opacity: page < totalPages - 1 ? 1 : 0.4 }]}
        onPress={() => { if (page < totalPages - 1) onGo(page + 1); }}
        disabled={page >= totalPages - 1}
        testID="page-nav-next"
      >
        <MaterialCommunityIcons name="chevron-right" size={14} color={C.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  mono: { fontFamily: F.mono, color: C.text },
  searchRow: { flexDirection: 'row', gap: Space.sm, alignItems: 'center', marginTop: Space.lg, marginBottom: Space.md, flexWrap: 'wrap' },
  searchWrap: {
    flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: Space.sm,
    paddingHorizontal: Space.md, paddingVertical: 10,
    backgroundColor: C.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 14, paddingVertical: 8, outline: 'none' as any },
  statRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.md, marginBottom: Space.md },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statText: { ...TextStyles.label, fontSize: 10, letterSpacing: 1.2 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: C.border,
    padding: Space.md, gap: Space.md, overflow: 'hidden',
  },
  rowAccent: { width: 3, alignSelf: 'stretch' },
  rowIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowName: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  rowMeta: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, fontSize: 11 },
  rowDot: { ...TextStyles.caption, color: C.textFaint },
  rowTime: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, fontSize: 11 },
  confBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm, minWidth: 50, alignItems: 'center' },
  confText: { ...TextStyles.dataSmall, fontFamily: F.monoSemibold },

  empty: { ...TextStyles.body, color: C.textMuted, padding: Space.xxl, textAlign: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Space.md, marginBottom: Space.sm, flexWrap: 'wrap', gap: Space.sm },
  pageSizeBar: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  pageMeta: { ...TextStyles.caption, fontFamily: F.mono, fontSize: 11 },
  chipRow: { flexDirection: 'row', gap: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  chipActive: { borderColor: C.primary, backgroundColor: C.primaryFaint },
  chipText: { ...TextStyles.label, fontSize: 10, color: C.textMuted },
  chipTextActive: { color: C.primary },
  pageNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Space.lg },
  pageNavBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2 },
  pageNumBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
  pageNumBtnActive: { backgroundColor: C.primary },
  pageNumText: { ...TextStyles.label, fontSize: 11, color: C.textMuted },
  pageNumTextActive: { color: '#fff' },
});
