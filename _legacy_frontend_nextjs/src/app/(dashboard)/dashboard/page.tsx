'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/formatDate';
import { useWebSocket } from '@/hooks/useWebSocket';
import { EmptyStateIllustration } from '@/components/illustrations';

const DetectionTrendsChartLazy = dynamic(
  () => import('@/components/dashboard/DetectionTrendsChart'),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center items-center min-h-[360px]">
        <span className="material-symbols-outlined animate-spin text-3xl text-primary">sync</span>
      </div>
    ),
  },
);

interface OverviewData {
  total_users?: number;
  total_cameras?: number;
  active_cameras?: number;
  detections_today?: number;
  unknown_detections_today?: number;
  detection_trend_7d?: number;
}

interface RecentDetection {
  id: number;
  camera_id: number;
  camera_name?: string | null;
  status: string;
  confidence: number;
  timestamp: string;
}

interface RecentAlert {
  id: number;
  alert_type: string;
  message: string;
  severity: string;
  is_read: boolean;
  timestamp: string;
}

interface UserMe {
  id: number;
  email: string;
  role: string;
}

function displayNameFromEmail(email: string): string {
  const part = email.split('@')[0];
  return part ? part.charAt(0).toUpperCase() + part.slice(1) : 'Admin';
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    cameras: 0,
    active_cameras: 0,
    detections: 0,
    unknown_today: 0,
    trend: 0,
    total_users: 0,
  });
  const [trends, setTrends] = useState<{ date: string; count: number }[]>([]);
  const [recentDetections, setRecentDetections] = useState<RecentDetection[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<RecentAlert[]>([]);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [user, setUser] = useState<UserMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    api<UserMe>('/api/v1/auth/me')
      .then(async (me) => {
        setUser(me);
        if (me.role === 'enrollee') {
          return;
        }
        const [overview, trendData, detections, alerts, health] = await Promise.all([
          api<OverviewData>('/api/v1/analytics/overview'),
          api<{ date: string; count: number }[]>('/api/v1/analytics/detection-trends?days=7'),
          api<RecentDetection[]>('/api/v1/analytics/recent-detections?limit=5'),
          api<RecentAlert[]>('/api/v1/analytics/recent-alerts?limit=5'),
          api<any>('/api/v1/analytics/system-health'),
        ]);
        setStats({
          cameras: overview.total_cameras ?? 0,
          active_cameras: overview.active_cameras ?? 0,
          detections: overview.detections_today ?? 0,
          unknown_today: overview.unknown_detections_today ?? 0,
          trend: overview.detection_trend_7d ?? 0,
          total_users: overview.total_users ?? 0,
        });
        setTrends(trendData);
        setRecentDetections(detections);
        setRecentAlerts(alerts);
        setSystemHealth(health);
      })
      .catch(() => setError('Login required'))
      .finally(() => {
        setLoading(false);
      });
  };

  const { connected } = useWebSocket((event) => {
    if (
      ['face_recognized', 'unknown_person_detected', 'object_detected', 'camera_status', 'alert'].includes(
        event.type,
      )
    ) {
      load(false);
    }
  });

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">sync</span>
      </div>
    );
  }

  if (user?.role === 'enrollee') {
    return (
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold mb-2 text-on-surface">Welcome</h2>
        <p className="text-slate-400 mb-6">Your account is set up for face enrollment. Live monitoring requires operator privileges.</p>
        <div className="bg-surface border border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-3xl">face</span>
            </div>
            <div>
              <h3 className="text-lg font-bold">Enroll your face</h3>
              <p className="text-sm text-slate-400">Upload photos so the system can recognize you on camera.</p>
            </div>
          </div>
          <Link href="/enroll" className="inline-flex items-center gap-2 font-bold text-primary-light hover:underline">
            Open enrollment <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-manrope font-black tracking-tight mb-2 text-on-surface">System Overview</h2>
          <div className="flex items-center gap-4 text-sm text-slate-400 font-medium">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-secondary shadow-[0_0_8px_rgba(87,224,130,0.4)]' : 'bg-error shadow-[0_0_8px_rgba(255,180,171,0.4)]'}`}></span>
            <span>All {stats.active_cameras}/{stats.cameras} neural nodes active</span>
          </div>
        </div>
        {error && <span className="text-error font-bold bg-error/10 px-3 py-1 rounded-md">{error}</span>}
      </div>

      {/* KPI Grid - Asymmetric Layout */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-12 gap-6 mb-8">
        
        <Link href="/users" className="lg:col-span-3 bg-surface-variant rounded-xl p-6 relative overflow-hidden group border border-white/5 hover:-translate-y-1 transition-transform cursor-pointer">
          <div className="relative z-10">
            <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-4">Total Users</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-manrope font-extrabold tabular-nums tracking-tight text-on-surface">{stats.total_users ?? '-'}</span>
              <span className="text-xs font-bold text-secondary">+12.4%</span>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="material-symbols-outlined text-[100px]" style={{ fontVariationSettings: "'FILL' 1" }}>group</span>
          </div>
        </Link>

        <Link href="/cameras" className="lg:col-span-3 bg-surface-variant rounded-xl p-6 relative overflow-hidden group border border-white/5 hover:-translate-y-1 transition-transform cursor-pointer">
          <div className="relative z-10">
            <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-4">Active Cameras</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-manrope font-extrabold tabular-nums tracking-tight text-on-surface">{stats.active_cameras ?? '-'}</span>
              <span className="text-sm font-medium text-secondary">Online</span>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="material-symbols-outlined text-[100px]" style={{ fontVariationSettings: "'FILL' 1" }}>videocam</span>
          </div>
        </Link>

        <Link href="/detections" className="lg:col-span-3 bg-surface-variant rounded-xl p-6 relative overflow-hidden group border border-white/5 hover:-translate-y-1 transition-transform cursor-pointer">
          <div className="relative z-10">
            <p className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-4">Today's Detections</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-manrope font-extrabold tabular-nums tracking-tight text-on-surface">{stats.detections ?? '-'}</span>
              <span className="text-xs font-bold text-primary-light">Avg Load</span>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <span className="material-symbols-outlined text-[100px]" style={{ fontVariationSettings: "'FILL' 1" }}>query_stats</span>
          </div>
        </Link>

        <Link href="/detections" className="lg:col-span-3 bg-error-dark/5 border border-error/10 rounded-xl p-6 relative overflow-hidden group hover:-translate-y-1 transition-transform cursor-pointer">
          <div className="relative z-10">
            <p className="text-xs font-bold text-error tracking-widest uppercase mb-4">Unknown Detections</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-manrope font-extrabold tabular-nums tracking-tight text-error">{stats.unknown_today ?? '-'}</span>
              {(stats.unknown_today ?? 0) > 0 && <span className="text-xs font-bold text-error px-2 py-0.5 rounded bg-error/10 border border-error/20">HIGH RISK</span>}
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="material-symbols-outlined text-error text-[100px]" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
          </div>
        </Link>
      </div>

      {/* Main Bento Grid Area */}
      <div className="grid grid-cols-12 gap-8">
        
        {/* Neural Analysis Chart Area */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <div className="bg-surface rounded-xl p-8 relative overflow-hidden group">
            <div className="flex justify-between items-start mb-8">
              <div>
                <h3 className="text-xl font-manrope font-bold mb-1 text-on-surface">Neural Analysis Activity</h3>
                <p className="text-sm text-slate-400">Real-time inference engine workload across clusters</p>
              </div>
              <div className="text-right">
                <p className="text-[#9BA1B0] text-[10px] font-black uppercase tracking-widest mb-1">Weekly Delta</p>
                <p className="text-3xl font-manrope font-black text-primary-light tabular-nums">{stats.trend > 0 ? '+' : ''}{stats.trend}%</p>
              </div>
            </div>
            
            <div className="h-64 w-full relative -ml-4">
               <DetectionTrendsChartLazy trends={trends} />
            </div>
          </div>

          {/* Recent Anomalies Feed */}
          <div>
            <div className="flex justify-between items-end mb-6">
              <h3 className="text-xl font-manrope font-bold text-on-surface">Recent Anomalies</h3>
              <Link href="/detections" className="text-sm font-bold text-primary-light hover:underline">View All Events</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {recentDetections.length === 0 ? (
                <div className="col-span-2 py-8 flex flex-col items-center justify-center bg-surface-variant rounded-xl border border-white/5">
                  <span className="material-symbols-outlined text-5xl text-slate-400 mb-3">verified</span>
                  <p className="text-slate-400 font-bold">No anomalies detected</p>
                </div>
              ) : (
                recentDetections.map((d) => (
                  <Link href={`/detections`} key={d.id} className="bg-surface-variant rounded-xl p-4 flex gap-4 hover:bg-surface transition-colors cursor-pointer group border border-white/5">
                    <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 relative bg-background flex items-center justify-center border border-white/10">
                        <span className="material-symbols-outlined text-3xl text-white/20">videocam</span>
                        <div className={`absolute inset-0 ${d.status === 'unknown' ? 'bg-error/10' : 'bg-secondary/10'} group-hover:bg-transparent transition-colors shadow-inner`}></div>
                        <div className={`absolute top-1 left-1 ${d.status === 'unknown' ? 'bg-error' : 'bg-secondary'} text-background text-[8px] font-black px-1 rounded`}>CAM-{d.camera_id}</div>
                    </div>
                    <div className="flex-1 py-1">
                      <div className="flex justify-between mb-1">
                        <span className={`text-[10px] font-bold ${d.status === 'unknown' ? 'text-error' : 'text-secondary'} tracking-widest uppercase`}>
                           {d.status === 'unknown' ? 'Unauthorized Entry' : 'Known Entity'}
                        </span>
                        <span className="text-[10px] tabular-nums text-slate-400">{(d.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-sm font-bold mb-1 line-clamp-1">{d.camera_name || `Camera ${d.camera_id}`}</p>
                      <p className="text-xs text-slate-400 leading-tight line-clamp-2">Neural engine flagged a {d.status} detection at {formatDateTime(d.timestamp)}.</p>
                    </div>
                  </Link>
                ))
              )}

            </div>
          </div>
        </div>

        {/* Sidebar Analysis Panel */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
          
          {/* System Health Summary */}
          <div className="bg-surface rounded-xl p-6">
            <h3 className="text-lg font-manrope font-bold mb-6 text-on-surface">System Health</h3>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-slate-400">Network Latency</span>
                  <span className="text-secondary">{systemHealth?.latency_ms || 12}ms</span>
                </div>
                <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-secondary transition-all duration-1000" 
                    style={{ width: `${Math.min(100, (systemHealth?.latency_ms || 12) * 2)}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-slate-400">Node Load</span>
                  <span className="text-primary-light">{systemHealth?.buffer_utilization || 0}%</span>
                </div>
                <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary-light transition-all duration-1000" 
                    style={{ width: `${systemHealth?.buffer_utilization || 0}%` }}
                  ></div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-slate-400">Database Sync</span>
                  <span className="text-secondary">{systemHealth?.db_sync ? 'Synced' : 'Connecting'}</span>
                </div>
                <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                  <div className={`h-full bg-secondary ${systemHealth?.db_sync ? 'w-full' : 'w-[40%] animate-pulse'}`}></div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-slate-400">Encryption</span>
                  <span className="text-slate-400">{systemHealth?.encryption || 'TLS 1.3'}</span>
                </div>
                <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                  <div className="h-full bg-primary-light w-[92%]"></div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-background">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/20 text-primary-light">
                  <span className="material-symbols-outlined">memory</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Neural Chipset</p>
                  <p className="text-sm font-bold text-on-surface">{systemHealth?.chipset || 'Sentinel-X Gen 4'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Global Activity Map Concept */}
          <div className="bg-surface rounded-xl p-6 overflow-hidden relative group">
            <h3 className="text-lg font-manrope font-bold mb-4 text-on-surface">Node Distribution</h3>
            <div className="aspect-square w-full rounded-lg bg-background relative overflow-hidden border border-white/5">
              <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--color-primary) 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              
              {/* Active Nodes */}
              {Array.from({ length: Math.min(6, systemHealth?.active_nodes || 0) }).map((_, i) => (
                <div 
                  key={`node-${i}`}
                  className="absolute w-2.5 h-2.5 bg-primary-light rounded-full animate-pulse shadow-[0_0_15px_rgba(32,101,209,0.4)]"
                  style={{ 
                    top: `${20 + (i * 15) % 60}%`, 
                    left: `${20 + (i * 25) % 60}%`,
                    animationDelay: `${i * 150}ms`
                  }}
                ></div>
              ))}

              {/* Status Indicators */}
              <div className="absolute top-1/2 left-2/3 w-2 h-2 bg-secondary rounded-full animate-pulse delay-75 shadow-[0_0_10px_rgba(87,224,130,0.6)]"></div>
              {recentAlerts.length > 0 && <div className="absolute bottom-1/3 right-1/4 w-4 h-4 bg-error rounded-full animate-pulse delay-150 shadow-[0_0_20px_rgba(255,180,171,0.6)]"></div>}
              
              <svg className="absolute inset-0 w-full h-full opacity-30">
                <line stroke="var(--color-primary)" strokeDasharray="4" strokeWidth="1" x1="33%" x2="66%" y1="25%" y2="50%"></line>
                <line stroke="var(--color-primary)" strokeDasharray="4" strokeWidth="1" x1="66%" x2="75%" y1="50%" y2="66%"></line>
              </svg>
            </div>
            <div className="mt-4 flex justify-between items-center text-[10px] font-bold text-slate-400 tracking-wider uppercase">
              <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-primary-light rounded-full"></span> {systemHealth?.active_nodes || 0} Neural Nodes</div>
              <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-secondary rounded-full"></span> {systemHealth?.total_nodes || 0} Registered</div>
            </div>
          </div>
          
        </div>
      </div>
      
    </div>
  );
}
