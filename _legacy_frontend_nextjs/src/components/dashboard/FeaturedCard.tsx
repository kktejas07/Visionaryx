'use client';

import Link from 'next/link';

/**
 * Minimals-style featured/quick actions card with gradient background.
 */
export function FeaturedCard() {
  return (
    <Link href="/live" className="block w-full h-full min-h-[180px] group">
      <div className="relative w-full h-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#2065D1] via-[#3366FF] to-[#5A9AFA] transition-all duration-300 transform group-hover:-translate-y-1 group-hover:shadow-[0_20px_40px_-12px_rgba(32,101,209,0.4)] isolation-isolate">
        
        {/* Slight dark overlay to guarantee text contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/25 z-0"></div>

        {/* Subtle gradient overlays - low opacity to not obscure text */}
        <div className="absolute -top-5 -right-5 w-28 h-28 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.10)_0%,transparent_70%)] z-0"></div>
        <div className="absolute -bottom-3 -left-3 w-20 h-20 rounded-full bg-[radial-gradient(circle,rgba(0,171,85,0.14)_0%,transparent_70%)] z-0"></div>

        <div className="relative z-10 p-6 flex flex-col justify-end h-full">
          <p className="text-[10px] text-white/95 font-bold uppercase tracking-widest mb-1 shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
            Quick Access
          </p>
          <h3 className="text-xl sm:text-2xl font-extrabold text-white/95 mb-2 shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
            Live Monitoring
          </h3>
          <p className="text-sm text-white/90 leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
            View real-time camera streams with face & object detection
          </p>
        </div>
      </div>
    </Link>
  );
}
