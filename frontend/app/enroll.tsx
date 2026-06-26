import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, Modal, TextInput, ActivityIndicator, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { getDashboardBase } from '@/lib/config';
import { Stitch, FontFamily } from '@/constants/stitchTheme';
import { useStitchTheme } from '@/hooks/useStitchTheme';
import { isAdminRole } from '@/lib/roles';

type User = {
  id: number;
  name: string;
  email: string;
  has_face_embedding: boolean;
};

type EnrollmentLink = {
  user_id: number;
  user_name: string;
  token: string;
  expires_at: string;
};

export default function EnrollScreen() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const T = useStitchTheme();
  const base = getDashboardBase();
  
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [generating, setGenerating] = useState(false);
  const [enrollmentLink, setEnrollmentLink] = useState<EnrollmentLink | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ items: User[] }>('/api/v1/users?limit=100&offset=0');
      setUsers(r.items?.filter(u => !u.has_face_embedding) || []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerateLink = async () => {
    if (!selectedUser) return;
    setGenerating(true);
    try {
      const r = await api<{ token: string; expires_in_hours: number; enroll_path: string }>(
        `/api/v1/users/${selectedUser.id}/enrollment-link`,
        { method: 'POST' }
      );
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + r.expires_in_hours);
      
      setEnrollmentLink({
        user_id: selectedUser.id,
        user_name: selectedUser.name,
        token: r.token,
        expires_at: expiresAt.toISOString(),
      });
    } catch (e) {
      Alert.alert('Error', 'Failed to generate enrollment link');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = () => {
    if (!enrollmentLink) return;
    const link = `${base}/enroll?token=${enrollmentLink.token}`;
    // Clipboard copy disabled - use share instead
    Alert.alert('Link', link);
  };

  const handleShareLink = async () => {
    if (!enrollmentLink) return;
    const link = `${base}/enroll?token=${enrollmentLink.token}`;
    try {
      await Share.share({
        message: `Complete your face enrollment for Visioryx: ${link}`,
        title: 'Visioryx Enrollment',
      });
    } catch {}
  };

  const handleClose = () => {
    setShowModal(false);
    setSelectedUser(null);
    setEnrollmentLink(null);
  };

  const formatExpiry = (iso: string) => {
    const date = new Date(iso);
    const hours = Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60));
    const minutes = Math.floor(((date.getTime() - Date.now()) % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const header = (
    <View style={styles.hero}>
      <MaterialCommunityIcons name="qrcode" size={48} color={Stitch.primary} style={{ alignSelf: 'center' }} />
      <Text style={[styles.title, { color: T.text }]}>QR Enrollment</Text>
      <Text style={[styles.subtitle, { color: T.textMuted }]}>
        Generate enrollment links for new users to register their face biometric.
      </Text>
      {isAdmin && (
        <Pressable style={styles.generateBtn} onPress={() => setShowModal(true)}>
          <LinearGradient
            colors={[Stitch.primary, Stitch.primaryContainer]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.generateBtnGradient}
          >
            <MaterialCommunityIcons name="plus" size={20} color={Stitch.onPrimary} />
            <Text style={styles.generateBtnText}>Generate Link</Text>
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );

  const pendingUsers = users.filter(u => !u.has_face_embedding);
  const enrolledUsers = users.filter(u => u.has_face_embedding);

  return (
    <View style={[styles.root, { backgroundColor: T.bg }]}>
      <FlatList
        data={isAdmin ? users : []}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        contentContainerStyle={[styles.pad, { paddingBottom: 32 }]}
        ListEmptyComponent={
          !isAdmin ? (
            <View style={styles.infoCard}>
              <MaterialCommunityIcons name="information-outline" size={24} color={Stitch.primary} />
              <Text style={[styles.infoText, { color: T.textMuted }]}>
                Face enrollment is managed by your administrator. Contact them to get an enrollment link.
              </Text>
            </View>
          ) : loading ? (
            <Text style={[styles.empty, { color: T.textMuted }]}>Loading…</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.userCard, { backgroundColor: T.card }]}>
            <View style={styles.userInfo}>
              <View style={[
                styles.avatar,
                { backgroundColor: item.has_face_embedding ? `${Stitch.secondary}22` : `${Stitch.tertiary}22` }
              ]}>
                <MaterialCommunityIcons
                  name={item.has_face_embedding ? 'check-circle' : 'account-clock'}
                  size={20}
                  color={item.has_face_embedding ? Stitch.secondary : Stitch.tertiary}
                />
              </View>
              <View style={styles.userDetails}>
                <Text style={[styles.userName, { color: T.text }]}>{item.name}</Text>
                <Text style={[styles.userEmail, { color: T.textMuted }]}>{item.email}</Text>
              </View>
            </View>
            <View style={[
              styles.statusBadge,
              { backgroundColor: item.has_face_embedding ? `${Stitch.secondary}22` : `${Stitch.tertiary}22` }
            ]}>
              <Text style={[styles.statusText, { color: item.has_face_embedding ? Stitch.secondary : Stitch.tertiary }]}>
                {item.has_face_embedding ? 'Enrolled' : 'Pending'}
              </Text>
            </View>
          </View>
        )}
      />

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: T.card }]}>
            <Text style={[styles.modalTitle, { color: T.text }]}>New User Enrollment</Text>
            <Text style={[styles.modalSub, { color: T.textMuted }]}>
              Select a user to generate an enrollment link. The link expires in 24 hours.
            </Text>

            {!enrollmentLink ? (
              <FlatList
                data={pendingUsers}
                keyExtractor={(item) => String(item.id)}
                style={styles.userList}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.selectUserCard,
                      selectedUser?.id === item.id && { borderColor: Stitch.primary, borderWidth: 2 }
                    ]}
                    onPress={() => setSelectedUser(item)}
                  >
                    <View style={styles.userInfo}>
                      <View style={[styles.avatar, { backgroundColor: `${Stitch.primary}22` }]}>
                        <MaterialCommunityIcons name="account" size={20} color={Stitch.primary} />
                      </View>
                      <View>
                        <Text style={[styles.userName, { color: T.text }]}>{item.name}</Text>
                        <Text style={[styles.userEmail, { color: T.textMuted }]}>{item.email}</Text>
                      </View>
                    </View>
                    {selectedUser?.id === item.id && (
                      <MaterialCommunityIcons name="check-circle" size={24} color={Stitch.primary} />
                    )}
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text style={[styles.empty, { color: T.textMuted, textAlign: 'center', padding: 20 }]}>
                    All users are enrolled
                  </Text>
                }
              />
            ) : (
              <View style={styles.linkResult}>
                <View style={[styles.qrPlaceholder, { backgroundColor: T.bg }]}>
                  <MaterialCommunityIcons name="qrcode" size={64} color={Stitch.primary} />
                </View>
                <Text style={[styles.linkUser, { color: T.text }]}>{enrollmentLink.user_name}</Text>
                <Text style={[styles.linkExpiry, { color: Stitch.tertiary }]}>
                  Expires in {formatExpiry(enrollmentLink.expires_at)}
                </Text>
                <View style={styles.linkActions}>
                  <Pressable style={[styles.linkBtn, { backgroundColor: T.bg }]} onPress={handleCopyLink}>
                    <MaterialCommunityIcons name="content-copy" size={20} color={Stitch.primary} />
                    <Text style={[styles.linkBtnText, { color: Stitch.primary }]}>Copy</Text>
                  </Pressable>
                  <Pressable style={[styles.linkBtn, { backgroundColor: Stitch.primary }]} onPress={handleShareLink}>
                    <MaterialCommunityIcons name="share-variant" size={20} color={Stitch.onPrimary} />
                    <Text style={[styles.linkBtnText, { color: Stitch.onPrimary }]}>Share</Text>
                  </Pressable>
                </View>
              </View>
            )}

            <View style={styles.modalActions}>
              <Pressable                   style={[styles.modalBtn, { backgroundColor: Stitch.surfaceContainerHigh }]} onPress={handleClose}>
                <Text style={[styles.modalBtnText, { color: T.text }]}>
                  {enrollmentLink ? 'Done' : 'Cancel'}
                </Text>
              </Pressable>
              {!enrollmentLink && (
                <Pressable
                  style={[
                    styles.modalBtn,
                    styles.modalBtnPrimary,
                    { backgroundColor: Stitch.primary, opacity: selectedUser ? 1 : 0.5 }
                  ]}
                  onPress={handleGenerateLink}
                  disabled={!selectedUser || generating}
                >
                  {generating ? (
                    <ActivityIndicator size="small" color={Stitch.onPrimary} />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: Stitch.onPrimary }]}>Generate</Text>
                  )}
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  title: {
    fontFamily: FontFamily.headlineBlack,
    fontSize: 24,
    marginTop: 16,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  generateBtn: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  generateBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  generateBtnText: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 15,
    color: Stitch.onPrimary,
  },
  pad: { padding: 16 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDetails: {},
  userName: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 15,
  },
  userEmail: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    fontFamily: FontFamily.body,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 20,
    backgroundColor: `${Stitch.primary}15`,
    borderRadius: 12,
  },
  infoText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontFamily: FontFamily.headlineBlack,
    fontSize: 22,
  },
  modalSub: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
  },
  userList: {
    maxHeight: 300,
  },
  selectUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  linkResult: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  qrPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  linkUser: {
    fontFamily: FontFamily.headline,
    fontSize: 18,
  },
  linkExpiry: {
    fontFamily: FontFamily.labelMedium,
    fontSize: 13,
    marginTop: 4,
  },
  linkActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  linkBtnText: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnPrimary: {},
  modalBtnText: {
    fontFamily: FontFamily.labelSemibold,
    fontSize: 15,
  },
});
