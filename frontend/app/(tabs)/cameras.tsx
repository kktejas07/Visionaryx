/**
 * Cameras CRUD list with View + Edit + Delete actions.
 *
 * MVVM via `useCamerasViewModel`. Admin-only row actions; all roles can view.
 */
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useCamerasViewModel } from '@/viewmodels';
import type { CameraModel } from '@/viewmodels/models';
import { useAuth } from '@/contexts/AuthContext';
import { useColors } from '@/contexts/ThemeContext';
import { isAdminRole } from '@/lib/roles';
import { getStoredToken } from '@/lib/api';
import { getApiBase } from '@/lib/config';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, ScreenSub, VxButton, VxInput, ErrorBanner } from '@/components/vx';
import { HlsPlayer } from '@/components/HlsPlayer';

export default function CamerasScreen() {
  const vm = useCamerasViewModel();
  const { user } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const isAdmin = isAdminRole(user?.role);

  const [addOpen, setAddOpen] = useState(false);
  const [viewing, setViewing] = useState<CameraModel | null>(null);
  const [editing, setEditing] = useState<CameraModel | null>(null);

  const [editCam, setEditCam] = useState<CameraModel | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);

  // Build live-stream src for the View modal whenever a camera is opened.
  // Prefer HLS gateway (real RTSP→HLS via ffmpeg). If the backend can't reach
  // the camera within ~6s the gateway will 502/504 and we'll fall back to the
  // synthetic MJPEG so the modal still shows *something*.
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState<'hls' | 'mjpeg' | 'loading'>('loading');
  useEffect(() => {
    if (!viewing) { setStreamSrc(null); setStreamMode('loading'); return; }
    let active = true;
    (async () => {
      const token = await getStoredToken();
      if (!active) return;
      const tokenQp = encodeURIComponent(token ?? '');
      const base = getApiBase();
      // 1. Probe the HLS playlist endpoint. 200 = ffmpeg up & camera reachable.
      try {
        const probe = await fetch(`${base}/api/v1/cameras/${viewing.id}/hls/index.m3u8?token=${tokenQp}`, {
          method: 'GET',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (active && probe.ok) {
          setStreamMode('hls');
          setStreamSrc(`${base}/api/v1/cameras/${viewing.id}/hls/index.m3u8?token=${tokenQp}`);
          return;
        }
      } catch {/* fall through */}
      if (active) {
        setStreamMode('mjpeg');
        setStreamSrc(`${base}/api/v1/cameras/${viewing.id}/stream.mjpeg?token=${tokenQp}`);
      }
    })();
    return () => { active = false; };
  }, [viewing]);

  const onAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    try {
      await vm.add({ camera_name: name.trim(), rtsp_url: url.trim() });
      setAddOpen(false);
      setName('');
      setUrl('');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add camera');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (cam: CameraModel) => {
    setEditing(cam);
    setEditName(cam.camera_name);
    setEditUrl(cam.rtsp_url);
    setEditEnabled(cam.is_enabled);
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await vm.update(editing.id, {
        camera_name: editName.trim(),
        rtsp_url: editUrl.trim(),
        is_enabled: editEnabled,
      });
      setEditing(null);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save changes');
  const onEdit = async () => {
    if (!editCam || !name.trim() || !url.trim()) return;
    setBusy(true);
    try {
      await vm.update(editCam.id, { camera_name: name.trim(), rtsp_url: url.trim() });
      closeEdit();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update camera');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (cam: CameraModel) => {
    setEditCam(cam);
    setName(cam.camera_name);
    setUrl(cam.rtsp_url);
  };

  const closeEdit = () => {
    setEditCam(null);
    setName('');
    setUrl('');
  };

  const onRemove = (cam: CameraModel) => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`Remove ${cam.camera_name}?`)) {
        vm.remove(cam.id).catch((e) => Alert.alert('Error', e?.message));
      }
      return;
    }
    Alert.alert('Remove camera', `Remove ${cam.camera_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => vm.remove(cam.id) },
    ]);
  };

  return (
    <View style={styles.root} testID="cameras-screen">
      <CommandBackground />
      <FlatList
        data={vm.filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.pad}
        refreshControl={
          <RefreshControl refreshing={vm.refreshing} onRefresh={vm.refresh} tintColor={colors.primaryAccent} />
        }
        ListHeaderComponent={
          <View>
            <SectionEyebrow>Inventory</SectionEyebrow>
            <ScreenTitle>Camera nodes</ScreenTitle>
            <ScreenSub>
              <Text style={[styles.mono, { color: colors.text }]}>{vm.totalActive}</Text> online ·{' '}
              <Text style={[styles.mono, { color: colors.warning }]}>{vm.totalOffline}</Text> offline ·{' '}
              <Text style={[styles.mono, { color: colors.text }]}>{vm.items.length}</Text> total
            </ScreenSub>

            <View style={styles.searchRow}>
              <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="magnify" size={16} color={colors.textMuted} />
                <VxInput
                  placeholder="Search by name or URL"
                  value={vm.query}
                  onChangeText={vm.setQuery}
                  style={styles.searchInput as any}
                  testID="cameras-search"
                />
              </View>
              {isAdmin ? (
                <VxButton
                  label="Add"
                  icon={<MaterialCommunityIcons name="plus" size={14} color="#fff" />}
                  onPress={() => setAddOpen(true)}
                  testID="add-camera-btn"
                  size="md"
                />
              ) : null}
            </View>

            <ErrorBanner message={vm.error} />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        renderItem={({ item }) => {
          const live = item.is_enabled && item.status === 'active';
          return (
            <View
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              testID={`camera-row-${item.id}`}
            >
              <View style={[styles.statusBlock, { backgroundColor: live ? colors.success : colors.warning }]} />
              <View style={[styles.iconWrap, { backgroundColor: colors.primaryFaint }]}>
                <MaterialCommunityIcons name="cctv" size={18} color={colors.primaryAccent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.camera_name}</Text>
                <Text style={[styles.rowUrl, { color: colors.textMuted }]} numberOfLines={1}>{item.rtsp_url}</Text>
              </View>

              {/* Action cluster: View / Edit / Toggle / Delete */}
              <Pressable
                onPress={() => setViewing(item)}
                style={[styles.iconBtn, { borderColor: colors.border }]}
                hitSlop={6}
                testID={`camera-view-${item.id}`}
                accessibilityLabel="View camera"
              >
                <MaterialCommunityIcons name="eye-outline" size={15} color={colors.primaryAccent} />
              </Pressable>
              {isAdmin ? (
                <Pressable
                  onPress={() => openEdit(item)}
                  style={[styles.iconBtn, { borderColor: colors.border }]}
                  hitSlop={6}
                  testID={`camera-edit-${item.id}`}
                  accessibilityLabel="Edit camera"
                >
                  <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.cyan} />
        renderItem={({ item }) => (
          <View style={styles.row} testID={`camera-row-${item.id}`}>
            <View style={[styles.statusBlock, { backgroundColor: item.is_enabled && item.status === 'active' ? C.success : C.warning }]} />
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="cctv" size={18} color={C.primaryAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName} numberOfLines={1}>{item.camera_name}</Text>
              <Text style={styles.rowUrl} numberOfLines={1}>{item.rtsp_url}</Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable onPress={() => router.push(`/camera/${item.id}`)} style={styles.actionBtn} hitSlop={6}>
                <MaterialCommunityIcons name="eye-outline" size={16} color={C.primaryAccent} />
              </Pressable>
              {isAdmin ? (
                <Pressable onPress={() => openEdit(item)} style={styles.actionBtn} hitSlop={6}>
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={C.textMuted} />
                </Pressable>
              ) : null}
              <Switch
                value={item.is_enabled}
                onValueChange={(v) => vm.toggle(item.id, v).catch((e) => Alert.alert('Error', e?.message))}
                trackColor={{ false: C.surface3, true: C.primary }}
                thumbColor="#fff"
                disabled={!isAdmin}
                testID={`camera-toggle-${item.id}`}
              />
              {isAdmin ? (
                <Pressable
                  onPress={() => onRemove(item)}
                  style={[styles.iconBtn, { borderColor: colors.border }]}
                  hitSlop={6}
                  testID={`camera-del-${item.id}`}
                  accessibilityLabel="Delete camera"
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={15} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          </View>
        )}}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {vm.loading ? 'Loading…' : 'No cameras configured.'}
          </Text>
        }
      />

      {/* Add modal */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.scrim} testID="add-camera-modal">
          <View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SectionEyebrow>New node</SectionEyebrow>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add camera</Text>
            <View style={{ gap: Space.md, marginTop: Space.lg }}>
              <VxInput label="Camera name" placeholder="Front Gate" value={name} onChangeText={setName} testID="add-camera-name" />
              <VxInput label="RTSP / HLS URL" placeholder="rtsp://…" value={url} onChangeText={setUrl} autoCapitalize="none" testID="add-camera-url" />
            </View>
            <View style={styles.modalActions}>
              <VxButton label="Cancel" variant="secondary" onPress={() => setAddOpen(false)} testID="add-camera-cancel" />
              <VxButton label="Add node" onPress={onAdd} busy={busy} testID="add-camera-confirm" />
            </View>
          </View>
        </View>
      </Modal>

      {/* View modal */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.scrim} testID="view-camera-modal">
          <View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxWidth: 640 }]}>
            <SectionEyebrow>Live preview</SectionEyebrow>
            <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>{viewing?.camera_name}</Text>
            <View style={styles.previewWrap}>
              {viewing && Platform.OS === 'web' ? (
                <View style={[styles.previewFrame, { borderColor: colors.border, backgroundColor: '#000' }]}>
                  {streamMode === 'hls' && streamSrc ? (
                    <HlsPlayer src={streamSrc} />
                  ) : streamMode === 'mjpeg' && streamSrc ? (
                    // @ts-expect-error — DOM element on web
                    <img
                      src={streamSrc}
                      alt={viewing.camera_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <View style={styles.previewOverlay}>
                      <MaterialCommunityIcons name="cctv" size={36} color={colors.primaryAccent} />
                      <Text style={styles.previewLbl}>CONNECTING…</Text>
                    </View>
                  )}
                  {streamMode === 'mjpeg' ? (
                    <View style={styles.streamModeBadge}>
                      <Text style={styles.streamModeBadgeText}>SYNTHETIC PREVIEW</Text>
                    </View>
                  ) : streamMode === 'hls' ? (
                    <View style={[styles.streamModeBadge, { backgroundColor: 'rgba(6,182,212,0.18)' }]}>
                      <Text style={[styles.streamModeBadgeText, { color: '#06B6D4' }]}>● LIVE HLS</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                <Text style={[styles.metaLbl, { color: colors.textFaint }]}>STATUS</Text>
                <Text style={[styles.metaVal, { color: viewing?.is_enabled && viewing?.status === 'active' ? colors.success : colors.warning }]}>
                  {viewing?.status?.toUpperCase()}
                </Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={[styles.metaLbl, { color: colors.textFaint }]}>ENABLED</Text>
                <Text style={[styles.metaVal, { color: colors.text }]}>{viewing?.is_enabled ? 'YES' : 'NO'}</Text>
              </View>
              <View style={[styles.metaCell, { flexBasis: '100%' }]}>
                <Text style={[styles.metaLbl, { color: colors.textFaint }]}>SOURCE URL</Text>
                <Text style={[styles.metaUrl, { color: colors.text }]} numberOfLines={2}>{viewing?.rtsp_url}</Text>
              </View>
            </View>
            <View style={styles.modalActions}>
              {isAdmin && viewing ? (
                <VxButton
                  label="Edit"
                  variant="secondary"
                  onPress={() => { const c = viewing; setViewing(null); openEdit(c); }}
                  icon={<MaterialCommunityIcons name="pencil-outline" size={14} color={colors.text} />}
                  testID="view-camera-edit"
                />
              ) : null}
              <VxButton label="Close" onPress={() => setViewing(null)} testID="view-camera-close" />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit modal */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.scrim} testID="edit-camera-modal">
          <View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SectionEyebrow>Edit node</SectionEyebrow>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{editing?.camera_name}</Text>
            <View style={{ gap: Space.md, marginTop: Space.lg }}>
              <VxInput label="Camera name" value={editName} onChangeText={setEditName} testID="edit-camera-name" />
              <VxInput label="RTSP / HLS URL" value={editUrl} onChangeText={setEditUrl} autoCapitalize="none" testID="edit-camera-url" />
              <View style={styles.editToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.metaLbl, { color: colors.textFaint }]}>STREAMING</Text>
                  <Text style={[styles.metaVal, { color: editEnabled ? colors.success : colors.warning }]}>
                    {editEnabled ? 'ENABLED' : 'DISABLED'}
                  </Text>
                </View>
                <Switch
                  value={editEnabled}
                  onValueChange={setEditEnabled}
                  trackColor={{ false: colors.surface3, true: colors.primary }}
                  thumbColor="#fff"
                  testID="edit-camera-toggle"
                />
              </View>
            </View>
            <View style={styles.modalActions}>
              <VxButton label="Cancel" variant="secondary" onPress={() => setEditing(null)} testID="edit-camera-cancel" />
              <VxButton label="Save changes" onPress={onSaveEdit} busy={busy} testID="edit-camera-save" />
      {/* Edit modal */}
      <Modal visible={editCam !== null} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.scrim} testID="edit-camera-modal">
          <View style={styles.modal}>
            <SectionEyebrow>Edit node</SectionEyebrow>
            <Text style={styles.modalTitle}>Edit camera</Text>
            <View style={{ gap: Space.md, marginTop: Space.lg }}>
              <VxInput label="Camera name" placeholder="Front Gate" value={name} onChangeText={setName} testID="edit-camera-name" />
              <VxInput label="RTSP / HLS URL" placeholder="rtsp://…" value={url} onChangeText={setUrl} autoCapitalize="none" testID="edit-camera-url" />
            </View>
            <View style={styles.modalActions}>
              <VxButton label="Cancel" variant="secondary" onPress={closeEdit} testID="edit-camera-cancel" />
              <VxButton label="Save" onPress={onEdit} busy={busy} testID="edit-camera-confirm" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  mono: { fontFamily: F.mono },
  searchRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, marginBottom: Space.md, alignItems: 'center', flexWrap: 'wrap' },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.xs, borderRadius: Radius.sm, borderWidth: 1, paddingLeft: Space.sm, minWidth: 200 },
  searchInput: { paddingLeft: Space.sm, backgroundColor: 'transparent', borderWidth: 0 },
  mono: { fontFamily: F.mono, color: C.text },
  searchRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, marginBottom: Space.md, alignItems: 'center', flexWrap: 'wrap' },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.xs, minWidth: 200 },
  searchInput: { paddingLeft: Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Space.md,
    gap: Space.md,
    overflow: 'hidden',
    flexWrap: 'wrap',
  },
  statusBlock: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowName: { ...TextStyles.bodySmall, fontFamily: F.bodySemibold },
  rowUrl: { ...TextStyles.caption, fontFamily: F.mono, marginTop: 2 },
  iconBtn: {
    width: 30, height: 30,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { ...TextStyles.body, padding: Space.xxl, textAlign: 'center' },
  iconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.primaryFaint, alignItems: 'center', justifyContent: 'center' },
  rowName: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  rowUrl: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, marginTop: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: { padding: 6 },
  empty: { ...TextStyles.body, color: C.textMuted, padding: Space.xxl, textAlign: 'center' },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: Space.lg },
  modal: { borderRadius: Radius.lg, padding: Space.lg, maxWidth: 480, width: '100%', alignSelf: 'center', borderWidth: 1 },
  modalTitle: { ...TextStyles.h3, marginTop: Space.sm },
  modalActions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, justifyContent: 'flex-end', flexWrap: 'wrap' },

  // View modal extras
  previewWrap: { marginTop: Space.lg },
  previewFrame: {
    aspectRatio: 16 / 9,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', gap: Space.sm,
  },
  previewLbl: { ...TextStyles.label, color: '#A78BFA', fontFamily: F.mono, fontSize: 10, letterSpacing: 2 },
  streamModeBadge: {
    position: 'absolute', top: 10, right: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,182,107,0.18)',
  },
  streamModeBadgeText: { ...TextStyles.label, color: '#FFB66B', fontSize: 9, letterSpacing: 1.2 },
  scanLine: {
    position: 'absolute',
    left: 0, right: 0, top: '50%',
    height: 1.5,
    backgroundColor: 'rgba(139, 92, 246, 0.45)',
    ...(Platform.OS === 'web' ? ({
      animation: 'vxScan 4s ease-in-out infinite',
    } as any) : {}),
  },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md, marginTop: Space.lg },
  metaCell: { flexBasis: 140, flexGrow: 1 },
  metaLbl: { ...TextStyles.label, fontSize: 9 },
  metaVal: { ...TextStyles.body, fontFamily: F.mono, marginTop: 4, fontSize: 13 },
  metaUrl: { ...TextStyles.body, fontFamily: F.mono, marginTop: 4, fontSize: 12 },
  editToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Space.sm,
  },
});
