'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/formatDate';
import { EmptyStateIllustration } from '@/components/illustrations';
import { useToast } from '@/contexts/ToastContext';

interface AuditRow {
  id: number;
  actor_email: string;
  action: string;
  resource_type: string;
  resource_id: number | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export default function AuditLogPage() {
  const toast = useToast();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeDays, setPurgeDays] = useState(90);
  const [purgeAlerts, setPurgeAlerts] = useState(false);
  const [purgeObjects, setPurgeObjects] = useState(true);
  const [purgeUnknown, setPurgeUnknown] = useState(false);
  const [purging, setPurging] = useState(false);
  const [detailRow, setDetailRow] = useState<AuditRow | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [search, actionFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));
      if (search.trim()) params.set('q', search.trim());
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      const r = await api<{ items: AuditRow[]; total: number }>(`/api/v1/audit?${params.toString()}`);
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load audit log';
      setError(msg);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, actionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<Record<string, number>>('/api/v1/admin/storage-summary')
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const runPurge = async () => {
    setPurging(true);
    try {
      const r = await api<{
        detections_deleted: number;
        alerts_deleted: number;
        objects_deleted: number;
        unknown_faces_deleted: number;
      }>('/api/v1/admin/purge-old-data', {
        method: 'POST',
        body: JSON.stringify({
          days: purgeDays,
          include_alerts: purgeAlerts,
          include_objects: purgeObjects,
          include_unknown_faces: purgeUnknown,
        }),
      });
      toast.success(
        `Purge complete: ${r.detections_deleted} detections, ${r.objects_deleted} objects, ${r.alerts_deleted} alerts, ${r.unknown_faces_deleted} unknown-face rows.`,
      );
      setPurgeOpen(false);
      void load();
      const s = await api<Record<string, number>>('/api/v1/admin/storage-summary').catch(() => null);
      if (s) setSummary(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Purge failed');
    } finally {
      setPurging(false);
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('delete') || action.includes('remove') || action.includes('purge')) return 'bg-error/10 text-error border-error/20';
    if (action.includes('update') || action.includes('patch')) return 'bg-tertiary/10 text-tertiary border-tertiary/20';
    if (action.includes('create') || action.includes('add')) return 'bg-secondary/10 text-secondary border-secondary/20';
    if (action.includes('auth') || action.includes('login')) return 'bg-primary/10 text-primary border-primary/20';
    return 'bg-surface border-white/5 text-slate-400';
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-8">

      {/* Page Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <nav className="flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">
            <span>Administration</span>
            <span className="material-symbols-outlined text-xs">chevron_right</span>
            <span className="text-primary">System Audit Logs</span>
          </nav>
          <h2 className="text-3xl font-extrabold font-manrope text-on-surface tracking-tight">Security Event Explorer</h2>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl leading-relaxed font-inter">
             Append-only record of administrative actions, camera settings changes, and telemetry across the enterprise. 
          </p>
          {error && <p className="text-error font-bold bg-error/10 px-3 py-1 rounded-md mt-4 inline-block">{error} <button onClick={() => void load()} className="ml-2 underline">Retry</button></p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button 
             onClick={() => setPurgeOpen(true)}
             className="flex items-center gap-2 px-5 py-2.5 bg-error/10 text-error hover:bg-error/20 text-sm font-bold rounded-lg transition-all border border-error/20"
          >
             <span className="material-symbols-outlined text-lg">delete_sweep</span> Purge Old Data
          </button>
        </div>
      </div>

      {/* Storage Summary & Webhook Info Box */}
      {summary && (
        <div className="bg-surface-variant rounded-xl p-6 border border-white/5 flex flex-col md:flex-row justify-between md:items-center gap-6 shadow-xl">
           <div>
              <h4 className="text-sm font-bold text-on-surface mb-1 font-manrope">Database Storage Telemetry</h4>
              <p className="text-xs text-slate-400 font-inter">
                Detections: <strong className="text-white">{summary.detections}</strong> &bull; Alerts: <strong className="text-white">{summary.alerts}</strong> &bull; Objects: <strong className="text-white">{summary.object_detections}</strong> &bull; Unknown snapshots: <strong className="text-white">{summary.unknown_face_snapshots}</strong>
              </p>
           </div>
           <div className="bg-surface px-4 py-3 rounded-lg border border-white/10 shrink-0">
               <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Webhook Integration</p>
               <p className="text-xs text-slate-300 font-inter">Set <code className="text-primary-light font-mono mx-1">ALERT_WEBHOOK_URL</code> in backend <code className="text-primary-light font-mono mx-1">.env</code> to POST to Slack/Discord.</p>
           </div>
        </div>
      )}

      {/* Filters Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 bg-surface-variant p-5 rounded-xl border border-white/5 shadow-xl">
        <div className="space-y-1.5 md:col-span-2 lg:col-span-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Context Search</label>
            <div className="relative">
               <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
               <input 
                 value={searchInput} 
                 onChange={e => setSearchInput(e.target.value)} 
                 className="w-full bg-surface border-none text-on-surface text-sm rounded-lg focus:ring-1 focus:ring-primary/40 py-2.5 pl-10 placeholder:text-slate-500 transition-all font-inter" 
                 type="text" 
                 placeholder="Search Actor, Action, Resource..." 
               />
            </div>
        </div>
        <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Action Filter</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">filter_alt</span>
              <input 
                 value={actionFilter} 
                 onChange={e => setActionFilter(e.target.value)}
                 className="w-full bg-surface border-none text-on-surface text-sm rounded-lg focus:ring-1 focus:ring-primary/40 py-2.5 pl-10 placeholder:text-slate-500 transition-all font-inter" 
                 type="text" 
                 placeholder="e.g. user.create" 
              />
            </div>
        </div>
        <div className="flex items-end">
            <button className="w-full py-2.5 bg-surface hover:bg-surface-variant/50 text-white text-sm font-bold rounded-lg transition-all" onClick={() => setPage(0)}>
                Apply Event Filters
            </button>
        </div>
      </div>

      {/* Data Table Container */}
      <div className="bg-surface-variant rounded-xl overflow-hidden border border-white/5 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-inter">
            <thead>
              <tr className="bg-surface border-b border-white/10">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timestamp</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operator</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resource</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              
              {loading && (
                 <tr>
                    <td colSpan={5} className="py-20 text-center">
                       <span className="material-symbols-outlined animate-spin text-4xl text-primary">sync</span>
                    </td>
                 </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                   <td colSpan={5} className="py-20 text-center text-slate-500">
                      <EmptyStateIllustration size={160} className="mx-auto opacity-50 mb-4" />
                      <p className="font-medium font-inter">No audit events match your filters.</p>
                   </td>
                </tr>
              )}

              {!loading && items.map(row => (
                  <tr key={row.id} className="hover:bg-surface/50 transition-colors group">
                     <td className="px-6 py-5 whitespace-nowrap">
                       <div className="flex flex-col">
                         <span className="text-sm font-bold text-white font-inter">{formatDateTime(row.created_at).split(' ')[0]}</span>
                         <span className="text-[10px] text-slate-500 font-mono">{formatDateTime(row.created_at).split(' ').slice(1).join(' ')}</span>
                       </div>
                     </td>
                     
                     <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center font-bold text-white text-xs border border-white/10 shrink-0">
                               {row.actor_email.charAt(0).toUpperCase()}
                           </div>
                           <span className="text-sm font-semibold text-white max-w-[150px] truncate font-inter">{row.actor_email}</span>
                        </div>
                     </td>
                     
                     <td className="px-6 py-5 whitespace-nowrap">
                        <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase tracking-tight border ${getActionColor(row.action)}`}>
                           {row.action}
                        </span>
                     </td>

                     <td className="px-6 py-5">
                       <p className="text-sm text-on-surface font-inter">
                         <span className="font-semibold text-white">{row.resource_type}</span>
                         {row.resource_id != null ? <span className="text-slate-500 ml-1 text-xs font-mono">#{row.resource_id}</span> : ''}
                       </p>
                     </td>

                     <td className="px-6 py-5 text-right whitespace-nowrap">
                       <button onClick={() => setDetailRow(row)} className="text-slate-500 hover:text-white transition-colors bg-surface-variant p-2 rounded-lg group-hover:bg-surface">
                          <span className="material-symbols-outlined text-[18px]">data_object</span>
                       </button>
                     </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {items.length > 0 && (
           <div className="bg-surface px-6 py-4 flex items-center justify-between border-t border-white/5">
              <p className="text-xs text-slate-500 font-medium font-inter">
                  Showing <span className="text-white font-bold tabular-nums">{page * rowsPerPage + 1} - {Math.min((page + 1) * rowsPerPage, total)}</span> of <span className="text-white font-bold tabular-nums">{total}</span> results
              </p>
              <div className="flex items-center gap-2">
                 <button 
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="p-1 rounded bg-surface-variant text-slate-400 hover:text-white disabled:opacity-30 flex items-center justify-center transition-colors"
                 >
                    <span className="material-symbols-outlined text-sm">chevron_left</span>
                 </button>
                 <button 
                    disabled={items.length < rowsPerPage}
                    onClick={() => setPage(page + 1)}
                    className="p-1 rounded bg-surface-variant text-slate-400 hover:text-white disabled:opacity-30 flex items-center justify-center transition-colors"
                 >
                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                 </button>
              </div>
           </div>
        )}
      </div>

      {/* Tailwind Dialog: Details Viewer */}
      {!!detailRow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-variant border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
             <div className="p-6 border-b border-white/5 bg-surface flex justify-between items-center">
                <h3 className="text-lg font-bold font-manrope text-white flex items-center gap-2">
                   <span className="material-symbols-outlined text-primary-light">data_object</span> Event Payload
                </h3>
                <button onClick={() => setDetailRow(null)} className="text-slate-500 hover:text-white transition-colors">
                   <span className="material-symbols-outlined text-xl">close</span>
                </button>
             </div>
             <div className="p-6 bg-surface-variant overflow-y-auto max-h-[60vh]">
                 <pre className="text-xs text-secondary font-mono leading-relaxed bg-surface p-4 rounded-lg border border-white/5 overflow-x-auto">
                    {detailRow.detail ? JSON.stringify(detailRow.detail, null, 2) : 'No payload details provided.'}
                 </pre>
             </div>
          </div>
        </div>
      )}

      {/* Tailwind Dialog: Purge Old Data */}
      {purgeOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-variant border border-error/20 rounded-xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
             <div className="p-6 border-b border-error/10 bg-error/10 flex gap-3 items-center">
                <span className="material-symbols-outlined text-error">warning</span>
                <h3 className="text-lg font-bold font-manrope text-error">Purge System Data</h3>
             </div>
             <div className="p-6 space-y-4">
                 <p className="text-sm text-slate-400 leading-relaxed font-inter">
                   Permanently delete database rows with timestamps older than the specified age. <strong className="text-white">This cannot be undone.</strong> Run backups first in production environments.
                 </p>
                 
                 <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Age Threshold (Days)</label>
                    <input 
                       type="number" 
                       value={purgeDays} 
                       onChange={(e) => setPurgeDays(Math.max(1, parseInt(e.target.value, 10) || 90))}
                       className="w-full bg-surface border border-error/20 rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-error/50 text-white outline-none tabular-nums font-inter" 
                    />
                 </div>

                 <div className="space-y-2 mt-4 font-inter">
                    <label className="flex items-center gap-3 p-2 rounded hover:bg-surface cursor-pointer group">
                       <input type="checkbox" checked={purgeObjects} onChange={e => setPurgeObjects(e.target.checked)} className="rounded border-slate-600 bg-transparent text-error focus:ring-error w-4 h-4" />
                       <span className="text-sm text-slate-400 group-hover:text-white transition-colors">Include Object Detections</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 rounded hover:bg-surface cursor-pointer group">
                       <input type="checkbox" checked={purgeAlerts} onChange={e => setPurgeAlerts(e.target.checked)} className="rounded border-slate-600 bg-transparent text-error focus:ring-error w-4 h-4" />
                       <span className="text-sm text-slate-400 group-hover:text-white transition-colors">Include Alerts</span>
                    </label>
                    <label className="flex items-center gap-3 p-2 rounded hover:bg-surface cursor-pointer group">
                       <input type="checkbox" checked={purgeUnknown} onChange={e => setPurgeUnknown(e.target.checked)} className="rounded border-slate-600 bg-transparent text-error focus:ring-error w-4 h-4" />
                       <span className="text-sm text-slate-400 group-hover:text-white transition-colors">Include Unknown Face Snapshots</span>
                    </label>
                 </div>
             </div>
             
             <div className="p-6 bg-surface border-t border-white/5 flex justify-end gap-3">
                 <button onClick={() => setPurgeOpen(false)} disabled={purging} className="px-5 py-2 rounded-lg text-sm font-bold text-slate-500 hover:text-white transition-colors font-manrope">Cancel</button>
                 <button onClick={() => void runPurge()} disabled={purging} className="px-6 py-2 bg-error text-white rounded-lg text-sm font-bold shadow-lg shadow-error/20 hover:bg-error-light transition-colors font-manrope">{purging ? 'Purging...' : 'Execute Purge'}</button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
