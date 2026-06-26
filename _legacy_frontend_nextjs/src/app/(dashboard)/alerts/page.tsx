'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { downloadAuthenticatedFile } from '@/lib/downloadCsv';
import { formatDateTime } from '@/lib/formatDate';
import { EmptyStateIllustration } from '@/components/illustrations';

interface Alert {
  id: number;
  alert_type: string;
  message: string;
  severity: string;
  is_read: boolean;
  timestamp: string;
}

export default function AlertsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<'read' | 'unread' | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));
      if (search.trim()) params.set('q', search.trim());
      if (unreadOnly) params.set('unread_only', 'true');
      const res = await api<{ items: Alert[]; total: number } | Alert[]>(`/api/v1/alerts?${params.toString()}`);
      if (Array.isArray(res)) {
        setItems(res);
        setTotal(res.length);
      } else {
        setItems(res.items ?? []);
        setTotal(typeof res.total === 'number' ? res.total : 0);
      }
    } catch {
      setError('Load failed');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, unreadOnly]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: number) => {
    try {
      await api(`/api/v1/alerts/${id}/read`, { method: 'PATCH' });
      void load();
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    setBulkBusy('read');
    try {
      const r = await api<{ updated: number }>('/api/v1/alerts/mark-all-read', { method: 'POST' });
      toast.success(r.updated ? `Marked ${r.updated} alert(s) as read` : 'No alerts to update');
      void load();
    } catch {
      toast.error('Could not mark all as read');
    } finally {
      setBulkBusy(null);
    }
  };

  const markAllUnread = async () => {
    setBulkBusy('unread');
    try {
      const r = await api<{ updated: number }>('/api/v1/alerts/mark-all-unread', { method: 'POST' });
      toast.success(r.updated ? `Marked ${r.updated} alert(s) as unread` : 'No alerts to update');
      void load();
    } catch {
      toast.error('Could not mark all as unread');
    } finally {
      setBulkBusy(null);
    }
  };

  const exportAlertsCsv = async () => {
    try {
      const params = new URLSearchParams();
      params.set('export_limit', '50000');
      if (search.trim()) params.set('q', search.trim());
      if (unreadOnly) params.set('unread_only', 'true');
      await downloadAuthenticatedFile(`/api/v1/alerts/export.csv?${params.toString()}`, 'visioryx-alerts.csv');
      toast.success('CSV download started');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const getSeverityStyles = (severity: string) => {
     switch(severity?.toLowerCase()) {
        case 'error': return { border: 'border-error/80', badge: 'bg-error-dark text-error-light', text: 'High Severity', icon: 'error' };
        case 'warning': return { border: 'border-warning/60', badge: 'bg-warning-dark text-warning-light', text: 'Medium Severity', icon: 'warning' };
        default: return { border: 'border-success/40', badge: 'bg-success text-on-surface', text: 'Low Severity', icon: 'info' };
     }
  };

  return (
    <div className="animate-in fade-in duration-500 relative">
      
      {/* Background Ambience from Stitch */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 right-0 w-[60%] h-[40%] bg-primary-light/5 blur-[120px] rounded-full opacity-30"></div>
        <div className="absolute bottom-0 left-0 w-[40%] h-[50%] bg-primary/5 blur-[120px] rounded-full opacity-20"></div>
      </div>

      <div className="flex flex-col xl:flex-row gap-8">
        
        {/* Main Feed */}
        <div className="flex-1 space-y-8 min-w-0">
          
          {/* Header Actions */}
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-6 mb-2">
            <div>
              <h2 className="text-3xl font-extrabold font-manrope tracking-tight text-white mb-2">Security Alerts</h2>
              <p className="text-slate-400 font-inter mb-1">Unknown face events, security notices, and camera status over continuous monitoring.</p>
              {error && <span className="text-error font-bold text-sm">{error}</span>}
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button 
                disabled={total === 0}
                onClick={() => void exportAlertsCsv()}
                className="bg-surface-variant text-on-surface px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-surface transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">download</span> Export Alert Log
              </button>
              
              <button 
                onClick={() => void markAllUnread()}
                disabled={!!bulkBusy || total === 0}
                className="bg-surface-variant text-on-surface px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 hover:bg-surface transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">mark_email_unread</span> Mark all unread
              </button>

              <button 
                onClick={() => void markAllRead()}
                disabled={!!bulkBusy || total === 0}
                className="bg-gradient-to-br from-primary-light to-primary text-primary-dark px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary-light/10 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>done_all</span> All Read
              </button>
            </div>
          </div>

          {/* Alerts List */}
          <div className="space-y-4">
            
            {loading && (
              <div className="py-20 flex justify-center">
                 <span className="material-symbols-outlined animate-spin text-4xl text-primary">sync</span>
              </div>
            )}

             {!loading && items.length === 0 && (
                <div className="py-20 text-center bg-surface-variant/50 border border-white/5 rounded-xl">
                   <EmptyStateIllustration size={160} className="mx-auto opacity-50 mb-4" />
                   <p className="text-slate-400 font-medium">No alerts match your filters.</p>
                </div>
            )}

            {!loading && items.map(a => {
               const styles = getSeverityStyles(a.severity);
               return (
                <div key={a.id} className={`bg-surface-variant border-l-4 ${styles.border} p-5 sm:p-6 rounded-xl relative group transition-all hover:bg-surface ${a.is_read ? 'opacity-60' : 'opacity-100'}`}>
                  
                  <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                    <div className="w-16 h-16 sm:w-28 sm:h-28 rounded-lg overflow-hidden relative bg-background flex-shrink-0 flex items-center justify-center border border-white/5">
                        <span className={`material-symbols-outlined text-4xl opacity-50 ${a.severity === 'error' ? 'text-error' : 'text-on-surface'}`}>{styles.icon}</span>
                        {!a.is_read && (
                            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${a.severity === 'error' ? 'bg-error animate-pulse' : 'bg-secondary'}`}></span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2 sm:mb-0">
                        <div className="order-2 sm:order-1 mt-2 sm:mt-0 max-w-[100%]">
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className={`${styles.badge} text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider uppercase`}>{styles.text}</span>
                            <span className="text-slate-500 text-xs tabular-nums font-mono">ID: AL-{a.id}</span>
                            <span className="text-slate-500 text-xs tabular-nums uppercase bg-[#283044] px-1.5 rounded">{a.alert_type}</span>
                          </div>
                          <h3 className="text-lg font-bold text-white leading-tight mt-2 sm:mt-0">{a.message}</h3>
                        </div>
                        
                        <div className="order-1 sm:order-2 text-left sm:text-right shrink-0">
                          <p className="text-sm font-bold text-on-surface tabular-nums font-inter">{formatDateTime(a.timestamp)}</p>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex flex-wrap items-center gap-3 sm:gap-6">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-slate-500 text-sm">settings_system_daydream</span>
                          <span className="text-xs font-semibold text-slate-300 truncate">Visioryx System</span>
                        </div>
                        
                        <div className="ml-auto w-full sm:w-auto flex justify-end gap-2 mt-2 sm:mt-0">
                           {!a.is_read && (
                             <button onClick={() => void markRead(a.id)} className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-lg bg-surface-variant hover:bg-surface text-on-surface transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">check_circle</span> Acknowledge
                             </button>
                           )}
                           {a.is_read && (
                             <button disabled className="w-full sm:w-auto px-4 py-2 text-xs font-bold rounded-lg bg-transparent text-slate-500 border border-slate-600/30 flex items-center justify-center gap-2 cursor-default">
                                <span className="material-symbols-outlined text-[16px]">done</span> Read
                             </button>
                           )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
               );
            })}
          </div>

          {/* Pagination Blocks */}
          {total > 0 && (
             <div className="px-6 py-4 flex items-center justify-between bg-surface-variant/50 border border-white/5 rounded-xl">
                 <div className="text-xs text-slate-500">
                   Showing <span className="text-on-surface font-bold tabular-nums">1-{items.length}</span> of <span className="text-on-surface font-bold tabular-nums">{total}</span> entries
                 </div>
                  <div className="flex items-center gap-2">
                    <button 
                      disabled={page === 0} 
                      onClick={() => setPage(page-1)}
                      className="w-8 h-8 flex items-center justify-center rounded bg-surface-variant text-white disabled:opacity-50 hover:bg-surface transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">chevron_left</span>
                    </button>
                    <span className="text-xs font-bold text-on-surface w-8 text-center">{page + 1}</span>
                    <button 
                      disabled={items.length < rowsPerPage} 
                      onClick={() => setPage(page+1)}
                      className="w-8 h-8 flex items-center justify-center rounded bg-surface-variant text-white disabled:opacity-50 hover:bg-surface transition-colors"
                    >
                      <span className="material-symbols-outlined text-lg">chevron_right</span>
                    </button>
                 </div>
             </div>
          )}
        </div>

        {/* Side Filter Panel */}
        <aside className="w-full xl:w-80 space-y-6 shrink-0 sticky top-24 self-start">
          <div className="bg-surface-variant rounded-xl p-6 border border-white/5 shadow-xl">
             <div className="flex items-center justify-between mb-6">
                <h3 className="font-manrope font-bold text-white text-lg">Refine Feed</h3>
                <button onClick={() => { setSearchInput(''); setUnreadOnly(false); setPage(0); }} className="text-[10px] font-bold text-primary-light uppercase tracking-widest hover:underline">Reset</button>
             </div>
             
             {/* General Search */}
             <div className="mb-8">
               <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Context Search</label>
               <div className="relative">
                 <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                 <input 
                   type="text"
                   value={searchInput}
                   onChange={e => { setSearchInput(e.target.value); setPage(0); }}
                   placeholder="Search message or type..."
                   className="w-full bg-background border-none rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary-light/40 text-on-surface placeholder-slate-600 outline-none transition-all font-inter"
                 />
               </div>
             </div>

             {/* Unread Only Filter */}
             <div className="mb-4">
               <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Triage Status</label>
               <label className={`flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer group border ${unreadOnly ? 'bg-surface border-primary/40' : 'bg-background border-transparent hover:bg-surface'}`}>
                  <div className="flex items-center gap-3">
                     <span className={`material-symbols-outlined ${unreadOnly ? 'text-[#afc6ff]' : 'text-slate-500'}`}>mark_email_unread</span>
                     <span className={`text-sm font-semibold ${unreadOnly ? 'text-[#afc6ff]' : 'text-slate-300'}`}>Show Unread Only</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={unreadOnly}
                    onChange={(e) => { setUnreadOnly(e.target.checked); setPage(0); }}
                    className="rounded border-[#424753] bg-[#0b1326] text-[#afc6ff] focus:ring-[#afc6ff]/20 w-4 h-4"
                  />
               </label>
             </div>

             <div className="mt-8 border-t border-white/5 pt-6 hidden xl:block">
                 <div className="bg-gradient-to-br from-primary/10 to-surface-variant rounded-xl p-6 border border-primary-light/10 relative overflow-hidden">
                    <div className="relative z-10">
                       <h4 className="text-xs font-bold text-[#afc6ff] mb-2 uppercase tracking-tighter">Event Telemetry</h4>
                       <p className="text-[10px] text-slate-400 leading-relaxed italic">
                         All events are securely hashed and stored in accordance with internal compliance protocols. 
                         Review alerts regularly to ensure optimal threshold configurations.
                       </p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-[#afc6ff]/5 rounded-full blur-2xl"></div>
                 </div>
             </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
