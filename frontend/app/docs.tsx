/**
 * Docs — in-app guide for connecting cameras, streaming modes, and features.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PaletteDark as C, FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';
import { CommandBackground } from '@/components/CommandBackground';
import { SectionEyebrow, ScreenTitle, ScreenSub } from '@/components/vx';
import MobileBackButton from '@/components/MobileBackButton';

function DocSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <Pressable style={styles.sectionHead} onPress={() => setOpen(!open)}>
        <MaterialCommunityIcons name={icon as any} size={20} color={C.primaryAccent} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={C.textMuted}
          style={{ marginLeft: 'auto' }}
        />
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.tip}>
      <MaterialCommunityIcons name="lightbulb-outline" size={14} color={C.warning} />
      <Text style={styles.tipText}>{children}</Text>
    </View>
  );
}

function Code({ children }: { children: string }) {
  return (
    <View style={styles.codeBlock}>
      <Text style={styles.codeText}>{children}</Text>
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.para}>{children}</Text>;
}

export default function DocsScreen() {
  return (
    <View style={styles.root} testID="docs-screen">
      <CommandBackground />
      <MobileBackButton />
      <ScrollView contentContainerStyle={styles.pad}>
        <SectionEyebrow>Guides &amp; reference</SectionEyebrow>
        <ScreenTitle>Camera Connection Docs</ScreenTitle>
        <ScreenSub>RTSP, phone cameras, streaming modes, face detection, and troubleshooting.</ScreenSub>

        <DocSection title="1. RTSP / IP Camera" icon="cctv">
          <P>Connect a physical CCTV camera or NVR that supports RTSP. The camera must be on the same LAN as the backend server.</P>
          <Text style={styles.subHead}>Common RTSP URL formats</Text>
          <Code>rtsp://username:password@192.168.1.100:554/Streaming/Channels/101</Code>
          <P>Hikvision: /Streaming/Channels/101 (main) or /102 (sub)</P>
          <P>Dahua: /cam/realmonitor?channel=1&amp;subtype=0</P>
          <P>Generic ONVIF: /onvif1</P>

          <Text style={styles.subHead}>Steps</Text>
          <P>1. Dashboard → Cameras → &quot;Add camera&quot;</P>
          <P>2. Enter a name and paste the RTSP URL</P>
          <P>3. Click &quot;Add node&quot;</P>
          <P>4. Go to Live Monitoring → start the stream</P>

          <Text style={styles.subHead}>Quality</Text>
          <P>Switch between 480p, 720p, and 1080p from the stream toolbar. Higher quality uses more CPU and bandwidth.</P>

          <Text style={styles.subHead}>Direct ffmpeg test</Text>
          <Code>ffmpeg -rtsp_transport tcp -i "rtsp://user:pass@192.168.x.x:554/stream" -frames:v 1 -f null -</Code>

          <Tip>
            &quot;No signal&quot; or black screen? The camera must be reachable from the backend server, not just your browser. Try ping the camera IP from the server.
          </Tip>
        </DocSection>

        <DocSection title="2. Phone Camera (Wireless)" icon="cellphone-link">
          <P>Turn any phone or tablet into a wireless camera. Frames stream over WebSocket at ~6 fps.</P>

          <Text style={styles.subHead}>Prerequisites</Text>
          <P>• Phone and computer on the same WiFi</P>
          <P>• Phone has a modern browser (Chrome/Safari)</P>
          <P>• Backend running on 0.0.0.0:8000</P>

          <Text style={styles.subHead}>Find your LAN IP</Text>
          <P><Text style={styles.bold}>macOS:</Text></P>
          <Code>ipconfig getifaddr en0</Code>
          <P><Text style={styles.bold}>Linux:</Text></P>
          <Code>hostname -I | awk '{print $1}'</Code>
          <P><Text style={styles.bold}>Windows:</Text></P>
          <Code>ipconfig  (look for IPv4 Address)</Code>
          <P>Your frontend URL is: http://&lt;IP&gt;:8081 (Expo dev) or your production domain.</P>

          <Text style={styles.subHead}>Steps</Text>
          <P>1. Dashboard → Cameras → &quot;Wireless&quot;</P>
          <P>2. Enter a camera name</P>
          <P>3. <Text style={{ color: C.warning }}>IMPORTANT:</Text> Set the App URL to your LAN IP (not localhost!)</P>
          <P>4. Click &quot;Create + show QR&quot;</P>
          <P>5. Scan the QR with your phone</P>
          <P>6. Tap &quot;Start camera&quot; → allow camera permission</P>

          <Text style={styles.subHead}>Environment variables for production</Text>
          <Code>PUBLIC_FRONTEND_URL=https://yourapp.com</Code>
          <Code>EXPO_PUBLIC_API_URL=https://yourapi.com</Code>

          <Tip>
            If the QR code doesn&apos;t work: make sure the App URL uses your LAN IP (e.g. 192.168.1.5), not localhost. Your phone can&apos;t access localhost on your computer.
          </Tip>
        </DocSection>

        <DocSection title="3. Streaming Modes" icon="video-outline">
          <P>Visionaryx supports three streaming modes, auto-selected based on what&apos;s available.</P>

          <View style={styles.tableRow}>
            <Text style={styles.tableLbl}>MJPEG</Text>
            <Text style={styles.tableDesc}>Server captures RTSP → draws detection overlay → streams JPEG frames. Best for face detection overlays.</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLbl}>HLS</Text>
            <Text style={styles.tableDesc}>FFmpeg transcodes RTSP to HLS segments. Best for Safari/iOS and firewall compatibility.</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLbl}>WebRTC</Text>
            <Text style={styles.tableDesc}>MediaMTX relays RTSP via WebRTC. Lowest latency. Requires MediaMTX configured.</Text>
          </View>

          <Tip>
            MJPEG is the safest fallback that works everywhere. HLS requires ffmpeg installed. WebRTC requires MediaMTX.
          </Tip>
        </DocSection>

        <DocSection title="4. Face Detection Overlay" icon="face-recognition">
          <P>Face detection runs server-side on the MJPEG capture thread.</P>

          <View style={styles.tagRow}>
            <View style={[styles.tag, { backgroundColor: 'rgba(0,255,0,0.15)' }]}>
              <Text style={[styles.tagText, { color: C.success }]}>Green box</Text>
            </View>
            <Text style={styles.tagLabel}>Known face (matched against enrolled users)</Text>
          </View>
          <View style={styles.tagRow}>
            <View style={[styles.tag, { backgroundColor: 'rgba(255,0,0,0.15)' }]}>
              <Text style={[styles.tagText, { color: C.danger }]}>Red box</Text>
            </View>
            <Text style={styles.tagLabel}>Unknown face</Text>
          </View>
          <View style={styles.tagRow}>
            <View style={[styles.tag, { backgroundColor: 'rgba(255,128,0,0.15)' }]}>
              <Text style={[styles.tagText, { color: '#FF8C00' }]}>Orange box</Text>
            </View>
            <Text style={styles.tagLabel}>Detected object (YOLO)</Text>
          </View>

          <Text style={styles.subHead}>Enable / disable</Text>
          <Code>STREAM_ENABLE_AI_OVERLAY=true    (face detection, default: on)</Code>
          <Code>STREAM_ENABLE_YOLO_OVERLAY=true  (object detection, default: off on macOS)</Code>

          <Tip>
            On macOS, live detection uses OpenCV Haar cascade (no InsightFace in capture threads to avoid crashes). On Linux, it uses InsightFace for better accuracy.
          </Tip>
        </DocSection>

        <DocSection title="5. Troubleshooting" icon="wrench-outline">
          <Text style={styles.subHead}>Stream lagging</Text>
          <P>• Reduce quality from 1080p to 720p or 480p</P>
          <P>• Ensure backend and camera are on same LAN</P>
          <P>• Check CPU usage — face detection on every 5th frame</P>
          <P>• Restart the stream if it has been running for a long time</P>

          <Text style={styles.subHead}>QR code not working</Text>
          <P>• Use LAN IP, not localhost, in the App URL field</P>
          <P>• Phone and computer must be on the same WiFi</P>
          <P>• Check firewall allows port 8081 (frontend) and 8000 (backend)</P>
          <P>• iOS: Settings → Privacy → Local Network → enable for browser/Expo Go</P>

          <Text style={styles.subHead}>Camera shows &quot;No signal&quot;</Text>
          <P>• Verify RTSP URL is correct — test with ffmpeg or VLC</P>
          <P>• Camera must be reachable from the backend server (not just browser)</P>
          <P>• Use TCP transport: set RTSP_CAPTURE_BACKEND=ffmpeg in .env</P>
          <P>• Docker deployments: use --network host or a reachable IP</P>

          <Text style={styles.subHead}>Face detection not showing boxes</Text>
          <P>• Check STREAM_ENABLE_AI_OVERLAY=true in .env</P>
          <P>• On macOS, only OpenCV Haar is used for live streams (all faces show as Unknown)</P>
          <P>• For embeddings + matching on macOS, set FACE_DETECTION_BACKEND=insightface (may crash)</P>
          <P>• Check backend logs for detection overlay errors</P>
        </DocSection>

        <DocSection title="6. Test / Demo Cameras" icon="test-tube">
          <P>Use test cameras for development without physical hardware.</P>
          <P>Add a camera with RTSP URL: <Text style={styles.bold}>test://demo</Text></P>
          <P>The system generates animated test patterns. Face detection still runs but won&apos;t find real faces.</P>
        </DocSection>

        <View style={styles.footer}>
          <MaterialCommunityIcons name="shield-check" size={16} color={C.textFaint} />
          <Text style={styles.footerText}>Visionaryx Docs · Keep this reference handy</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  pad: { padding: Space.lg, paddingBottom: 120, maxWidth: 800, width: '100%', alignSelf: 'center' },

  section: {
    marginTop: Space.md,
    backgroundColor: C.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
  },
  sectionTitle: { ...TextStyles.h4, color: C.text, flex: 1 },
  sectionBody: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
    gap: Space.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: Space.md,
  },

  para: { ...TextStyles.body, color: C.textMuted, lineHeight: 22 },
  subHead: { ...TextStyles.label, color: C.primaryAccent, fontSize: 10, marginTop: Space.sm, marginBottom: Space.xs },
  bold: { fontFamily: F.bodySemibold, color: C.text },

  codeBlock: {
    backgroundColor: C.surface3,
    borderRadius: Radius.sm,
    padding: Space.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  codeText: {
    ...TextStyles.caption,
    fontFamily: F.mono,
    color: C.cyan,
    fontSize: 12,
  },

  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs,
    backgroundColor: 'rgba(255,182,107,0.08)',
    borderRadius: Radius.sm,
    padding: Space.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,182,107,0.2)',
    marginTop: Space.xs,
  },
  tipText: { ...TextStyles.caption, color: C.warning, flex: 1, lineHeight: 18 },

  tableRow: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  tableLbl: { ...TextStyles.label, color: C.primaryAccent, width: 72, fontSize: 10 },
  tableDesc: { ...TextStyles.caption, color: C.textMuted, flex: 1, lineHeight: 18 },

  tagRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  tagText: { ...TextStyles.label, fontSize: 9 },
  tagLabel: { ...TextStyles.caption, color: C.textMuted },

  footer: {
    marginTop: Space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    opacity: 0.5,
  },
  footerText: { ...TextStyles.caption, color: C.textFaint, fontFamily: F.mono },
});

