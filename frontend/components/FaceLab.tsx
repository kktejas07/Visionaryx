/**
 * FaceLab — live webcam + backend face detection / matching demo.
 *
 * On WEB only:
 *   1. Requests the user's webcam via `getUserMedia`
 *   2. Captures a JPEG frame ~every 600 ms into an offscreen canvas
 *   3. POSTs to `/api/v1/face/match`
 *   4. Draws bounding boxes + name/confidence labels onto the overlay canvas
 *
 * Smoothness:
 *   - Skips a request if the previous one is still in flight (prevents queue)
 *   - Bounding boxes use linear interpolation between detections so they
 *     don't "snap" between frames
 *
 * On native this renders a "web-only" placeholder card.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useColors } from '@/contexts/ThemeContext';
import { getStoredToken } from '@/lib/api';
import { getApiBase } from '@/lib/config';
import { FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';

interface Match {
  bbox: { x: number; y: number; w: number; h: number };
  det_score: number;
  status: 'known' | 'unknown';
  match: { user_id: string; email: string; name?: string; score: number } | null;
}

export function FaceLab() {
  const colors = useColors();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const captureRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ faces: 0, fps: 0, enrolled: 0, latencyMs: 0 });

  const matchesRef = useRef<Match[]>([]);
  const interpRef = useRef<Match[]>([]); // smoothed for drawing
  const unknownStreakRef = useRef<number>(0);
  const lastAlertAtRef = useRef<number>(0);

  // ---- camera lifecycle ----
  const start = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not access webcam');
    }
  }, []);

  const stop = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setRunning(false);
    matchesRef.current = [];
    interpRef.current = [];
  }, []);

  useEffect(() => () => stop(), [stop]);

  // ---- detection loop ----
  useEffect(() => {
    if (!running || Platform.OS !== 'web') return;
    let inFlight = false;
    let stopped = false;
    let lastTs = performance.now();

    const tick = async () => {
      if (stopped) return;
      if (!inFlight && videoRef.current && videoRef.current.readyState >= 2) {
        const vid = videoRef.current;
        let cap = captureRef.current;
        if (!cap) {
          cap = document.createElement('canvas');
          captureRef.current = cap;
        }
        cap.width = 320; cap.height = Math.round(320 * (vid.videoHeight / vid.videoWidth || 0.75));
        const ctx = cap.getContext('2d');
        if (ctx) {
          ctx.drawImage(vid, 0, 0, cap.width, cap.height);
          const dataUrl = cap.toDataURL('image/jpeg', 0.7);
          inFlight = true;
          const t0 = performance.now();
          try {
            const token = await getStoredToken();
            const res = await fetch(`${getApiBase()}/api/v1/face/match`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ image: dataUrl }),
            });
            if (res.ok) {
              const data = await res.json();
              matchesRef.current = data.matches ?? [];
              const now = performance.now();
              setStats((s) => ({
                faces: data.faces ?? 0,
                fps: Math.round(1000 / Math.max(80, now - lastTs)),
                enrolled: data.enrolled_count ?? s.enrolled,
                latencyMs: Math.round(now - t0),
              }));
              lastTs = now;

              // Unknown-face alert: emit once we see >=3 consecutive frames
              // with at least one unknown face, and at most one alert per 30s.
              const hasUnknown = (data.matches ?? []).some((m: Match) => m.status === 'unknown');
              if (hasUnknown) {
                unknownStreakRef.current += 1;
              } else {
                unknownStreakRef.current = 0;
              }
              if (unknownStreakRef.current >= 3 && Date.now() - lastAlertAtRef.current > 30000) {
                lastAlertAtRef.current = Date.now();
                const topUnknown = (data.matches ?? []).find((m: Match) => m.status === 'unknown');
                try {
                  await fetch(`${getApiBase()}/api/v1/face/alerts/unknown-face`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                      camera_name: 'Webcam · FaceLab',
                      det_score: topUnknown?.det_score ?? 0,
                      consecutive_frames: unknownStreakRef.current,
                    }),
                  });
                  unknownStreakRef.current = 0; // reset after firing
                } catch {/* swallow */}
              }
            } else if (res.status === 503) {
              setError('Face model warming up… first run can take ~3 s.');
            }
          } catch (e) {
            // Don't tear down on transient errors.
          } finally {
            inFlight = false;
          }
        }
      }
      setTimeout(tick, 500);
    };
    void tick();
    return () => { stopped = true; };
  }, [running]);

  // ---- smooth interpolation + draw loop ----
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const draw = () => {
      const canvas = overlayRef.current;
      const vid = videoRef.current;
      if (canvas && vid) {
        if (canvas.width !== vid.clientWidth) canvas.width = vid.clientWidth;
        if (canvas.height !== vid.clientHeight) canvas.height = vid.clientHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Smoothly interpolate from interpRef → matchesRef for non-jumpy bboxes.
          const target = matchesRef.current;
          const prev = interpRef.current;
          const next: Match[] = [];
          for (let i = 0; i < target.length; i++) {
            const t = target[i];
            const p = prev[i];
            if (p) {
              next.push({
                ...t,
                bbox: {
                  x: p.bbox.x + (t.bbox.x - p.bbox.x) * 0.35,
                  y: p.bbox.y + (t.bbox.y - p.bbox.y) * 0.35,
                  w: p.bbox.w + (t.bbox.w - p.bbox.w) * 0.35,
                  h: p.bbox.h + (t.bbox.h - p.bbox.h) * 0.35,
                },
              });
            } else next.push(t);
          }
          interpRef.current = next;

          for (const m of next) {
            const x = m.bbox.x * canvas.width;
            const y = m.bbox.y * canvas.height;
            const w = m.bbox.w * canvas.width;
            const h = m.bbox.h * canvas.height;
            const known = m.status === 'known';
            const color = known ? '#06B6D4' : '#FFB4AB';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            // Corner brackets — more "tracker" looking than a full box.
            const c = Math.min(18, w / 4);
            ctx.beginPath();
            ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
            ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
            ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h);
            ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c);
            ctx.stroke();
            // Faint full box overlay
            ctx.strokeStyle = color + '55';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
            // Label
            const label = known
              ? `${m.match?.name || m.match?.email || 'KNOWN'} · ${(m.match!.score * 100).toFixed(0)}%`
              : `UNKNOWN · ${(m.det_score * 100).toFixed(0)}%`;
            ctx.font = '11px "JetBrains Mono", monospace';
            const tw = ctx.measureText(label).width + 10;
            ctx.fillStyle = color;
            ctx.fillRect(x, Math.max(0, y - 16), tw, 16);
            ctx.fillStyle = '#0a0a14';
            ctx.fillText(label, x + 5, Math.max(11, y - 4));
          }
        }
      }
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Face Lab</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Live webcam face detection works on the web build. Mobile preview is coming with the
          native CoreML / NNAPI bridge.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="face-lab">
      <View style={styles.head}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primaryAccent }]}>FACE LAB · INSIGHTFACE</Text>
          <Text style={[styles.title, { color: colors.text }]}>Real-time face recognition</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Webcam → InsightFace `buffalo_sc` → cosine match against enrolled operators.
          </Text>
        </View>
        {running ? (
          <Pressable
            onPress={stop}
            style={[styles.btn, { borderColor: colors.danger, backgroundColor: colors.dangerFaint }]}
            testID="facelab-stop"
          >
            <MaterialCommunityIcons name="stop" size={12} color={colors.danger} />
            <Text style={[styles.btnText, { color: colors.danger }]}>STOP</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={start}
            style={[styles.btn, { borderColor: colors.primary, backgroundColor: colors.primaryFaint }]}
            testID="facelab-start"
          >
            <MaterialCommunityIcons name="camera" size={12} color={colors.primary} />
            <Text style={[styles.btnText, { color: colors.primary }]}>START WEBCAM</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.frame, { borderColor: colors.border, backgroundColor: '#000' }]}>
        {/* @ts-expect-error — DOM element on web */}
        <video
          ref={videoRef as any}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }}
        />
        {/* @ts-expect-error — DOM element on web */}
        <canvas
          ref={overlayRef as any}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', transform: 'scaleX(-1)',
          }}
        />
        {!running ? (
          <View style={styles.frameEmpty}>
            <MaterialCommunityIcons name="face-recognition" size={32} color={colors.primaryAccent} />
            <Text style={[styles.frameEmptyText, { color: colors.textMuted }]}>
              Click "START WEBCAM" to begin live face detection
            </Text>
          </View>
        ) : null}
      </View>

      {error ? (
        <Text style={[styles.err, { color: colors.danger }]}>{error}</Text>
      ) : null}

      <View style={styles.statsRow}>
        <Stat lbl="FACES" val={String(stats.faces)} color={colors.text} />
        <Stat lbl="LATENCY" val={`${stats.latencyMs}ms`} color={colors.cyan} />
        <Stat lbl="ENROLLED" val={String(stats.enrolled)} color={colors.electricViolet} />
        <Stat lbl="STATUS" val={running ? 'LIVE' : 'IDLE'} color={running ? colors.success : colors.textMuted} />
      </View>
    </View>
  );
}

function Stat({ lbl, val, color }: { lbl: string; val: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.surfaceLow }]}>
      <Text style={[styles.statLbl, { color: colors.textFaint }]}>{lbl}</Text>
      <Text style={[styles.statVal, { color }]}>{val}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Space.lg,
    gap: Space.md,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Space.md, flexWrap: 'wrap' },
  eyebrow: { ...TextStyles.label, fontSize: 10 },
  title: { ...TextStyles.h3, marginTop: 2 },
  sub: { ...TextStyles.bodySmall, marginTop: 4, maxWidth: 540 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1,
  },
  btnText: { ...TextStyles.label, fontSize: 10, letterSpacing: 1.2 },
  frame: {
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    maxHeight: 480,
  },
  frameEmpty: {
    position: 'absolute', inset: 0,
    alignItems: 'center', justifyContent: 'center', gap: Space.sm,
  },
  frameEmptyText: { ...TextStyles.bodySmall, maxWidth: 320, textAlign: 'center' },
  err: { ...TextStyles.bodySmall, fontFamily: F.mono, fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  stat: {
    flex: 1, minWidth: 100,
    borderRadius: Radius.sm, borderWidth: 1,
    paddingHorizontal: Space.md, paddingVertical: Space.sm,
  },
  statLbl: { ...TextStyles.label, fontSize: 9 },
  statVal: { ...TextStyles.h4, fontFamily: F.mono, marginTop: 2, fontSize: 18 },
});
