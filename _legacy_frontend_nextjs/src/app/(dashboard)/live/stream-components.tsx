'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Hls from 'hls.js';
import { api } from '@/lib/api';

export interface LiveCamera {
  id: number;
  camera_name: string;
  rtsp_url: string;
  status: string;
  is_enabled: boolean;
}

export interface LiveStreamToolbarProps {
  cam: LiveCamera;
  variant: 'overlay' | 'bar';
  fullscreenCameraId: number | null;
  onRetry: (cameraId: number) => void;
  onZoomDelta: (cameraId: number, delta: number) => void;
  onToggleFullscreen: (cameraId: number) => void;
  onExitFullscreen: () => void;
}

export function LiveStreamToolbar({
  cam,
  variant,
  fullscreenCameraId,
  onRetry,
  onZoomDelta,
  onToggleFullscreen,
  onExitFullscreen,
}: LiveStreamToolbarProps) {
  const isBar = variant === 'bar';
  const layoutClass = isBar
    ? 'flex flex-wrap items-center gap-1 sm:gap-2 p-2 sm:p-3 bg-black/90 border-b border-white/10 shrink-0 z-10'
    : 'absolute top-4 right-4 flex flex-wrap gap-1 z-10 justify-end max-w-[calc(100%-32px)]';

  return (
    <div className={layoutClass}>
      {isBar && (
        <h3 className="text-white font-semibold flex-1 min-w-0 pr-2 truncate font-manrope">
          {cam.camera_name}
        </h3>
      )}
      <button
        onClick={() => onRetry(cam.id)}
        className="h-5 px-2 text-[9px] font-black uppercase tracking-widest border border-white/20 text-white rounded hover:bg-white/10 transition-colors bg-black/40 backdrop-blur flex items-center"
      >
        Reconnect
      </button>
      <button
        onClick={() => onZoomDelta(cam.id, 15)}
        title="Zoom in"
        className="h-5 w-7 bg-black/40 backdrop-blur rounded text-white/70 hover:text-white transition-colors flex items-center justify-center border border-white/20"
      >
        <span className="material-symbols-outlined text-[12px]">zoom_in</span>
      </button>
      <button
        onClick={() => onZoomDelta(cam.id, -15)}
        title="Zoom out"
        className="h-5 w-7 bg-black/40 backdrop-blur rounded text-white/70 hover:text-white transition-colors flex items-center justify-center border border-white/20"
      >
        <span className="material-symbols-outlined text-[12px]">zoom_out</span>
      </button>
      <button
        onClick={() => (fullscreenCameraId === cam.id ? onExitFullscreen() : onToggleFullscreen(cam.id))}
        title={fullscreenCameraId === cam.id ? 'Exit fullscreen' : 'Fullscreen'}
        className="h-5 w-7 bg-black/40 backdrop-blur rounded text-white/70 hover:text-white transition-colors flex items-center justify-center border border-white/20"
      >
        <span className="material-symbols-outlined text-[12px]">
          {fullscreenCameraId === cam.id ? 'fullscreen_exit' : 'fullscreen'}
        </span>
      </button>
      {isBar && (
        <button onClick={onExitFullscreen} className="text-slate-300 hover:text-white ml-auto px-2 text-sm font-inter">
          Close
        </button>
      )}
    </div>
  );
}

export function DetectionsOverlay({ detections }: { detections: any[] }) {
  const [activeDetections, setActiveDetections] = useState<any[]>([]);

  useEffect(() => {
    // Keep only detections from the last 2 seconds to avoid stale boxes
    const now = Date.now();
    const recent = detections.filter(d => (now - new Date(d.timestamp).getTime()) < 2000);
    setActiveDetections(recent);

    const timer = setInterval(() => {
      const current = Date.now();
      setActiveDetections(prev => prev.filter(d => (current - new Date(d.timestamp).getTime()) < 2000));
    }, 500);

    return () => clearInterval(timer);
  }, [detections]);

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-30" viewBox="0 0 100 100" preserveAspectRatio="none">
      {activeDetections.map((d) => {
        const bbox = d.bbox;
        if (!bbox || typeof bbox.x === 'undefined') return null;
        
        const isKnown = d.status === 'known';
        const isObject = d.status === 'object';
        const color = isKnown ? '#22c55e' : isObject ? '#3b82f6' : '#ef4444'; // Green, Blue, Red
        
        return (
          <g key={d.id} className="fade-in animate-in">
            <rect
              x={bbox.x}
              y={bbox.y}
              width={bbox.w}
              height={bbox.h}
              fill="transparent"
              stroke={color}
              strokeWidth="0.5"
              className="drop-shadow-md"
            />
            <rect
              x={bbox.x}
              y={Math.max(0, bbox.y - 4)}
              width={Math.min(100 - bbox.x, (d.label?.length || 5) * 2 + 4)}
              height="4"
              fill={color}
              opacity="0.8"
            />
            <text
              x={bbox.x + 0.5}
              y={Math.max(3, bbox.y - 1)}
              fontSize="2.5"
              fontWeight="bold"
              fill="white"
              fontFamily="Inter, sans-serif"
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function WebRTCPlayer({ cameraId, getZoom, isFullscreen, detections = [], onLatencyUpdate }: { cameraId: number; getZoom: () => number; isFullscreen?: boolean; detections?: any[]; onLatencyUpdate?: (latency: number) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [latency, setLatency] = useState<number>(0);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!videoRef.current) return;
    let cancelled = false;

    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pcRef.current = pc;

    // Configure for low latency
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        // Calculate latency when video starts playing
        const endTime = performance.now();
        const latencyMs = Math.round(endTime - startTimeRef.current);
        setLatency(latencyMs);
        if (onLatencyUpdate) {
          onLatencyUpdate(latencyMs);
        }
        if (videoRef.current.getVideoPlaybackQuality) {
          videoRef.current.play().catch(() => {});
        }
        setStatus('connected');
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setStatus('error');
      }
    };

    const start = async () => {
        startTimeRef.current = performance.now();
        try {
            const offer = await pc.createOffer({
              // Suggest low latency
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            });
            await pc.setLocalDescription(offer);

            // Wait for ICE gathering to complete (WHEP needs a full offer)
            if (pc.iceGatheringState !== 'complete') {
              await new Promise<void>((resolve) => {
                const check = () => {
                  if (pc.iceGatheringState === 'complete' || cancelled) {
                    resolve();
                  }
                };
                pc.onicegatheringstatechange = check;
                // Safety timeout: don't wait forever
                setTimeout(resolve, 2000);
              });
            }

            if (cancelled) return;
            const fullOffer = pc.localDescription?.sdp;
            if (!fullOffer) throw new Error('No local SDP');

            const res = await api<{ sdp: string }>(`/api/v1/stream/${cameraId}/webrtc-signal`, {
                method: 'POST',
                body: JSON.stringify({ sdp: fullOffer }),
            });
            if (cancelled) return;
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: res.sdp }));
        } catch (e) {
            console.error('WebRTC WHEP error:', e);
            if (!cancelled) setStatus('error');
        }
    };

    start();

    return () => {
      cancelled = true;
      pc.close();
      pcRef.current = null;
    };
  }, [cameraId, onLatencyUpdate]);

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`w-full h-full block ${isFullscreen ? 'object-contain' : 'object-cover'}`}
        style={{ latency: '0' }}
      />
      <DetectionsOverlay detections={detections} />
      {status === 'connecting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-300 font-bold uppercase tracking-widest">Connecting WebRTC...</span>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <span className="material-symbols-outlined text-3xl text-error">signal_disconnected</span>
            <span className="text-xs text-slate-400 font-bold">WebRTC connection failed</span>
            <span className="text-[10px] text-slate-500">Camera may not be reachable from MediaMTX</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function HLSPlayer({ url, getZoom, isFullscreen, detections = [] }: { url: string; getZoom: () => number; isFullscreen?: boolean; detections?: any[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!url || !videoRef.current) return;
    const video = videoRef.current;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
  }, [url]);

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`w-full h-full block ${isFullscreen ? 'object-contain' : 'object-cover'}`}
      />
      <DetectionsOverlay detections={detections} />
    </div>
  );
}

export interface LiveStreamStageProps {
  cam: LiveCamera;
  isFullscreen?: boolean;
  showMjpeg: boolean;
  streaming: Set<number>;
  streamErrors: Set<number>;
  streamRetryKey: Record<number, number>;
  starting: Set<number>;
  streamUrl: (cameraId: number) => string | null;
  getZoom: (cameraId: number) => number;
  onRetry: (cameraId: number) => void;
  onStop: (cameraId: number) => void;
  onStart: (cameraId: number) => void;
  onExitFullscreen: () => void;
  onLoadFrame: (cameraId: number) => void;
  onFrameError: (cameraId: number) => void;
  detections?: any[];
  overlayToolbar?: ReactNode;
  onLatencyUpdate?: (cameraId: number, latency: number) => void;
  latency?: number;
}

export function LiveStreamStage({
  cam,
  isFullscreen,
  showMjpeg,
  streaming,
  streamErrors,
  streamRetryKey,
  starting,
  streamUrl,
  getZoom,
  onRetry,
  onStop,
  onStart,
  onExitFullscreen,
  onLoadFrame,
  onFrameError,
  detections = [],
  overlayToolbar,
  onLatencyUpdate,
  latency = 0,
}: LiveStreamStageProps) {
  const url = streamUrl(cam.id);

  return (
    <div
      className={`bg-black flex items-center justify-center relative overflow-hidden ${
        isFullscreen ? 'w-full h-full flex-1 min-h-0' : 'w-full aspect-video rounded-xl shadow-2xl ring-1 ring-white/5 bg-surface'
      }`}
    >
      {streaming.has(cam.id) && streamErrors.has(cam.id) ? (
        <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center text-center p-8 backdrop-blur-sm z-20">
          <span className="material-symbols-outlined text-4xl text-slate-500 mb-4">videocam_off</span>
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Signal Lost</p>
          <p className="text-xs text-slate-500 mb-4">No signal — check network or RTSP URL.<br/>Cameras must be on the same network or VPN.</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <button
              onClick={() => onRetry(cam.id)}
              className="px-4 py-1.5 border border-white/20 rounded text-slate-300 hover:bg-white/10 hover:text-white transition-colors text-xs font-bold"
            >
              Retry Connection
            </button>
            <button
              onClick={() => onStop(cam.id)}
              className="px-4 py-1.5 bg-error-dark text-error-light hover:bg-error hover:text-black rounded transition-colors text-xs font-bold"
            >
              Stop Stream
            </button>
          </div>
        </div>
      ) : streaming.has(cam.id) && url && (showMjpeg || url.includes('ws://')) ? (
        <div className="w-full h-full overflow-hidden flex items-center justify-center bg-black relative">
          <div
            className="absolute inset-0 origin-center transition-transform duration-300 flex items-center justify-center"
            style={{ transform: `scale(${getZoom(cam.id)})` }}
          >
            {url.includes('/mjpeg') ? (
               /* eslint-disable-next-line @next/next/no-img-element */
               <div className="relative w-full h-full">
                 <img
                   key={`stream-${cam.id}-${streamRetryKey[cam.id] ?? 0}`}
                   src={url}
                   alt={cam.camera_name}
                    className={`w-full h-full block ${isFullscreen ? 'object-contain' : 'object-cover'}`}
                   onLoad={() => onLoadFrame(cam.id)}
                   onError={() => onFrameError(cam.id)}
                 />
                 <DetectionsOverlay detections={detections.filter(d => d.camera_id === cam.id)} />
               </div>
            ) : url.includes('m3u8') ? (
               <HLSPlayer url={url} getZoom={() => getZoom(cam.id)} isFullscreen={isFullscreen} detections={detections.filter(d => d.camera_id === cam.id)} />
            ) : (
               <WebRTCPlayer cameraId={cam.id} getZoom={() => getZoom(cam.id)} isFullscreen={isFullscreen} detections={detections.filter(d => d.camera_id === cam.id)} onLatencyUpdate={(latency) => onLatencyUpdate?.(cam.id, latency)} />
            )}
          </div>
          {!isFullscreen && (
            <div className="absolute top-4 left-4 flex items-center gap-2 z-10 flex-wrap">
               <span className="px-2 py-0.5 bg-red-600 text-[10px] font-black rounded text-white flex items-center gap-1 shadow-lg shadow-red-900/50 uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> LIVE
               </span>
                <span className="px-2 py-0.5 bg-black/60 backdrop-blur-md text-[10px] font-black text-slate-300 rounded uppercase tracking-widest border border-white/10 shadow-xl">
                    {cam.camera_name}
                </span>
                {latency > 0 && url?.includes('ws://') && (
                  <span className="px-2 py-0.5 bg-blue-600/80 backdrop-blur-md text-[10px] font-black text-white rounded uppercase tracking-widest border border-blue-400/30 shadow-xl">
                     {latency}ms
                  </span>
                )}
                {latency === 0 && url?.includes('/mjpeg') && (
                  <span className="px-2 py-0.5 bg-green-600/80 backdrop-blur-md text-[10px] font-black text-white rounded uppercase tracking-widest border border-green-400/30 shadow-xl">
                     DIRECT
                  </span>
                )}
            </div>
          )}
        </div>
      ) : streaming.has(cam.id) && !showMjpeg ? (
        <div className="text-center p-6 bg-background w-full h-full flex flex-col items-center justify-center">
          <p className="text-slate-400 text-sm mb-3">Stream is open in fullscreen viewer</p>
          <button
            onClick={onExitFullscreen}
            className="px-4 py-2 border border-slate-600 text-slate-300 hover:bg-slate-800 rounded text-xs font-bold transition-colors"
          >
            Exit fullscreen
          </button>
        </div>
      ) : (
        <div className="text-center p-6 bg-background w-full h-full flex flex-col items-center justify-center absolute inset-0 z-10 transition-colors group">
          <span className="material-symbols-outlined text-4xl text-slate-700 mb-3 group-hover:text-primary transition-colors">videocam</span>
          <p className="text-slate-500 text-sm mb-4">
            {cam.is_enabled
              ? starting.has(cam.id)
                ? 'Initializing stream...'
                : 'Stream is currently inactive'
              : 'Camera disabled'}
          </p>
          {cam.is_enabled && (
            <button
              onClick={() => onStart(cam.id)}
              disabled={starting.has(cam.id)}
              className="bg-gradient-to-br from-primary-light to-primary text-on-surface px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 text-sm"
            >
              {starting.has(cam.id) ? (
                 <>
                   <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                   Starting...
                 </>
              ) : (
                 <>
                   <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                   Start Feed
                 </>
              )}
            </button>
          )}
        </div>
      )}
      {overlayToolbar}
    </div>
  );
}
