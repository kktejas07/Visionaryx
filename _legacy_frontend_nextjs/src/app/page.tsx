'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 bg-gradient-to-br from-[#060e20] via-[#0b1326] to-[#131b2e] px-4 text-center">
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h1 className="font-[Manrope] font-extrabold tracking-tight text-[#afc6ff] text-5xl sm:text-7xl mb-4">
          Visioryx
        </h1>
        <p className="text-[#c2c6d5] text-lg sm:text-xl font-[Inter] mb-10 max-w-xl mx-auto leading-relaxed">
          AI Powered Real-Time Face Recognition & Surveillance System. Digital Sentinel core active.
        </p>
        <Link 
          href="/login"
          className="inline-flex items-center gap-2 bg-gradient-to-br from-[#afc6ff] to-[#2065d1] text-[#002d6c] font-black px-10 py-4 rounded-2xl shadow-2xl shadow-[#2065d1]/30 hover:scale-[1.02] active:scale-95 transition-all"
        >
          Sign In to Access Dashboard
          <span className="material-symbols-outlined">arrow_forward</span>
        </Link>
      </div>
      
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 opacity-30 grayscale pointer-events-none">
         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Secured by Digital Sentinel Architecture</span>
      </div>
    </main>
  );
}
