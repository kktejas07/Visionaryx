'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!getToken()) {
      router.replace('/login');
    }
  }, [mounted, router]);

  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-[#2065d1] border-t-white rounded-full animate-spin mb-4"></div>
        <p className="text-[#8c909f] text-sm font-bold uppercase tracking-widest animate-pulse">Initializing Session</p>
      </div>
    );
  }

  if (typeof window !== 'undefined' && !getToken()) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
         <p className="text-[#8c909f] text-sm font-bold uppercase tracking-widest">Redirecting to login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
