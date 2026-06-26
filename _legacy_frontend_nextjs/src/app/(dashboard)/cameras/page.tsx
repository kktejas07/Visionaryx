'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { maskRtspUrl } from '@/lib/maskRtsp';
import { useToast } from '@/contexts/ToastContext';
import { EmptyStateIllustration } from '@/components/illustrations';

interface Camera {
  id: number;
  camera_name: string;
  rtsp_url: string;
  status: string;
  is_enabled: boolean;
}

export default function CamerasPage() {
  const toast = useToast();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  
  const [rtspRevealed, setRtspRevealed] = useState<Record<number, boolean>>({});
  const [showRtspInDialog, setShowRtspInDialog] = useState(false);

  const filteredCameras = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return cameras;
    return cameras.filter(
      (c) =>
        c.camera_name.toLowerCase().includes(q) ||
        c.rtsp_url.toLowerCase().includes(q) ||
        String(c.id).includes(q),
    );
  }, [cameras, filter]);

  const load = () => {
    setLoading(true);
    api<Camera[]>('/api/v1/cameras')
      .then(setCameras)
      .catch(() => setError('Load failed'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleOpen = (cam?: Camera) => {
    setEditing(cam || null);
    setName(cam?.camera_name || '');
    setUrl(cam?.rtsp_url || '');
    setShowRtspInDialog(false);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditing(null);
    setName('');
    setUrl('');
    setShowRtspInDialog(false);
  };

  const toggleRtspReveal = (id: number) => {
    setRtspRevealed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api(`/api/v1/cameras/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ camera_name: name, rtsp_url: url }),
        });
        toast.success('Camera updated');
      } else {
        await api('/api/v1/cameras', {
          method: 'POST',
          body: JSON.stringify({ camera_name: name, rtsp_url: url }),
        });
        toast.success('Camera added');
      }
      handleClose();
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
      toast.error(msg);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this camera?')) return;
    try {
      await api(`/api/v1/cameras/${id}`, { method: 'DELETE' });
      load();
      toast.success('Camera deleted');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      
      {/* Hero Header & Stats (Bento Grid Style) */}
      <section className="grid grid-cols-12 gap-6 mb-10">
        <div className="col-span-12 lg:col-span-7 flex flex-col justify-between p-8 rounded-xl bg-surface-variant/50 relative overflow-hidden group border border-white/5">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-light/5 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-primary-light/10 transition-colors duration-500"></div>
          <div className="relative z-10">
            <h2 className="font-manrope text-3xl font-extrabold text-on-surface tracking-tight mb-2">Camera Infrastructure</h2>
            <p className="text-slate-400 max-w-md text-sm leading-relaxed">Manage your global sentinel network. Deploy new nodes, monitor health telemetry, and optimize tracking from a single interface.</p>
          </div>
          <div className="relative z-10 mt-8 flex gap-4">
            <button 
              onClick={() => handleOpen()}
              className="bg-gradient-to-br from-primary-light to-primary text-primary-dark font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 text-sm hover:opacity-90 transition-opacity shadow-lg shadow-primary-light/10"
            >
              <span className="material-symbols-outlined text-sm">add</span> Add Camera
            </button>
          </div>
        </div>

        <div className="col-span-12 md:col-span-6 lg:col-span-2 p-6 rounded-xl bg-surface-variant flex flex-col justify-between border-t border-white/5">
          <div className="flex justify-between items-start">
            <span className="material-symbols-outlined text-primary-light" style={{ fontVariationSettings: "'FILL' 1" }}>sensors</span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Nodes</p>
            <p className="text-3xl font-manrope font-black text-on-surface tabular-nums">{cameras.length}</p>
          </div>
        </div>

        <div className="col-span-12 md:col-span-6 lg:col-span-3 p-6 rounded-xl bg-surface-variant flex flex-col justify-between border-t border-white/5">
          <div className="flex justify-between items-start">
            <span className="material-symbols-outlined text-warning" style={{ fontVariationSettings: "'FILL' 1" }}>podcasts</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">REALTIME</span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Active Streams</p>
            <div className="flex items-end gap-2">
               <p className="text-3xl font-manrope font-black text-on-surface tabular-nums">{cameras.filter(c => c.status === 'active').length}</p>
            </div>
            <div className="w-full h-1 bg-surface mt-3 rounded-full overflow-hidden">
                <div className="h-full bg-warning" style={{ width: cameras.length > 0 ? `${(cameras.filter(c => c.status === 'active').length / cameras.length) * 100}%` : '0%' }}></div>
            </div>
          </div>
        </div>
      </section>

      {/* Info Alert about Networking */}
      <div className="bg-surface border-l-4 border-primary p-4 rounded-r-lg mb-6 flex gap-3 text-sm text-on-surface">
        <span className="material-symbols-outlined text-primary-light">info</span>
        <div>
          <p className="font-bold mb-1">RTSP & Remote Access</p>
          <p className="text-slate-400">
            RTSP URLs with local IPs (e.g. 192.168.x.x) only work when <strong>Visioryx runs on the same network</strong> as your cameras. 
          </p>
        </div>
      </div>

      {error && <span className="text-error font-bold bg-error/10 px-3 py-1 rounded-md mb-4 inline-block">{error}</span>}

      {/* Table Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
           <div className="relative w-full max-w-sm">
             <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
             <input 
               className="w-full bg-surface-variant border-none rounded-lg py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary/40 text-on-surface placeholder:text-slate-600 transition-all outline-none" 
               placeholder="Search by name, URL, or ID" 
               type="text"
               value={filter}
               onChange={e => setFilter(e.target.value)}
             />
           </div>
        </div>

        <div className="bg-surface-variant rounded-xl overflow-hidden border border-white/5 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-inter">
              <thead>
                <tr className="bg-surface border-b border-white/10">
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:table-cell">ID</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Device Name</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">RTSP Target</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
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

              {!loading && cameras.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <EmptyStateIllustration size={160} className="mx-auto opacity-50 mb-4" />
                    <p className="text-[#8c909f]">No cameras configured. Add a camera to begin monitoring.</p>
                  </td>
                </tr>
              )}

              {!loading && cameras.length > 0 && filteredCameras.length === 0 && (
                 <tr>
                    <td colSpan={5} className="py-10 text-center text-[#8c909f]">
                       No cameras match your search.
                    </td>
                 </tr>
              )}

              {!loading && filteredCameras.map(cam => (
                 <tr key={cam.id} className="hover:bg-surface/50 transition-colors group">
                    <td className="px-6 py-4 hidden sm:table-cell text-xs font-bold text-slate-400 tabular-nums">#{cam.id}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-lg overflow-hidden bg-background border border-white/10 flex items-center justify-center">
                             <span className="material-symbols-outlined opacity-50 text-primary-light">videocam</span>
                         </div>
                         <div>
                            <p className="text-sm font-bold text-on-surface">{cam.camera_name}</p>
                            <p className="text-[10px] text-slate-500 font-medium tracking-tight">Camera Node</p>
                         </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2 max-w-xs group/url">
                            <code className="text-xs font-inter tabular-nums text-slate-400 truncate">
                                {rtspRevealed[cam.id] ? cam.rtsp_url : maskRtspUrl(cam.rtsp_url)}
                            </code>
                            <button 
                                onClick={() => toggleRtspReveal(cam.id)}
                                className="p-1 text-slate-600 hover:text-white transition-colors opacity-0 group-hover/url:opacity-100"
                            >
                                <span className="material-symbols-outlined text-[16px]">{rtspRevealed[cam.id] ? 'visibility_off' : 'visibility'}</span>
                            </button>
                        </div>
                    </td>

                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           {cam.status === 'active' ? (
                               <>
                                <span className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(87,224,130,0.5)]"></span>
                                <span className="text-xs font-semibold text-secondary">Active</span>
                               </>
                           ) : (
                               <>
                                <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                                <span className="text-xs font-semibold text-slate-500">{cam.status || 'Offline'}</span>
                               </>
                           )}
                        </div>
                    </td>

                    <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                            <button onClick={() => handleOpen(cam)} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-all" title="Edit">
                                <span className="material-symbols-outlined text-lg">edit</span>
                            </button>
                            <button onClick={() => handleDelete(cam.id)} className="p-2 text-slate-500 hover:text-[#ffb4ab] hover:bg-[#ffb4ab]/5 rounded-lg transition-all" title="Delete">
                                 <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                        </div>
                    </td>
                 </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      {/* Tailwind Modal Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
             
             <div className="p-6 border-b border-white/5 flex justify-between items-center bg-surface-variant/50">
                <h3 className="text-xl font-bold font-manrope text-on-surface">
                  {editing ? 'Configure Node' : 'Deploy New Node'}
                </h3>
                <button onClick={handleClose} className="text-slate-500 hover:text-white transition-colors">
                   <span className="material-symbols-outlined text-xl">close</span>
                </button>
             </div>

             <div className="p-6 space-y-5">
                <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Camera Alias</label>
                   <input 
                     type="text"
                     value={name}
                     onChange={e => setName(e.target.value)}
                     className="w-full bg-background border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary/50 text-on-surface outline-none transition-all placeholder:text-slate-600"
                     placeholder="e.g. Office Cam 1"
                   />
                </div>

                <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Stream Protocol URL (RTSP)</label>
                   <div className="relative">
                       <input 
                         type={showRtspInDialog ? 'text' : 'password'}
                         value={url}
                         onChange={e => setUrl(e.target.value)}
                         className="w-full bg-background border border-white/10 rounded-lg pl-4 pr-10 py-2.5 text-sm focus:ring-1 focus:ring-primary/50 text-on-surface outline-none transition-all placeholder:text-slate-600 font-inter tracking-wider"
                         placeholder="rtsp://user:pass@ip:554/path"
                       />
                       <button 
                           onClick={() => setShowRtspInDialog(!showRtspInDialog)}
                           className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                       >
                           <span className="material-symbols-outlined text-lg">{showRtspInDialog ? 'visibility_off' : 'visibility'}</span>
                       </button>
                   </div>
                   <p className="text-[10px] text-slate-400 mt-2">Credentials are masked. Same network as Visioryx required for LAN IPs.</p>
                </div>
             </div>

             <div className="p-6 bg-surface-variant border-t border-white/5 flex justify-end gap-3">
                 <button onClick={handleClose} className="px-5 py-2 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/5 transition-colors">Abort</button>
                 <button onClick={handleSave} className="px-6 py-2 bg-gradient-to-br from-primary-light to-primary text-primary-dark rounded-lg text-sm font-bold hover:opacity-95 transition-opacity shadow-[0_4px_12px_rgba(32,101,209,0.3)]">Inject Core</button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}
