'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getStreamBase, getToken } from '@/lib/api';
import {
  enrollmentBaseIsUnreachableFromOtherDevices,
  getEnrollmentPublicBase,
  getPublicAppOrigin,
} from '@/lib/appOrigin';
import { useToast } from '@/contexts/ToastContext';
import { EmptyStateIllustration } from '@/components/illustrations';
import QRCode from 'react-qr-code';

interface User {
  id: number;
  name: string;
  email: string;
  image_path?: string;
  is_active: boolean;
  has_face_embedding?: boolean;
  role?: string;
}

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [uploadUserId, setUploadUserId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUser, setPreviewUser] = useState<User | null>(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [enrollUser, setEnrollUser] = useState<User | null>(null);
  const [enrollUrl, setEnrollUrl] = useState<string | null>(null);
  const [enrollHours, setEnrollHours] = useState(48);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [emailingId, setEmailingId] = useState<number | null>(null);
  
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [userTotal, setUserTotal] = useState(0);
  const [userSearch, setUserSearch] = useState('');
  const [userSearchDebounced, setUserSearchDebounced] = useState('');
  const [phoneQrWarning, setPhoneQrWarning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    () => {
      setLoading(true);
      api<{ items: User[]; total: number } | User[]>(
        `/api/v1/users?limit=${rowsPerPage}&offset=${page * rowsPerPage}${
          userSearchDebounced.trim() ? `&q=${encodeURIComponent(userSearchDebounced.trim())}` : ''
        }`,
      )
        .then((r) => {
          if (Array.isArray(r)) {
            setUsers(r);
            setUserTotal(r.length);
          } else {
            setUsers(r.items ?? []);
            setUserTotal(typeof r.total === 'number' ? r.total : 0);
          }
        })
        .catch(() => setError('Load failed'))
        .finally(() => setLoading(false));
    },
    [page, rowsPerPage, userSearchDebounced],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setUserSearchDebounced(userSearch), 400);
    return () => window.clearTimeout(t);
  }, [userSearch]);

  useEffect(() => {
    setPage(0);
  }, [userSearchDebounced]);

  useEffect(() => {
    let cancelled = false;
    getEnrollmentPublicBase()
      .then((base) => {
        if (!cancelled) setPhoneQrWarning(enrollmentBaseIsUnreachableFromOtherDevices(base));
      })
      .catch(() => {
        if (!cancelled) setPhoneQrWarning(enrollmentBaseIsUnreachableFromOtherDevices(getPublicAppOrigin()));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    try {
      await api('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({ name, email }),
      });
      setOpen(false);
      setName('');
      setEmail('');
      load();
      toast.success('User registered successfully');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
      toast.error(msg);
    }
  };

  const handleUpload = async (userId: number, file: File) => {
    setUploading(userId);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await api(`/api/v1/users/${userId}/upload-face`, {
        method: 'POST',
        body: form,
      });
      await load();
      toast.success('Face photo uploaded successfully');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    const id = deleteUser.id;
    setDeletingId(id);
    setError(null);
    try {
      await api(`/api/v1/users/${id}`, { method: 'DELETE' });
      setDeleteUser(null);
      if (previewUser?.id === id) setPreviewUser(null);
      if (enrollUser?.id === id) {
        setEnrollUser(null);
        setEnrollUrl(null);
      }
      await load();
      toast.success('User removed');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const sendEnrollmentEmail = async (u: User) => {
    setEmailingId(u.id);
    setError(null);
    try {
      await api(`/api/v1/users/${u.id}/send-enrollment-email`, { method: 'POST' });
      toast.success(`Enrollment link sent to ${u.email}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Send failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setEmailingId(null);
    }
  };

  const openEnrollmentQr = async (u: User) => {
    setEnrollUser(u);
    setEnrollUrl(null);
    setEnrollError(null);
    setEnrollLoading(true);
    try {
      const data = await api<{ token: string; enroll_path: string; expires_in_hours: number }>(
        `/api/v1/users/${u.id}/enrollment-link`,
        { method: 'POST' },
      );
      const base = await getEnrollmentPublicBase();
      const full = `${base.replace(/\/$/, '')}${data.enroll_path}`;
      setEnrollUrl(full);
      setEnrollHours(data.expires_in_hours);
    } catch (e) {
      setEnrollError(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setEnrollLoading(false);
    }
  };

  const photoUrlFor = (userId: number) => {
    const token = getToken();
    if (!token) return null;
    const base = getStreamBase();
    // cache-bust to avoid stale 401/old image after upload
    return `${base}/api/v1/users/${userId}/photo?token=${encodeURIComponent(token)}&_=${Date.now()}`;
  };

  const activeEnrolledCount = users.filter(u => u.has_face_embedding).length;
  const pendingCount = users.filter(u => !u.has_face_embedding && u.image_path).length;

  return (
    <div className="animate-in fade-in duration-500">
      
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && uploadUserId) handleUpload(uploadUserId, f);
          setUploadUserId(null);
          e.target.value = '';
        }}
      />

      {/* Page Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-10">
        <div>
          <h1 className="font-manrope text-4xl font-extrabold tracking-tight text-on-surface">User Management</h1>
          <p className="text-slate-400 mt-2 max-w-xl">Oversee ecosystem access, enrollment statuses, and biometric integrity across the enterprise network.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-5 py-2.5 bg-surface-variant text-on-surface rounded-md font-semibold text-sm hover:bg-surface transition-all">
            <span className="material-symbols-outlined text-lg">download</span> Export CSV
          </button>
          <button 
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-br from-primary-light to-primary text-primary-dark rounded-md font-bold text-sm shadow-lg shadow-primary-light/10 hover:opacity-90 transition-all"
          >
            <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>person_add</span> Register User
          </button>
        </div>
      </div>

      {error && <span className="text-error font-bold bg-error/10 px-3 py-1 rounded-md mb-4 inline-block">{error}</span>}
      
      {phoneQrWarning && (
        <div className="bg-surface border-l-4 border-warning p-4 rounded-r-lg mb-6 text-sm text-on-surface">
          <h4 className="font-bold flex items-center gap-2 text-warning mb-1"><span className="material-symbols-outlined">warning</span> QR codes won&apos;t work on your phone while the link uses localhost</h4>
          <p className="text-slate-500">
            Set <strong className="text-white">Public dashboard URL</strong> in Admin → Email & SMTP (or <code>PUBLIC_DASHBOARD_URL</code> in backend <code>.env</code>) to your LAN URL, e.g. <code>http://192.168.x.x:3000</code>.
          </p>
        </div>
      )}

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Total Enrolled */}
        <div className="relative overflow-hidden bg-surface-variant rounded-xl p-8 group border border-white/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary-light/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-primary-light/10"></div>
          <div className="flex flex-col gap-1 relative z-10">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 font-inter">Total Enrolled</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-manrope font-extrabold tabular-nums">{activeEnrolledCount}</span>
              <span className="text-secondary text-xs font-bold flex items-center gap-0.5 tabular-nums"></span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between text-xs text-slate-500 border-t border-white/10 pt-4">
            <span>Total Accounts</span>
            <span className="tabular-nums font-bold text-white/70">{userTotal}</span>
          </div>
        </div>
        {/* Pending Verification */}
        <div className="relative overflow-hidden bg-surface-variant rounded-xl p-8 group border border-white/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-warning/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-warning/10"></div>
          <div className="flex flex-col gap-1 relative z-10">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 font-inter">Pending Embedding</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-manrope font-extrabold tabular-nums text-warning">{pendingCount}</span>
              <span className="text-warning/60 text-xs font-bold tabular-nums">Requires action</span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between text-xs text-slate-500 border-t border-white/10 pt-4">
            <span>Processing Time</span>
            <span className="tabular-nums font-bold text-white/70">Automatic</span>
          </div>
        </div>
        {/* Search / Active */}
        <div className="relative overflow-hidden bg-surface-variant rounded-xl p-8 group border border-white/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-secondary/10"></div>
          <div className="flex flex-col gap-1 relative z-10">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 font-inter">Search Directory</span>
             <div className="relative w-full mt-3">
               <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
               <input 
                 className="w-full bg-background border-none rounded-lg py-2.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary-light/40 text-on-surface placeholder-slate-600 outline-none transition-all tabular-nums font-inter" 
                 placeholder="Search name or email..." 
                 type="text"
                 value={userSearch}
                 onChange={e => setUserSearch(e.target.value)}
               />
             </div>
          </div>
        </div>
      </div>

      {/* Main Data Canvas */}
      <div className="bg-surface rounded-xl overflow-hidden shadow-2xl border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-inter">
            <thead>
              <tr className="bg-surface border-b border-white/10">
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">User Identity</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Face Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">System ID</th>
                <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              
              {loading && (
                 <tr>
                    <td colSpan={4} className="py-20 text-center">
                       <span className="material-symbols-outlined animate-spin text-4xl text-primary">sync</span>
                    </td>
                 </tr>
              )}

              {!loading && users.length === 0 && (
                <tr>
                   <td colSpan={4} className="py-20 text-center">
                       <EmptyStateIllustration size={160} className="mx-auto opacity-50 mb-4" />
                       <p className="text-slate-400 font-medium">No users found. Try registering a user to begin.</p>
                   </td>
                </tr>
              )}

              {!loading && users.map(u => (
                <tr key={u.id} className="hover:bg-surface-variant/40 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-surface-variant flex-shrink-0 relative flex items-center justify-center font-bold text-on-surface">
                        {u.image_path ? (
                            <img src={photoUrlFor(u.id) ?? undefined} onError={(e) => { e.currentTarget.style.display='none'; }} alt={u.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            u.name.charAt(0).toUpperCase()
                        )}
                        {u.has_face_embedding && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-secondary border-2 border-surface rounded-full"></div>}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-on-surface">{u.name}</div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5 max-w-[150px] sm:max-w-xs">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${u.role === 'admin' ? 'bg-primary/20 text-primary-light border border-primary/30' : 'bg-surface-variant text-slate-400 border border-white/5'}`}>
                      {u.role}
                    </span>
                  </td>

                  <td className="px-6 py-5">
                    {u.has_face_embedding ? (
                        <div className="flex items-center gap-2" title="Face vector saved — live recognition active">
                           <span className="material-symbols-outlined text-secondary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                           <span className="text-xs font-semibold text-on-surface">Enrolled</span>
                        </div>
                    ) : u.image_path ? (
                        <div className="flex items-center gap-2" title="Photo uploaded but embedding failed. Re-upload a clear photo.">
                           <span className="material-symbols-outlined text-warning text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>pending</span>
                           <span className="text-xs font-semibold text-on-surface">Pending Embedding</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2" title="No photo uploaded">
                           <span className="material-symbols-outlined text-slate-400 text-lg">no_photography</span>
                           <span className="text-xs font-semibold text-slate-400">Missing Photo</span>
                        </div>
                    )}
                  </td>

                  <td className="px-6 py-5">
                     <span className="px-2.5 py-1 rounded bg-background text-slate-400 text-[10px] font-extrabold uppercase tracking-wider font-mono">
                         ID: VX-{u.id.toString().padStart(4, '0')}
                     </span>
                  </td>

                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            disabled={!u.image_path}
                            onClick={() => { setPhotoLoadError(false); setPreviewUser(u); }}
                            className="p-2 hover:bg-surface-variant rounded-lg text-slate-400 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                            title="View Photo"
                        >
                           <span className="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                        <button 
                            onClick={() => { setUploadUserId(u.id); fileInputRef.current?.click(); }}
                            disabled={uploading === u.id}
                            className="p-2 hover:bg-surface-variant rounded-lg text-slate-400 hover:text-secondary transition-all"
                            title="Upload Face Image"
                        >
                           {uploading === u.id ? <span className="material-symbols-outlined animate-spin text-[20px]">sync</span> : <span className="material-symbols-outlined text-[20px]">cloud_upload</span>}
                        </button>
                        <button 
                            onClick={() => openEnrollmentQr(u)}
                            className="p-2 hover:bg-surface-variant rounded-lg text-slate-400 hover:text-primary-light transition-all"
                            title="Enrollment Qr"
                        >
                           <span className="material-symbols-outlined text-[20px]">qr_code_2</span>
                        </button>
                        <button 
                            disabled={emailingId === u.id}
                            onClick={() => void sendEnrollmentEmail(u)}
                            className="p-2 hover:bg-surface-variant rounded-lg text-slate-400 hover:text-primary-light transition-all"
                            title="Email Enrollment Link"
                        >
                           {emailingId === u.id ? <span className="material-symbols-outlined animate-spin text-[20px]">sync</span> : <span className="material-symbols-outlined text-[20px]">email</span>}
                        </button>
                        <button 
                            disabled={deletingId === u.id}
                            onClick={() => setDeleteUser(u)}
                            className="p-2 hover:bg-surface-variant rounded-lg text-slate-400 hover:text-error transition-all"
                            title="Delete User"
                        >
                           <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        {users.length > 0 && (
            <div className="px-8 py-4 flex items-center justify-between bg-surface-variant/50 border-t border-white/5">
                <div className="text-xs text-slate-500">
                  Showing <span className="text-on-surface font-bold tabular-nums">1-{users.length}</span> of <span className="text-on-surface font-bold tabular-nums">{userTotal}</span> entries
                </div>
                {/* Pagination Controls simplified for Tailwind Demo */}
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
                     disabled={users.length < rowsPerPage} 
                     onClick={() => setPage(page+1)}
                     className="w-8 h-8 flex items-center justify-center rounded bg-surface-variant text-white disabled:opacity-50 hover:bg-surface transition-colors"
                   >
                     <span className="material-symbols-outlined text-lg">chevron_right</span>
                   </button>
                </div>
            </div>
        )}
      </div>

      {/* Tailwind Dialogs (Replacing MUI) */}

      {/* Register User Dialog */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-white/10 rounded-xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
             <div className="p-6 border-b border-white/5 bg-surface-variant flex justify-between items-center">
                <h3 className="text-lg font-bold font-manrope text-on-surface">Register New User</h3>
             </div>
             <div className="p-6 space-y-4">
                <div>
                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Full Name</label>
                   <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-background border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary-light/50 text-on-surface outline-none" placeholder="John Doe" />
                </div>
                <div>
                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                   <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-background border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:ring-1 focus:ring-primary-light/50 text-on-surface outline-none" placeholder="john@company.com" />
                </div>
             </div>
             <div className="p-6 bg-surface-variant border-t border-white/5 flex justify-end gap-3">
                 <button onClick={() => setOpen(false)} className="px-5 py-2 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/5">Cancel</button>
                 <button onClick={handleSave} className="px-6 py-2 bg-gradient-to-br from-primary-light to-primary text-primary-dark rounded-lg text-sm font-bold shadow-lg shadow-primary-light/20 hover:opacity-90 transition-opacity">Register</button>
             </div>
          </div>
        </div>
      )}

      {/* Delete User Dialog */}
      {!!deleteUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-white/10 rounded-xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col">
             <div className="p-6 border-b border-error/10 bg-error-dark/10 flex gap-3 items-center">
                <span className="material-symbols-outlined text-error">warning</span>
                <h3 className="text-lg font-bold font-manrope text-error">Delete Identity</h3>
             </div>
             <div className="p-6">
                 <p className="text-sm text-slate-300 leading-relaxed">
                   Permanently remove <strong>{deleteUser?.name}</strong> ({deleteUser?.email}) from the biometric system? Past detection logs will remain but will no longer resolve to this identity.
                 </p>
             </div>
             <div className="p-6 bg-surface-variant border-t border-white/5 flex justify-end gap-3">
                 <button onClick={() => setDeleteUser(null)} disabled={!!deletingId} className="px-5 py-2 rounded-lg text-sm font-bold text-slate-300 hover:bg-white/5">Abort</button>
                 <button onClick={() => void handleDelete()} disabled={!!deletingId} className="px-6 py-2 bg-error text-error-dark rounded-lg text-sm font-bold hover:bg-error-light transition-colors">{deletingId ? 'Deleting...' : 'Confirm Purge'}</button>
             </div>
          </div>
        </div>
      )}

      {/* QR Code Enrollment Dialog */}
      {!!enrollUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-white/10 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
             <div className="p-6 border-b border-white/5 bg-surface-variant flex justify-between items-center">
                <h3 className="text-lg font-bold font-manrope text-on-surface">Remote Enrollment</h3>
                <button onClick={() => { setEnrollUser(null); setEnrollUrl(null); setEnrollError(null); }} className="text-slate-500 hover:text-white">
                   <span className="material-symbols-outlined text-xl">close</span>
                </button>
             </div>
             <div className="p-6 bg-background flex flex-col items-center">
                <p className="text-sm text-slate-400 text-center mb-6">
                   Open link on a mobile device (same Wi-Fi/LAN). Link expires in {enrollHours} hours.
                </p>
                {enrollLoading && <span className="material-symbols-outlined animate-spin text-4xl text-primary-light my-10">sync</span>}
                {enrollError && <p className="text-error font-bold text-sm bg-error/10 p-2 rounded">{enrollError}</p>}
                {enrollUrl && !enrollLoading && (
                   <div className="flex flex-col items-center w-full">
                      <div className="bg-white p-4 rounded-xl shadow-lg mb-6">
                         <QRCode value={enrollUrl || ''} size={200} />
                      </div>
                      <div className="w-full p-3 bg-surface-variant border border-white/10 rounded-lg flex items-center justify-between gap-3 overflow-hidden">
                         <code className="text-xs text-primary-light font-mono truncate">{enrollUrl}</code>
                         <button onClick={() => { if(enrollUrl) navigator.clipboard.writeText(enrollUrl).then(() => toast.success('Link Copied')); }} className="bg-surface hover:bg-surface-variant text-white p-2 rounded shrink-0">
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                         </button>
                      </div>
                   </div>
                )}
             </div>
          </div>
        </div>
      )}

      {/* Preview Photo Dialog */}
      {!!previewUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
             <div className="relative w-full max-w-xl">
                 <button onClick={() => setPreviewUser(null)} className="absolute -top-10 right-0 text-white opacity-50 hover:opacity-100 transition-opacity">
                     <span className="material-symbols-outlined text-3xl">close</span>
                 </button>
                 {previewUser?.image_path ? (
                    <div className="bg-background rounded-xl overflow-hidden border border-white/10 shadow-2xl relative min-h-[400px]">
                        <img 
                          src={photoUrlFor(previewUser?.id) ?? undefined} 
                          alt={previewUser?.name} 
                          className="w-full max-h-[70vh] object-contain block" 
                          onError={() => setPhotoLoadError(true)} 
                        />
                        {photoLoadError && <div className="absolute inset-0 flex items-center justify-center bg-surface-variant/90 text-center p-6"><p className="text-error">Couldn't load image from storage. Make sure backend node is healthy.</p></div>}
                    </div>
                 ) : (
                    <div className="bg-surface-variant rounded-xl p-10 text-center"><p className="text-slate-400">No biometrics found.</p></div>
                 )}
                 <div className="mt-4 text-center">
                    <p className="font-bold text-on-surface">{previewUser?.name}</p>
                    <p className="text-xs text-slate-500 font-mono">ID: VX-{previewUser?.id.toString().padStart(4,'0')}</p>
                 </div>
             </div>
        </div>
      )}

    </div>
  );
}