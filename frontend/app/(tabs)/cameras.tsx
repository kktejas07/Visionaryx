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
import { SectionEyebrow, ScreenTitle, ScreenSub, VxButton, VxInput, ErrorBanner, useConfirm } from '@/components/vx';
import { HlsPlayer } from '@/components/HlsPlayer';

export default function CamerasScreen() {
  const vm = useCamerasViewModel();
  const { user } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const isAdmin = isAdminRole(user?.role);

  const [addOpen, setAddOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairInfo, setPairInfo] = useState<{ id: string; camera_name: string; pair_url: string } | null>(null);
  const [pairName, setPairName] = useState('');
  const [pairBaseUrl, setPairBaseUrl] = useState('');
  const [pairToken, setPairToken] = useState<string | null>(null);
  const [viewing, setViewing] = useState<CameraModel | null>(null);
  const [editing, setEditing] = useState<CameraModel | null>(null);

  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');

  const { confirm, ConfirmDialog } = useConfirm();
  const [url, setUrl] = useState('');

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
      setPairToken(token);
      const tokenQp = encodeURIComponent(token ?? '');
      const base = getApiBase();
      // Phone camera → skip HLS, go straight to the cached-frame MJPEG re-stream.
      if (viewing.kind === 'phone') {
        setStreamMode('mjpeg');
        setStreamSrc(`${base}/api/v1/cameras/${viewing.id}/stream.mjpeg?token=${tokenQp}`);
        return;
      }
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
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (cam: CameraModel) => {
    const ok = await confirm('Remove camera', `Remove ${cam.camera_name}?`, { confirmLabel: 'Remove' });
    if (ok) {
      vm.remove(cam.id).catch((e) => Alert.alert('Error', e?.message));
    }
  };

  const onPairCreate = async () => {
    if (!pairName.trim()) return;
    setBusy(true);
    try {
      const token = await getStoredToken();
      const base = getApiBase();
      const r = await fetch(`${base}/api/v1/phone-cameras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ camera_name: pairName.trim() }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const data = await r.json();
      const origin = pairBaseUrl || (typeof window !== 'undefined' && window.location?.origin) || base;
      setPairToken(token);
      setPairInfo({
        id: data.id,
        camera_name: data.camera_name,
        pair_url: `${origin}${data.pair_url_path}`,
      });
      void vm.refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create wireless camera');
    } finally {
      setBusy(false);
    }
  };

  const closePairModal = () => {
    setPairOpen(false);
    setPairInfo(null);
    setPairName('');
    setPairBaseUrl('');
    setPairToken(null);
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
                <>
                  <VxButton
                    label="Add camera"
                    icon={<MaterialCommunityIcons name="plus" size={14} color="#fff" />}
                    onPress={() => setAddOpen(true)}
                    testID="add-camera-btn"
                  />
                  <VxButton
                    label="Wireless"
                    variant="secondary"
                    icon={<MaterialCommunityIcons name="cellphone-link" size={14} color={colors.text} />}
                    onPress={() => setPairOpen(true)}
                    testID="add-wireless-camera-btn"
                  />
                </>
              ) : null}
            </View>

            <ErrorBanner message={vm.error} />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`camera-row-${item.id}`}>
            <View style={[styles.statusBlock, { backgroundColor: item.is_enabled && item.status === 'active' ? C.success : C.warning }]} />
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name={item.kind === 'phone' ? 'cellphone-link' : 'cctv'} size={18} color={C.primaryAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.rowName} numberOfLines={1}>{item.camera_name}</Text>
                {item.kind === 'phone' ? (
                  <View style={[styles.kindChip, { borderColor: C.cyan, backgroundColor: C.cyanFaint }]} testID={`camera-kind-phone-${item.id}`}>
                    <Text style={[styles.kindChipText, { color: C.cyan }]}>WIRELESS</Text>
                  </View>
                ) : null}
              </View>
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
                  style={[styles.iconBtn, { borderColor: C.border }]}
                  hitSlop={6}
                  testID={`camera-del-${item.id}`}
                  accessibilityLabel="Delete camera"
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={15} color={C.danger} />
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
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
                    <View style={[styles.streamModeBadge, styles.streamModeBadgeLeft]} testID="stream-badge-mjpeg">
                      <Text style={styles.streamModeBadgeText}>SYNTHETIC PREVIEW</Text>
                    </View>
                  ) : streamMode === 'hls' ? (
                    <View style={[styles.streamModeBadge, { backgroundColor: 'rgba(6,182,212,0.18)' }]} testID="stream-badge-hls">
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
                <Text style={[styles.metaLbl, { color: colors.textFaint }]}>TYPE</Text>
                <Text style={[styles.metaVal, { color: colors.text }]}>{viewing?.kind === 'phone' ? 'WIRELESS' : 'RTSP'}</Text>
              </View>
              <View style={[styles.metaCell, { flexBasis: '100%' }]}>
                <Text style={[styles.metaLbl, { color: colors.textFaint }]}>SOURCE URL</Text>
                <Text style={[styles.metaUrl, { color: colors.text }]} numberOfLines={2}>{viewing?.rtsp_url}</Text>
              </View>
            </View>

            {/* Pair QR for phone cameras */}
            {viewing?.kind === 'phone' && isAdmin ? (
              <View style={{ marginTop: Space.md, gap: Space.sm }}>
                <Text style={[styles.metaLbl, { color: colors.textFaint }]}>PAIR QR &amp; URL</Text>
                <View style={[styles.qrSmallFrame, { borderColor: colors.border }]}>
                  {Platform.OS === 'web' ? (
                    // @ts-expect-error — DOM img
                    <img
                      src={`${getApiBase()}/api/v1/phone-cameras/${viewing.id}/qr.png?base=${encodeURIComponent(pairBaseUrl || (typeof window !== 'undefined' ? window.location.origin : getApiBase()))}&token=${encodeURIComponent(pairToken || '')}`}
                      alt="Pair QR"
                      style={{ width: 160, height: 160, display: 'block' }}
                    />
                  ) : null}
                </View>
                <View style={[styles.pairUrlWrap, { borderColor: colors.border }]}>
                  <Text selectable style={[styles.pairUrlText, { color: colors.textMuted }]}>
                    {pairBaseUrl || (typeof window !== 'undefined' ? window.location.origin : getApiBase())}/pair?token=
                  </Text>
                </View>
              </View>
            ) : null}
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
            </View>
          </View>
        </View>
      </Modal>

      {/* Pair / wireless camera modal */}
      <Modal visible={pairOpen} transparent animationType="fade" onRequestClose={closePairModal}>
        <View style={styles.scrim} testID="pair-camera-modal">
          <View style={[styles.modal, { backgroundColor: colors.surface, borderColor: colors.border, maxWidth: 480 }]}>
            <SectionEyebrow>Wireless camera</SectionEyebrow>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {pairInfo ? 'Scan to pair' : 'Add a phone / tablet camera'}
            </Text>
            {!pairInfo ? (
              <>
                <Text style={[styles.pairBlurb, { color: colors.textMuted }]}>
                  Turn any phone, tablet or laptop into a VisionaryX camera. We&apos;ll mint a QR code — scan it on the device, allow camera access, and frames stream straight into the platform over WebSocket.
                </Text>
                <View style={{ gap: Space.md, marginTop: Space.lg }}>
                  <VxInput
                    label="Camera name"
                    placeholder="e.g. Lobby iPhone"
                    value={pairName}
                    onChangeText={setPairName}
                    testID="pair-camera-name"
                  />
                  <View>
                    <Text style={[styles.metaLbl, { color: colors.textFaint, marginBottom: 4 }]}>APP URL (phone must reach this)</Text>
                    <VxInput
                      placeholder="http://192.168.x.x:8081"
                      value={pairBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')}
                      onChangeText={setPairBaseUrl}
                      autoCapitalize="none"
                      testID="pair-base-url"
                    />
                    {pairBaseUrl && /localhost|127\.0\.0\.1/.test(pairBaseUrl) ? (
                      <Text style={[styles.pairBlurb, { color: colors.warning, marginTop: 6, fontSize: 11 }]}>
                        Your phone cannot reach localhost. Replace with your computer's LAN IP (e.g. 192.168.1.5) and the same port.
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.modalActions}>
                  <VxButton label="Cancel" variant="secondary" onPress={closePairModal} testID="pair-camera-cancel" />
                  <VxButton label="Create + show QR" onPress={onPairCreate} busy={busy} testID="pair-camera-create" />
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.pairBlurb, { color: colors.textMuted }]}>
                  Open the camera app on <Text style={{ color: colors.text, fontFamily: F.bodySemibold }}>{pairInfo.camera_name}</Text> and scan this QR. The device will load the pairing page — tap <Text style={{ color: colors.text }}>Start camera</Text> to go live.
                </Text>
                <View style={styles.qrFrame} testID="pair-qr-frame">
                  {Platform.OS === 'web' ? (
                    // @ts-expect-error — DOM img
                    <img
                      src={`${getApiBase()}/api/v1/phone-cameras/${pairInfo.id}/qr.png?base=${encodeURIComponent(pairBaseUrl || (typeof window !== 'undefined' ? window.location.origin : getApiBase()))}&token=${encodeURIComponent(pairToken || '')}`}
                      alt="Pair QR"
                      style={{ width: 220, height: 220, display: 'block' }}
                    />
                  ) : null}
                </View>
                <Text selectable style={[styles.pairUrl, { color: colors.textMuted, borderColor: colors.border }]} testID="pair-url">
                  {pairInfo.pair_url}
                </Text>
                <View style={styles.modalActions}>
                  <VxButton
                    label="Copy URL"
                    variant="secondary"
                    onPress={() => { if (typeof navigator !== 'undefined' && navigator.clipboard) void navigator.clipboard.writeText(pairInfo.pair_url); }}
                    icon={<MaterialCommunityIcons name="content-copy" size={14} color={colors.text} />}
                    testID="pair-copy-url"
                  />
                  <VxButton label="Done" onPress={closePairModal} testID="pair-done" />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      {ConfirmDialog}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  mono: { fontFamily: F.mono, color: C.text },
  searchRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, marginBottom: Space.md, alignItems: 'center', flexWrap: 'wrap' },
  searchWrap: {
    flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: Space.sm,
    borderRadius: Radius.sm, borderWidth: 1,
    paddingHorizontal: Space.md, paddingVertical: 10,
  },
  searchInput: { flex: 1, paddingLeft: Space.sm, outline: 'none' as any },
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
  iconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.primaryFaint, alignItems: 'center', justifyContent: 'center' },
  rowName: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  rowUrl: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, marginTop: 2 },
  iconBtn: {
    width: 30, height: 30,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
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
    zIndex: 2,
  },
  streamModeBadgeLeft: { right: undefined, left: 10, top: undefined, bottom: 36, backgroundColor: 'rgba(255,182,107,0.22)' },
  streamModeBadgeText: { ...TextStyles.label, color: '#FFB66B', fontSize: 9, letterSpacing: 1.2 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md, marginTop: Space.lg },
  metaCell: { flexBasis: 140, flexGrow: 1 },
  metaLbl: { ...TextStyles.label, fontSize: 9 },
  metaVal: { ...TextStyles.body, fontFamily: F.mono, marginTop: 4, fontSize: 13 },
  metaUrl: { ...TextStyles.body, fontFamily: F.mono, marginTop: 4, fontSize: 12 },
  qrSmallFrame: { alignSelf: 'center', backgroundColor: '#fff', borderRadius: Radius.md, padding: Space.sm, borderWidth: 2 },
  pairUrlWrap: { padding: Space.sm, borderRadius: Radius.sm, borderWidth: 1, backgroundColor: 'transparent' },
  pairUrlText: { ...TextStyles.caption, fontFamily: F.mono, fontSize: 11 },
  editToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Space.sm,
  },
  kindChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.full, borderWidth: 1 },
  kindChipText: { ...TextStyles.label, fontSize: 8, letterSpacing: 1 },
  pairBlurb: { ...TextStyles.body, fontSize: 13, marginTop: Space.sm, lineHeight: 19 },
  qrFrame: {
    alignSelf: 'center', marginTop: Space.lg, padding: Space.md,
    backgroundColor: '#fff', borderRadius: Radius.md,
    borderWidth: 3, borderColor: '#0B0716',
  },
  pairUrl: {
    ...TextStyles.caption, fontFamily: F.mono, fontSize: 11,
    marginTop: Space.md, padding: Space.sm,
    borderWidth: 1, borderRadius: Radius.sm,
  },
});
