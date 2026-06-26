import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Text, useWindowDimensions, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getStoredToken, streamMjpegUrl, api } from '@/lib/api';
import { Stitch, FontFamily } from '@/constants/stitchTheme';

type CameraDetails = {
  id: number;
  camera_name: string;
};

export default function CameraViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cameraId = Number(id);
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const [uri, setUri] = useState<string | null>(null);
  const [cam, setCam] = useState<CameraDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [token, details] = await Promise.all([
          getStoredToken(),
          api<CameraDetails>(`/api/v1/cameras/${cameraId}`)
        ]);
        if (cancelled) return;
        setCam(details);
        if (token) {
          setUri(streamMjpegUrl(cameraId, token));
        }
      } catch (e) {
        console.error('Failed to load camera', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cameraId]);

  return (
    <View style={[styles.root, { backgroundColor: Stitch.surface }]}>
      <View style={styles.viewerContainer}>
        {!uri ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={Stitch.primary} />
            <Text style={styles.loaderText}>Establishing Secure Connection...</Text>
          </View>
        ) : (
          <View style={styles.feedWrapper}>
            <WebView
              source={{ uri }}
              style={styles.web}
              scrollEnabled={false}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              originWhitelist={['*']}
            />
            {/* Surveillance Overlays */}
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
         <Pressable style={styles.controlBtn} onPress={() => router.back()}>
            <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
            <Text style={styles.controlText}>Back</Text>
         </Pressable>
         <View style={{flex: 1}} />
         <Pressable style={styles.recordBtn}>
            <View style={styles.recordInner} />
         </Pressable>
         <View style={{flex: 1}} />
         <Pressable style={styles.actionBtn}>
            <MaterialCommunityIcons name="cog-outline" size={24} color={Stitch.onSurfaceVariant} />
         </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
  },
  loader: {
    alignItems: 'center',
    gap: 16,
  },
  loaderText: {
    color: Stitch.onSurfaceVariant,
    fontFamily: FontFamily.labelSemibold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  feedWrapper: {
    flex: 1,
    position: 'relative',
  },
  web: { 
    flex: 1, 
    backgroundColor: '#000',
  },
  overlayTop: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(211, 47, 47, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontFamily: FontFamily.labelSemibold,
    fontSize: 10,
    letterSpacing: 1,
  },
  camNameTag: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  camNameText: {
    color: Stitch.primary,
    fontFamily: FontFamily.labelSemibold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  timeTag: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  timeText: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: FontFamily.body,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    height: 100,
    backgroundColor: Stitch.surfaceContainerLowest,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  controlText: {
    color: '#fff',
    fontFamily: FontFamily.labelSemibold,
    fontSize: 14,
  },
  recordBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#d32f2f',
  },
  actionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
