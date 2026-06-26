/**
 * Cameras CRUD list. MVVM via `useCamerasViewModel`.
 */
import { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useCamerasViewModel } from '@/viewmodels';
import type { CameraModel } from '@/viewmodels/models';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, ScreenSub, VxButton, VxInput, ErrorBanner } from '@/components/vx';

export default function CamerasScreen() {
  const vm = useCamerasViewModel();
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = isAdminRole(user?.role);
  const [addOpen, setAddOpen] = useState(false);
  const [editCam, setEditCam] = useState<CameraModel | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

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
          <RefreshControl refreshing={vm.refreshing} onRefresh={vm.refresh} tintColor={C.primaryAccent} />
        }
        ListHeaderComponent={
          <View>
            <SectionEyebrow>Inventory</SectionEyebrow>
            <ScreenTitle>Camera nodes</ScreenTitle>
            <ScreenSub>
              <Text style={styles.mono}>{vm.totalActive}</Text> online · <Text style={[styles.mono, { color: C.warning }]}>{vm.totalOffline}</Text> offline · <Text style={styles.mono}>{vm.items.length}</Text> total
            </ScreenSub>

            <View style={styles.searchRow}>
              <View style={styles.searchWrap}>
                <MaterialCommunityIcons name="magnify" size={16} color={C.textMuted} />
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
                <Pressable onPress={() => onRemove(item)} style={styles.actionBtn} hitSlop={6}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={C.danger} />
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {vm.loading ? 'Loading…' : 'No cameras configured.'}
          </Text>
        }
      />

      {/* Add modal */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.scrim} testID="add-camera-modal">
          <View style={styles.modal}>
            <SectionEyebrow>New node</SectionEyebrow>
            <Text style={styles.modalTitle}>Add camera</Text>
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
  mono: { fontFamily: F.mono, color: C.text },
  searchRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, marginBottom: Space.md, alignItems: 'center', flexWrap: 'wrap' },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.xs, minWidth: 200 },
  searchInput: { paddingLeft: Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: Space.md,
    gap: Space.md,
    overflow: 'hidden',
  },
  statusBlock: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.primaryFaint, alignItems: 'center', justifyContent: 'center' },
  rowName: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  rowUrl: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, marginTop: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: { padding: 6 },
  empty: { ...TextStyles.body, color: C.textMuted, padding: Space.xxl, textAlign: 'center' },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: Space.lg },
  modal: { backgroundColor: C.surface, borderRadius: Radius.lg, padding: Space.lg, maxWidth: 480, width: '100%', alignSelf: 'center', borderWidth: 1, borderColor: C.border },
  modalTitle: { ...TextStyles.h3, color: C.text, marginTop: Space.sm },
  modalActions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, justifyContent: 'flex-end' },
});
