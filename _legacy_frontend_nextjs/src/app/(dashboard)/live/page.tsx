'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, getToken, getStreamBase } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { EmptyStateIllustration } from '@/components/illustrations';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatDateTime } from '@/lib/formatDate';
import { LiveCamera, LiveStreamStage, LiveStreamToolbar } from './stream-components';

const STREAM_ERROR_DEBOUNCE_MS = 2800;

interface User {
  id: number;
  name: string;
}

export default function LiveMonitoringPage() {
  const toast = useToast();
  const [cameras, setCameras] = useState<LiveCamera[]>([]);
  const [streaming, setStreaming] = useState<Record<number, { mode: string, hls_url?: string, webrtc_url?: string }>>({});
  const [streamErrors, setStreamErrors] = useState<Set<number>>(new Set());
  const [streamRetryKey, setStreamRetryKey] = useState<Record<number, number>>({});
  const [starting, setStarting] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreenCameraId, setFullscreenCameraId] = useState<number | null>(null);
  const [zoom, setZoom] = useState<Record<number, number>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [detections, setDetections] = useState<any[]>([]); // New state for live feed
  const [activeFilter, setActiveFilter] = useState<'all' | 'known' | 'unknown' | 'object'>('all');
  const [gridLayout, setGridLayout] = useState<'1x1' | '2x2' | '3x3'>('2x2');
  const [streamQuality, setStreamQuality] = useState<'360p' | '720p' | '1080p'>('720p');
  const [streamQualityPerCamera, setStreamQualityPerCamera] = useState<Record<number, string>>({});
  const [latencyPerCamera, setLatencyPerCamera] = useState<Record<number, number>>({});
  
  const handleLatencyUpdate = (cameraId: number, latency: number) => {
    setLatencyPerCamera(prev => ({ ...prev, [cameraId]: latency }));
  };
  
  const startStreamWithQuality = async (cameraId: number, quality: '360p' | '720p' | '1080p') => {
    setError(null);
    setStarting((s) => new Set(s).add(cameraId));
    try {
      const data = await api<{ mode: string, hls_url?: string, webrtc_url?: string }>(`/api/v1/stream/${cameraId}/start?quality=${quality.replace('p', '')}`, { method: 'POST' });
      setStreaming((s) => ({ ...s, [cameraId]: data }));
      setStreamQualityPerCamera(prev => ({ ...prev, [cameraId]: quality }));
      setStreamErrors((e) => {
        const n = new Set(e);
        n.delete(cameraId);
        return n;
      });
      toast.success(`Stream started at ${quality}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Start failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setStarting((s) => {
        const n = new Set(s);
        n.delete(cameraId);
        return n;
      });
    }
  };

  const handleQualityChange = async (newQuality: '360p' | '720p' | '1080p') => {
    setStreamQuality(newQuality);
    // If any camera is streaming, restart it with new quality
    const activeCameras = Object.keys(streaming);
    if (activeCameras.length > 0) {
      for (const camId of activeCameras) {
        const camIdNum = parseInt(camId);
        await stopStream(camIdNum);
        await startStreamWithQuality(camIdNum, newQuality);
      }
    }
  };
  
  const getGridColumns = () => {
    switch (gridLayout) {
      case '1x1': return 'grid-cols-1';
      case '2x2': return 'grid-cols-1 xl:grid-cols-2';
      case '3x3': return 'grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3';
      default: return 'grid-cols-1 xl:grid-cols-2';
    }
  };
  
  const streamErrorTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const syncStreamStatusFromServer = useCallback(async () => {
    try {
      const data = await api<{ active_camera_ids: number[] }>('/api/v1/stream/status');
      const activeMap: Record<number, { mode: string }> = {};
      (data.active_camera_ids ?? []).forEach(id => {
        activeMap[id] = { mode: 'webrtc' }; // Use WebRTC for smooth streaming
      });
      setStreaming(activeMap);
    } catch {
      /* keep local state if status unavailable */
    }
  }, []);

  const { connected } = useWebSocket((event) => {
    if (['face_recognized', 'unknown_person_detected', 'object_detected'].includes(event.type)) {
      const { camera_id, person_name, object_name, status, label, user_id, detection_id } = event.data as any;
      const cam = (cameras || []).find((c) => c.id === camera_id);
      const user = Array.isArray(users) ? users.find((u) => u.id === user_id) : null;
      
      setDetections((prev) => [
        {
          id: detection_id || Date.now(),
          type: event.type,
          camera_id: camera_id,
          camera_name: cam?.camera_name || `Camera ${camera_id}`,
          timestamp: new Date().toISOString(),
          status: status || (event.type === 'face_recognized' ? 'known' : event.type === 'object_detected' ? 'object' : 'unknown'),
          label: user?.name || label || person_name || object_name || (event.type === 'unknown_person_detected' ? 'Unknown Person' : 'Object'),
          snapshot: (event.data as any).snapshot ? `/storage/${(event.data as any).snapshot}` : null,
          bbox: (event.data as any).bbox,
        },
        ...prev,
      ].slice(0, 20));
    }
  });

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api<LiveCamera[]>('/api/v1/cameras'),
      api<User[]>('/api/v1/users'), // Fetch users
      api<{ items: any[] }>('/api/v1/detections?limit=10') // Fetch initial detections
    ])
      .then(([cams, fetchedUsers, dets]: [any, any, any]) => {
        setCameras(cams || []);
        const actualUsers = fetchedUsers?.items || (Array.isArray(fetchedUsers) ? fetchedUsers : []);
        setUsers(actualUsers);
        const actualDets = dets?.items || (Array.isArray(dets) ? dets : []);
        const normalizedDetections = actualDets.map((d: any) => {
          const cameraName = cams.find((c: any) => c.id === d.camera_id)?.camera_name || `Camera ${d.camera_id}`;
          const userName = actualUsers.find((u: any) => u.id === d.user_id)?.name;
          const bbox = d.bbox || null;
          return {
            id: d.id,
            type: d.type || 'face_recognized',
            camera_id: d.camera_id,
            camera_name: cameraName,
            timestamp: d.timestamp,
            status: d.status || (d.type === 'object_detected' ? 'object' : 'unknown'),
            label: d.label || userName || d.person_name || d.object_name || 'Event',
            snapshot: d.snapshot ? `/storage/${d.snapshot}` : d.image ? `/storage/${d.image}` : null,
            bbox: bbox,
          };
        });
        setDetections(normalizedDetections);
      })
      .catch((e) => {
        console.error('Initial load failed', e);
        setError('Connection failed. Please check if the backend is running.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || cameras.length === 0) return;
    void syncStreamStatusFromServer();
  }, [loading, cameras, syncStreamStatusFromServer]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && cameras.length > 0) {
        void syncStreamStatusFromServer();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [cameras.length, syncStreamStatusFromServer]);

  useEffect(() => {
    const timers = streamErrorTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (fullscreenCameraId === null) return;
    
    // Enable auto-rotate on mobile when entering fullscreen
    const enableAutoRotate = async () => {
      if (screen.orientation && 'lock' in screen.orientation) {
        try {
          await screen.orientation.lock('landscape');
        } catch (e) {
          console.log('Could not lock orientation:', e);
        }
      }
    };
    
    enableAutoRotate();
    
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenCameraId(null);
    };
    window.addEventListener('keydown', onKey);
    
    return () => {
      // Unlock orientation when exiting fullscreen
      if (screen.orientation && 'unlock' in screen.orientation) {
        screen.orientation.unlock();
      }
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreenCameraId]);

  const startStream = async (cameraId: number) => {
    setError(null);
    setStarting((s) => new Set(s).add(cameraId));
    try {
      const data = await api<{ mode: string, hls_url?: string, webrtc_url?: string }>(`/api/v1/stream/${cameraId}/start?quality=${streamQuality.replace('p', '')}`, { method: 'POST' });
      setStreaming((s) => ({ ...s, [cameraId]: data }));
      setStreamErrors((e) => {
        const n = new Set(e);
        n.delete(cameraId);
        return n;
      });
      toast.success(`Stream started as ${data.mode}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Start failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setStarting((s) => {
        const n = new Set(s);
        n.delete(cameraId);
        return n;
      });
    }
  };

  const stopStream = async (cameraId: number) => {
    try {
      await api(`/api/v1/stream/${cameraId}/stop`, { method: 'POST' });
      setStreaming((s) => {
        const next = { ...s };
        delete next[cameraId];
        return next;
      });
      setStreamErrors((e) => {
        const n = new Set(e);
        n.delete(cameraId);
        return n;
      });
      if (fullscreenCameraId === cameraId) setFullscreenCameraId(null);
      clearTimeout(streamErrorTimersRef.current[cameraId]);
      toast.info('Stream stopped');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Stop failed';
      setError(msg);
      toast.error(msg);
    }
  };

  const streamUrl = useCallback(
    (cameraId: number) => {
      const cam = cameras.find(c => c.id === cameraId);
      if (!cam) return null;
      
      const details = streaming[cameraId];
      if (!details) return null;

      const token = getToken();
      if (!token) return null;

      const mode = details.mode || 'mjpeg';
      
      // Return WebRTC URL for smooth streaming with frontend overlay
      if (mode === 'webrtc' && details.webrtc_url) {
        return details.webrtc_url;
      }

      // Fall back to MJPEG
      const qualityMap: Record<string, string> = {
        '360p': '480',
        '720p': '720', 
        '1080p': '1080',
      };
      const quality = qualityMap[streamQuality] || '720';

      const base = getStreamBase();
      const retry = streamRetryKey[cameraId] ?? 0;
      return `${base}/api/v1/stream/${cameraId}/mjpeg?token=${encodeURIComponent(token)}&quality=${quality}&_=${retry}`;
    },
    [cameras, streaming, streamRetryKey, streamQuality]
  );

  const retryStream = (cameraId: number) => {
    clearTimeout(streamErrorTimersRef.current[cameraId]);
    setStreamErrors((e) => {
      const n = new Set(e);
      n.delete(cameraId);
      return n;
    });
    setStreamRetryKey((k) => ({ ...k, [cameraId]: (k[cameraId] ?? 0) + 1 }));
  };

  const scheduleStreamError = (cameraId: number) => {
    clearTimeout(streamErrorTimersRef.current[cameraId]);
    streamErrorTimersRef.current[cameraId] = setTimeout(() => {
      setStreamErrors((e) => new Set(e).add(cameraId));
      delete streamErrorTimersRef.current[cameraId];
    }, STREAM_ERROR_DEBOUNCE_MS);
  };

  const clearStreamError = (cameraId: number) => {
    clearTimeout(streamErrorTimersRef.current[cameraId]);
    delete streamErrorTimersRef.current[cameraId];
    setStreamErrors((e) => {
      const n = new Set(e);
      n.delete(cameraId);
      return n;
    });
  };

  const getZoom = (id: number) => (zoom[id] ?? 100) / 100;
  const onZoomDelta = (id: number, delta: number) =>
    setZoom((z) => ({ ...z, [id]: Math.max(50, Math.min(200, (z[id] ?? 100) + delta)) }));

  const shouldAttachMjpegInGrid = (camId: number) => !!streaming[camId] && fullscreenCameraId !== camId;

  const toolbarCallbacks = {
    onRetry: retryStream,
    onZoomDelta,
    onToggleFullscreen: setFullscreenCameraId,
    onExitFullscreen: () => setFullscreenCameraId(null),
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background relative overflow-hidden mt-[-2rem] mb-[-2rem] ml-[-2rem] mr-[-2rem]">
      {fullscreenCameraId !== null && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-0 m-0">
          {(() => {
            const cam = cameras.find((c) => c.id === fullscreenCameraId);
            if (!cam) return null;
            return (
              <div className="flex flex-col w-full h-full">
                <LiveStreamToolbar cam={cam} variant="bar" fullscreenCameraId={fullscreenCameraId} {...toolbarCallbacks} />
                <div className="flex-1 w-full relative bg-black">
                  <LiveStreamStage
                    cam={cam}
                    isFullscreen
                    showMjpeg
                    streaming={new Set(Object.keys(streaming).map(Number))}
                    streamErrors={streamErrors}
                    streamRetryKey={streamRetryKey}
                    starting={starting}
                    streamUrl={streamUrl}
                    getZoom={getZoom}
                    onRetry={retryStream}
                    onStop={stopStream}
                    onStart={startStream}
                    onExitFullscreen={() => setFullscreenCameraId(null)}
                    onLoadFrame={clearStreamError}
                    onFrameError={scheduleStreamError}
                    detections={detections}
                    latency={latencyPerCamera[cam.id] || 0}
                    onLatencyUpdate={handleLatencyUpdate}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Main Grid Area */}
      <section className="flex-1 p-6 lg:p-10 overflow-y-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-manrope font-extrabold tracking-tight text-primary-light">Live Monitoring Console</h2>
            <p className="text-slate-400 mt-1 font-inter">Real-time surveillance overview — {cameras.length} active streams across network.</p>
          </div>
          <Link
            href="/cameras"
            className="bg-gradient-to-br from-primary-light to-primary text-on-surface px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform"
          >
            <span className="material-symbols-outlined text-lg">add_circle</span>
            Add Camera
          </Link>
        </div>

        {error && (
          <div className="bg-error-dark/20 border border-error/50 p-4 rounded-xl mb-6 text-error-light font-bold">
            {error}
          </div>
        )}

        {/* Toolbar: Grid Layout & Quality */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-surface-variant rounded-lg p-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Grid</span>
              {(['1x1', '2x2', '3x3'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGridLayout(g)}
                  className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${
                    gridLayout === g
                      ? 'bg-primary text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 bg-surface-variant rounded-lg p-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Quality</span>
              {(['360p', '720p', '1080p'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => handleQualityChange(q)}
                  className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${
                    streamQuality === q
                      ? 'bg-primary text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-primary border-t-white rounded-full animate-spin"></div>
          </div>
        ) : cameras.length === 0 ? (
          <div className="bg-surface-variant border border-white/5 rounded-2xl p-12 flex flex-col items-center justify-center shadow-xl">
             <EmptyStateIllustration size={160} className="mb-6 opacity-60" />
             <h3 className="text-xl font-bold text-white font-manrope mb-2">No Cameras Configured</h3>
             <p className="text-slate-500 max-w-sm text-center mb-8">Please register an ONVIF or RTSP camera in the Cameras configuration module to enable live monitoring.</p>
             <Link href="/cameras" className="bg-primary text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-600 transition-colors">
                 Go Setup Cameras
             </Link>
          </div>
        ) : (
          <div className={`grid ${getGridColumns()} gap-6`}>
            {cameras.map((cam) => (
               <div key={cam.id} className="group relative bg-surface-variant rounded-xl overflow-hidden ring-1 ring-white/5 shadow-2xl flex flex-col">
                   {/* The stream stage renders the actual video + play button etc */}
                  <LiveStreamStage
                    cam={cam}
                    showMjpeg={!!streaming[cam.id] && fullscreenCameraId !== cam.id}
                    streaming={new Set(Object.keys(streaming).map(Number))}
                    streamErrors={streamErrors}
                    streamRetryKey={streamRetryKey}
                    starting={starting}
                    streamUrl={streamUrl}
                    getZoom={getZoom}
                    onRetry={retryStream}
                    onStop={stopStream}
                    onStart={startStream}
                    onExitFullscreen={() => setFullscreenCameraId(null)}
                    onLoadFrame={clearStreamError}
                    onFrameError={scheduleStreamError}
                    detections={detections}
                    latency={latencyPerCamera[cam.id] || 0}
                    overlayToolbar={
                      streaming[cam.id] && (fullscreenCameraId !== cam.id) ? (
                        <LiveStreamToolbar
                          cam={cam}
                          variant="overlay"
                           fullscreenCameraId={fullscreenCameraId}
                          {...toolbarCallbacks}
                        />
                      ) : undefined
                    }
                    onLatencyUpdate={handleLatencyUpdate}
                  />

                  {/* Tile Bottom Info Bar matching the Stitch style when stream is NOT covering it (or if it is, we can push it out or overlay it) */}
                  {/* Wait, stream components is aspect-video. The layout has the video full, so we overlay info. */}
                   {streaming[cam.id] && (fullscreenCameraId !== cam.id) && (
                      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none fade-in animate-in">
                         <div className="tabular-nums font-[Inter] text-[10px] text-slate-300 pointer-events-auto">
                            <button onClick={() => stopStream(cam.id)} className="flex items-center gap-1 bg-red-600/20 text-red-400 hover:text-white hover:bg-red-600 px-2 py-0.5 rounded transition-colors uppercase font-black tracking-widest backdrop-blur-md border border-red-500/30 text-[10px]">
                               <span className="material-symbols-outlined text-[14px]">stop</span>
                               Disconnect
                            </button>
                         </div>
                      </div>
                   )}
               </div>
            ))}
          </div>
        )}
      </section>

      {/* Right-hand Sidebar (Detections) - Static to match Stitch UI since live detections aren't implemented here yet */}
      <aside className="w-80 bg-surface-variant shadow-[-1px_0_0_0_rgba(255,255,255,0.05)] hidden lg:flex flex-col border-l border-white/5 shrink-0 z-10 transition-all">
         <div className="p-6 border-b border-white/5 shrink-0 sticky top-0 bg-surface-variant z-10">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-manrope font-bold text-lg text-primary-light">Detection Feed</h3>
               <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${connected ? 'bg-secondary' : 'bg-red-500'}`}></div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${connected ? 'text-slate-500' : 'text-red-500'}`}>
                    {connected ? 'Real-time' : 'Offline'}
                  </span>
               </div>
            </div>
            <div className="flex flex-wrap gap-2">
               {[
                 { id: 'all', label: 'All Events' },
                 { id: 'known', label: 'Face' },
                 { id: 'unknown', label: 'Unknown' },
                 { id: 'object', label: 'Objects' }
               ].map(f => (
                 <button 
                   key={f.id}
                   onClick={() => setActiveFilter(f.id as any)}
                   className={`px-3 py-1 text-[10px] font-bold rounded-full whitespace-nowrap transition-colors ${activeFilter === f.id ? 'bg-primary text-white' : 'bg-surface text-slate-400 hover:text-slate-200'}`}
                 >
                   {f.label}
                 </button>
               ))}
            </div>
         </div>
         
         <div className="flex-1 p-4 space-y-4 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#4b5563 #1f2937' }}>
            {detections.length === 0 ? (
               <div className="group bg-surface/40 p-3 rounded-xl hover:bg-surface transition-all cursor-pointer">
                  <div className="flex gap-3">
                     <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-background">
                        <div className="absolute inset-0 border border-primary-light/40 rounded-lg"></div>
                        <span className="material-symbols-outlined text-4xl text-primary-light/20 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">person</span>
                     </div>
                     <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-on-surface truncate">Connection Active</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">System Initialization</p>
                        <div className="flex justify-between items-center mt-2">
                           <span className="px-1.5 py-0.5 bg-success/10 text-secondary text-[9px] font-black rounded uppercase">Success</span>
                           <span className="tabular-nums text-[9px] text-slate-500 font-bold">Just now</span>
                        </div>
                     </div>
                  </div>
               </div>
            ) : (
               detections
                 .filter(d => activeFilter === 'all' || d.status === activeFilter || (activeFilter === 'unknown' && d.status !== 'known' && d.status !== 'object'))
                 .map((d) => (
                  <div key={d.id} className="group bg-surface/40 p-3 rounded-xl hover:bg-surface transition-all cursor-pointer animate-in slide-in-from-right duration-300">
                     <div className="flex gap-3">
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-surface-variant border border-white/10 flex items-center justify-center">
                           {d.snapshot ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={d.snapshot} alt={d.label || 'Detection'} className="w-full h-full object-cover" />
                           ) : (
                              <span className="material-symbols-outlined text-2xl text-primary-light/40">{d.status === 'known' ? 'person' : 'person_off'}</span>
                           )}
                           <div className={`absolute inset-0 ${d.status === 'known' ? 'bg-secondary/5' : 'bg-amber-500/5'}`}></div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                           <p className="text-xs font-bold text-on-surface truncate">{d.label === 'Unknown Person' ? 'Unknown' : d.label}</p>
                           <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-tighter truncate">{d.camera_name}</p>
                           <div className="flex justify-between items-center mt-2">
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${d.status === 'known' ? 'bg-secondary/10 text-secondary border-secondary/20' : d.status === 'object' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'} uppercase`}>
                                 {d.status === 'unknown' ? 'Unknown' : d.status}
                              </span>
                              <span className="tabular-nums text-[9px] text-slate-500 font-bold">{formatDateTime(d.timestamp).split(',')[1].trim()}</span>
                           </div>
                        </div>
                     </div>
                  </div>
               ))
            )}
            
            {detections.length > 0 && (
               <p className="text-center text-slate-600 text-[10px] font-bold italic mt-8 px-6">Showing latest {detections.length} neural events</p>
            )}
            {detections.length === 0 && (
               <p className="text-center text-slate-500 text-xs font-bold italic mt-12 px-6">Live visual detections stream will appear here when telemetry is engaged.</p>
            )}
         </div>
      </aside>
    </div>
  );
}
