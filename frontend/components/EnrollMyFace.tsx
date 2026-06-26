/**
 * EnrollMyFace — webcam capture + POST /api/v1/face/enroll/me.
 *
 * Web-only. Captures a single frame from the user's webcam and uploads it
 * to the backend which extracts the InsightFace embedding and stores it
 * against the current user.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useColors } from '@/contexts/ThemeContext';
import { getStoredToken } from '@/lib/api';
import { getApiBase } from '@/lib/config';
import { FontFamily as F, Radius, Space, TextStyles } from '@/constants/visionTheme';

type Status = 'idle' | 'camera' | 'enrolling' | 'success' | 'error';

export function EnrollMyFace() {
  const colors = useColors();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [detScore, setDetScore] = useState<number | null>(null);

  const start = useCallback(async () => {
    setMessage(null);
    setDetScore(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus('camera');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not access webcam');
      setStatus('error');
    }
  }, []);

  const stop = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const enroll = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      setMessage('Camera not ready yet — wait a moment and try again.');
      return;
    }
    setStatus('enrolling');
    setMessage(null);
    const cap = document.createElement('canvas');
    cap.width = videoRef.current.videoWidth || 640;
    cap.height = videoRef.current.videoHeight || 480;
    const ctx = cap.getContext('2d');
    if (!ctx) {
      setStatus('error');
      setMessage('Browser canvas unavailable.');
      return;
    }
    ctx.drawImage(videoRef.current, 0, 0, cap.width, cap.height);
    const dataUrl = cap.toDataURL('image/jpeg', 0.85);
    try {
      const token = await getStoredToken();
      const res = await fetch(`${getApiBase()}/api/v1/face/enroll/me`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus('error');
        setMessage(data.detail || `Enrollment failed (${res.status})`);
        return;
      }
      setStatus('success');
      setDetScore(data.det_score ?? null);
      setMessage('Your face was enrolled successfully.');
      stop();
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Network error');
    }
  }, [stop]);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Face enrollment</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Webcam enrollment is available on the web build. Mobile enrollment uses the camera
          permissions flow — coming next.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="enroll-face-card">
      <View>
        <Text style={[styles.eyebrow, { color: colors.primaryAccent }]}>BIOMETRICS · INSIGHTFACE</Text>
        <Text style={[styles.title, { color: colors.text }]}>Enroll my face</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Capture a single front-facing frame from your webcam. We extract a 512-dim embedding
          and store it on your user record — used for live operator recognition in the Face Lab.
        </Text>
      </View>

      <View style={[styles.frame, { borderColor: colors.border }]}>
        {/* @ts-expect-error — DOM element on web */}
        <video
          ref={videoRef as any}
          autoPlay playsInline muted
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            display: 'block', transform: 'scaleX(-1)',
            background: '#000',
          }}
        />
        {status === 'idle' ? (
          <View style={styles.frameEmpty}>
            <MaterialCommunityIcons name="face-recognition" size={28} color={colors.primaryAccent} />
            <Text style={[styles.frameEmptyText, { color: colors.textMuted }]}>
              Webcam preview will appear here.
            </Text>
          </View>
        ) : null}
        {status === 'success' ? (
          <View style={[styles.frameOverlay, { backgroundColor: 'rgba(6,182,212,0.22)' }]}>
            <MaterialCommunityIcons name="check-decagram" size={40} color={colors.success} />
            <Text style={[styles.frameOverlayText, { color: colors.success }]}>ENROLLED</Text>
            {detScore != null ? (
              <Text style={[styles.frameOverlayMeta, { color: colors.text }]}>
                detection score · {(detScore * 100).toFixed(1)}%
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {message ? (
        <Text style={[styles.msg, { color: status === 'error' ? colors.danger : colors.success }]}>
          {message}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {status === 'idle' || status === 'error' ? (
          <Pressable
            onPress={start}
            style={[styles.btn, { backgroundColor: colors.primary }]}
            testID="enroll-start-btn"
          >
            <MaterialCommunityIcons name="camera" size={14} color="#fff" />
            <Text style={styles.btnText}>START WEBCAM</Text>
          </Pressable>
        ) : null}
        {status === 'camera' ? (
          <>
            <Pressable
              onPress={() => { stop(); setStatus('idle'); }}
              style={[styles.btn, styles.btnSecondary, { borderColor: colors.border }]}
              testID="enroll-cancel-btn"
            >
              <Text style={[styles.btnText, { color: colors.text }]}>CANCEL</Text>
            </Pressable>
            <Pressable
              onPress={enroll}
              style={[styles.btn, { backgroundColor: colors.primary }]}
              testID="enroll-capture-btn"
            >
              <MaterialCommunityIcons name="account-check" size={14} color="#fff" />
              <Text style={styles.btnText}>CAPTURE & ENROLL</Text>
            </Pressable>
          </>
        ) : null}
        {status === 'enrolling' ? (
          <View style={[styles.btn, { backgroundColor: colors.primary, opacity: 0.7 }]}>
            <MaterialCommunityIcons name="loading" size={14} color="#fff" />
            <Text style={styles.btnText}>ENROLLING…</Text>
          </View>
        ) : null}
        {status === 'success' ? (
          <Pressable
            onPress={() => { setStatus('idle'); setMessage(null); setDetScore(null); }}
            style={[styles.btn, styles.btnSecondary, { borderColor: colors.border }]}
            testID="enroll-reset-btn"
          >
            <MaterialCommunityIcons name="restart" size={14} color={colors.text} />
            <Text style={[styles.btnText, { color: colors.text }]}>ENROLL AGAIN</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.md, borderWidth: 1, padding: Space.lg, gap: Space.md },
  eyebrow: { ...TextStyles.label, fontSize: 10 },
  title: { ...TextStyles.h3, marginTop: 2 },
  sub: { ...TextStyles.bodySmall, marginTop: 4, maxWidth: 560 },
  frame: {
    aspectRatio: 4 / 3, maxHeight: 360, maxWidth: 480,
    borderRadius: Radius.md, borderWidth: 1,
    overflow: 'hidden', position: 'relative',
    backgroundColor: '#000',
  },
  frameEmpty: {
    position: 'absolute', inset: 0,
    alignItems: 'center', justifyContent: 'center', gap: Space.sm,
  },
  frameEmptyText: { ...TextStyles.bodySmall, maxWidth: 280, textAlign: 'center' },
  frameOverlay: {
    position: 'absolute', inset: 0,
    alignItems: 'center', justifyContent: 'center', gap: Space.xs,
  },
  frameOverlayText: { ...TextStyles.h3, fontFamily: F.heading, letterSpacing: 4 },
  frameOverlayMeta: { ...TextStyles.bodySmall, fontFamily: F.mono },
  msg: { ...TextStyles.bodySmall, fontFamily: F.mono, fontSize: 12 },
  actions: { flexDirection: 'row', gap: Space.sm, flexWrap: 'wrap' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Space.md, paddingVertical: 10,
    borderRadius: Radius.md,
  },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1 },
  btnText: { ...TextStyles.label, color: '#fff', fontSize: 11, letterSpacing: 1.2 },
});
