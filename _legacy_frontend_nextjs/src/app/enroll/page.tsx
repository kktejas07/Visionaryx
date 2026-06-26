'use client';
/* eslint-disable react/no-unescaped-entities, @next/next/no-img-element */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getApiBase, getToken, publicApi } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { WebcamCaptureDialog } from '@/components/WebcamCaptureDialog';

const STEPS = ['Confirm', 'Photos', 'Review', 'Done'];

type VerifyOk = { valid: boolean; user_name: string; user_id: number };

function EnrollContent() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const token = searchParams ? searchParams.get('token') : null;
  const [activeStep, setActiveStep] = useState(0);
  const [verifying, setVerifying] = useState(!!token);
  const [verified, setVerified] = useState<VerifyOk | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionJwt, setSessionJwt] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [straight, setStraight] = useState<File | null>(null);
  const [left, setLeft] = useState<File | null>(null);
  const [right, setRight] = useState<File | null>(null);

  const [preview, setPreview] = useState<{ straight?: string; left?: string; right?: string }>({});
  const [webcamFor, setWebcamFor] = useState<'straight' | 'left' | 'right' | null>(null);

  useEffect(() => {
    const jwt = getToken();
    setSessionJwt(jwt);
    if (!jwt) return;
    const base = getApiBase();
    fetch(`${base}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${jwt}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { email?: string } | null) => {
        if (me?.email) setSessionEmail(me.email);
      })
      .catch(() => setSessionEmail(null));
  }, []);

  useEffect(() => {
    if (!straight) {
      setPreview((p) => {
        if (p.straight) URL.revokeObjectURL(p.straight);
        return { ...p, straight: undefined };
      });
      return;
    }
    const url = URL.createObjectURL(straight);
    setPreview((p) => ({ ...p, straight: url }));
    return () => URL.revokeObjectURL(url);
  }, [straight]);

  useEffect(() => {
    if (!left) {
      setPreview((p) => {
        if (p.left) URL.revokeObjectURL(p.left);
        return { ...p, left: undefined };
      });
      return;
    }
    const url = URL.createObjectURL(left);
    setPreview((p) => ({ ...p, left: url }));
    return () => URL.revokeObjectURL(url);
  }, [left]);

  useEffect(() => {
    if (!right) {
      setPreview((p) => {
        if (p.right) URL.revokeObjectURL(p.right);
        return { ...p, right: undefined };
      });
      return;
    }
    const url = URL.createObjectURL(right);
    setPreview((p) => ({ ...p, right: url }));
    return () => URL.revokeObjectURL(url);
  }, [right]);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setVerifyError(null);
      try {
        const data = await publicApi<VerifyOk>(
          `/api/v1/enroll/verify?token=${encodeURIComponent(token)}`,
        );
        if (!cancelled) setVerified(data);
      } catch (e) {
        if (!cancelled) setVerifyError(e instanceof Error ? e.message : 'Invalid or expired link');
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const canEnroll = Boolean(verified || (!token && sessionJwt));
  const progress = done ? 100 : ((activeStep + 1) / STEPS.length) * 100;

  const filesList = useCallback(() => {
    const out: File[] = [];
    if (straight) out.push(straight);
    if (left) out.push(left);
    if (right) out.push(right);
    return out;
  }, [straight, left, right]);

  const submit = async () => {
    const files = filesList();
    if (!straight) {
      toast.error('Add the front / straight photo.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      if (token) {
        form.append('token', token);
        await publicApi<{ ok: boolean }>('/api/v1/enroll/upload', { method: 'POST', body: form });
      } else if (sessionJwt) {
        const base = getApiBase();
        const res = await fetch(`${base}/api/v1/enroll/upload-session`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionJwt}` },
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail || res.statusText),
          );
        }
      } else {
        toast.error('Use your enrollment link or sign in first.');
        return;
      }
      setDone(true);
      setActiveStep(3);
      toast.success('Face profile saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleNextFromConfirm = () => {
    if (!canEnroll || verifyError) return;
    setActiveStep(1);
  };

  return (
    <div className="min-h-screen bg-[#0b1326] flex items-center justify-center p-4 py-12 relative overflow-hidden font-[Inter]">
      {/* Background Decorators */}
      <div className="fixed top-0 left-0 w-full h-full opacity-30 pointer-events-none z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#afc6ff]/10 blur-[100px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-[#00aa54]/10 blur-[100px]"></div>
      </div>
      
      {/* Card Container */}
      <div className="w-full max-w-[560px] bg-[#131b2e] rounded-2xl shadow-2xl border border-white/5 relative z-10 overflow-hidden flex flex-col">
         {/* Top Branding Header */}
         <div className="bg-[#222a3d]/50 p-6 border-b border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-[#2065d1]/20 rounded-lg flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#afc6ff]">face</span>
               </div>
               <div>
                  <h1 className="text-xl font-bold tracking-widest text-white font-[Manrope]">VISIORYX</h1>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[#8c909f] font-extrabold">Identity Enrollment Node</p>
               </div>
            </div>
            {sessionJwt && activeStep < 3 && (
               <Link href="/dashboard" className="flex items-center gap-2 text-sm text-[#8c909f] hover:text-white transition-colors bg-[#060e20] px-3 py-1.5 rounded-lg border border-white/5">
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Dashboard
               </Link>
            )}
         </div>

         {/* Content padding */}
         <div className="p-6 md:p-8 space-y-8">
            {/* Context & Progress Indicator */}
            <div className="space-y-4">
               <div>
                  <h2 className="text-2xl font-bold text-white font-[Manrope] mb-2 font-headline">Face Enrollment Sequence</h2>
                  <p className="text-sm text-[#c2c6d5] leading-relaxed">
                     Step-by-step neural capture for optical recognition. You do <strong className="text-white">not</strong> need dashboard access — only this terminal window via your secure invite link.
                  </p>
                  {token && !sessionJwt && (
                     <p className="text-xs text-[#8c909f] mt-2 border-l-2 border-[#2065d1] pl-3 py-1 bg-[#2065d1]/5">
                        Initiated via QR terminal. You may close this session anytime. Operators must <Link href="/login" className="text-[#afc6ff] hover:underline font-bold">Sign In</Link>.
                     </p>
                  )}
               </div>

               {/* Progress Bar */}
               <div className="pt-4">
                  <div className="w-full bg-[#060e20] h-2 rounded-full overflow-hidden border border-white/5 shadow-inner relative">
                     <div 
                        className="h-full rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-1" 
                        style={{ width: `${progress}%`, backgroundImage: 'linear-gradient(90deg, #2065d1, #afc6ff)' }}
                     >
                        <div className="w-1 h-1 bg-white/50 rounded-full animate-pulse"></div>
                     </div>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                     <span className="text-xs font-bold text-[#8c909f] tracking-wider uppercase">Step {Math.min(activeStep + 1, STEPS.length)} / {STEPS.length}</span>
                     <span className="text-xs font-bold text-[#afc6ff] tracking-wider uppercase">{STEPS[activeStep] ?? 'Done'}</span>
                  </div>
               </div>
            </div>

            {/* Step 0 - Confirm identity */}
            {activeStep === 0 && (
               <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  {verifying && (
                     <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <div className="w-8 h-8 border-3 border-[#2065d1] border-t-white rounded-full animate-spin"></div>
                        <p className="text-sm text-[#8c909f] animate-pulse">Validating cryptographic token...</p>
                     </div>
                  )}

                  {!verifying && (
                     <div className="space-y-4">
                        {verifyError && (
                           <div className="p-4 bg-[#93000a]/20 border border-[#ffb4ab]/30 rounded-xl flex items-start gap-3 text-[#ffdad6] text-sm shadow-inner">
                              <span className="material-symbols-outlined text-[#ffb4ab]">error</span>
                              <p className="pt-0.5">{verifyError}</p>
                           </div>
                        )}
                        
                        {!token && !sessionJwt && (
                           <div className="p-4 bg-[#2065d1]/10 border border-[#2065d1]/30 rounded-xl flex items-start gap-3 text-[#e4eaff] text-sm shadow-inner">
                              <span className="material-symbols-outlined text-[#afc6ff]">info</span>
                              <p className="pt-0.5">Secure enrollment token required. Contact your administrator or <Link href="/login" className="font-bold underline text-white hover:text-[#afc6ff]">Sign in</Link> if you have an active account.</p>
                           </div>
                        )}

                        {token && verified && (
                           <div className="p-4 bg-[#00aa54]/10 border border-[#00aa54]/30 rounded-xl flex items-start gap-3 text-[#dae2fd] text-sm shadow-[0_0_15px_rgba(0,170,84,0.1)]">
                              <span className="material-symbols-outlined text-[#57e082] text-2xl">verified_user</span>
                              <div className="pt-0.5">
                                 <p className="font-bold text-[#57e082] uppercase tracking-wider text-xs mb-1">Identity Verified</p>
                                 <p>Welcome, <strong className="text-white text-base">{verified.user_name}</strong>. Please confirm to initiate facial telemetry capture.</p>
                              </div>
                           </div>
                        )}

                        {!token && sessionJwt && (
                           <div className="p-4 bg-[#00aa54]/10 border border-[#00aa54]/30 rounded-xl flex items-start gap-3 text-[#dae2fd] text-sm shadow-[0_0_15px_rgba(0,170,84,0.1)]">
                              <span className="material-symbols-outlined text-[#57e082] text-2xl">badge</span>
                              <div className="pt-0.5">
                                 <p className="font-bold text-[#57e082] uppercase tracking-wider text-xs mb-1">Session Active</p>
                                 <p>Signed into operator terminal as <strong className="text-white">{sessionEmail ?? 'Active User'}</strong>. Facial scans will be bound to this account.</p>
                              </div>
                           </div>
                        )}
                     </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/5">
                     {sessionJwt && (
                        <Link href="/dashboard" className="w-full sm:w-auto px-6 py-3 bg-[#2d3449] hover:bg-[#31394d] text-white text-sm font-bold rounded-xl text-center transition-colors">
                           Cancel Sequence
                        </Link>
                     )}
                     <button
                        className="w-full bg-gradient-to-r from-[#2065d1] to-[#afc6ff] hover:to-white text-[#002d6c] font-black text-sm py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:filter-grayscale active:scale-[0.98] shadow-lg shadow-[#2065d1]/20 flex items-center justify-center gap-2"
                        disabled={!canEnroll || !!verifyError || verifying}
                        onClick={handleNextFromConfirm}
                     >
                        Initiate Camera Protocol
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                     </button>
                  </div>
               </div>
            )}

            {/* Step 1 - Photos */}
            {activeStep === 1 && (
               <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="bg-[#060e20] p-4 rounded-xl border border-white/5 flex gap-3 text-sm">
                     <span className="material-symbols-outlined text-[#ffb950]">lightbulb</span>
                     <p className="text-[#c2c6d5] pt-0.5">Front angle is required for neural baseline. Ensure well-lit conditions. Left/Right profiles improve tracking precision.</p>
                  </div>

                  {/* Photo Requirements List */}
                  <div className="space-y-5">
                     {/* Straight */}
                     <div className="space-y-2">
                        <div className="flex items-center justify-between">
                           <p className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#afc6ff]"></span>
                              Front / Straight
                              <span className="text-[9px] bg-[#93000a] text-white px-2 py-0.5 rounded-full ml-1">REQUIRED</span>
                           </p>
                           {preview.straight && <span className="material-symbols-outlined text-[#57e082] text-sm">check_circle</span>}
                        </div>
                        <div className="flex flex-row gap-2 h-12">
                           <button onClick={() => setWebcamFor('straight')} className="flex-1 bg-[#222a3d]/50 hover:bg-[#2d3449] text-[#dae2fd] text-sm font-medium rounded-lg border border-white/5 transition-colors flex items-center justify-center gap-2">
                              <span className="material-symbols-outlined text-[18px]">videocam</span> Camera
                           </button>
                           <label className="flex-1 bg-[#222a3d]/50 hover:bg-[#2d3449] text-[#dae2fd] text-sm font-medium rounded-lg border border-white/5 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                              <span className="material-symbols-outlined text-[18px]">upload</span> Upload
                              <input type="file" accept="image/*" capture="user" hidden onChange={(e) => setStraight(e.target.files?.[0] ?? null)} />
                           </label>
                        </div>
                         {preview.straight && (
                            <div className="relative w-full h-32 rounded-lg overflow-hidden border border-[#57e082]/30 mt-2 bg-black">
                               {/* eslint-disable-next-line @next/next/no-img-element */}
                               <img src={preview.straight} alt="Front preview" className="w-full h-full object-contain" />
                               <div className="absolute inset-0 ring-inset ring-2 ring-[#57e082]/20 rounded-lg pointer-events-none"></div>
                            </div>
                         )}
                     </div>

                     {/* Left */}
                     <div className="space-y-2 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between">
                           <p className="text-xs font-bold uppercase tracking-wider text-[#8c909f] flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full border border-[#8c909f]"></span>
                              Left Angle <span className="text-[9px] opacity-70 ml-1">(Optional)</span>
                           </p>
                           {preview.left && <span className="material-symbols-outlined text-[#57e082] text-sm">check_circle</span>}
                        </div>
                        <div className="flex flex-row gap-2 h-10">
                           <button onClick={() => setWebcamFor('left')} className="flex-1 bg-transparent hover:bg-[#222a3d] text-[#8c909f] hover:text-white text-xs font-medium rounded-lg border border-white/5 transition-colors flex items-center justify-center gap-2">
                              <span className="material-symbols-outlined text-[16px]">videocam</span>
                           </button>
                           <label className="flex-1 bg-transparent hover:bg-[#222a3d] text-[#8c909f] hover:text-white text-xs font-medium rounded-lg border border-white/5 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                              <span className="material-symbols-outlined text-[16px]">upload_file</span>
                              <input type="file" accept="image/*" hidden onChange={(e) => setLeft(e.target.files?.[0] ?? null)} />
                           </label>
                        </div>
                         {preview.left && (
                            <div className="w-24 h-24 rounded-lg overflow-hidden border border-[#57e082]/30 mt-2 bg-black inline-block">
                               {/* eslint-disable-next-line @next/next/no-img-element */}
                               <img src={preview.left} alt="Left preview" className="w-full h-full object-cover" />
                            </div>
                         )}
                     </div>

                     {/* Right */}
                     <div className="space-y-2 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between">
                           <p className="text-xs font-bold uppercase tracking-wider text-[#8c909f] flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full border border-[#8c909f]"></span>
                              Right Angle <span className="text-[9px] opacity-70 ml-1">(Optional)</span>
                           </p>
                           {preview.right && <span className="material-symbols-outlined text-[#57e082] text-sm">check_circle</span>}
                        </div>
                        <div className="flex flex-row gap-2 h-10">
                           <button onClick={() => setWebcamFor('right')} className="flex-1 bg-transparent hover:bg-[#222a3d] text-[#8c909f] hover:text-white text-xs font-medium rounded-lg border border-white/5 transition-colors flex items-center justify-center gap-2">
                              <span className="material-symbols-outlined text-[16px]">videocam</span>
                           </button>
                           <label className="flex-1 bg-transparent hover:bg-[#222a3d] text-[#8c909f] hover:text-white text-xs font-medium rounded-lg border border-white/5 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                              <span className="material-symbols-outlined text-[16px]">upload_file</span>
                              <input type="file" accept="image/*" hidden onChange={(e) => setRight(e.target.files?.[0] ?? null)} />
                           </label>
                        </div>
                         {preview.right && (
                            <div className="w-24 h-24 rounded-lg overflow-hidden border border-[#57e082]/30 mt-2 bg-black inline-block">
                               {/* eslint-disable-next-line @next/next/no-img-element */}
                               <img src={preview.right} alt="Right preview" className="w-full h-full object-cover" />
                            </div>
                         )}
                     </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-6 border-t border-white/5">
                     <button onClick={() => setActiveStep(0)} className="w-full sm:w-auto px-4 py-2.5 text-sm font-bold text-[#8c909f] hover:text-white transition-colors">
                        Go Back
                     </button>
                     <div className="flex gap-3 w-full sm:w-auto">
                        {sessionJwt && (
                           <Link href="/dashboard" className="flex-1 sm:flex-none text-center px-4 py-2.5 bg-[#222a3d]/50 hover:bg-[#2d3449] text-[#c2c6d5] border border-white/5 text-sm font-bold rounded-xl transition-colors">
                              Abort
                           </Link>
                        )}
                        <button 
                           onClick={() => setActiveStep(2)} 
                           disabled={!straight}
                           className="flex-1 sm:flex-none px-6 py-2.5 bg-[#afc6ff] hover:bg-white text-[#002d6c] font-bold text-sm rounded-xl transition-all disabled:opacity-50 disabled:bg-[#424753] disabled:text-[#8c909f] shadow-[0_0_15px_rgba(175,198,255,0.2)] disabled:shadow-none"
                        >
                           Review Node
                        </button>
                     </div>
                  </div>
               </div>
            )}

            {/* Step 2 - Review */}
            {activeStep === 2 && (
               <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                  <div className="bg-[#131b2e] border border-white/5 p-5 rounded-xl text-sm">
                     <h3 className="font-bold text-white mb-2">Final Neural Review</h3>
                     <p className="text-[#8c909f] leading-relaxed">
                        {filesList().length} image(s) mapped for payload delivery. The global recognition index will fuse these perspectives into a single biometric embedding map.
                     </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-[#060e20] p-4 rounded-xl border border-white/5 shadow-inner">
                      {preview.straight && (
                         <div className="relative group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={preview.straight} className="w-full aspect-square object-cover rounded-lg border border-[#57e082]/40" alt="straight" />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 text-center backdrop-blur-sm rounded-b-lg">
                               <span className="text-[10px] text-white font-bold uppercase tracking-widest">FRONT</span>
                            </div>
                         </div>
                      )}
                      {preview.left && (
                         <div className="relative group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={preview.left} className="w-full aspect-square object-cover rounded-lg border border-white/10" alt="left" />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 text-center backdrop-blur-sm rounded-b-lg">
                               <span className="text-[10px] text-white font-bold uppercase tracking-widest">LEFT</span>
                            </div>
                         </div>
                      )}
                      {preview.right && (
                         <div className="relative group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={preview.right} className="w-full aspect-square object-cover rounded-lg border border-white/10" alt="right" />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 text-center backdrop-blur-sm rounded-b-lg">
                               <span className="text-[10px] text-white font-bold uppercase tracking-widest">RIGHT</span>
                            </div>
                         </div>
                      )}
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-6 border-t border-white/5">
                     <button onClick={() => setActiveStep(1)} disabled={busy} className="w-full sm:w-auto px-4 py-2.5 text-sm font-bold text-[#8c909f] hover:text-white transition-colors disabled:opacity-50">
                        Go Back
                     </button>
                     <div className="flex gap-3 w-full sm:w-auto">
                        <button 
                           onClick={submit} 
                           disabled={busy || !straight}
                           className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#00aa54] to-[#57e082] text-[#00210b] font-bold text-sm rounded-xl transition-all shadow-lg shadow-[#00aa54]/20 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:filter-grayscale"
                        >
                           {busy ? (
                              <>
                                 <span className="material-symbols-outlined animate-spin align-middle" style={{ fontSize: '18px' }}>sync</span>
                                 Encoding...
                              </>
                           ) : (
                              <>
                                 <span className="material-symbols-outlined align-middle" style={{ fontSize: '18px' }}>check_circle</span>
                                 Deploy Embedding
                              </>
                           )}
                        </button>
                     </div>
                  </div>
               </div>
            )}

            {/* Step 3 - Done */}
            {activeStep === 3 && done && (
               <div className="flex flex-col items-center justify-center space-y-6 py-8 animate-in fade-in zoom-in-95 duration-500">
                  <div className="w-24 h-24 bg-[#00aa54]/20 rounded-full flex items-center justify-center relative">
                     <div className="absolute inset-0 border-4 border-[#57e082]/30 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
                     <span className="material-symbols-outlined text-[#57e082]" style={{ fontSize: '56px' }}>check_circle</span>
                  </div>
                  
                  <div className="text-center space-y-2">
                     <h3 className="text-2xl font-bold text-white font-[Manrope]">Telemetry Deployed</h3>
                     <p className="text-sm text-[#8c909f] max-w-sm mx-auto leading-relaxed">
                        Security identity created. Live neural arrays will leverage this matrix. <br/>You may securely dismiss this window.
                     </p>
                  </div>

                  {sessionJwt && (
                     <div className="pt-4 w-full sm:w-auto">
                        <Link href="/dashboard" className="w-full inline-flex items-center justify-center gap-2 px-8 py-3 bg-[#2d3449] hover:bg-[#31394d] text-white text-sm font-bold border border-white/10 rounded-xl transition-all shadow-lg shadow-black/20">
                           <span className="material-symbols-outlined text-[18px]">dashboard</span>
                           Return to Core Dashboard
                        </Link>
                     </div>
                  )}
                  {!sessionJwt && (
                     <div className="inline-block p-3 rounded-lg bg-[#222a3d]/30 border border-white/5">
                        <p className="text-[10px] uppercase font-bold text-[#8c909f] tracking-widest text-center">Session Ended Successfully</p>
                     </div>
                  )}
               </div>
            )}
         </div>
      </div>

      {/* Capture overlay mounting portal */}
      <WebcamCaptureDialog
         open={webcamFor !== null}
         onClose={() => setWebcamFor(null)}
         onCaptured={(file) => {
            if (webcamFor === 'straight') setStraight(file);
            else if (webcamFor === 'left') setLeft(file);
            else if (webcamFor === 'right') setRight(file);
            setWebcamFor(null);
         }}
         title={
            webcamFor === 'straight'
            ? 'Initialize Front Sequence'
            : webcamFor === 'left' ? 'Initialize Left Sequence' : 'Initialize Right Sequence'
         }
         description={
            webcamFor === 'straight'
            ? 'Center your facial structure within the guide wireframe.'
            : 'Slight rotation required. Keep primary facial features visible.'
         }
      />
    </div>
  );
}

export default function EnrollPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0b1326] flex items-center justify-center">
           <div className="w-12 h-12 border-4 border-[#2065d1] border-t-white rounded-full animate-spin"></div>
        </div>
      }
    >
      <EnrollContent />
    </Suspense>
  );
}
