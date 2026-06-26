'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { downloadAuthenticatedFile } from '@/lib/downloadCsv';
import { useToast } from '@/contexts/ToastContext';
import { formatDateTime } from '@/lib/formatDate';
import { EmptyState } from '@/components/EmptyState';
import { StitchPageHeader } from '@/components/StitchPageHeader';

interface Detection {
  id: number;
  camera_id: number;
  camera_name?: string | null;
  user_id?: number | null;
  user_name?: string | null;
  status: string;
  confidence: number;
  timestamp: string;
}

interface CameraOpt {
  id: number;
  camera_name: string;
}

interface UserRow {
  id: number;
  has_face_embedding?: boolean;
  image_path?: string | null;
}

export default function DetectionsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Detection[]>([]);
  const [total, setTotal] = useState(0);
  const [cameras, setCameras] = useState<CameraOpt[]>([]);
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);
  const [usersSummary, setUsersSummary] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [cameraId, setCameraId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(rowsPerPage));
      // In a real UI with numeric pages, we offset
      params.set('offset', String(page * rowsPerPage));
      if (search.trim()) params.set('q', search.trim());
      if (status) params.set('status', status);
      if (cameraId) params.set('camera_id', cameraId);
      const res = await api<{ items: Detection[]; total: number } | Detection[]>(
        `/api/v1/detections?${params.toString()}`
      );
      if (Array.isArray(res)) {
         setItems(res);
         setTotal(res.length);
      } else {
         setItems(res.items ?? []);
         setTotal(typeof res.total === 'number' ? res.total : 0);
      }
    } catch {
      setError('Failed to load detections');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, status, cameraId]);

  useEffect(() => {
    api<CameraOpt[]>('/api/v1/cameras').then(setCameras).catch(() => {});
  }, []);

  useEffect(() => {
    api<{ items: UserRow[]; total: number } | UserRow[]>('/api/v1/users?limit=200')
      .then((r) => {
        const rows = Array.isArray(r) ? r : r.items ?? [];
        setUsersSummary(rows);
        setEnrolledCount(rows.filter((u) => u.has_face_embedding).length);
      })
      .catch(() => setEnrolledCount(null));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput), 400);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void load();
  }, [load]);

  const cameraLabel = (d: Detection) => d.camera_name?.trim() || `Camera ${d.camera_id}`;

  const exportQuery = () => {
    const params = new URLSearchParams();
    params.set('export_limit', '50000');
    if (search.trim()) params.set('q', search.trim());
    if (status) params.set('status', status);
    if (cameraId) params.set('camera_id', cameraId);
    return params.toString();
  };

  const handleExportCsv = async () => {
    try {
      await downloadAuthenticatedFile(`/api/v1/detections/export.csv?${exportQuery()}`, 'visioryx-detections.csv');
      toast.success('CSV download started');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  // Math for pagination
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));

  return (
    <div className="animate-in fade-in duration-500 pb-12 w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
         <StitchPageHeader
            eyebrow="Forensics"
            title="Detection Intelligence"
            subtitle="Deep-layer face detections across your camera grid. Known rows show enrolled names; confidence for known is similarity to the enrolled face, for unknown it is detector score only."
         />
         
         <div className="flex gap-3 shrink-0">
            <button 
               onClick={handleExportCsv}
               className="bg-surface-variant px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface transition-colors text-white border border-white/5"
            >
               <span className="material-symbols-outlined text-sm">download</span>
               Export Dataset
            </button>
            <button className="bg-gradient-to-br from-primary-light to-primary px-6 py-2.5 rounded-xl font-bold text-sm text-on-surface flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-primary/20">
               <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>calendar_today</span>
               Last 14 Days
            </button>
         </div>
      </div>

      {enrolledCount === 0 && usersSummary.length > 0 && usersSummary.some((u) => u.image_path && !u.has_face_embedding) && (
         <div className="mb-6 bg-warning-dark/30 border border-warning/30 p-4 rounded-xl flex items-start gap-3">
            <span className="material-symbols-outlined text-warning">warning</span>
            <div>
               <p className="text-[#ffe6ca] text-sm">
                  A photo is saved but <strong>no face embedding</strong> was stored — usually the face was unclear, too small, or the server
                  is in OpenCV-only mode. Re-upload a front-facing photo on the{' '}
                  <Link href="/users" className="font-bold underline text-white hover:text-primary transition-colors">Users</Link>{' '}
                  page.
               </p>
            </div>
         </div>
      )}
      {enrolledCount === 0 && !usersSummary.some((u) => u.image_path && !u.has_face_embedding) && (
         <div className="mb-6 bg-primary-dark/30 border border-primary-light/30 p-4 rounded-xl flex items-start gap-3">
            <span className="material-symbols-outlined text-primary-light">info</span>
            <div>
               <p className="text-[#e4eaff] text-sm">
                  No enrolled faces yet — add users on the{' '}
                  <Link href="/users" className="font-bold underline text-white hover:text-[#dae2fd] transition-colors">Users</Link>{' '}
                  page and upload a clear front-facing photo so names can appear here as <strong>known</strong>.
               </p>
            </div>
         </div>
      )}
      {error && (
         <div className="mb-6 bg-error-dark/20 border border-error/20 p-4 rounded-xl flex items-center gap-2 text-error-light text-sm">
            <span className="material-symbols-outlined text-error text-sm">error</span>
            {error}
         </div>
      )}

      {/* Forensic Log Table */}
      <section className="bg-surface-variant rounded-xl overflow-hidden shadow-2xl border border-white/5">
         <div className="p-6 md:p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
               <h2 className="font-manrope text-xl font-bold text-white mb-1">Forensic Log</h2>
               <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Global detection stream</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
               <div className="relative group flex-grow md:flex-grow-0">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary-light transition-colors text-sm">search</span>
                  <input 
                     type="text"
                     value={searchInput}
                     onChange={(e) => { setSearchInput(e.target.value); setPage(0); }}
                     placeholder="Search Person or ID..."
                     className="w-full md:w-64 bg-background border border-white/5 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:ring-1 focus:ring-primary/40 outline-none transition-all placeholder:text-slate-600"
                  />
               </div>
               
               <select 
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); setPage(0); }}
                  className="bg-background border border-white/5 rounded-lg py-2 px-3 text-sm text-white focus:ring-1 focus:ring-primary/40 outline-none transition-all cursor-pointer"
               >
                  <option value="">All Statuses</option>
                  <option value="known">Known</option>
                  <option value="unknown">Unknown</option>
               </select>

               <select 
                  value={cameraId}
                  onChange={(e) => { setCameraId(e.target.value); setPage(0); }}
                  className="bg-background border border-white/5 rounded-lg py-2 px-3 text-sm text-white focus:ring-1 focus:ring-primary/40 outline-none transition-all cursor-pointer"
               >
                  <option value="">All Cameras</option>
                  {cameras.map((c) => (
                     <option key={c.id} value={String(c.id)}>{c.camera_name}</option>
                  ))}
               </select>
            </div>
         </div>

          <div className="bg-surface rounded-xl overflow-hidden border border-white/5 shadow-2xl">
            <div className="overflow-x-auto">
             <table className="w-full text-left font-inter">
                <thead>
                   <tr className="bg-surface border-b border-white/10">
                      <th className="px-6 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">ID</th>
                      <th className="px-6 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Person</th>
                      <th className="px-6 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Camera / Node</th>
                      <th className="px-6 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Confidence</th>
                      <th className="px-6 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th>
                      <th className="px-6 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Timestamp</th>
                   </tr>
                </thead>
               <tbody className="divide-y divide-white/5">
                  {loading ? (
                     <tr>
                        <td colSpan={6} className="px-8 py-12 text-center text-slate-500 animate-pulse">Loading neural forensic data...</td>
                     </tr>
                  ) : items.length === 0 ? (
                     <tr>
                        <td colSpan={6} className="px-8 py-12">
                           <EmptyState message="No detections found matching your filters." />
                        </td>
                     </tr>
                  ) : (
                     items.map((d) => (
                        <tr key={d.id} className="hover:bg-white/5 transition-colors group">
                           <td className="px-6 md:px-8 py-4 tabular-nums text-slate-400 font-medium">#{d.id}</td>
                           <td className="px-6 md:px-8 py-4">
                              <div className="flex items-center gap-2">
                                 <span className={`material-symbols-outlined text-lg ${d.status === 'known' ? 'text-secondary' : 'text-slate-400'}`}>
                                    {d.status === 'known' ? 'person' : 'person_off'}
                                 </span>
                                 <span className={`font-bold ${d.status === 'known' ? 'text-white' : 'text-slate-400'}`}>
                                    {d.user_name || 'Unidentified'}
                                 </span>
                              </div>
                           </td>
                           <td className="px-6 md:px-8 py-4 text-slate-400">{cameraLabel(d)}</td>
                           <td className={`px-6 md:px-8 py-4 tabular-nums font-medium ${d.confidence > 0.85 ? 'text-secondary' : d.confidence > 0.6 ? 'text-warning' : 'text-error'}`}>
                              {(d.confidence * 100).toFixed(1)}%
                           </td>
                           <td className="px-6 md:px-8 py-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter ${
                                 d.status === 'known' ? 'bg-success/20 text-secondary' : 'bg-slate-800 text-slate-300'
                              }`}>
                                 {d.status}
                              </span>
                           </td>
                           <td className="px-6 md:px-8 py-4 text-right tabular-nums text-slate-400">
                              {formatDateTime(d.timestamp)}
                           </td>
                        </tr>
                     ))
                  )}
               </tbody>
            </table>
            </div>
         </div>

         {/* Pagination Footer */}
         <div className="p-4 bg-surface-variant/20 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-xs text-slate-400">
               Showing <span className="text-white font-bold">{items.length > 0 ? page * rowsPerPage + 1 : 0}</span> to <span className="text-white font-bold">{Math.min((page + 1) * rowsPerPage, total)}</span> of <span className="text-white font-bold">{total}</span>
            </div>
            
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Rows per page:</span>
                  <select 
                     value={rowsPerPage}
                     onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
                     className="bg-transparent text-sm text-white font-bold focus:outline-none cursor-pointer"
                  >
                     <option value={10} className="bg-background">10</option>
                     <option value={25} className="bg-background">25</option>
                     <option value={50} className="bg-background">50</option>
                     <option value={100} className="bg-background">100</option>
                  </select>
               </div>
               
               <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-white/5">
                  <button 
                     onClick={() => setPage(p => Math.max(0, p - 1))}
                     disabled={page === 0}
                     className="p-1 rounded text-slate-400 hover:text-white hover:bg-surface-variant disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                     <span className="material-symbols-outlined text-sm">chevron_left</span>
                  </button>
                  <span className="text-xs font-bold px-2 text-white">
                     {totalPages > 0 ? page + 1 : 0} / {totalPages}
                  </span>
                  <button 
                     onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                     disabled={page >= totalPages - 1 || totalPages === 0}
                     className="p-1 rounded text-slate-400 hover:text-white hover:bg-surface-variant disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                     <span className="material-symbols-outlined text-sm">chevron_right</span>
                  </button>
               </div>
            </div>
         </div>
      </section>
    </div>
  );
}
