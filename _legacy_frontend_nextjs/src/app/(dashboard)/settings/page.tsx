'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { StitchPageHeader } from '@/components/StitchPageHeader';

interface UserMe {
  id: number;
  email: string;
  role: string;
}

interface AppSettingsDto {
  yolo_object_detection_enabled: boolean;
  yolo_object_detection_from_database: boolean;
  face_detection_enabled: boolean;
  face_detection_from_database: boolean;
  person_detection_enabled: boolean;
  person_detection_from_database: boolean;
  can_edit: boolean;
  mobile_app_version?: string;
  mobile_app_ios_url?: string;
  mobile_app_android_url?: string;
  public_api_url?: string;
}

interface EmailSettingsDto {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  use_ssl: boolean;
  public_base_url: string;
  password_configured: boolean;
  public_dashboard_url_default: string;
}

type TabType = 'account' | 'security' | 'smtp' | 'ai' | 'mobile' | 'cloudflare' | 'brand';

export default function UnifiedSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  
  // Auth & General
  const [user, setUser] = useState<UserMe | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab: Account (Profile)
  const [email, setEmail] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);

  // Tab: Security
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);

  // Tab: SMTP (Notification Node)
  const [emailSettings, setEmailSettings] = useState<EmailSettingsDto | null>(null);
  const [smtpPassword, setSmtpPassword] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [smtpBusy, setSmtpBusy] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testTo, setTestTo] = useState('');

  // Tab: AI (YOLO)
  const [appSettings, setAppSettings] = useState<AppSettingsDto | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  // Load Initial Data
  useEffect(() => {
    setLoading(true);
    api<UserMe>('/api/v1/auth/me')
      .then((u) => {
        setUser(u);
        setEmail(u.email);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load profile');
        setLoading(false);
      });
  }, []);

  // Mobile app settings
  const [mobileVersion, setMobileVersion] = useState('');
  const [mobileIosUrl, setMobileIosUrl] = useState('');
  const [mobileAndroidUrl, setMobileAndroidUrl] = useState('');
  const [publicApiUrl, setPublicApiUrl] = useState('');
  const [mobileBusy, setMobileBusy] = useState(false);

  // Cloudflare settings
  const [cfEnabled, setCfEnabled] = useState(false);
  const [cfDomain, setCfDomain] = useState('');
  const [cfApiToken, setCfApiToken] = useState('');
  const [cfZoneId, setCfZoneId] = useState('');
  const [cfR2Bucket, setCfR2Bucket] = useState('');
  const [cfR2AccessKey, setCfR2AccessKey] = useState('');
  const [cfR2SecretKey, setCfR2SecretKey] = useState('');
  const [cfR2PublicUrl, setCfR2PublicUrl] = useState('');
  const [cfBusy, setCfBusy] = useState(false);
  const [cfSslStatus, setCfSslStatus] = useState<string>('inactive');

  // Brand settings
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [favicon, setFavicon] = useState('');
  const [copyrightText, setCopyrightText] = useState('');
  const [brandBusy, setBrandBusy] = useState(false);

  // Fetch Tab Specific Data
  useEffect(() => {
    if (!user) return;

    if (activeTab === 'smtp' && user.role === 'admin' && !emailSettings) {
      api<EmailSettingsDto>('/api/v1/settings/email')
        .then((d) => {
          setEmailSettings(d);
          setTestTo(d.from_email || '');
        })
        .catch(() => setError('Failed to load email settings'));
    }

    if (activeTab === 'ai' && user.role === 'admin' && !appSettings) {
      api<AppSettingsDto>('/api/v1/settings')
        .then(setAppSettings)
        .catch(() => setAppSettings({
          yolo_object_detection_enabled: false,
          yolo_object_detection_from_database: false,
          face_detection_enabled: true,
          face_detection_from_database: false,
          person_detection_enabled: false,
          person_detection_from_database: false,
          can_edit: true
        }));
    }

    // Load mobile settings when tab is active
    if (activeTab === 'mobile' && user?.role === 'admin' && appSettings && !mobileVersion) {
      setMobileVersion(appSettings.mobile_app_version || '');
      setMobileIosUrl(appSettings.mobile_app_ios_url || '');
      setMobileAndroidUrl(appSettings.mobile_app_android_url || '');
      setPublicApiUrl(appSettings.public_api_url || '');
    }

    // Load Cloudflare settings when tab is active
    if (activeTab === 'cloudflare' && user?.role === 'admin' && !cfDomain) {
      api<any>('/api/v1/settings/cloudflare')
        .then((d: any) => {
          setCfEnabled(d.enabled || false);
          setCfDomain(d.domain || '');
          setCfSslStatus(d.ssl_status || 'inactive');
        })
        .catch(() => {});
    }

    // Load Brand settings when tab is active
    if (activeTab === 'brand' && user?.role === 'admin' && !companyName) {
      api<any>('/api/v1/settings/brand')
        .then((d: any) => {
          setCompanyName(d.company_name || '');
          setCompanyLogo(d.company_logo_url || '');
          setFavicon(d.favicon_url || '');
          setCopyrightText(d.copyright_text || '');
        })
        .catch(() => {});
    }
  }, [activeTab, user, emailSettings, appSettings, mobileVersion, cfDomain, companyName]);

  const handleSaveMobileSettings = async () => {
    if (user?.role !== 'admin') return;
    setMobileBusy(true);
    try {
      const next = await api<AppSettingsDto>('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          mobile_app_version: mobileVersion || undefined,
          mobile_app_ios_url: mobileIosUrl || undefined,
          mobile_app_android_url: mobileAndroidUrl || undefined,
          public_api_url: publicApiUrl || undefined,
        }),
      });
      setAppSettings(next);
      toast.success('Mobile app settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setMobileBusy(false);
    }
  };

  // Actions: Cloudflare
  const handleSaveCloudflare = async () => {
    if (user?.role !== 'admin') return;
    setCfBusy(true);
    try {
      await api('/api/v1/settings/cloudflare', {
        method: 'POST',
        body: JSON.stringify({
          enabled: cfEnabled,
          domain: cfDomain,
          api_token: cfApiToken,
          zone_id: cfZoneId,
          r2_bucket: cfR2Bucket,
          r2_access_key: cfR2AccessKey,
          r2_secret_key: cfR2SecretKey,
          r2_public_url: cfR2PublicUrl,
        }),
      });
      toast.success('Cloudflare settings saved');
      setCfApiToken('');
      setCfR2SecretKey('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setCfBusy(false);
    }
  };

  const handleEnableSSL = async () => {
    setCfBusy(true);
    try {
      const res: any = await api('/api/v1/settings/cloudflare/enable-ssl', { method: 'POST' });
      toast.success(res.message || 'SSL enabled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setCfBusy(false);
    }
  };

  // Actions: Brand
  const handleSaveBrand = async () => {
    if (user?.role !== 'admin') return;
    setBrandBusy(true);
    try {
      await api('/api/v1/settings/brand', {
        method: 'POST',
        body: JSON.stringify({
          company_name: companyName,
          copyright_text: copyrightText,
        }),
      });
      toast.success('Brand settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBrandBusy(false);
    }
  };

  const handleUploadLogo = async (file: File) => {
    setBrandBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res: any = await fetch(`${window.location.origin}/api/v1/settings/brand/logo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      const data = await res.json();
      setCompanyLogo(data.logo_url);
      toast.success('Logo uploaded!');
    } catch (e) {
      toast.error('Upload failed');
    } finally {
      setBrandBusy(false);
    }
  };

  const handleUploadFavicon = async (file: File) => {
    setBrandBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res: any = await fetch(`${window.location.origin}/api/v1/settings/brand/favicon`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      const data = await res.json();
      setFavicon(data.favicon_url);
      toast.success('Favicon uploaded!');
    } catch (e) {
      toast.error('Upload failed');
    } finally {
      setBrandBusy(false);
    }
  };

  // Actions: Account
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentPassword) return;
    setProfileBusy(true);
    setError(null);
    setProfileSuccess(false);
    try {
      await api('/api/v1/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ email, current_password: currentPassword }),
      });
      setUser((u) => (u ? { ...u, email } : null));
      setCurrentPassword('');
      setProfileSuccess(true);
      toast.success('Identity updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setProfileBusy(false);
    }
  };

  // Actions: Security
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSecurityBusy(true);
    setError(null);
    setPasswordSuccess(false);
    try {
      await api('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      toast.success('Security matrix updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Password change failed');
    } finally {
      setSecurityBusy(false);
    }
  };

  // Actions: SMTP
  const handleSaveSmtp = async () => {
    if (!emailSettings) return;
    setSmtpBusy(true);
    setError(null);
    try {
      const body: Record<string, any> = { ...emailSettings };
      if (smtpPassword) body.smtp_password = smtpPassword;
      const next = await api<EmailSettingsDto>('/api/v1/settings/email', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setEmailSettings(next);
      setSmtpPassword('');
      toast.success('SMTP node configured');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSmtpBusy(false);
    }
  };

  const sendSmtpTest = async () => {
    if (!testTo.trim()) return;
    setTestingSmtp(true);
    try {
      const r = await api<{ message: string }>('/api/v1/settings/email/test', {
        method: 'POST',
        body: JSON.stringify({ to: testTo.trim() }),
      });
      toast.success(r.message || 'Verification signal sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTestingSmtp(false);
    }
  };

  // Actions: AI
  const handleYoloToggle = async (enabled: boolean) => {
    if (!appSettings?.can_edit) return;
    setAiBusy(true);
    try {
      const next = await api<AppSettingsDto>('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ yolo_object_detection_enabled: enabled }),
      });
      setAppSettings(next);
      toast.success(enabled ? 'Neural engine engaged' : 'Neural engine idle');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI update failed');
    } finally {
      setAiBusy(false);
    }
  };

  const handleFaceToggle = async (enabled: boolean) => {
    if (!appSettings?.can_edit) return;
    setAiBusy(true);
    try {
      const next = await api<AppSettingsDto>('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ face_detection_enabled: enabled }),
      });
      setAppSettings(next);
      toast.success(enabled ? 'Face detection enabled' : 'Face detection disabled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Face detection update failed');
    } finally {
      setAiBusy(false);
    }
  };

  const handlePersonToggle = async (enabled: boolean) => {
    if (!appSettings?.can_edit) return;
    setAiBusy(true);
    try {
      const next = await api<AppSettingsDto>('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ person_detection_enabled: enabled }),
      });
      setAppSettings(next);
      toast.success(enabled ? 'Person detection enabled' : 'Person detection disabled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Person detection update failed');
    } finally {
      setAiBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500 pb-20 max-w-[1200px] mx-auto">
      <StitchPageHeader
        eyebrow="Configuration"
        title="Settings Console"
        subtitle="Manage your operator identity, security credentials, and system communication nodes from a unified interface."
      />

      {error && (
        <div className="mb-8 bg-error/20 border border-error/30 p-4 rounded-xl flex items-center gap-3 text-error-light text-sm group font-inter">
           <span className="material-symbols-outlined text-error">warning</span>
           <p className="flex-1">{error}</p>
           <button onClick={() => setError(null)} className="opacity-50 group-hover:opacity-100 transition-opacity">
              <span className="material-symbols-outlined text-sm">close</span>
           </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-10 mt-2">
        {/* Sidebar Tabs */}
        <aside className="lg:w-64 shrink-0">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 scrollbar-hide">
             <button 
                onClick={() => setActiveTab('account')}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'account' ? 'bg-surface-variant text-primary-light border-l-2 border-primary' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
             >
                <span className="material-symbols-outlined text-[20px]">person</span>
                Personal Info
             </button>
             <button 
                onClick={() => setActiveTab('security')}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'security' ? 'bg-surface-variant text-primary-light border-l-2 border-primary' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
             >
                <span className="material-symbols-outlined text-[20px]">security</span>
                Access Control
             </button>
             {user.role === 'admin' && (
               <>
                 <button 
                    onClick={() => setActiveTab('smtp')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'smtp' ? 'bg-surface-variant text-primary-light border-l-2 border-primary' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                 >
                    <span className="material-symbols-outlined text-[20px]">mail</span>
                    Notifications
                 </button>
                 <button 
                     onClick={() => setActiveTab('ai')}
                     className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'ai' ? 'bg-surface-variant text-primary-light border-l-2 border-primary' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  >
                     <span className="material-symbols-outlined text-[20px]">memory</span>
                     AI Engine
                  </button>
                  <button 
                      onClick={() => setActiveTab('mobile')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'mobile' ? 'bg-surface-variant text-primary-light border-l-2 border-primary' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                   >
                      <span className="material-symbols-outlined text-[20px]">smartphone</span>
                      Mobile App
                   </button>
                   <button 
                       onClick={() => setActiveTab('cloudflare')}
                       className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'cloudflare' ? 'bg-surface-variant text-primary-light border-l-2 border-primary' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                   >
                       <span className="material-symbols-outlined text-[20px]">cloud</span>
                       Cloudflare
                   </button>
                   <button 
                       onClick={() => setActiveTab('brand')}
                       className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'brand' ? 'bg-surface-variant text-primary-light border-l-2 border-primary' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                   >
                       <span className="material-symbols-outlined text-[20px]">palette</span>
                       Brand
                   </button>
                </>
             )}
          </nav>

          <div className="mt-10 p-6 bg-surface-variant rounded-xl border border-white/5 hidden lg:block">
             <span className="material-symbols-outlined text-warning mb-3">verified_user</span>
             <h4 className="text-sm font-bold text-white mb-2 font-manrope">Session Integrity</h4>
             <p className="text-[10px] text-slate-500 leading-relaxed uppercase tracking-wider font-inter">
                Current Role: <strong className="text-primary-light">{user.role}</strong><br/>
                Node Status: <strong className="text-secondary">Healthy</strong>
             </p>
          </div>
        </aside>

        {/* Tab Canvas */}
        <div className="flex-1 min-w-0">
          
          {/* TAB: ACCOUNT */}
          {activeTab === 'account' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
               <section className="bg-surface-variant rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                  <div className="p-8 border-b border-white/5 bg-surface/30">
                     <h3 className="text-xl font-bold text-white font-manrope">Profile Identity</h3>
                     <p className="text-slate-400 text-sm mt-1 font-inter">Updates to your email will take effect upon the next authentication cycle.</p>
                  </div>
                  <div className="p-8 space-y-8">
                     <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-primary/20">
                           {user.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                           <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">System Identifier</p>
                           <p className="text-white font-mono text-sm leading-none tabular-nums">#{user.id.toString().padStart(6,'0')}</p>
                        </div>
                     </div>
                     
                     <form onSubmit={handleUpdateEmail} className="max-w-md space-y-6">
                        <div>
                           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Current Email Address</label>
                           <input 
                              type="email" 
                              value={email} 
                              onChange={e => setEmail(e.target.value)}
                              className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-primary-light/40 outline-none transition-all font-inter"
                           />
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Current Password (Verify Identity)</label>
                           <div className="relative">
                              <input 
                                 type={showCurrentPassword ? 'text' : 'password'}
                                 value={currentPassword}
                                 onChange={e => setCurrentPassword(e.target.value)}
                                 className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-primary-light/40 outline-none transition-all font-mono"
                                 placeholder="••••••••"
                              />
                               <button 
                                 type="button" 
                                 onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                               >
                                 <span className="material-symbols-outlined text-[20px]">{showCurrentPassword ? 'visibility_off' : 'visibility'}</span>
                               </button>
                           </div>
                        </div>
                        <div className="flex items-center gap-4 pt-2">
                           <button 
                              type="submit"
                              disabled={profileBusy || email === user.email || !currentPassword}
                              className="bg-gradient-to-br from-primary-light to-primary text-on-primary font-black px-8 py-3 rounded-xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 font-manrope"
                           >
                              {profileBusy ? 'Synchronizing...' : 'Save Identity'}
                           </button>
                           {profileSuccess && <span className="text-secondary text-xs font-bold flex items-center gap-1 font-inter"><span className="material-symbols-outlined text-sm">check_circle</span> Node Updated</span>}
                        </div>
                     </form>
                  </div>
               </section>
            </div>
          )}

          {/* TAB: SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
               <section className="bg-surface-variant rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                  <div className="p-8 border-b border-white/5 bg-surface/30">
                     <h3 className="text-xl font-bold text-white font-manrope">Credential Rotation</h3>
                     <p className="text-slate-400 text-sm mt-1 font-inter">Maintain security by rotating your access credentials every 90 days.</p>
                  </div>
                  <div className="p-8">
                     <form onSubmit={handleChangePassword} className="max-w-md space-y-6">
                        <div>
                           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Current Matrix Key</label>
                           <input 
                              type="password" 
                              value={currentPassword}
                              onChange={e => setCurrentPassword(e.target.value)}
                              className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-primary-light/40 outline-none transition-all font-mono"
                           />
                        </div>
                        <div className="grid grid-cols-1 gap-6">
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">New Security Key</label>
                              <input 
                                 type="password" 
                                 value={newPassword}
                                 onChange={e => setNewPassword(e.target.value)}
                                 className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-primary-light/40 outline-none transition-all font-mono"
                              />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Confirm New Key</label>
                              <input 
                                 type="password" 
                                 value={confirmPassword}
                                 onChange={e => setConfirmPassword(e.target.value)}
                                 className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-primary-light/40 outline-none transition-all font-mono"
                              />
                           </div>
                        </div>
                        <div className="flex items-center gap-4 pt-2">
                           <button 
                              type="submit"
                              disabled={securityBusy || !currentPassword || !newPassword || !confirmPassword}
                              className="bg-surface text-white font-black px-8 py-3 rounded-xl shadow-lg border border-white/1 tracking-wide hover:bg-surface-variant transition-all disabled:opacity-50 font-manrope"
                           >
                              {securityBusy ? 'Rotating Keys...' : 'Update Matrix'}
                           </button>
                           {passwordSuccess && <span className="text-secondary text-xs font-bold flex items-center gap-1 font-inter"><span className="material-symbols-outlined text-sm">security</span> Key Rotation Success</span>}
                        </div>
                     </form>
                  </div>
               </section>
            </div>
          )}

          {/* TAB: SMTP (Notification Node) */}
          {activeTab === 'smtp' && user.role === 'admin' && emailSettings && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
               <div className="grid grid-cols-1 gap-8">
                  <section className="bg-surface-variant rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                     <div className="p-8 border-b border-white/5 bg-surface/30 flex justify-between items-center">
                        <div>
                           <h3 className="text-xl font-bold text-white font-manrope">Communication Node</h3>
                           <p className="text-slate-400 text-sm mt-1">Configure SMTP relays for automated security alerts.</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                           <input 
                              type="checkbox" 
                              checked={emailSettings.enabled} 
                              onChange={e => setEmailSettings({ ...emailSettings, enabled: e.target.checked })}
                              className="sr-only peer" 
                           />
                           <div className="w-11 h-6 bg-surface peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
                        </label>
                     </div>
                     <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">SMTP Host Address</label>
                           <input 
                              type="text" 
                              value={emailSettings.host} 
                              onChange={e => setEmailSettings({ ...emailSettings, host: e.target.value })}
                              className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:ring-1 focus:ring-primary-light/30 transition-all font-inter" 
                           />
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Server Port</label>
                           <input 
                              type="number" 
                              value={emailSettings.port} 
                              onChange={e => setEmailSettings({ ...emailSettings, port: parseInt(e.target.value) || 587 })}
                              className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:ring-1 focus:ring-primary-light/30 transition-all font-inter" 
                           />
                        </div>
                        <div className="flex gap-6 items-end pb-3">
                           <label className="flex items-center gap-3 cursor-pointer group">
                              <input type="checkbox" checked={emailSettings.use_tls} onChange={e => setEmailSettings({...emailSettings, use_tls: e.target.checked, use_ssl: false})} className="rounded bg-transparent border-white/20 text-primary w-4 h-4" />
                              <span className="text-sm text-slate-400 group-hover:text-white transition-colors">STARTTLS</span>
                           </label>
                           <label className="flex items-center gap-3 cursor-pointer group">
                              <input type="checkbox" checked={emailSettings.use_ssl} onChange={e => setEmailSettings({...emailSettings, use_ssl: e.target.checked, use_tls: false})} className="rounded bg-transparent border-white/20 text-primary w-4 h-4" />
                              <span className="text-sm text-slate-400 group-hover:text-white transition-colors">SSL</span>
                           </label>
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Auth Username</label>
                           <input 
                              type="text" 
                              value={emailSettings.user} 
                              onChange={e => setEmailSettings({ ...emailSettings, user: e.target.value })}
                              className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:ring-1 focus:ring-primary-light/30 transition-all font-inter" 
                           />
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Auth Password</label>
                           <input 
                              type="password" 
                              value={smtpPassword} 
                              onChange={e => setSmtpPassword(e.target.value)}
                              placeholder={emailSettings.password_configured ? '••••••••' : ''}
                              className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white outline-none font-mono" 
                           />
                        </div>
                        <div className="md:col-span-2 pt-4">
                           <button onClick={handleSaveSmtp} disabled={smtpBusy} className="bg-gradient-to-br from-primary-light to-primary text-on-primary font-black px-10 py-3 rounded-xl shadow-lg hover:opacity-90 transition-opacity disabled:opacity-30 font-manrope">
                              {smtpBusy ? 'Saving Config...' : 'Deploy Node Config'}
                           </button>
                        </div>
                     </div>
                  </section>

                  <section className="bg-gradient-to-r from-surface to-surface-variant rounded-xl p-8 border border-white/5 shadow-xl">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="max-w-md">
                           <h4 className="font-bold text-white flex items-center gap-2 mb-1">
                              <span className="material-symbols-outlined text-primary-light">send</span>
                              Verify Signal
                           </h4>
                           <p className="text-xs text-slate-500 font-[Inter]">Transmit a test packet to verify server handshakes and credential validity.</p>
                        </div>
                        <div className="flex-1 flex gap-3">
                           <input 
                              type="email" 
                              value={testTo} 
                              onChange={e => setTestTo(e.target.value)}
                              placeholder="admin@local.test"
                              className="flex-1 bg-surface border-white/5 rounded-lg px-4 py-2.5 text-sm font-inter outline-none" 
                           />
                           <button onClick={sendSmtpTest} disabled={testingSmtp || !emailSettings.enabled} className="bg-surface text-white text-xs font-bold px-6 py-2.5 rounded-lg border border-white/5 hover:bg-surface-variant transition-colors disabled:opacity-50 font-manrope">
                              {testingSmtp ? 'Sending...' : 'Test Signal'}
                           </button>
                        </div>
                      </div>
                  </section>
               </div>
            </div>
          )}

          {/* TAB: AI (AI Core) */}
          {activeTab === 'ai' && user.role === 'admin' && appSettings && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
               <section className="bg-surface-variant rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                  <div className="p-8 border-b border-white/5 bg-surface/30">
                     <h3 className="text-xl font-bold text-white font-manrope">Neural Core Parameters</h3>
                     <p className="text-slate-400 text-sm mt-1">Regulate the real-time object detection engine and neural overhead.</p>
                  </div>
                  <div className="p-8 space-y-8 text-center sm:text-left">
                     <div className="bg-surface p-6 rounded-xl border border-orange-500/10 flex flex-col sm:flex-row justify-between sm:items-center gap-6">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                               <span className="material-symbols-outlined text-orange-500">psychology</span>
                           </div>
                           <div className="text-left font-inter">
                              <p className="text-on-surface text-sm font-bold">Live Stream Object Analysis (YOLO)</p>
                              <p className="text-slate-500 text-[10px] uppercase tracking-tighter mt-1">High Hardware Utilization &bull; Neural Inference Engage</p>
                           </div>
                        </div>
                        {/* Custom Toggle Switch */}
                        <div className="flex justify-center">
                           <label className={`relative inline-flex items-center ${!appSettings.can_edit || aiBusy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                              <input 
                                 type="checkbox" 
                                 className="sr-only peer" 
                                 checked={appSettings.yolo_object_detection_enabled}
                                 onChange={(e) => handleYoloToggle(e.target.checked)}
                                 disabled={!appSettings.can_edit || aiBusy}
                              />
                              <div className="w-14 h-7 bg-surface-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-success shadow-inner"></div>
                           </label>
                        </div>
                     </div>
                     
                      <div className="bg-surface-variant p-6 rounded-xl border border-white/5 max-w-lg">
                         <h4 className="text-primary-light text-xs font-bold mb-3 flex items-center gap-2 font-manrope">
                            <span className="material-symbols-outlined text-sm">info</span> Runtime Topology
                         </h4>
                         <p className="text-xs text-slate-400 leading-relaxed font-inter">
                            Enabling live object detection will inject inference scripts into every active camera stream. 
                            This will increase CPU/GPU load significantly. Use for forensic monitoring only.
                         </p>
                      </div>
                   </div>
                </section>

                {/* Face Detection Toggle */}
                <section className="bg-surface-variant rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                   <div className="p-8 border-b border-white/5 bg-surface/30">
                      <h3 className="text-xl font-bold text-white font-manrope">Face Detection</h3>
                      <p className="text-slate-400 text-sm mt-1">Enable or disable face detection and recognition on live streams.</p>
                   </div>
                   <div className="p-8 space-y-8 text-center sm:text-left">
                      <div className="bg-surface p-6 rounded-xl border border-green-500/10 flex flex-col sm:flex-row justify-between sm:items-center gap-6">
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-green-500">face</span>
                            </div>
                            <div className="text-left font-inter">
                               <p className="text-on-surface text-sm font-bold">Face Detection & Recognition</p>
                               <p className="text-slate-500 text-[10px] uppercase tracking-tighter mt-1">InsightFace AI Engine &bull; Real-time Recognition</p>
                            </div>
                         </div>
                         <div className="flex justify-center">
                            <label className={`relative inline-flex items-center ${!appSettings.can_edit || aiBusy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                               <input 
                                  type="checkbox" 
                                  className="sr-only peer" 
                                  checked={appSettings.face_detection_enabled}
                                  onChange={(e) => handleFaceToggle(e.target.checked)}
                                  disabled={!appSettings.can_edit || aiBusy}
                               />
                               <div className="w-14 h-7 bg-surface-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-success shadow-inner"></div>
                            </label>
                         </div>
                      </div>
                      
                      <div className="bg-surface-variant p-6 rounded-xl border border-white/5 max-w-lg">
                         <h4 className="text-primary-light text-xs font-bold mb-3 flex items-center gap-2 font-manrope">
                            <span className="material-symbols-outlined text-sm">info</span> How It Works
                         </h4>
                         <p className="text-xs text-slate-400 leading-relaxed font-inter">
                            When enabled, faces detected in live streams will show green boxes (recognized users) or red boxes (unknown). 
                            Recognition requires users to have face embeddings enrolled in the system.
                         </p>
                      </div>
                   </div>
                </section>

                {/* Person Detection Toggle */}
                <section className="bg-surface-variant rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                   <div className="p-8 border-b border-white/5 bg-surface/30">
                      <h3 className="text-xl font-bold text-white font-manrope">Person Detection (HOG)</h3>
                      <p className="text-slate-400 text-sm mt-1">Enable or disable person detection using HOG (Histogram of Oriented Gradients).</p>
                   </div>
                   <div className="p-8 space-y-8 text-center sm:text-left">
                      <div className="bg-surface p-6 rounded-xl border border-blue-500/10 flex flex-col sm:flex-row justify-between sm:items-center gap-6">
                         <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-blue-500">person_search</span>
                            </div>
                            <div className="text-left font-inter">
                               <p className="text-on-surface text-sm font-bold">Person Detection (HOG)</p>
                               <p className="text-slate-500 text-[10px] uppercase tracking-tighter mt-1">OpenCV HOG &bull; Body Detection</p>
                            </div>
                         </div>
                         <div className="flex justify-center">
                            <label className={`relative inline-flex items-center ${!appSettings.can_edit || aiBusy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                               <input 
                                  type="checkbox" 
                                  className="sr-only peer" 
                                  checked={appSettings.person_detection_enabled}
                                  onChange={(e) => handlePersonToggle(e.target.checked)}
                                  disabled={!appSettings.can_edit || aiBusy}
                               />
                               <div className="w-14 h-7 bg-surface-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-success shadow-inner"></div>
                            </label>
                         </div>
                      </div>
                      
                      <div className="bg-surface-variant p-6 rounded-xl border border-white/5 max-w-lg">
                         <h4 className="text-primary-light text-xs font-bold mb-3 flex items-center gap-2 font-manrope">
                            <span className="material-symbols-outlined text-sm">info</span> How It Works
                         </h4>
                         <p className="text-xs text-slate-400 leading-relaxed font-inter">
                            HOG (Histogram of Oriented Gradients) is a computer vision method for detecting human bodies in images. 
                            When enabled, detected persons will be shown with orange boxes on live streams.
                         </p>
                      </div>
                   </div>
                </section>
              </div>
          )}

          {/* TAB: Mobile App */}
          {activeTab === 'mobile' && user.role === 'admin' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
               <section className="bg-surface-variant rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                  <div className="p-8 border-b border-white/5 bg-surface/30">
                     <h3 className="text-xl font-bold text-white font-manrope">Mobile Application</h3>
                     <p className="text-slate-400 text-sm mt-1">Upload mobile app files directly or enter download URLs. Files appear on the login page.</p>
                  </div>
                   <div className="p-8 space-y-6">
                      <div>
                         <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">App Version</label>
                         <input
                           type="text"
                           value={mobileVersion}
                           onChange={(e) => setMobileVersion(e.target.value)}
                           placeholder="e.g., 1.0.0"
                           className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none"
                         />
                      </div>

                      {/* Public API URL */}
                      <div>
                         <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Public API URL</label>
                         <input
                           type="text"
                           value={publicApiUrl}
                           onChange={(e) => setPublicApiUrl(e.target.value)}
                           placeholder="e.g., https://xxx.ngrok-free.dev"
                           className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none"
                         />
                         <p className="text-xs text-slate-500 mt-2">
                           For mobile app remote access. Set this to your ngrok/tunnel URL when not on same network.
                         </p>
                      </div>
                     
                     {/* Android Upload */}
                     <div className="bg-surface p-6 rounded-xl border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                           <div>
                              <h4 className="text-white font-bold">Android (APK)</h4>
                              {mobileAndroidUrl && (
                                <p className="text-xs text-secondary mt-1">Uploaded ✓</p>
                              )}
                           </div>
                           {mobileAndroidUrl && (
                             <button
                               onClick={async () => {
                                 try {
                                   await api(`/api/v1/mobile-app/files?platform=android`, { method: 'DELETE' });
                                   setMobileAndroidUrl('');
                                   toast.success('Android app removed');
                                 } catch (e) {
                                   toast.error('Failed to remove');
                                 }
                               }}
                               className="text-xs text-error hover:underline"
                             >
                               Remove
                             </button>
                           )}
                        </div>
                        <label className="flex items-center justify-center gap-3 px-6 py-4 border-2 border-dashed border-slate-600 hover:border-primary rounded-lg cursor-pointer transition-colors">
                           <input
                             type="file"
                             accept=".apk"
                             className="hidden"
                             onChange={async (e) => {
                               const file = e.target.files?.[0];
                               if (!file) return;
                               setMobileBusy(true);
                               try {
                                 const formData = new FormData();
                                 formData.append('file', file);
                                 const res = await fetch(`${window.location.origin}/api/v1/mobile-app/upload/android`, {
                                   method: 'POST',
                                   headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                                   body: formData,
                                 });
                                 const data = await res.json();
                                 setMobileAndroidUrl(data.download_url);
                                 toast.success('Android app uploaded!');
                               } catch (err) {
                                 toast.error('Upload failed');
                               } finally {
                                 setMobileBusy(false);
                               }
                             }}
                           />
                           <span className="material-symbols-outlined text-primary">cloud_upload</span>
                           <span className="text-slate-400">{mobileBusy ? 'Uploading...' : 'Click to upload APK'}</span>
                        </label>
                        <p className="text-xs text-slate-500 mt-2">Or enter URL:</p>
                        <input
                          type="url"
                          value={mobileAndroidUrl}
                          onChange={(e) => setMobileAndroidUrl(e.target.value)}
                          placeholder="https://your-cdn.com/app.apk"
                          className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none mt-2"
                        />
                     </div>

                     {/* iOS Upload */}
                     <div className="bg-surface p-6 rounded-xl border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                           <div>
                              <h4 className="text-white font-bold">iOS (IPA)</h4>
                              {mobileIosUrl && (
                                <p className="text-xs text-secondary mt-1">Uploaded ✓</p>
                              )}
                           </div>
                           {mobileIosUrl && (
                             <button
                               onClick={async () => {
                                 try {
                                   await api(`/api/v1/mobile-app/files?platform=ios`, { method: 'DELETE' });
                                   setMobileIosUrl('');
                                   toast.success('iOS app removed');
                                 } catch (e) {
                                   toast.error('Failed to remove');
                                 }
                               }}
                               className="text-xs text-error hover:underline"
                             >
                               Remove
                             </button>
                           )}
                        </div>
                        <label className="flex items-center justify-center gap-3 px-6 py-4 border-2 border-dashed border-slate-600 hover:border-primary rounded-lg cursor-pointer transition-colors">
                           <input
                             type="file"
                             accept=".ipa"
                             className="hidden"
                             onChange={async (e) => {
                               const file = e.target.files?.[0];
                               if (!file) return;
                               setMobileBusy(true);
                               try {
                                 const formData = new FormData();
                                 formData.append('file', file);
                                 const res = await fetch(`${window.location.origin}/api/v1/mobile-app/upload/ios`, {
                                   method: 'POST',
                                   headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                                   body: formData,
                                 });
                                 const data = await res.json();
                                 setMobileIosUrl(data.download_url);
                                 toast.success('iOS app uploaded!');
                               } catch (err) {
                                 toast.error('Upload failed');
                               } finally {
                                 setMobileBusy(false);
                               }
                             }}
                           />
                           <span className="material-symbols-outlined text-primary">cloud_upload</span>
                           <span className="text-slate-400">{mobileBusy ? 'Uploading...' : 'Click to upload IPA'}</span>
                        </label>
                        <p className="text-xs text-slate-500 mt-2">Or enter URL:</p>
                        <input
                          type="url"
                          value={mobileIosUrl}
                          onChange={(e) => setMobileIosUrl(e.target.value)}
                          placeholder="https://your-cdn.com/app.ipa"
                          className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none mt-2"
                        />
                     </div>

                     <button
                       onClick={handleSaveMobileSettings}
                       disabled={mobileBusy}
                       className="px-6 py-3 bg-gradient-to-r from-primary-light to-primary text-white font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {mobileBusy ? 'Saving...' : 'Save Settings'}
                      </button>
                   </div>
                </section>
             </div>
          )}

          {/* TAB: Cloudflare */}
          {activeTab === 'cloudflare' && user.role === 'admin' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
               <section className="bg-surface-variant rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                  <div className="p-8 border-b border-white/5 bg-surface/30">
                     <div className="flex items-center justify-between">
                        <div>
                           <h3 className="text-xl font-bold text-white font-manrope">Cloudflare</h3>
                           <p className="text-slate-400 text-sm mt-1">Configure Cloudflare for CDN, SSL, and R2 storage.</p>
                        </div>
                        <div className={`px-4 py-2 rounded-full text-xs font-bold ${cfSslStatus === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                           SSL: {cfSslStatus}
                        </div>
                     </div>
                  </div>
                  <div className="p-8 space-y-6">
                     {/* Enable Toggle */}
                     <div className="flex items-center justify-between bg-surface p-4 rounded-xl border border-white/5">
                        <div>
                           <h4 className="text-white font-bold">Enable Cloudflare</h4>
                           <p className="text-xs text-slate-400">Use Cloudflare CDN and R2 storage</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" checked={cfEnabled} onChange={(e) => setCfEnabled(e.target.checked)} className="sr-only peer" />
                           <div className="w-14 h-7 bg-surface-variant rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                     </div>

                     {/* Domain */}
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Your Domain</label>
                        <input type="text" value={cfDomain} onChange={(e) => setCfDomain(e.target.value)} placeholder="visioryx.com" className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none" />
                     </div>

                     {/* API Credentials */}
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cloudflare API Token</label>
                           <input type="password" value={cfApiToken} onChange={(e) => setCfApiToken(e.target.value)} placeholder="Enter API token" className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none" />
                           <p className="text-xs text-slate-500 mt-1">Get from Cloudflare Dashboard → Profile → API Tokens</p>
                        </div>
                        <div>
                           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Zone ID</label>
                           <input type="password" value={cfZoneId} onChange={(e) => setCfZoneId(e.target.value)} placeholder="Enter Zone ID" className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none" />
                           <p className="text-xs text-slate-500 mt-1">Get from Domain → Overview</p>
                        </div>
                     </div>

                     {/* R2 Storage */}
                     <div className="bg-surface p-6 rounded-xl border border-orange-500/20">
                        <h4 className="text-orange-400 font-bold mb-4 flex items-center gap-2">
                           <span className="material-symbols-outlined">cloud</span> R2 Storage (Optional)
                        </h4>
                        <p className="text-xs text-slate-400 mb-4">Upload mobile apps directly to Cloudflare R2 instead of local storage.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">R2 Bucket Name</label>
                              <input type="text" value={cfR2Bucket} onChange={(e) => setCfR2Bucket(e.target.value)} placeholder="visioryx-apps" className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">R2 Public URL</label>
                              <input type="url" value={cfR2PublicUrl} onChange={(e) => setCfR2PublicUrl(e.target.value)} placeholder="https://pub-xxx.r2.dev" className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">R2 Access Key</label>
                              <input type="text" value={cfR2AccessKey} onChange={(e) => setCfR2AccessKey(e.target.value)} placeholder="Access Key ID" className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">R2 Secret Key</label>
                              <input type="password" value={cfR2SecretKey} onChange={(e) => setCfR2SecretKey(e.target.value)} placeholder="Secret Access Key" className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none" />
                           </div>
                        </div>
                     </div>

                     {/* SSL Button */}
                     <div className="flex gap-4">
                        <button onClick={handleSaveCloudflare} disabled={cfBusy} className="px-6 py-3 bg-gradient-to-r from-primary-light to-primary text-white font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
                           {cfBusy ? 'Saving...' : 'Save Cloudflare Settings'}
                        </button>
                        <button onClick={handleEnableSSL} disabled={cfBusy || !cfApiToken} className="px-6 py-3 bg-orange-500/20 text-orange-400 font-bold rounded-lg hover:bg-orange-500/30 transition-colors disabled:opacity-50">
                           Enable SSL
                        </button>
                      </div>
                   </div>
                </section>
             </div>
          )}

          {/* TAB: Brand */}
          {activeTab === 'brand' && user.role === 'admin' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
               <section className="bg-surface-variant rounded-xl border border-white/5 overflow-hidden shadow-2xl">
                  <div className="p-8 border-b border-white/5 bg-surface/30">
                     <h3 className="text-xl font-bold text-white font-manrope">Brand Settings</h3>
                     <p className="text-slate-400 text-sm mt-1">Customize your company branding. Logo and favicon appear on login and dashboard.</p>
                  </div>
                  <div className="p-8 space-y-6">
                     {/* Company Name */}
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Company Name</label>
                        <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Visioryx" className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none" />
                     </div>

                     {/* Logo Upload */}
                     <div className="bg-surface p-6 rounded-xl border border-white/5">
                        <h4 className="text-white font-bold mb-4">Company Logo</h4>
                        {companyLogo && (
                          <div className="mb-4">
                            <img src={companyLogo} alt="Logo" className="h-16 object-contain" />
                            <button onClick={() => setCompanyLogo('')} className="text-xs text-error mt-2">Remove</button>
                          </div>
                        )}
                        <label className="flex items-center justify-center gap-3 px-6 py-4 border-2 border-dashed border-slate-600 hover:border-primary rounded-lg cursor-pointer transition-colors">
                           <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadLogo(f); }} />
                           <span className="material-symbols-outlined text-primary">cloud_upload</span>
                           <span className="text-slate-400">{brandBusy ? 'Uploading...' : 'Click to upload logo'}</span>
                        </label>
                        <p className="text-xs text-slate-500 mt-2">Recommended: PNG, SVG (transparent background)</p>
                     </div>

                     {/* Favicon Upload */}
                     <div className="bg-surface p-6 rounded-xl border border-white/5">
                        <h4 className="text-white font-bold mb-4">Favicon</h4>
                        {favicon && (
                          <div className="mb-4 flex items-center gap-2">
                            <img src={favicon} alt="Favicon" className="w-8 h-8 object-contain" />
                            <button onClick={() => setFavicon('')} className="text-xs text-error">Remove</button>
                          </div>
                        )}
                        <label className="flex items-center justify-center gap-3 px-6 py-4 border-2 border-dashed border-slate-600 hover:border-primary rounded-lg cursor-pointer transition-colors">
                           <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFavicon(f); }} />
                           <span className="material-symbols-outlined text-primary">cloud_upload</span>
                           <span className="text-slate-400">{brandBusy ? 'Uploading...' : 'Click to upload favicon'}</span>
                        </label>
                        <p className="text-xs text-slate-500 mt-2">Recommended: 32x32 PNG or ICO</p>
                     </div>

                     {/* Copyright */}
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Copyright Text</label>
                        <input type="text" value={copyrightText} onChange={(e) => setCopyrightText(e.target.value)} placeholder="© 2024 Visioryx. All rights reserved." className="w-full bg-surface border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-primary/40 outline-none" />
                     </div>

                     <button onClick={handleSaveBrand} disabled={brandBusy} className="px-6 py-3 bg-gradient-to-r from-primary-light to-primary text-white font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
                       {brandBusy ? 'Saving...' : 'Save Brand Settings'}
                     </button>
                  </div>
               </section>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
