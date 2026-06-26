'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type WebcamCaptureDialogProps = {
  open: boolean;
  onClose: () => void;
  /** JPEG file from the current video frame */
  onCaptured: (file: File) => void;
  title: string;
  description?: string;
};

export function WebcamCaptureDialog({
  open,
  onClose,
  onCaptured,
  title,
  description,
}: WebcamCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setStarting(false);
      setReady(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      return;
    }

    let cancelled = false;
    setError(null);
    setReady(false);
    setStarting(true);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera is not supported in this browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          await el.play().catch(() => {
            /* autoplay policies — user gesture already opened dialog */
          });
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          const msg =
            e instanceof Error
              ? e.name === 'NotAllowedError'
                ? 'Camera permission denied. Allow access in the browser bar, or use upload instead.'
                : e.message
              : 'Could not open camera.';
          setError(msg);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    const video = videoRef.current;
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (video) {
        video.srcObject = null;
      }
    };
  }, [open]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setError('Video not ready yet. Wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Could not capture frame.');
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Could not encode image.');
          return;
        }
        const file = new File([blob], `enroll-webcam-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCaptured(file);
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  }, [onCaptured, onClose]);

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 transition-all duration-300 ${open ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}
      aria-labelledby="webcam-dialog-title"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-[#060e20]/80 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} 
        onClick={onClose}
      ></div>
      
      {/* Dialog Container */}
      <div 
        className={`relative w-full max-w-lg bg-[#131b2e] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col transition-all duration-300 transform ${open ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 flex justify-between items-center">
          <h2 id="webcam-dialog-title" className="text-xl font-bold font-[Manrope] text-white tracking-tight">{title}</h2>
          <button 
            onClick={onClose}
            className="text-[#8c909f] hover:text-white transition-colors p-1 rounded-md hover:bg-white/5"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>
        
        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          {description && (
            <p className="text-sm text-[#c2c6d5]">{description}</p>
          )}
          
          {error && (
            <div className="p-3 bg-[#93000a]/20 border border-[#error]/20 rounded-xl flex items-start gap-2 text-[#ffdad6] text-sm">
              <span className="material-symbols-outlined text-[#ffb4ab] text-lg shrink-0">error</span>
              <p>{error}</p>
            </div>
          )}
          
          {/* Camera Feed Container */}
          <div className="relative w-full aspect-[4/3] bg-[#060e20] rounded-xl overflow-hidden flex items-center justify-center border border-white/5 shadow-inner">
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#131b2e]/50 z-10">
                <div className="w-8 h-8 border-3 border-[#2065d1] border-t-[#afc6ff] rounded-full animate-spin"></div>
              </div>
            )}
            
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${starting && !ready ? 'hidden' : 'block'}`}
            />
            
            {/* Camera Viewfinder overlay */}
            {ready && !error && (
              <div className="absolute inset-0 pointer-events-none border-[2px] border-[#2065d1]/20 m-4 rounded-lg flex flex-col justify-between">
                 <div className="flex justify-between w-full p-2">
                    <div className="w-4 h-4 border-t-2 border-l-2 border-[#57e082]"></div>
                    <div className="w-4 h-4 border-t-2 border-r-2 border-[#57e082]"></div>
                 </div>
                 <div className="flex justify-between w-full p-2">
                    <div className="w-4 h-4 border-b-2 border-l-2 border-[#57e082]"></div>
                    <div className="w-4 h-4 border-b-2 border-r-2 border-[#57e082]"></div>
                 </div>
              </div>
            )}
          </div>
          
          <p className="text-[10px] text-[#8c909f] uppercase tracking-wider font-bold">
            Preview is mirrored like a selfie. Saved photo is standard.
          </p>
        </div>
        
        {/* Actions */}
        <div className="px-6 py-4 bg-[#222a3d]/30 border-t border-white/5 flex justify-end gap-3">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-bold text-[#c2c6d5] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={capture}
            disabled={!ready || !!error}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-[#00aa54] to-[#57e082] text-[#00210b] font-bold text-sm rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#00aa54]/20 disabled:opacity-50 disabled:scale-100 disabled:filter-grayscale"
          >
            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
            Capture Frame
          </button>
        </div>
      </div>
    </div>
  );
}
