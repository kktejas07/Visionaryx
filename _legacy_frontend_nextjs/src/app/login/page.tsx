'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/contexts/ToastContext';
import { AppVersionFooter } from '@/components/AppVersionFooter';
import { api, getApiBase } from '@/lib/api';

type MetaInfo = {
  app_name: string;
  backend_version: string;
  mobile_app_version?: string;
  mobile_app_ios_url?: string;
  mobile_app_android_url?: string;
};

type BrandInfo = {
  company_name: string;
  company_logo_url: string;
  favicon_url: string;
  copyright_text: string;
};

function formatApiError(data: unknown, fallback: string): string {
  if (data == null || typeof data !== 'object') return fallback;
  const d = data as { detail?: unknown };
  const { detail } = d;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: string }).msg);
        }
        return JSON.stringify(item);
      })
      .join(' ');
  }
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('admin@visioryx.dev');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [metaInfo, setMetaInfo] = useState<MetaInfo | null>(null);
  const [brandInfo, setBrandInfo] = useState<BrandInfo | null>(null);

  useEffect(() => {
    api<MetaInfo>('/api/v1/meta/version')
      .then(setMetaInfo)
      .catch(() => {});
    api<BrandInfo>('/api/v1/settings/brand')
      .then(setBrandInfo)
      .catch(() => {});
  }, []);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const r = await fetch(`${getApiBase()}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, expires_in_days: rememberMe ? 30 : undefined }),
      });
      let data: unknown = null;
      try {
        data = await r.json();
      } catch {
        data = null;
      }
      if (!r.ok) {
        throw new Error(formatApiError(data, r.status === 503 ? 'Service unavailable' : 'Invalid email or password'));
      }
      const payload = data as { access_token?: string };
      if (!payload?.access_token) {
        throw new Error('Invalid login response');
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', payload.access_token);
      }
      const me = await api<{ role: string }>('/api/v1/auth/me');
      toast.success('Signed in successfully');
      router.push(me.role === 'enrollee' ? '/enroll' : '/dashboard');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed. Please check your credentials or network connection.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }
    setRecoveryLoading(true);
    try {
      const r = await fetch(`${getApiBase()}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await r.json();
      if (r.ok) {
        toast.success('Password recovery email sent if account exists');
      } else {
        throw new Error(data.detail || 'Failed to process recovery request');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to process recovery';
      setError(msg);
      toast.error(msg);
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="bg-background text-on-surface font-inter min-h-screen flex flex-col p-4 relative overflow-hidden">
      {/* Background Decorative Element */}
      <div className="fixed top-0 right-0 -z-10 w-full h-full opacity-30 pointer-events-none">
         <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary-light/20 blur-[120px]"></div>
         <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-success/10 blur-[100px]"></div>
      </div>

      {/* Top Navigation Bar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-8 h-20">
          <div className="flex items-center gap-2">
             {brandInfo?.company_logo_url ? (
               <img src={brandInfo.company_logo_url} alt="Logo" className="h-10 object-contain" />
             ) : (
               <span className="font-manrope font-black text-3xl text-primary-light tracking-tighter">{brandInfo?.company_name || 'Visioryx'}</span>
             )}
          </div>
      </header>

      <main className="flex-1 w-full max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center z-10">
         {/* Left Column: Editorial Content */}
         <div className="hidden lg:flex flex-col space-y-8 pr-12">
            <div className="space-y-4 animate-in slide-in-from-left-8 duration-700">
               <h1 className="font-manrope font-extrabold text-6xl tracking-tight leading-[1.1] text-on-surface">
                  Advanced <br/>
                  <span className="text-primary-light">Surveillance</span> <br/>
                  Intelligence.
               </h1>
               <p className="text-xl text-slate-400/80 max-w-md leading-relaxed">
                  The next evolution of enterprise security. Precision monitoring, real-time analytics, and automated response protocols.
               </p>
            </div>
            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-left-8 duration-1000">
               <div className="p-6 rounded-xl bg-surface-variant/50 flex flex-col space-y-2 border border-white/5">
                  <span className="material-symbols-outlined text-primary-light text-3xl">verified_user</span>
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Authentication</span>
                  <span className="font-manrope font-bold text-lg text-white">Multi-Factor Ready</span>
               </div>
               <div className="p-6 rounded-xl bg-surface-variant/50 flex flex-col space-y-2 border border-white/5">
                   <span className="material-symbols-outlined text-secondary text-3xl">terminal</span>
                   <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">Protocol</span>
                   <span className="font-manrope font-bold text-lg text-white">TLS 1.3 / HTTPS</span>
                </div>
            </div>
            
            {/* Mobile App Downloads */}
            {(metaInfo?.mobile_app_ios_url || metaInfo?.mobile_app_android_url) && (
              <div className="mt-8 animate-in slide-in-from-left-8 duration-1000">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Mobile App</p>
                <div className="flex gap-4">
                  {metaInfo?.mobile_app_android_url && (
                    <a
                      href={metaInfo.mobile_app_android_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-5 py-3 bg-[#3bcc4a]/20 hover:bg-[#3bcc4a]/30 border border-[#3bcc4a]/30 rounded-xl transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                        <path d="M17.523 2.047a.5.5 0 00-.583.218L9.083 10.91a.996.996 0 00.576.18l6.864.01a.5.5 0 00.5-.5v-9zm-1.593 1.12L8.51 13.68a.5.5 0 01-.285.093l-3.424.643a1.5 1.5 0 00-1.108 1.108l-.643 3.424a.5.5 0 01-.092.285l-1.047 5.59a.5.5 0 00.572.572l5.59-1.047a.5.5 0 01.286.093l3.424.643a1.5 1.5 0 001.107-1.108l.644-3.424a.5.5 0 01.093-.286l6.428-1.047a.5.5 0 00.357-.643l-2.69-14.45a.5.5 0 00-.572-.357z"/>
                        <path d="M4.5 10.67l.707-.707L4.5 9.257v1.413zM3 7.5l1.5-1.5.707.707L3.707 8.207 3 7.5zm14.5.5l-2.5-2.5.707-.707L18 7.293v.707zm-12 3l.5-.5.707.707L6 11.707v-.707z"/>
                      </svg>
                      <div>
                        <span className="block text-xs text-slate-400">Android</span>
                        <span className="font-bold text-white">Download APK</span>
                      </div>
                    </a>
                  )}
                  {metaInfo?.mobile_app_ios_url && (
                    <a
                      href={metaInfo.mobile_app_ios_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-5 py-3 bg-[#007aff]/20 hover:bg-[#007aff]/30 border border-[#007aff]/30 rounded-xl transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                      </svg>
                      <div>
                        <span className="block text-xs text-slate-400">iOS</span>
                        <span className="font-bold text-white">Download IPA</span>
                      </div>
                    </a>
                  )}
                </div>
                {metaInfo?.mobile_app_version && (
                  <p className="text-xs text-slate-500 mt-2">Version {metaInfo.mobile_app_version}</p>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Login Card */}
         <div className="w-full flex justify-center lg:justify-end animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full max-w-[440px] bg-surface-variant/40 backdrop-blur-[20px] p-10 rounded-2xl shadow-[-4px_40px_rgba(175,198,255,0.04)] border border-white/10 flex flex-col space-y-8 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-[50px] pointer-events-none"></div>

               <div className="space-y-2 relative z-10">
                  <h2 className="font-manrope font-bold text-3xl text-white">Secure Access</h2>
                  <p className="text-slate-400">Enter your credentials to monitor your assets.</p>
               </div>
               
               <form 
                  className="space-y-6 relative z-10"
                  onSubmit={(e) => {
                     e.preventDefault();
                     void handleLogin();
                  }}
               >
                  {/* Error State Message */}
                  {error && (
                     <div className="flex items-center gap-3 p-4 rounded-xl bg-error-dark/20 border border-error/20 animate-in slide-in-from-top-2">
                        <span className="material-symbols-outlined text-error text-xl">error</span>
                        <p className="text-sm text-error-light">{error}</p>
                     </div>
                  )}

                  <div className="space-y-5">
                     {/* Email Field */}
                     <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 ml-1" htmlFor="email">Work Email</label>
                        <div className="relative group">
                           <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#8c909f] transition-colors group-focus-within:text-[#afc6ff]">mail</span>
                           <input 
                              className="w-full h-14 pl-12 pr-4 bg-[#060e20] border border-white/5 rounded-xl text-white placeholder:text-[#8c909f]/50 focus:ring-2 focus:ring-[#2065d1]/50 focus:border-transparent transition-all outline-none" 
                              id="email" 
                              name="email" 
                              placeholder="name@company.com" 
                              type="email" 
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                           />
                        </div>
                     </div>
                     
                     {/* Password Field */}
<div className="space-y-2">
                         <div className="flex justify-between items-center px-1">
                            <label className="block text-xs font-bold uppercase tracking-widest text-[#c2c6d5]" htmlFor="password">Access Code</label>
                            <button 
                              type="button"
                              onClick={handleRecovery}
                              disabled={recoveryLoading}
                              className="text-xs font-bold uppercase tracking-[0.05em] text-[#afc6ff] hover:text-[#d9e2ff] transition-colors disabled:opacity-50"
                            >
                              {recoveryLoading ? 'Sending...' : 'Recovery'}
                            </button>
                         </div>
                        <div className="relative group">
                           <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 transition-colors group-focus-within:text-primary-light">lock</span>
                           <input 
                              className="w-full h-14 pl-12 pr-12 bg-[#060e20] border border-white/5 rounded-xl text-white placeholder:text-slate-400/50 focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all outline-none" 
                              id="password" 
                              name="password" 
                              placeholder="••••••••" 
                              type={showPassword ? 'text' : 'password'}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                           />
                           <button 
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8c909f] hover:text-white transition-colors focus:outline-none" 
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                           >
                              <span className="material-symbols-outlined">
                                 {showPassword ? 'visibility_off' : 'visibility'}
                              </span>
                           </button>
                        </div>
</div>
                   </div>

                   {/* Remember Me */}
                   <div className="flex items-center gap-3">
                     <button
                       type="button"
                       onClick={() => setRememberMe(!rememberMe)}
                       className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                         rememberMe 
                           ? 'bg-primary-light border-primary-light' 
                           : 'border-white/20 bg-transparent'
                       }`}
                     >
                       {rememberMe && <span className="material-symbols-outlined text-primary-dark text-sm">check</span>}
                     </button>
                     <span 
                       className="text-sm text-slate-400 cursor-pointer"
                       onClick={() => setRememberMe(!rememberMe)}
                     >
                       Trusted device for 30 days
                     </span>
                   </div>

                   {/* Action Button */}
                  <button 
                     type="submit"
                     disabled={loading}
                     className="w-full h-14 bg-linear-to-br from-primary-light to-primary rounded-xl text-primary-dark font-manrope font-extrabold text-lg flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-70 disabled:scale-100"
                  >
                     {loading ? (
                        <>
                           <span className="material-symbols-outlined animate-spin">refresh</span>
                           <span>Connecting...</span>
                        </>
                     ) : (
                        <>
                           <span>Initialize Protocol</span>
                           <span className="material-symbols-outlined">arrow_forward</span>
                        </>
                     )}
                  </button>
               </form>
               
               <div className="flex flex-col items-center gap-2 pt-4 relative z-10">
                  <p className="text-sm text-[#8c909f]">No account? <Link href="/register" className="text-[#afc6ff] hover:text-white font-bold transition-colors">Create one</Link></p>
                  <p className="text-[10px] text-[#424753] uppercase tracking-widest font-bold">Demo: admin@visioryx.dev / admin123</p>
               </div>
            </div>
         </div>
      </main>

      <footer className="w-full py-6 text-center z-10 space-y-2">
        {brandInfo?.copyright_text && (
          <p className="text-xs text-slate-500">{brandInfo.copyright_text}</p>
        )}
        <AppVersionFooter className="text-[10px] text-slate-500 uppercase tracking-widest font-bold" />
      </footer>
    </div>
  );
}
