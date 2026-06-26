'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  ComposedChart,
  Cell
} from 'recharts';
import { api } from '@/lib/api';
import { ChartEmptyIllustration } from '@/components/illustrations';
import { stitchChart } from '@/theme/stitchSx';

type DayRange = 7 | 14 | 30;

export default function AnalyticsPage() {
  const [days, setDays] = useState<DayRange>(14);
  const [trends, setTrends] = useState<{ date: string; count: number }[]>([]);
  const [statusTrend, setStatusTrend] = useState<{ date: string; known: number; unknown: number }[]>([]);
  const [byCamera, setByCamera] = useState<{ camera_name: string; count: number }[]>([]);
  const [objectStats, setObjectStats] = useState<{ object: string; count: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const q = `days=${days}`;
    api<{ date: string; count: number }[]>(`/api/v1/analytics/detection-trends?${q}`)
      .then(setTrends)
      .catch(() => setError('Load trends failed'));
    api<{ date: string; known: number; unknown: number }[]>(`/api/v1/analytics/detection-status-trends?${q}`)
      .then(setStatusTrend)
      .catch(() => setStatusTrend([]));
    api<{ camera_name: string; count: number }[]>(`/api/v1/analytics/detections-by-camera?${q}&limit=12`)
      .then(setByCamera)
      .catch(() => setByCamera([]));
    api<{ object: string; count: number }[]>(`/api/v1/analytics/object-stats?${q}`)
      .then(setObjectStats)
      .catch(() => setObjectStats([]));
  }, [days]);


  const axisCommon = { stroke: 'var(--color-slate-500)', tick: { fill: 'var(--color-slate-400)', fontSize: 11 } };
  const tooltipSx = {
    contentStyle: {
      backgroundColor: 'var(--color-surface)',
      border: `1px solid var(--color-slate-500)`,
      borderRadius: 12,
      color: 'var(--color-on-surface)',
    },
    labelStyle: { color: 'var(--color-slate-400)' },
  };

  return (
    <div className="animate-in fade-in duration-500">
      
      {/* Background Ambience from Stitch */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 right-0 w-[60%] h-[40%] bg-primary-light/5 blur-[120px] rounded-full opacity-30"></div>
        <div className="absolute bottom-0 left-0 w-[40%] h-[50%] bg-primary/5 blur-[120px] rounded-full opacity-20"></div>
      </div>

      {/* Editorial Header Section */}
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
        <div>
          <nav className="flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">
            <span>Telemetry</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-primary">Detection Intelligence</span>
          </nav>
          <h1 className="font-manrope font-bold text-4xl lg:text-5xl tracking-tight text-on-surface mb-2">Detection Intelligence</h1>
          <p className="text-slate-400 max-w-2xl font-inter">Real-time telemetry and forensic object analysis across the neural network. Showing trends for the past {days} days.</p>
          {error && <p className="text-error mt-2 font-bold bg-error/10 inline-block px-3 py-1 rounded">{error}</p>}
        </div>
        
        {/* Filters Shell */}
        <div className="flex items-center gap-1 bg-surface-variant p-1.5 rounded-xl border border-white/5 shadow-lg">
           <button onClick={() => setDays(7)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${days === 7 ? 'bg-surface text-white shadow' : 'text-slate-400 hover:text-white hover:bg-surface/50'}`}>7 Days</button>
           <button onClick={() => setDays(14)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${days === 14 ? 'bg-surface text-white shadow' : 'text-slate-400 hover:text-white hover:bg-surface/50'}`}>14 Days</button>
           <button onClick={() => setDays(30)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${days === 30 ? 'bg-surface text-white shadow' : 'text-slate-400 hover:text-white hover:bg-surface/50'}`}>30 Days</button>
        </div>
      </header>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 relative z-10">
        <div className="bg-surface-variant p-6 rounded-xl relative overflow-hidden group border border-white/5 shadow-xl">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-white">precision_manufacturing</span>
           </div>
           <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Detection Accuracy</p>
           <div className="flex items-baseline gap-2">
              <span className="text-3xl font-manrope font-extrabold text-white tabular-nums">98.4%</span>
              <span className="text-secondary text-xs font-bold tabular-nums">+0.2%</span>
           </div>
        </div>
        
        <div className="bg-surface-variant p-6 rounded-xl relative overflow-hidden group border border-white/5 shadow-xl">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-white">memory</span>
           </div>
           <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Engine Load</p>
           <div className="flex items-baseline gap-2">
              <span className="text-3xl font-manrope font-extrabold text-white tabular-nums">42%</span>
              <span className="text-slate-400 text-xs font-bold">OPTIMIZED</span>
           </div>
        </div>

        <div className="bg-surface-variant p-6 rounded-xl relative overflow-hidden group border border-white/5 shadow-xl">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-white">group</span>
           </div>
           <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total Detections</p>
           <div className="flex items-baseline gap-2">
              <span className="text-3xl font-manrope font-extrabold text-white tabular-nums">{trends.reduce((acc, curr) => acc + curr.count, 0).toLocaleString()}</span>
              <span className="text-slate-400 text-xs font-bold uppercase">Period</span>
           </div>
        </div>

        <div className="bg-surface-variant p-6 rounded-xl relative overflow-hidden group border border-error/20 shadow-xl shadow-error/5">
           <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-4xl text-error">warning</span>
           </div>
           <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Risk Factors</p>
           <div className="flex items-baseline gap-2">
              <span className="text-3xl font-manrope font-extrabold text-error tabular-nums">{statusTrend.reduce((acc, curr) => acc + curr.unknown, 0).toLocaleString()}</span>
              <span className="text-slate-400 text-xs font-bold uppercase">Unknowns</span>
           </div>
        </div>
      </div>

      {/* Bento Grid Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Trend Chart: Area chart for Unknowns vs Knowns */}
        <div className="lg:col-span-8 bg-surface-variant rounded-xl p-8 border border-white/5 shadow-xl flex flex-col">
           <div className="flex justify-between items-start mb-6">
              <div>
                 <h3 className="font-manrope font-bold text-xl text-white">Face Recognition Breakdown</h3>
                 <p className="text-slate-500 text-sm">Identity verification trend over the last {days} days</p>
              </div>
              <div className="flex gap-4">
                 <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-secondary">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(87,224,130,0.5)]"></span> Known Entities
                 </span>
                 <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-warning">
                    <span className="w-2.5 h-2.5 rounded-full bg-warning shadow-[0_0_8px_rgba(255,185,80,0.5)]"></span> Unknown Visitors
                 </span>
              </div>
           </div>
           
           <div className="flex-1 min-h-[300px]">
              {statusTrend.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center opacity-50">
                    <ChartEmptyIllustration size={120} />
                    <p className="text-sm mt-4 text-slate-500">No face detection breakdown yet.</p>
                 </div>
              ) : (
                 <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={statusTrend} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-variant)" vertical={false} />
                       <XAxis dataKey="date" {...axisCommon} />
                       <YAxis allowDecimals={false} {...axisCommon} />
                       <Tooltip {...tooltipSx} />
                       <Area type="monotone" dataKey="unknown" name="Unknown" stackId="a" fill="url(#colorUnknown)" stroke="var(--color-warning)" strokeWidth={2} />
                       <Area type="monotone" dataKey="known" name="Known" stackId="a" fill="url(#colorKnown)" stroke="var(--color-secondary)" strokeWidth={2} />
                       <defs>
                         <linearGradient id="colorKnown" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="var(--color-secondary)" stopOpacity={0.3}/>
                           <stop offset="95%" stopColor="var(--color-secondary)" stopOpacity={0}/>
                         </linearGradient>
                         <linearGradient id="colorUnknown" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="var(--color-warning)" stopOpacity={0.3}/>
                           <stop offset="95%" stopColor="var(--color-warning)" stopOpacity={0}/>
                         </linearGradient>
                       </defs>
                    </ComposedChart>
                 </ResponsiveContainer>
              )}
           </div>
        </div>

        {/* Object Distribution */}
        <div className="lg:col-span-4 bg-surface-variant rounded-xl p-8 border border-white/5 shadow-xl flex flex-col">
           <h3 className="font-manrope font-bold text-xl text-white mb-2">Object Distribution</h3>
           <p className="text-slate-500 text-sm mb-6">Aggregate types detected</p>
           
           <div className="flex-1 min-h-[300px]">
              {objectStats.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center opacity-50">
                    <ChartEmptyIllustration size={100} />
                    <p className="text-sm mt-4 text-slate-500">No object stats yet.</p>
                 </div>
              ) : (
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={objectStats} layout="vertical" margin={{ left: -10, right: 10 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-variant)" horizontal={false} />
                       <XAxis type="number" allowDecimals={false} {...axisCommon} />
                       <YAxis dataKey="object" type="category" width={80} tick={{ fill: 'var(--color-on-surface)', fontSize: 12, fontWeight: 600 }} />
                       <Tooltip {...tooltipSx} cursor={{fill: 'var(--color-surface)'}} />
                       <Bar dataKey="count" name="Count" fill="var(--color-primary-light)" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                 </ResponsiveContainer>
              )}
           </div>
        </div>

        {/* Total Detection Trends Line Chart */}
        <div className="lg:col-span-6 bg-surface-variant rounded-xl p-8 border border-white/5 shadow-xl flex flex-col">
           <h3 className="font-manrope font-bold text-xl text-white mb-2">Detection Trajectory</h3>
           <p className="text-slate-500 text-sm mb-6">Total event volume across network</p>
           
           <div className="flex-1 min-h-[320px]">
              {trends.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center opacity-50">
                    <ChartEmptyIllustration size={100} />
                 </div>
              ) : (
                 <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends} margin={{ left: -20 }}>
                       <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-variant)" vertical={false} />
                       <XAxis dataKey="date" {...axisCommon} />
                       <YAxis allowDecimals={false} {...axisCommon} />
                       <Tooltip {...tooltipSx} />
                       <Line type="monotone" dataKey="count" name="Total Events" stroke="var(--color-primary)" strokeWidth={3} dot={{ fill: 'var(--color-primary-light)', strokeWidth: 0, r: 4 }} activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--color-primary-light)' }} />
                    </LineChart>
                 </ResponsiveContainer>
              )}
           </div>
        </div>

        {/* By Camera Distribution */}
        <div className="lg:col-span-6 bg-surface-variant rounded-xl p-8 border border-white/5 shadow-xl flex flex-col">
           <h3 className="font-manrope font-bold text-xl text-white mb-2">Network Load</h3>
           <p className="text-slate-500 text-sm mb-6">Event distribution by camera node</p>
           
           <div className="flex-1 min-h-[320px]">
              {byCamera.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center opacity-50">
                    <ChartEmptyIllustration size={100} />
                 </div>
              ) : (
                 <div style={{ height: Math.min(420, 60 + byCamera.length * 40), width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={byCamera} layout="vertical" margin={{ left: 0, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-variant)" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} {...axisCommon} />
                          <YAxis dataKey="camera_name" type="category" width={120} tick={{ fill: 'var(--color-slate-400)', fontSize: 11 }} />
                          <Tooltip {...tooltipSx} cursor={{fill: 'var(--color-surface)'}} />
                          <Bar dataKey="count" name="Detections" fill="var(--color-success)" radius={[0, 4, 4, 0]} barSize={16}>
                             {byCamera.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={index % 2 === 0 ? 'var(--color-success)' : 'var(--color-secondary)'} />
                             ))}
                          </Bar>
                       </BarChart>
                    </ResponsiveContainer>
                 </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
