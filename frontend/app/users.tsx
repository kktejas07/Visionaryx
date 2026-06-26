/**
 * User management — admin-only. MVVM via `useUsersViewModel`.
 */
import { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useUsersViewModel, type UserItem } from '@/viewmodels';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, ScreenSub, VxButton, VxInput, ErrorBanner } from '@/components/vx';

const ROLES = [
  { value: 'admin', label: 'Admin', desc: 'Full system access' },
  { value: 'operator', label: 'Operator', desc: 'Camera & detection access' },
  { value: 'enrollee', label: 'Enrollee', desc: 'Face enrollment only' },
];

export default function UsersScreen() {
  const vm = useUsersViewModel();
  const { user: currentUser } = useAuth();
  const isAdmin = isAdminRole(currentUser?.role);

  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [roleFor, setRoleFor] = useState<UserItem | null>(null);

  const closeMenu = () => { setMenuFor(null); setMenuPos(null); };

  const openMenu = (id: string, e: any) => {
    if (menuFor === id) { closeMenu(); return; }
    setMenuPos({ top: e.nativeEvent.pageY, left: e.nativeEvent.pageX - 200 });
    setMenuFor(id);
  };

  const onAdd = async () => {
    if (!newEmail.trim() || newPwd.length < 8) {
      Alert.alert('Validation', 'Enter email and a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await vm.add({ email: newEmail.trim(), password: newPwd, role: newRole, name: newName.trim() || undefined });
      setAddOpen(false);
      setNewEmail(''); setNewName(''); setNewPwd(''); setNewRole('operator');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (u: UserItem) => {
    setMenuFor(null);
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      if (window.confirm(`Remove ${u.email}?`)) {
        vm.remove(u.id).catch((e) => Alert.alert('Error', e?.message));
      }
      return;
    }
    Alert.alert('Delete user', `Remove ${u.email}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => vm.remove(u.id) },
    ]);
  };

  const onSendLink = async (u: UserItem) => {
    setMenuFor(null);
    try {
      const r = await vm.sendEnrollLink(u.id);
      Alert.alert('Enrollment link generated', `${u.email}\n\n${r.enroll_url || ''}`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  };

  if (!isAdmin) {
    return (
      <View style={styles.root}>
        <CommandBackground />
        <View style={styles.pad}>
          <SectionEyebrow>Access</SectionEyebrow>
          <ScreenTitle>Admin only</ScreenTitle>
          <ScreenSub>User management is restricted to administrators.</ScreenSub>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="users-screen">
      <CommandBackground />
      <FlatList
        data={vm.filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={vm.loading} onRefresh={vm.refresh} tintColor={C.primaryAccent} />}
        ListHeaderComponent={
          <View>
            <SectionEyebrow>Directory</SectionEyebrow>
            <ScreenTitle>User management</ScreenTitle>
            <ScreenSub>Operators, enrollees, and biometric enrollment status.</ScreenSub>

            <View style={styles.searchRow}>
              <View style={styles.searchWrap}>
                <MaterialCommunityIcons name="magnify" size={16} color={C.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={vm.query}
                  onChangeText={vm.setQuery}
                  placeholder="Search name or email"
                  placeholderTextColor={C.textFaint}
                  testID="users-search"
                />
              </View>
              <VxButton
                label="Add user"
                icon={<MaterialCommunityIcons name="plus" size={14} color="#fff" />}
                onPress={() => setAddOpen(true)}
                testID="add-user-btn"
              />
            </View>

            <View style={styles.kpiRow}>
              <KpiTile label="ENROLLED" value={vm.enrolledCount} color={C.cyan} />
              <KpiTile label="PENDING" value={vm.pendingCount} color={C.warning} />
              <KpiTile label="ACTIVE" value={vm.activeCount} color={C.primaryAccent} />
            </View>
            <ErrorBanner message={vm.error} />
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Space.sm }} />}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`user-row-${item.id}`}>
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>{(item.name || item.email).charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>{item.name || item.email}</Text>
              <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
            </View>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{(item.role || 'operator').toUpperCase()}</Text>
            </View>
            <Pressable
              onPress={(e) => openMenu(item.id, e)}
              hitSlop={6}
              style={styles.menuBtn}
              testID={`user-menu-${item.id}`}
            >
              <MaterialCommunityIcons name="dots-vertical" size={18} color={C.textMuted} />
            </Pressable>

            {/* single menu overlay at root level */}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{vm.loading ? 'Loading…' : 'No users yet.'}</Text>
        }
      />

      {menuFor && menuPos ? (
        <View style={styles.menuOverlayScrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <View style={[styles.menu, { position: 'absolute', top: menuPos.top + 4, left: Math.max(4, menuPos.left - 200) }]} testID={`user-menu-open-${menuFor}`}>
            {vm.filtered.find((i) => i.id === menuFor) ? (
              <>
                <Pressable style={styles.menuItem} onPress={() => {
                  const u = vm.filtered.find((i) => i.id === menuFor);
                  if (u) onSendLink(u);
                }}>
                  <MaterialCommunityIcons name="email-outline" size={16} color={C.primaryAccent} />
                  <Text style={styles.menuLabel}>Send enrollment link</Text>
                </Pressable>
                <Pressable style={styles.menuItem} onPress={() => {
                  const u = vm.filtered.find((i) => i.id === menuFor);
                  if (u) { setMenuFor(null); setMenuPos(null); setRoleFor(u); }
                }}>
                  <MaterialCommunityIcons name="account-cog" size={16} color={C.primaryAccent} />
                  <Text style={styles.menuLabel}>Change role</Text>
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable style={styles.menuItem} onPress={() => {
                  const u = vm.filtered.find((i) => i.id === menuFor);
                  if (u) onDelete(u);
                }}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={C.danger} />
                  <Text style={[styles.menuLabel, { color: C.danger }]}>Delete</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      ) : null}
      {/* Add modal */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.scrim} testID="add-user-modal">
          <View style={styles.modal}>
            <SectionEyebrow>Provision</SectionEyebrow>
            <Text style={styles.modalTitle}>Register operator</Text>
            <View style={{ gap: Space.md, marginTop: Space.lg }}>
              <VxInput label="Email" autoCapitalize="none" keyboardType="email-address" value={newEmail} onChangeText={setNewEmail} placeholder="name@company.com" testID="new-user-email" />
              <VxInput label="Name" value={newName} onChangeText={setNewName} placeholder="Optional" testID="new-user-name" />
              <VxInput label="Initial password" secureTextEntry value={newPwd} onChangeText={setNewPwd} placeholder="≥ 8 characters" testID="new-user-password" />
              <Text style={[styles.label]}>ROLE</Text>
              <View style={styles.roleSelector}>
                {ROLES.map((r) => {
                  const active = newRole === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      style={[styles.roleSelect, active && styles.roleSelectActive]}
                      onPress={() => setNewRole(r.value)}
                      testID={`role-${r.value}`}
                    >
                      <Text style={[styles.roleSelectText, active && { color: '#fff' }]}>{r.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.modalActions}>
              <VxButton label="Cancel" variant="secondary" onPress={() => setAddOpen(false)} />
              <VxButton label="Authorize" onPress={onAdd} busy={busy} testID="confirm-add-user" />
            </View>
          </View>
        </View>
      </Modal>

      {/* Role-edit modal */}
      <Modal visible={!!roleFor} transparent animationType="fade" onRequestClose={() => setRoleFor(null)}>
        <View style={styles.scrim}>
          <View style={styles.modal}>
            <SectionEyebrow>Permissions</SectionEyebrow>
            <Text style={styles.modalTitle}>Change role</Text>
            <Text style={styles.modalSub}>{roleFor?.email}</Text>
            <View style={{ gap: Space.sm, marginTop: Space.md }}>
              {ROLES.map((r) => {
                const active = roleFor?.role === r.value;
                return (
                  <Pressable
                    key={r.value}
                    style={[styles.roleCard, active && styles.roleCardActive]}
                    onPress={async () => {
                      if (!roleFor) return;
                      try { await vm.updateRole(roleFor.id, r.value); setRoleFor(null); }
                      catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed'); }
                    }}
                    testID={`role-card-${r.value}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roleCardLabel}>{r.label}</Text>
                      <Text style={styles.roleCardDesc}>{r.desc}</Text>
                    </View>
                    {active ? <MaterialCommunityIcons name="check-circle" size={20} color={C.primaryAccent} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <VxButton label="Close" variant="secondary" onPress={() => setRoleFor(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function KpiTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.kpiTile, { borderColor: color + '55' }]}>
      <Text style={[styles.kpiLabel, { color: C.textFaint }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value.toString().padStart(2, '0')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 100, maxWidth: 1200, width: '100%', alignSelf: 'center' },

  searchRow: { flexDirection: 'row', gap: Space.sm, alignItems: 'center', marginTop: Space.lg },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.sm,
    backgroundColor: C.surface, borderRadius: Radius.sm, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: Space.md, paddingVertical: 4,
  },
  searchInput: { flex: 1, color: C.text, fontFamily: F.body, fontSize: 14, paddingVertical: 10 },

  kpiRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.md, marginBottom: Space.md },
  kpiTile: { flex: 1, backgroundColor: C.surface, borderRadius: Radius.md, padding: Space.md, borderWidth: 1 },
  kpiLabel: { ...TextStyles.label, fontSize: 9 },
  kpiValue: { ...TextStyles.dataLarge, fontSize: 28, marginTop: 2 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: Space.md,
    backgroundColor: C.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: C.border,
    padding: Space.md,
    position: 'relative',
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontFamily: F.heading, fontSize: 14 },
  userName: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  userEmail: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, marginTop: 2 },
  rolePill: { backgroundColor: C.primaryFaint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm },
  roleText: { ...TextStyles.label, color: C.primaryAccent, fontSize: 9, letterSpacing: 1.2 },
  menuBtn: { padding: 6 },
  menuOverlayScrim: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 999,
  },
  menu: {
    backgroundColor: C.surface2, borderRadius: Radius.md,
    borderWidth: 1, borderColor: C.border,
    padding: 6, minWidth: 220,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, padding: Space.sm, borderRadius: Radius.sm },
  menuLabel: { ...TextStyles.bodySmall, color: C.text },
  menuDivider: { height: 1, backgroundColor: C.border, marginVertical: 4 },

  empty: { ...TextStyles.body, color: C.textMuted, textAlign: 'center', padding: Space.xxl },

  // Modals
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: Space.lg },
  modal: { backgroundColor: C.surface, borderRadius: Radius.lg, padding: Space.lg, maxWidth: 520, width: '100%', alignSelf: 'center', borderWidth: 1, borderColor: C.border },
  modalTitle: { ...TextStyles.h3, color: C.text, marginTop: Space.sm },
  modalSub: { ...TextStyles.bodySmall, color: C.textMuted, marginTop: 4 },
  modalActions: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, justifyContent: 'flex-end' },
  label: { ...TextStyles.label, color: C.textMuted, marginTop: Space.xs },

  roleSelector: { flexDirection: 'row', gap: Space.sm },
  roleSelect: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, alignItems: 'center', backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  roleSelectActive: { backgroundColor: C.primary, borderColor: C.primary },
  roleSelectText: { ...TextStyles.label, color: C.textMuted, fontSize: 10 },

  roleCard: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.md, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border },
  roleCardActive: { borderColor: C.primary, backgroundColor: C.primaryFaint },
  roleCardLabel: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  roleCardDesc: { ...TextStyles.caption, color: C.textMuted, marginTop: 2 },
});
