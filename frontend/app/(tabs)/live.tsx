/**
 * Live grid — multi-camera tiles with MJPEG previews.
 */
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useCamerasViewModel } from '@/viewmodels';
import type { CameraModel } from '@/viewmodels/models';
import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles, Breakpoint } from '@/constants/visionTheme';
import { useRealtimeConnected } from '@/contexts/RealtimeContext';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, ScreenSub, VxCard } from '@/components/vx';
import { FaceLab } from '@/components/FaceLab';
import { getStoredToken, streamMjpegUrl } from '@/lib/api';
import MjpegStreamView from '@/components/MjpegStreamView';

export default function LiveScreen() {
  const vm = useCamerasViewModel();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const connected = useRealtimeConnected();
  const [token, setToken] = useState<string | null>(null);
  const cols = width >= Breakpoint.wide ? 4 : width >= Breakpoint.desktop ? 3 : width >= Breakpoint.tablet ? 2 : 1;

  useEffect(() => {
    getStoredToken().then(setToken);
  }, []);

  return (
    <View style={styles.root} testID="live-screen">
      <CommandBackground />
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={<RefreshControl refreshing={vm.refreshing} onRefresh={vm.refresh} tintColor={C.primaryAccent} />}
      >
        <SectionEyebrow>Live · Streaming</SectionEyebrow>
        <ScreenTitle>Multi-camera grid</ScreenTitle>
        <ScreenSub>
          Real-time feeds from <Text style={styles.mono}>{vm.totalActive}</Text> active cameras.{' '}
          {vm.totalOffline > 0 ? (
            <Text style={[styles.mono, { color: C.warning }]}>
              {vm.totalOffline} offline.
            </Text>
          ) : null}
        </ScreenSub>

        <View style={styles.statRow}>
          <Pill icon="circle" color={connected ? C.cyan : C.warning} label={connected ? 'WS · LIVE' : 'WS · IDLE'} />
          <Pill icon="record-circle-outline" color={C.danger} label="REC · 24h" />
          <Pill icon="server-network" color={C.primaryAccent} label={`${vm.items.length} NODES`} />
        </View>

        <View style={[styles.grid, { gap: Space.md }]}>
          {vm.items.map((c) => (
            <View key={c.id} style={[styles.tileSlot, { flexBasis: `${100 / cols - 1}%`, minWidth: 240 }]}>
              <CameraTile cam={c} token={token} onPress={() => router.push(`/camera/${c.id}` as any)} />
            </View>
          ))}
          {vm.items.length === 0 && !vm.loading ? (
            <Text style={styles.empty}>No cameras configured yet. Add one from the Cameras tab.</Text>
          ) : null}
        </View>

        {/* Face Lab — real webcam + InsightFace pipeline (web only) */}
        <View style={{ marginTop: Space.xl }}>
          <FaceLab />
        </View>
      </ScrollView>
    </View>
  );
}

function CameraTile({ cam, token, onPress }: { cam: CameraModel; token: string | null; onPress: () => void }) {
  const online = cam.is_enabled && cam.status === 'active';
  const streamUri = token ? streamMjpegUrl(cam.id, token) : null;

  return (
    <Pressable
      style={[styles.tile, !online && styles.tileOffline]}
      onPress={onPress}
      testID={`camera-tile-${cam.id}`}
    >
      <View style={styles.tileBody}>
        {online && streamUri ? (
          <MjpegStreamView uri={streamUri} style={styles.streamPreview} />
        ) : (
          <View style={styles.offlineCenter}>
            <MaterialCommunityIcons name="video-off" size={26} color={C.textFaint} />
            <Text style={styles.offlineText}>OFFLINE</Text>
          </View>
        )}
        <View style={[styles.tick, styles.tickTL]} />
        <View style={[styles.tick, styles.tickTR]} />
        <View style={[styles.tick, styles.tickBL]} />
        <View style={[styles.tick, styles.tickBR]} />
        {online ? (
          <View style={styles.liveBadge} testID={`live-badge-${cam.id}`}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.tileMeta}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tileName} numberOfLines={1}>{cam.camera_name}</Text>
          <Text style={styles.tileUrl} numberOfLines={1}>{cam.rtsp_url}</Text>
        </View>
        <MaterialCommunityIcons name="arrow-top-right" size={16} color={C.textMuted} />
      </View>
    </Pressable>
  );
}

function Pill({ icon, color, label }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; label: string }) {
  return (
    <View style={[styles.pill, { borderColor: color + '55' }]}>
      <MaterialCommunityIcons name={icon} size={10} color={color} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 80, maxWidth: 1600, width: '100%', alignSelf: 'center' },
  mono: { fontFamily: F.mono, color: C.text },
  statRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.lg, marginBottom: Space.lg, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: Space.xs,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.sm, borderWidth: 1, backgroundColor: C.surface,
  },
  pillText: { ...TextStyles.label, fontSize: 9, letterSpacing: 1.4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  tileSlot: { flexGrow: 1 },
  tile: {
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  tileOffline: { opacity: 0.7 },
  tileBody: {
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
    overflow: 'hidden',
  },
  streamPreview: {
    flex: 1,
    backgroundColor: '#000',
  },
  offlineCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  offlineText: { ...TextStyles.label, color: C.textFaint, fontSize: 10 },
  tick: { position: 'absolute', width: 14, height: 14, borderColor: C.primaryAccent },
  tickTL: { top: 8, left: 8, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  tickTR: { top: 8, right: 8, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  tickBL: { bottom: 8, left: 8, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  tickBR: { bottom: 8, right: 8, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
  liveBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    borderRadius: Radius.sm,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { ...TextStyles.label, color: '#fff', fontSize: 9, letterSpacing: 1.2 },
  tileMeta: { flexDirection: 'row', alignItems: 'center', padding: Space.md, gap: Space.sm },
  tileName: { ...TextStyles.bodySmall, color: C.text, fontFamily: F.bodySemibold },
  tileUrl: { ...TextStyles.caption, color: C.textMuted, fontFamily: F.mono, marginTop: 2 },
  empty: { ...TextStyles.body, color: C.textMuted, padding: Space.xl, textAlign: 'center', flex: 1 },
});
