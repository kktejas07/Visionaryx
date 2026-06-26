'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartEmptyIllustration } from '@/components/illustrations';

type TrendPoint = { date: string; count: number };

export default function DetectionTrendsChart({ trends }: { trends: TrendPoint[] }) {
  return (
    <div className="h-full bg-[#131b2e] rounded-xl border border-white/5 overflow-hidden shadow-xl">
      <div className="p-6">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#2065D1] text-white flex items-center justify-center shadow-lg shadow-[#2065D1]/20">
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white font-[Manrope]">Detection Trends</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Last 14 days analysis</p>
          </div>
        </div>

        {trends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ChartEmptyIllustration size={140} className="mb-4 opacity-30" />
            <p className="text-[#8c909f] text-sm font-medium font-[Inter]">
              No detection data available for the interval.
            </p>
          </div>
        ) : (
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2065D1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2065D1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 10, fill: '#8c909f', fontWeight: 600 }} 
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#8c909f', fontWeight: 600 }} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                    background: '#171f33',
                    padding: '12px 16px',
                  }}
                  itemStyle={{ color: '#afc6ff', fontSize: '12px', fontWeight: 'bold' }}
                  labelStyle={{ color: '#8c909f', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: '800' }}
                  cursor={{ stroke: '#2065D1', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="none" 
                  fill="url(#colorCount)" 
                  animationDuration={1500}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#2065D1"
                  strokeWidth={3}
                  dot={{ fill: '#2065D1', r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#afc6ff', stroke: '#2065D1', strokeWidth: 2 }}
                  animationDuration={1500}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      
      <div className="px-6 py-3 bg-[#171f33]/30 border-t border-white/5 flex justify-between items-center">
         <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Real-time Telemetry Vector</span>
         <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#57e082] animate-pulse"></span>
            <span className="text-[10px] text-[#57e082] font-bold uppercase">Live</span>
         </div>
      </div>
    </div>
  );
}
