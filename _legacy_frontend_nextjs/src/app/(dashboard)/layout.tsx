'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { AppVersionFooter } from '@/components/AppVersionFooter';
import { api } from '@/lib/api';

const FULL_NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/live', label: 'Live Monitoring', icon: 'videocam' },
  { path: '/cameras', label: 'Cameras', icon: 'photo_camera' },
  { path: '/detections', label: 'Detections', icon: 'manage_search' },
  { path: '/alerts', label: 'Alerts', icon: 'notifications_active' },
  { path: '/users', label: 'Users', icon: 'group' },
  { path: '/analytics', label: 'Analytics', icon: 'analytics' },
  { path: '/audit', label: 'Audit Logs', icon: 'history' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

const ENROLLEE_NAV_ITEMS = [
  { path: '/dashboard', label: 'Home', icon: 'dashboard' },
  { path: '/enroll', label: 'Face enrollment', icon: 'face' },
  { path: '/settings', label: 'Account Settings', icon: 'manage_accounts' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [userRole, setUserRole] = useState<string | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string>('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    api<{ role: string; email: string }>('/api/v1/auth/me')
      .then((r) => {
        setUserRole(r.role);
        setUserEmail(r.email);
      })
      .catch(() => setUserRole(''));
  }, [mounted]);

  useEffect(() => {
    if (userRole === 'enrollee') {
      const blocked = ['/live', '/cameras', '/users', '/detections', '/analytics', '/alerts', '/audit'];
      if (pathname && blocked.includes(pathname)) router.replace('/dashboard');
    }
  }, [userRole, pathname, router]);

  useEffect(() => {
    let cancelled = false;
    const q = searchQuery.toLowerCase();
    const navForSearch = userRole === 'enrollee' ? ENROLLEE_NAV_ITEMS : FULL_NAV_ITEMS;

    const searchPages = () =>
      navForSearch
        .filter((item) => item.label.toLowerCase().includes(q))
        .map((item) => ({ ...item, type: 'page' as const }));

    const runSearch = async () => {
      const pages = searchPages();
      if (cancelled) return;
      setSearchResults(pages);

      const canSearchEntities =
        (userRole === 'admin' || userRole === 'operator') && searchQuery.trim().length > 0;
      if (!canSearchEntities) {
        return;
      }

      try {
        const [camOut, usrOut] = await Promise.allSettled([
          api<unknown>('/api/v1/cameras'),
          api<{ items: any[] }>('/api/v1/users?limit=50'),
        ]);

        if (cancelled) return;

        const rawCams = camOut.status === 'fulfilled' ? camOut.value : null;
        const camList: { camera_name: string }[] = Array.isArray(rawCams)
          ? rawCams
          : rawCams && typeof rawCams === 'object' && 'items' in rawCams
            ? ((rawCams as { items: { camera_name: string }[] }).items ?? [])
            : [];

        const usrData =
          usrOut.status === 'fulfilled' ? usrOut.value : { items: [] as any[] };
        const userItems = usrData.items ?? [];

        const camResults = camList
          .filter((c) => c.camera_name.toLowerCase().includes(q))
          .map((c) => ({
            path: '/cameras',
            label: `Camera: ${c.camera_name}`,
            icon: 'videocam',
            type: 'device' as const,
          }));

        const userResults = userItems
          .filter(
            (u: { name: string; email: string }) =>
              u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
          )
          .map((u: { name: string }) => ({
            path: '/users',
            label: `User: ${u.name}`,
            icon: 'person',
            type: 'identity' as const,
          }));

        setSearchResults([...pages, ...camResults, ...userResults]);
      } catch (e) {
        console.error('Search failed', e);
      }
    };

    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, userRole]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const navItems = useMemo(() => {
    if (userRole === 'enrollee') return ENROLLEE_NAV_ITEMS;
    return FULL_NAV_ITEMS;
  }, [userRole]);

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  };

  const displayName = useMemo(() => {
    if (!userEmail) return 'Admin';
    const part = userEmail.split('@')[0];
    return part ? part.charAt(0).toUpperCase() + part.slice(1) : 'Admin';
  }, [userEmail]);

  return (
    <div className="bg-surface text-on-surface min-h-screen flex selection:bg-primary-container/30">
      
      {/* Mobile Nav Toggle */}
      <button 
        className="fixed bottom-4 right-4 lg:hidden z-50 bg-primary text-white p-3 rounded-full shadow-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <span className="material-symbols-outlined">{mobileOpen ? 'close' : 'menu'}</span>
      </button>

      {/* SideNavBar Component */}
      <aside className={`h-screen w-64 fixed left-0 top-0 border-r-0 bg-surface-variant shadow-[1px_0_0_0_rgba(255,255,255,0.05)] shadow-blue-900/20 flex flex-col pt-6 pb-6 z-50 transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="px-6 mb-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-primary-light to-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>security</span>
            </div>
            <div>
              <h1 className="text-xl font-black tracking-widest text-primary-light font-manrope">VISIORYX</h1>
              <p className="text-[10px] tracking-[0.2em] text-slate-500 font-bold uppercase">Digital Sentinel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {navItems.map(item => {
            const active = !!pathname && (pathname === item.path || pathname.startsWith(item.path + '/'));
            return (
              <Link 
                key={item.path} 
                href={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg font-manrope transition-colors duration-200 group ${active ? 'text-primary-light bg-surface-variant border-l-2 border-primary font-bold' : 'text-slate-400 hover:text-slate-100 hover:bg-surface font-medium'}`}
              >
                <span className={`material-symbols-outlined text-[22px] ${active ? '' : 'group-active:translate-x-1 duration-150'}`}>{item.icon}</span>
                <span className="text-sm tracking-tight pt-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-6 pt-6 mt-auto border-t border-white/5">
          <div className="flex justify-between items-center mb-4 p-2 rounded-xl bg-background/50 group">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full border border-primary/20 bg-primary flex items-center justify-center text-white font-bold shrink-0">
                {displayName.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold truncate text-on-surface">{displayName}</p>
                <p className="text-[10px] text-slate-500 truncate">{userRole === 'admin' ? 'Chief Security Officer' : 'System Operator'}</p>
              </div>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity" title="Logout">
              <span className="material-symbols-outlined text-lg">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* TopNavBar Component */}
      <header className="fixed top-0 lg:right-0 w-full lg:w-[calc(100%-16rem)] h-16 z-40 bg-background/80 backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.05)] flex justify-between items-center px-4 lg:px-8">
        <div className="flex-1 max-w-xl hidden sm:block">
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input 
              className="w-full bg-background border-none rounded-lg pl-10 pr-4 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-slate-500 font-inter tabular-nums outline-none" 
              placeholder="Search entity, camera, or event log..." 
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearch(true);
              }}
              onFocus={() => setShowSearch(true)}
            />
            
            {showSearch && searchQuery.trim() && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-surface-variant border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                <div className="p-2 max-h-[400px] overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map((res: any) => (
                      <button
                        key={res.path}
                        onClick={() => {
                          router.push(res.path);
                          setShowSearch(false);
                          setSearchQuery('');
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 rounded-lg transition-colors text-left group"
                      >
                        <span className="material-symbols-outlined text-slate-400 group-hover:text-primary-light">{res.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-on-surface">{res.label}</p>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest">{res.type}</p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-sm text-slate-500">No results found for "{searchQuery}"</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            {showSearch && (
              <div 
                className="fixed inset-0 z-[-1]" 
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                }}
              />
            )}
          </div>
        </div>
        <div className="flex items-center gap-6 ml-auto">
          <div className="h-6 w-0 shrink-0 border-l border-white/10 hidden sm:block" aria-hidden />
          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-400 font-bold tracking-widest leading-none">SYSTEM ROLE</p>
              <p className="text-sm font-manrope tabular-nums font-bold text-primary-light uppercase pt-1">{userRole || 'Connecting...'}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="w-full lg:ml-64 pt-20 lg:pt-24 px-4 lg:px-8 pb-8 min-h-screen flex flex-col">
        <div className="flex-1 w-full min-h-0">
          <AuthGuard>{children}</AuthGuard>
        </div>
        <footer className="mt-10 pt-6 border-t border-white/5 text-center">
          <AppVersionFooter className="text-[10px] text-slate-500 uppercase tracking-widest font-bold" />
        </footer>
      </main>
    </div>
  );
}
