'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/contexts/ToastContext';
import { getApiBase } from '@/lib/api';

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

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${getApiBase()}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email, password }),
      });
      let data: unknown = null;
      try {
        data = await r.json();
      } catch {
        data = null;
      }
      if (!r.ok) {
        throw new Error(formatApiError(data, r.status === 503 ? 'Service unavailable' : 'Registration failed'));
      }
      const payload = data as { access_token?: string };
      if (!payload?.access_token) {
        throw new Error('Invalid registration response');
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', payload.access_token);
      }
      toast.success('Account created');
      router.push('/enroll');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Registration failed. Please check your details.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0b1326] text-[#dae2fd] font-[Inter] min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorative Element */}
      <div className="fixed top-0 right-0 -z-10 w-full h-full opacity-30 pointer-events-none">
         <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#afc6ff]/20 blur-[120px]"></div>
         <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#00aa54]/10 blur-[100px]"></div>
      </div>

      {/* Top Navigation Bar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-8 h-20">
         <div className="flex items-center gap-2">
            <span className="font-[Manrope] font-black text-3xl text-[#afc6ff] tracking-tighter">Visioryx</span>
         </div>
         <div className="hidden md:flex items-center gap-6">
            <Link className="text-[10px] uppercase tracking-widest text-[#8c909f] hover:text-[#dae2fd] font-bold transition-colors" href="/login">Sign In</Link>
         </div>
      </header>

      <main className="w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-2 gap-12 items-center z-10 my-16">
         {/* Left Column: Editorial Content */}
         <div className="hidden lg:flex flex-col space-y-8 pr-12 animate-in slide-in-from-left-8 duration-700">
            <div className="space-y-4">
               <h1 className="font-[Manrope] font-extrabold text-6xl tracking-tight leading-[1.1] text-[#dae2fd]">
                  Start <br/>
                  <span className="text-[#00aa54]">Monitoring</span> <br/>
                  Networks.
               </h1>
               <p className="text-xl text-[#c2c6d5] max-w-md leading-relaxed">
                  Join the platform to enroll your facial identity and gain access to advanced surveillance tools. Operators and admins map the future of digital safety.
               </p>
            </div>
            
            <div className="mt-8">
               <div className="p-6 rounded-xl bg-[#131b2e] flex flex-col space-y-2 border border-white/5 border-l-4 border-l-[#00aa54]">
                  <span className="material-symbols-outlined text-[#00aa54] text-3xl mb-2">face_recognition</span>
                  <span className="text-sm font-bold text-[#8c909f] uppercase tracking-wider">Step 1: Identity</span>
                  <span className="font-[Manrope] font-bold text-lg text-white">Create your clearance profile</span>
                  <p className="text-sm text-[#8c909f] mt-1">Setup multi-angle facial telemetry immediately after registration.</p>
               </div>
            </div>
         </div>

         {/* Right Column: Enrollment Card */}
         <div className="w-full flex justify-center lg:justify-end animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full max-w-[480px] bg-[#222a3d]/40 backdrop-blur-[20px] p-8 md:p-10 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-white/10 flex flex-col space-y-8 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-[#00aa54]/20 rounded-full blur-[50px] pointer-events-none"></div>

               <div className="space-y-2 relative z-10">
                  <h2 className="font-[Manrope] font-bold text-3xl text-white">Register Account</h2>
                  <p className="text-[#c2c6d5] text-sm">Sign up to enroll your face telemetry. Advanced surveillance features require an operator role post-registration.</p>
               </div>
               
               <form 
                  className="space-y-5 relative z-10"
                  onSubmit={(e) => {
                     e.preventDefault();
                     void handleRegister();
                  }}
               >
                  {/* Error State Message */}
                  {error && (
                     <div className="flex items-center gap-3 p-4 rounded-xl bg-[#93000a]/20 border border-[#error]/20 animate-in slide-in-from-top-2">
                        <span className="material-symbols-outlined text-[#ffb4ab] text-xl">error</span>
                        <p className="text-sm text-[#ffdad6]">{error}</p>
                     </div>
                  )}

                  {/* Name Field */}
                  <div className="space-y-2">
                     <label className="block text-xs font-bold uppercase tracking-[0.1em] text-[#c2c6d5] ml-1" htmlFor="name">Full Name</label>
                     <div className="relative group">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#8c909f] transition-colors group-focus-within:text-[#00aa54]">badge</span>
                        <input 
                           className="w-full h-12 pl-12 pr-4 bg-[#060e20] border border-white/5 rounded-xl text-white placeholder:text-[#8c909f]/50 focus:ring-2 focus:ring-[#00aa54]/50 focus:border-transparent transition-all outline-none" 
                           id="name" 
                           name="name" 
                           placeholder="John Doe" 
                           type="text" 
                           required
                           value={name}
                           onChange={(e) => setName(e.target.value)}
                        />
                     </div>
                  </div>

                  {/* Email Field */}
                  <div className="space-y-2">
                     <label className="block text-xs font-bold uppercase tracking-[0.1em] text-[#c2c6d5] ml-1" htmlFor="email">Work Email</label>
                     <div className="relative group">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#8c909f] transition-colors group-focus-within:text-[#00aa54]">mail</span>
                        <input 
                           className="w-full h-12 pl-12 pr-4 bg-[#060e20] border border-white/5 rounded-xl text-white placeholder:text-[#8c909f]/50 focus:ring-2 focus:ring-[#00aa54]/50 focus:border-transparent transition-all outline-none" 
                           id="email" 
                           name="email" 
                           placeholder="name@company.com" 
                           type="email" 
                           required
                           value={email}
                           onChange={(e) => setEmail(e.target.value)}
                        />
                     </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                     {/* Password Field */}
                     <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-[#c2c6d5] ml-1" htmlFor="password">Access Code</label>
                        <div className="relative group">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#8c909f] transition-colors group-focus-within:text-[#00aa54] text-[18px]">lock</span>
                           <input 
                              className="w-full h-12 pl-10 pr-10 bg-[#060e20] border border-white/5 rounded-xl text-white placeholder:text-[#8c909f]/50 focus:ring-2 focus:ring-[#00aa54]/50 focus:border-transparent transition-all outline-none text-sm" 
                              id="password" 
                              name="password" 
                              placeholder="••••••••" 
                              type={showPassword ? 'text' : 'password'}
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                           />
                           <button 
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8c909f] hover:text-white transition-colors focus:outline-none" 
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                           >
                              <span className="material-symbols-outlined text-[18px]">
                                 {showPassword ? 'visibility_off' : 'visibility'}
                              </span>
                           </button>
                        </div>
                     </div>

                     {/* Confirm Password Field */}
                     <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.1em] text-[#c2c6d5] ml-1" htmlFor="confirmPassword">Verify Code</label>
                        <div className="relative group">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#8c909f] transition-colors group-focus-within:text-[#00aa54] text-[18px]">lock_reset</span>
                           <input 
                              className="w-full h-12 pl-10 pr-10 bg-[#060e20] border border-white/5 rounded-xl text-white placeholder:text-[#8c909f]/50 focus:ring-2 focus:ring-[#00aa54]/50 focus:border-transparent transition-all outline-none text-sm" 
                              id="confirmPassword" 
                              name="confirmPassword" 
                              placeholder="••••••••" 
                              type={showConfirmPassword ? 'text' : 'password'}
                              required
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                           />
                           <button 
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8c909f] hover:text-white transition-colors focus:outline-none" 
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                           >
                              <span className="material-symbols-outlined text-[18px]">
                                 {showConfirmPassword ? 'visibility_off' : 'visibility'}
                              </span>
                           </button>
                        </div>
                     </div>
                  </div>

                  <div className="pt-2">
                     <button 
                        type="submit"
                        disabled={loading}
                        className="w-full h-14 bg-gradient-to-br from-[#00aa54] to-[#57e082] rounded-xl text-[#00210b] font-[Manrope] font-extrabold text-lg flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-[#00aa54]/20 disabled:opacity-70 disabled:scale-100"
                     >
                        {loading ? (
                           <>
                              <span className="material-symbols-outlined animate-spin">refresh</span>
                              <span>Registering...</span>
                           </>
                        ) : (
                           <>
                              <span className="material-symbols-outlined">how_to_reg</span>
                              <span>Complete Registration</span>
                           </>
                        )}
                     </button>
                  </div>
               </form>
               
               <div className="flex flex-col items-center gap-2 pt-2 relative z-10 border-t border-white/10">
                  <p className="text-sm text-[#8c909f] mt-4">Already have clearance? <Link href="/login" className="text-[#57e082] hover:text-white font-bold transition-colors">Sign in here</Link></p>
               </div>
            </div>
         </div>
      </main>
    </div>
  );
}
