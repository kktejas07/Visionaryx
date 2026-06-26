'use client';

import Link from 'next/link';
import { WelcomeIllustration } from '@/components/illustrations';

interface WelcomeCardProps {
  displayName?: string;
}

/** Stitch Digital Sentinel — dark hero card */
export function WelcomeCard({ displayName = 'Admin' }: WelcomeCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#131b2e] via-[#171f33] to-[#222a3d] border border-white/5 shadow-[0_16px_48px_rgba(0,0,0,0.45)] text-white">
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, #2065d1 1px, transparent 1px), radial-gradient(circle at 80% 20%, #57e082 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
      
      <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 z-10">
        <div className="flex-1">
          <h2 className="font-[Manrope] font-extrabold text-2xl sm:text-3xl tracking-tight mb-2">
            Hi, {displayName} <span className="inline-block animate-[wave_2.5s_infinite]">👋</span>
          </h2>
          <p className="text-[#c2c6d5] max-w-[420px] mb-6 leading-relaxed text-sm">
            Monitor your AI surveillance system in real time. View live streams, manage cameras, and track face recognition events.
          </p>
          <Link href="/live" className="inline-flex items-center gap-2 bg-[#00aa54] hover:bg-[#007b55] text-[#003415] hover:text-white font-bold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-[#00aa54]/20 group">
            Go to Live
            <span className="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </Link>
        </div>
        <div className="hidden md:block shrink-0">
          <WelcomeIllustration size={220} className="opacity-90 drop-shadow-2xl" />
        </div>
      </div>
    </div>
  );
}
