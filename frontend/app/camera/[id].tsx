import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getStoredToken, api } from '@/lib/api';
import { getApiBase } from '@/lib/config';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import MjpegStreamView from '@/components/MjpegStreamView';

type CameraDetails = {
  id: string;
  camera_name: string;
  kind?: 'rtsp' | 'phone';
  rtsp_url?: string;
  status?: string;
  pair_token?: string;
};

function buildMjpegUri(cam: CameraDetails, token: string): string {
  const base = getApiBase();
  const tq = encodeURIComponent(token);
  if (cam.kind === 'phone') {
    return `${base}/api/v1/cameras/${cam.id}/stream.mjpeg?token=${tq}`;
  }
  return `${base}/api/v1/stream/${cam.id}/mjpeg?token=${tq}`;
}

export default function CameraViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const [uri, setUri] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [cam, setCam] = useState<CameraDetails | null>(null);
  const [gearOpen, setGearOpen] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, details] = await Promise.all([
          getStoredToken(),
          api<CameraDetails>(`/api/v1/cameras/${id}`),
        ]);
        if (cancelled) return;
        setCam(details);
        if (t && details) {
          setToken(t);
          setUri(buildMjpegUri(details, t));
        }
      } catch (e) {
        console.error('Failed to load camera', e);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const captureSnapshot = async () => {
    if (!token || !cam) return;
    try {
      const frameUrl = `${getApiBase()}/api/v1/stream/${id}/frame?token=${encodeURIComponent(token)}`;
      const resp = await fetch(frameUrl);
      if (!resp.ok) throw new Error('Snapshot failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cam.camera_name.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      Alert.alert('Error', 'Failed to capture snapshot');
    }
  };

  const isWeb = typeof document !== 'undefined';

  return (
    <View style={[styles.root, { backgroundColor: C.surface }]}>
      <View style={styles.viewerContainer}>
        {!uri ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={C.primaryAccent} />
            <Text style={styles.loaderText}>Establishing Secure Connection...</Text>
          </View>
        ) : (
          <View style={styles.feedWrapper}>
            <MjpegStreamView uri={uri} style={styles.web} />
            <View style={styles.overlayTop}>
              <View style={styles.livePill}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <View style={styles.camNameTag}>
                <Text style={styles.camNameText}>{cam?.camera_name || 'FEED'}</Text>
              </View>
            </View>
            <View style={styles.overlayBottom}>
               <View style={styles.timeTag}>
                  <Text style={styles.timeText}>{new Date().toLocaleDateString()} · {new Date().toLocaleTimeString()}</Text>
               </View>
            </View>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
         <Pressable style={styles.controlBtn} onPress={() => router.replace('/(tabs)/cameras')}>
            <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
            <Text style={styles.controlText}>Back</Text>
         </Pressable>
         <View style={{flex: 1}} />
         <Pressable style={styles.recordBtn} onPress={captureSnapshot}>
            <View style={styles.recordInner} />
         </Pressable>
         <View style={{flex: 1}} />
         <Pressable style={styles.actionBtn} onPress={() => setGearOpen(true)}>
            <MaterialCommunityIcons name="cog-outline" size={24} color={C.textMuted} />
         </Pressable>
      </View>

      {/* Gear modal */}
      <Modal visible={gearOpen} transparent animationType="fade" onRequestClose={() => setGearOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setGearOpen(false)}>
          <View style={styles.gearSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.gearTitle}>Stream Settings</Text>

            <Pressable style={styles.gearRow} onPress={captureSnapshot}>
              <MaterialCommunityIcons name="camera" size={20} color={C.primaryAccent} />
              <Text style={styles.gearLabel}>Snapshot</Text>
              <Text style={styles.gearDesc}>Download current frame as JPEG</Text>
            </Pressable>

            <Pressable style={styles.gearRow}>
              <MaterialCommunityIcons name="record-circle" size={20} color="#d32f2f" />
              <Text style={styles.gearLabel}>Record</Text>
              <Text style={styles.gearDesc}>Start / stop video recording</Text>
            </Pressable>

            <View style={styles.gearDivider} />

            <Text style={styles.gearInfo}>Stream: MJPEG · 15 fps</Text>
            <Text style={styles.gearInfo}>Type: {cam?.kind === 'phone' ? 'Wireless' : 'RTSP'}</Text>

            <Pressable style={styles.gearClose} onPress={() => setGearOpen(false)}>
              <Text style={styles.gearCloseText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  viewerContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  loader: { alignItems: 'center', gap: 16 },
  loaderText: { color: C.textMuted, fontFamily: F.bodySemibold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  feedWrapper: { flex: 1, position: 'relative' },
  web: { flex: 1, backgroundColor: '#000' },
  overlayTop: { position: 'absolute', top: 20, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(211, 47, 47, 0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontFamily: F.bodySemibold, fontSize: 10, letterSpacing: 1 },
  camNameTag: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  camNameText: { color: C.primaryAccent, fontFamily: F.bodySemibold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  overlayBottom: { position: 'absolute', bottom: 20, left: 20 },
  timeTag: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  timeText: { color: 'rgba(255,255,255,0.7)', fontFamily: F.body, fontSize: 10, fontVariant: ['tabular-nums'] },
  controls: { height: 100, backgroundColor: C.surface2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  controlBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  controlText: { color: '#fff', fontFamily: F.bodySemibold, fontSize: 14 },
  recordBtn: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  recordInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#d32f2f' },
  actionBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  // Gear modal
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  gearSheet: { backgroundColor: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 40 },
  gearTitle: { fontFamily: F.heading, fontSize: 18, color: '#fff', marginBottom: 20 },
  gearRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  gearLabel: { fontFamily: F.bodySemibold, fontSize: 15, color: '#fff', flex: 1 },
  gearDesc: { fontFamily: F.body, fontSize: 12, color: C.textMuted },
  gearDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 8 },
  gearInfo: { fontFamily: F.mono, fontSize: 11, color: C.textMuted, marginTop: 4 },
  gearClose: { marginTop: 20, alignItems: 'center', paddingVertical: 12, borderRadius: 8, backgroundColor: C.surface2 },
  gearCloseText: { fontFamily: F.bodySemibold, fontSize: 15, color: C.primaryAccent },
});
