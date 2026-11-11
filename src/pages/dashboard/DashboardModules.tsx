import React, { useState, useEffect } from 'react';
import { useRouter } from '../../context/RouterContext';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { LabelItem, ArtistProfile, SupportTicket, SmartLink, SmartLinkStores, Release, OtherRequest, TransactionItem } from '../../types';
import { PRICING_PLANS } from '../../data/pricingData';
import { apiUrl } from '../../utils/api';
import {
  Tag,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileText,
  Download,
  Wallet,
  Users,
  LifeBuoy,
  CreditCard,
  Receipt,
  MoreHorizontal,
  Youtube,
  Mic2,
  Share2,
  FileEdit,
  Send,
  Copy,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Calendar,
  Clock,
  Sparkles,
  RefreshCw,
  Power,
  Edit3,
  History,
  UserCheck,
  Search,
  Lock,
  X,
  Music,
  Play,
  Pause,
  Trash2,
  Globe,
  Radio,
  Eye,
  Check,
  Smartphone,
  Link as LinkIcon,
  Link2,
  Sliders,
  Info,
  CheckCheck
} from 'lucide-react';

// ======================== 1. MY LABELS PAGE ========================
export const MyLabelsPage: React.FC = () => {
  const { token } = useAuth();
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [newLabelName, setNewLabelName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/dashboard/data'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setLabels(data.labels || []));
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabelName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/dashboard/labels'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newLabelName })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLabels(prev => [data.label, ...prev]);
        setNewLabelName('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="My Labels">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white font-display">My Record Labels</h1>
            <p className="text-xs text-slate-400">Manage approved record label entities, custom label codes, and catalog allocations</p>
          </div>
        </div>

        {/* Create Label Input */}
        <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800">
          <form onSubmit={handleCreate} className="flex gap-3">
            <input
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="Enter new label name (e.g. Rudra Sounds Records)..."
              className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={loading || !newLabelName.trim()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Register Label</span>
            </button>
          </form>
        </div>

        {/* Labels List */}
        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800">
          {labels.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">No labels registered yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="pb-3">Label Name</th>
                    <th className="pb-3">Label Code</th>
                    <th className="pb-3">Approval Status</th>
                    <th className="pb-3">Linked Catalog</th>
                    <th className="pb-3">Date Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {labels.map((l) => (
                    <tr key={l.id}>
                      <td className="py-3 font-semibold text-white">{l.name}</td>
                      <td className="py-3 font-mono text-[11px] text-blue-400">{l.code}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          l.status === 'Approved' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-[11px]">{l.catalogCount} Releases</td>
                      <td className="py-3 font-mono text-[11px] text-slate-400">{l.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 2. PROFILE PAGE ========================
export const ProfilePage: React.FC = () => {
  const { user, token } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [country, setCountry] = useState(user?.country || '');
  const [saved, setSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileCompletion, setProfileCompletion] = useState(0);

  // KYC State
  const [kycStatus, setKycStatus] = useState<string>('Not Submitted');
  const [kycReason, setKycReason] = useState<string>('');
  const [servicesUnlocked, setServicesUnlocked] = useState(false);
  const [fullLegalName, setFullLegalName] = useState(user?.fullName || '');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [aadhaarLast4, setAadhaarLast4] = useState('');
  const [panNumber, setPanNumber] = useState('');

  const [aadhaarFrontFileId, setAadhaarFrontFileId] = useState('');
  const [aadhaarFrontUrl, setAadhaarFrontUrl] = useState('');
  const [aadhaarBackFileId, setAadhaarBackFileId] = useState('');
  const [aadhaarBackUrl, setAadhaarBackUrl] = useState('');
  const [panCardFileId, setPanCardFileId] = useState('');
  const [panCardUrl, setPanCardUrl] = useState('');
  const [profilePhotoFileId, setProfilePhotoFileId] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycMessage, setKycMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/profile'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.profile) {
          setFullName(data.profile.fullName || '');
          setCountry(data.profile.country || '');
          setProfileCompletion(data.profile.profileCompletion || 0);
          const k = data.profile.kyc;
          if (k) {
            setKycStatus(k.status || 'Not Submitted');
            setKycReason(k.rejectionReason || '');
            setServicesUnlocked(Boolean(k.servicesUnlocked));
            if (k.fullLegalName) setFullLegalName(k.fullLegalName);
            if (k.dateOfBirth) setDateOfBirth(k.dateOfBirth);
            if (k.address) setAddress(k.address);
            if (k.mobileNumber) setMobileNumber(k.mobileNumber);
            if (k.aadhaarNumberLast4) setAadhaarLast4(k.aadhaarNumberLast4);
            if (k.panNumber) setPanNumber(k.panNumber);
            if (k.aadhaarFrontFileId) setAadhaarFrontFileId(k.aadhaarFrontFileId);
            if (k.aadhaarFrontUrl) setAadhaarFrontUrl(k.aadhaarFrontUrl);
            if (k.aadhaarBackFileId) setAadhaarBackFileId(k.aadhaarBackFileId);
            if (k.aadhaarBackUrl) setAadhaarBackUrl(k.aadhaarBackUrl);
            if (k.panCardFileId) setPanCardFileId(k.panCardFileId);
            if (k.panCardUrl) setPanCardUrl(k.panCardUrl);
            if (k.profilePhotoFileId) setProfilePhotoFileId(k.profilePhotoFileId);
            if (k.profilePhotoUrl) setProfilePhotoUrl(k.profilePhotoUrl);
          }
        }
      })
      .catch(() => {});
  }, [token]);

  const handleSaveProfile = async () => {
    if (!token) return;
    setSavingProfile(true);
    setSaved(false);
    try {
      const res = await fetch(apiUrl('/api/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fullName, country })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaved(true);
        if (typeof data.profileCompletion === 'number') setProfileCompletion(data.profileCompletion);
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDocUpload = async (docType: 'aadhaarFront' | 'aadhaarBack' | 'panCard' | 'profilePhoto', file: File) => {
    if (!token) return;
    setUploadingDoc(docType);
    setKycMessage(null);
    try {
      const formData = new FormData();
      formData.append('docType', docType);
      formData.append('file', file);
      const res = await fetch(apiUrl('/api/profile/kyc/upload'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setKycMessage({ type: 'err', text: data.error || 'Document upload failed.' });
        return;
      }
      if (docType === 'aadhaarFront') {
        setAadhaarFrontFileId(data.fileId);
        setAadhaarFrontUrl(data.fileUrl);
      } else if (docType === 'aadhaarBack') {
        setAadhaarBackFileId(data.fileId);
        setAadhaarBackUrl(data.fileUrl);
      } else if (docType === 'panCard') {
        setPanCardFileId(data.fileId);
        setPanCardUrl(data.fileUrl);
      } else if (docType === 'profilePhoto') {
        setProfilePhotoFileId(data.fileId);
        setProfilePhotoUrl(data.fileUrl);
      }
      setKycMessage({ type: 'ok', text: `${file.name} uploaded securely to private storage.` });
    } catch {
      setKycMessage({ type: 'err', text: 'Network error uploading document.' });
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setKycSubmitting(true);
    setKycMessage(null);
    try {
      const res = await fetch(apiUrl('/api/profile/kyc'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fullLegalName,
          dateOfBirth,
          address,
          mobileNumber,
          aadhaarNumberLast4: aadhaarLast4,
          panNumber,
          aadhaarFrontFileId,
          aadhaarFrontUrl,
          aadhaarBackFileId,
          aadhaarBackUrl,
          panCardFileId,
          panCardUrl,
          profilePhotoFileId,
          profilePhotoUrl
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setKycMessage({ type: 'err', text: data.error || 'KYC submission failed.' });
        return;
      }
      setKycStatus(data.kyc.status);
      setKycReason('');
      setServicesUnlocked(Boolean(data.kyc.servicesUnlocked));
      if (typeof data.profileCompletion === 'number') setProfileCompletion(data.profileCompletion);
      setKycMessage({ type: 'ok', text: 'KYC documents submitted securely. Our compliance team will review them shortly.' });
    } catch {
      setKycMessage({ type: 'err', text: 'Network error submitting KYC.' });
    } finally {
      setKycSubmitting(false);
    }
  };

  return (
    <DashboardLayout title="Profile & KYC">
      <div className="max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Artist Account Profile & KYC</h1>
            <p className="text-xs text-slate-400">Manage legal identification, country, and identity verification documents</p>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            Completion: <span className="text-amber-400 font-semibold">{profileCompletion}%</span>
          </div>
        </div>

        {/* Basic Account Details */}
        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
          <h2 className="text-sm font-semibold text-white">Account Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Display Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Account Email</label>
              <input
                type="email"
                readOnly
                value={user?.email || ''}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Country</label>
              <input
                type="text"
                value={country}
                onChange={e => setCountry(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Account Role</label>
              <input
                type="text"
                readOnly
                value={user?.role || ''}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-blue-400 font-mono capitalize"
              />
            </div>
          </div>

          {saved && (
            <div className="p-3 text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/40 rounded-lg">
              Profile details updated and saved.
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold"
            >
              {savingProfile ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </div>

        {/* KYC Verification Section */}
        <form onSubmit={handleSubmitKyc} className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">KYC Identity Verification</h2>
              <p className="text-xs text-slate-400">Encrypted & stored privately for royalty payouts and distribution compliance</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wide ${
                  kycStatus === 'Approved'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : kycStatus === 'Pending'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : kycStatus === 'Rejected' || kycStatus === 'Reupload Required'
                        ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                        : 'bg-slate-800 text-slate-300'
                }`}
              >
                {kycStatus}
              </span>
              {servicesUnlocked && (
                <span className="px-2 py-1 rounded text-[11px] bg-emerald-900/40 text-emerald-300 border border-emerald-700/40">
                  Services Unlocked
                </span>
              )}
            </div>
          </div>

          {kycReason && (
            <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/50 text-xs text-red-200">
              <span className="font-semibold">Admin Review Note:</span> {kycReason}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Full Legal Name *</label>
              <input
                type="text"
                required
                value={fullLegalName}
                onChange={e => setFullLegalName(e.target.value)}
                placeholder="As printed on Aadhaar / PAN"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Date of Birth *</label>
              <input
                type="date"
                required
                value={dateOfBirth}
                onChange={e => setDateOfBirth(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Mobile Number *</label>
              <input
                type="tel"
                required
                value={mobileNumber}
                onChange={e => setMobileNumber(e.target.value)}
                placeholder="+91 98XXXXXXXX"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">PAN Number</label>
              <input
                type="text"
                value={panNumber}
                onChange={e => setPanNumber(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                maxLength={10}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono uppercase"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">Residential / Registered Address *</label>
              <input
                type="text"
                required
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Full street address, city, state, PIN code"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Aadhaar Last 4 Digits</label>
              <input
                type="text"
                value={aadhaarLast4}
                onChange={e => setAadhaarLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="1234"
                maxLength={4}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {[
              { key: 'aadhaarFront' as const, label: 'Aadhaar Front', fileId: aadhaarFrontFileId },
              { key: 'aadhaarBack' as const, label: 'Aadhaar Back', fileId: aadhaarBackFileId },
              { key: 'panCard' as const, label: 'PAN Card', fileId: panCardFileId },
              { key: 'profilePhoto' as const, label: 'Profile Photograph', fileId: profilePhotoFileId }
            ].map(doc => (
              <div key={doc.key} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-200">{doc.label}</span>
                  {doc.fileId ? (
                    <span className="text-[11px] text-emerald-400 font-mono">Uploaded</span>
                  ) : (
                    <span className="text-[11px] text-slate-500">Required</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleDocUpload(doc.key, f);
                  }}
                  className="block w-full text-[11px] text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700"
                />
                {uploadingDoc === doc.key && <p className="text-[11px] text-amber-400">Uploading securely...</p>}
              </div>
            ))}
          </div>

          {kycMessage && (
            <div
              className={`p-3 rounded-lg text-xs border ${
                kycMessage.type === 'ok'
                  ? 'bg-emerald-950/60 border-emerald-800/40 text-emerald-300'
                  : 'bg-red-950/60 border-red-800/40 text-red-300'
              }`}
            >
              {kycMessage.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={kycSubmitting}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg text-xs font-bold"
            >
              {kycSubmitting ? 'Submitting KYC...' : kycStatus === 'Pending' ? 'Update KYC Submission' : 'Submit KYC for Verification'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

// ======================== 3. REPORTS & ROYALTIES ========================
export const ReportsPage: React.FC = () => {
  const { token } = useAuth();
  const { navigate } = useRouter();
  const [statements, setStatements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/dashboard/data'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => {
        setStatements(d.monthlyRoyalties || []);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleDownload = (month?: string) => {
    const url = apiUrl(
      month
        ? `/api/dashboard/royalties/export?month=${encodeURIComponent(month)}`
        : '/api/dashboard/royalties/export'
    );
    window.location.href = url;
  };

  return (
    <DashboardLayout title="Reports">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white font-display">Royalty Statements & Stream Reports</h1>
            <p className="text-xs text-slate-400">Quarterly reconciliation feeds processed directly from digital service providers</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard/financial')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-blue-400 hover:text-blue-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span>View Visual Recharts Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDownload()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export All Statements (.CSV)</span>
            </button>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">Accounting Cycles:</span>
              <span className="px-3 py-1 bg-slate-900 border border-slate-800 rounded font-mono text-white font-semibold">
                2025 – 2026 Live Feeds
              </span>
            </div>
            <span className="text-slate-400 font-mono text-[11px]">
              {statements.length} verified monthly periods
            </span>
          </div>

          {statements.length === 0 ? (
            <div className="py-16 text-center bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
              <FileText className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">No finalized royalty statements yet</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Partner platforms report streaming calculations on a 60-to-90 day reconciliation lag. Statements will populate here once verified by our accounting desk.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="pb-3">Statement Ref</th>
                    <th className="pb-3">Period</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Verified Plays</th>
                    <th className="pb-3">Gross (₹)</th>
                    <th className="pb-3">Net Artist (₹)</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {statements.map((s) => (
                    <tr key={s.statementId} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 font-mono text-[11px] text-blue-400 font-semibold">{s.statementId}</td>
                      <td className="py-3 font-medium text-white">{s.monthLabel}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          s.status === 'Cleared' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80' : 'bg-amber-950 text-amber-400 border border-amber-800/80'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-[11px]">{s.streams.toLocaleString('en-IN')}</td>
                      <td className="py-3 font-mono text-slate-300">₹{s.grossRoyalty.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 font-mono font-bold text-emerald-400">₹{s.netRoyalty.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDownload(s.month)}
                          className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-blue-400 hover:text-blue-300 border border-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>CSV</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 4. FINANCIAL & WALLET ========================
export { FinancialPage } from './FinancialPage';

// ======================== 5. USER MANAGEMENT ========================
export const UserManagementPage: React.FC = () => {
  const { token } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Viewer');

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/dashboard/data'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => setMembers(d.teamMembers || []));
  }, [token]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName || !inviteEmail) return;

    const res = await fetch(apiUrl('/api/dashboard/users'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: inviteName, email: inviteEmail, role: inviteRole })
    });
    const d = await res.json();
    if (d.success) {
      setMembers(prev => [...prev, d.member]);
      setInviteName('');
      setInviteEmail('');
    }
  };

  return (
    <DashboardLayout title="User Management">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Workspace Team & Roles</h1>
          <p className="text-xs text-slate-400">Invite label managers, collaborators, or accountants with scoped role permissions</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800">
          <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="Team Member Name"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
            />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="member@domain.com"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
            >
              <option value="Label Manager">Label Manager</option>
              <option value="Artist">Artist Collaborator</option>
              <option value="Viewer">Viewer / Accountant</option>
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
            >
              Invite Member
            </button>
          </form>
        </div>

        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="pb-3">Name</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Workspace Role</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 font-semibold text-white">{m.name}</td>
                  <td className="py-3 font-mono text-slate-400">{m.email}</td>
                  <td className="py-3">{m.role}</td>
                  <td className="py-3 text-emerald-400 font-mono text-[11px]">{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 6. SUPPORT TICKETING ========================
export const SupportPage: React.FC = () => {
  const { token } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Metadata Inquiry');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/dashboard/data'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => setTickets(d.tickets || []));
  }, [token]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) return;
    const res = await fetch(apiUrl('/api/dashboard/support'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject, category, message, priority: 'Medium' })
    });
    const d = await res.json();
    if (d.success) {
      setTickets(prev => [d.ticket, ...prev]);
      setSubject('');
      setMessage('');
    }
  };

  return (
    <DashboardLayout title="Support Desk">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Artist Support Desk</h1>
          <p className="text-xs text-slate-400">Open priority tickets with Rudraatma Music operations desk. Response within 24–48 hours.</p>
        </div>

        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white font-display">Create Support Ticket</h2>
          <form onSubmit={handleCreateTicket} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ticket Subject..."
                className="px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              >
                <option value="Metadata Inquiry">Metadata Inquiry</option>
                <option value="Audio / Artwork QC">Audio / Artwork QC</option>
                <option value="Payout Assistance">Payout Assistance</option>
                <option value="Takedown Assistance">Takedown Assistance</option>
              </select>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Describe your inquiry with relevant release titles..."
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
            >
              Submit Ticket
            </button>
          </form>
        </div>

        {/* Existing tickets */}
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-blue-400 mr-2">{t.id}</span>
                  <span className="font-bold text-white text-sm">{t.subject}</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400">
                  {t.status}
                </span>
              </div>
              <div className="space-y-2 text-xs bg-slate-950/60 p-3 rounded-lg">
                {t.messages.map((m, i) => (
                  <div key={i} className="text-slate-300">
                    <strong className="text-white">{m.sender}:</strong> {m.text}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 7. SUBSCRIPTION MANAGEMENT ========================
export const SubscriptionPlanPage: React.FC = () => {
  const { navigate } = useRouter();
  const { token, selectedPlanId } = useAuth();
  const [activePlanId, setActivePlanId] = useState('growth-monthly');
  const [subscription, setSubscription] = useState<any>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);

  const fetchSubscriptionData = () => {
    if (!token) return;
    fetch(apiUrl('/api/dashboard/data'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => {
        if (d.planId) setActivePlanId(d.planId);
        if (d.subscription) setSubscription(d.subscription);
      });
  };

  useEffect(() => {
    fetchSubscriptionData();
  }, [token]);

  const handleCancelAutoRenew = async () => {
    if (!confirm('Are you sure you want to cancel automatic renewal? Your benefits will remain active until the end of your current cycle.')) return;
    setCancelLoading(true);
    try {
      const res = await fetch(apiUrl('/api/razorpay/cancel-subscription'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCancelMessage(data.message);
        fetchSubscriptionData();
      }
    } finally {
      setCancelLoading(false);
    }
  };

  const currentPlan = PRICING_PLANS.find(p => p.id === activePlanId) || PRICING_PLANS[0];
  const featuresList = subscription?.features && subscription.features.length > 0
    ? subscription.features
    : currentPlan.features;

  const isPlanActive = subscription?.status === 'active';
  const isPlanExpired = subscription?.status === 'expired';
  const isPlanPending = subscription?.status === 'pending';
  const isPlanRevoked = subscription?.status === 'revoked';

  return (
    <DashboardLayout title="Subscription Plan">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">My Plan / Subscription</h1>
          <p className="text-xs text-slate-400">Manage your digital music distribution entitlement, billing cycles, and platform allowances</p>
        </div>

        {/* PRIMARY CARD: MY PLAN / SUBSCRIPTION DETAILS */}
        <div className="p-7 rounded-3xl bg-[#090e1a] border border-blue-500/30 shadow-2xl relative overflow-hidden">
          {/* Subtle Glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 blur-3xl pointer-events-none rounded-full" />

          {/* Header Row: Plan Name, Status, and Renew/Upgrade */}
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-slate-800">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                {/* 3. Plan Status Badge */}
                {isPlanActive ? (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 shadow-sm shadow-emerald-950">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Active Subscription</span>
                  </span>
                ) : isPlanExpired ? (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-400 border border-rose-500/50">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Expired</span>
                  </span>
                ) : isPlanRevoked ? (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-400 border border-rose-500/50">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Revoked by Admin</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-500/50">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Pending Verification</span>
                  </span>
                )}

                {/* 4. Payment Status Badge */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-slate-900 border border-slate-700/80 text-cyan-300">
                  <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Payment: {subscription?.paymentStatus || 'Verified & Paid'}</span>
                </span>
              </div>

              {/* 1. Current Plan Name */}
              <h2 className="text-3xl font-bold text-white font-display pt-1">
                {subscription?.planName || currentPlan.name}
              </h2>

              <p className="text-xs text-slate-300 max-w-xl">
                {currentPlan.description}
              </p>
            </div>

            {/* Actions: Upgrade / Renew Plan Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={() => navigate('/pricing')}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4" />
                <span>Upgrade / Renew Plan</span>
              </button>

              {currentPlan.type !== 'one-time' && subscription?.autoRenew && (
                <button
                  onClick={handleCancelAutoRenew}
                  disabled={cancelLoading}
                  className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-rose-400 border border-rose-900/60 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {cancelLoading ? 'Cancelling...' : 'Cancel Auto-Renewal'}
                </button>
              )}

              <button
                onClick={() => navigate('/dashboard/wallet-transactions')}
                className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-800 transition-colors"
              >
                Payment Ledger
              </button>
            </div>
          </div>

          {/* Key Metrics Grid (Price, Purchase Date, Expiry Date, Days Remaining, Transaction ID) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-6">
            {/* 2. Plan Price */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Plan Price</span>
              <div className="text-xl font-bold font-mono text-white mt-1">
                ₹{subscription?.planPrice || currentPlan.priceINR}
                <span className="text-xs text-slate-400 font-normal ml-1">
                  {currentPlan.billingText}
                </span>
              </div>
            </div>

            {/* 5. Purchase Date */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Purchase Date</span>
              <div className="text-sm font-semibold font-mono text-slate-200 mt-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>{subscription?.startedAt || 'Active Cycle'}</span>
              </div>
            </div>

            {/* 6. Expiry Date */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Expiry Date</span>
              <div className="text-sm font-semibold font-mono text-slate-200 mt-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>{subscription?.expiresAt || (subscription?.renewsAt ? subscription.renewsAt : 'Never (Lifetime)')}</span>
              </div>
            </div>

            {/* 7. Days Remaining */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Days Remaining</span>
              <div className="text-xl font-bold font-mono mt-1 flex items-baseline gap-1">
                <span className={isPlanExpired ? 'text-rose-400' : 'text-emerald-400'}>
                  {subscription?.daysRemaining ?? (isPlanExpired ? 0 : 30)}
                </span>
                <span className="text-xs text-slate-400 font-normal">days left</span>
              </div>
            </div>

            {/* 8. Transaction ID */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 col-span-2 md:col-span-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Transaction ID</span>
              <div className="text-xs font-mono text-cyan-300 mt-2 truncate font-semibold" title={subscription?.transactionId || subscription?.paymentId || subscription?.orderId}>
                {subscription?.transactionId || subscription?.paymentId || subscription?.orderId || 'Verified Record'}
              </div>
            </div>
          </div>

          {/* 9. Plan Features Checklist */}
          <div className="mt-6 pt-6 border-t border-slate-800/80">
            <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>Included Plan Entitlements & Features</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {featuresList.map((feat: string, i: number) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/50">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-200">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {cancelMessage && (
            <div className="mt-4 p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl text-xs text-blue-300">
              {cancelMessage}
            </div>
          )}
        </div>

        {/* Catalog Grid for Plan Switching */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white font-display">
                All Available Rudraatma Music Plans
              </h2>
              <p className="text-xs text-slate-400">Switch or renew directly into any one-time or recurring package</p>
            </div>
            <button
              onClick={() => navigate('/pricing')}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <span>View Full Matrix</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING_PLANS.map((p) => {
              const isCurrent = p.id === activePlanId;
              return (
                <div
                  key={p.id}
                  className={`p-5 rounded-2xl bg-[#090e1a] border flex flex-col justify-between transition-all ${
                    isCurrent ? 'border-emerald-500/80 shadow-lg shadow-emerald-500/10' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-mono uppercase text-slate-400">{p.type}</span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>Active Plan</span>
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-white mt-1">{p.name}</h3>
                    <div className="text-xl font-bold font-mono text-white mt-2">
                      ₹{p.priceINR} <span className="text-xs text-slate-400 font-normal">{p.billingText}</span>
                    </div>
                    {p.annualCalculation && (
                      <div className="text-[10px] font-mono text-emerald-400 mt-0.5">
                        {p.annualCalculation}
                      </div>
                    )}
                    <div className="text-xs text-blue-300 mt-1 font-medium">{p.allowance}</div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-800">
                    {isCurrent ? (
                      <div className="py-2 text-center text-xs font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 rounded-lg">
                        Currently Active
                      </div>
                    ) : (
                      <button
                        onClick={() => navigate(`/checkout?planId=${p.id}`)}
                        className="w-full py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors shadow-sm"
                      >
                        {p.type === 'one-time' ? `Purchase for ₹${p.priceINR}` : `Switch to ${p.name}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 8. WALLET TRANSACTIONS ========================
export const WalletTransactionsPage: React.FC = () => {
  const { token } = useAuth();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/dashboard/data'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => setTransactions(d.transactions || []));
  }, [token]);

  return (
    <DashboardLayout title="Wallet Transactions">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Wallet Transactions & Ledger</h1>
          <p className="text-xs text-slate-400">Auditable accounting records of royalty credits, debits, and verified payouts</p>
        </div>

        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800">
          {transactions.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">No transactions recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="pb-3">Reference ID</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Description</th>
                    <th className="pb-3">Amount (INR)</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-3 font-mono text-[11px] text-blue-400">{tx.reference}</td>
                      <td className="py-3 font-semibold text-white">{tx.type}</td>
                      <td className="py-3">{tx.description}</td>
                      <td className="py-3 font-mono text-white font-bold tabular-nums">₹{tx.amount.toFixed(2)}</td>
                      <td className="py-3 text-emerald-400 font-mono text-[11px]">{tx.status}</td>
                      <td className="py-3 font-mono text-[11px] text-slate-400">{tx.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 9. OTHERS (TOOLS) ========================
export const OthersPage: React.FC = () => {
  const [upcResult, setUpcResult] = useState('');
  const [isrcResult, setIsrcResult] = useState('');

  const generateUpc = () => {
    setUpcResult('890' + Math.floor(1000000000 + Math.random() * 9000000000));
  };

  const generateIsrc = () => {
    setIsrcResult('IN-RUD-26-' + Math.floor(1000 + Math.random() * 9000));
  };

  return (
    <DashboardLayout title="Others">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Metadata & Barcode Utilities</h1>
          <p className="text-xs text-slate-400">Generate candidate UPC packages, track-level ISRC identifiers, and metadata presets</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white font-display">UPC Barcode Generator</h2>
            <p className="text-xs text-slate-400">Generate an EAN-13 compatible 890-prefix barcode for release packaging.</p>
            <button
              onClick={generateUpc}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
            >
              Generate UPC Code
            </button>
            {upcResult && (
              <div className="p-3 bg-slate-900 rounded-lg text-xs font-mono text-emerald-400 border border-slate-800">
                Generated UPC: {upcResult}
              </div>
            )}
          </div>

          <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white font-display">Track ISRC Code Generator</h2>
            <p className="text-xs text-slate-400">Standardized IN-RUD-26 track identification format.</p>
            <button
              onClick={generateIsrc}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
            >
              Generate Track ISRC
            </button>
            {isrcResult && (
              <div className="p-3 bg-slate-900 rounded-lg text-xs font-mono text-emerald-400 border border-slate-800">
                Generated ISRC: {isrcResult}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 10. YOUTUBE INTEGRATIONS ========================
export const YouTubePage: React.FC = () => {
  return (
    <DashboardLayout title="YouTube">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">YouTube Music & Content ID</h1>
          <p className="text-xs text-slate-400">Content ID fingerprinting status, Official Artist Channel (OAC) guidelines, and channel claims</p>
        </div>

        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
            <Youtube className="w-8 h-8 text-rose-500" />
            <div>
              <h2 className="text-sm font-bold text-white font-display">Official Artist Channel (OAC) Integration</h2>
              <span className="text-xs text-slate-400">Consolidate your Topic Channel and Vevo/personal channels into a musical note badge</span>
            </div>
          </div>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <p>
              • <strong>Content ID Eligibility:</strong> To claim monetization on user-uploaded videos containing your sound recording, you must own 100% exclusive master and publishing rights. Releases with third-party loops, non-exclusive beats, or public domain samples are not eligible.
            </p>
            <p>
              • <strong>OAC Requirements:</strong> You must have at least 1 commercially delivered release live on YouTube Music and own a personal YouTube channel representing your artist brand.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => alert('OAC claims desk will verify your channel link within 7 business days.')}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
            >
              Submit YouTube Channel for OAC Linking
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 11. MANAGE ARTISTS ========================
export const ManageArtistsPage: React.FC = () => {
  const { token, user } = useAuth();
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [name, setName] = useState('');
  const [primaryGenre, setPrimaryGenre] = useState('Pop');
  const [spotifyId, setSpotifyId] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/dashboard/data'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => setArtists(d.artists || []));
  }, [token]);

  const handleCreateArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch(apiUrl('/api/dashboard/artists'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, primaryGenre, spotifyId })
    });
    const d = await res.json();
    if (d.success) {
      setArtists(prev => [...prev, d.artist]);
      setName('');
      setSpotifyId('');
    }
  };

  return (
    <DashboardLayout title="Manage Artists">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Artist Roster Profiles</h1>
          <p className="text-xs text-slate-400">Map artist profiles with Spotify & Apple Music identifiers to prevent catalog mixups</p>
        </div>

        <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800">
          <form onSubmit={handleCreateArtist} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Artist Name *"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
            />
            <input
              type="text"
              value={primaryGenre}
              onChange={(e) => setPrimaryGenre(e.target.value)}
              placeholder="Primary Genre"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
            />
            <input
              type="text"
              value={spotifyId}
              onChange={(e) => setSpotifyId(e.target.value)}
              placeholder="Spotify Artist URI (Optional)"
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
            >
              Add Artist
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {artists.map((art) => (
            <div key={art.id} className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-2">
              <div className="font-bold text-white text-sm font-display">{art.name}</div>
              <div className="text-xs text-blue-400">{art.primaryGenre}</div>
              <div className="text-[11px] text-slate-400 font-mono">
                Spotify ID: {art.spotifyId || 'Auto-mapping on first release'}
              </div>
              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                Releases Linked: {art.releasesCount}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 12. SMART LINKS ========================
export const SmartLinksPage: React.FC = () => {
  const { navigate } = useRouter();
  const { token, user } = useAuth();

  const [links, setLinks] = useState<SmartLink[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showBuilder, setShowBuilder] = useState(true);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState(user?.fullName || '');
  const [slug, setSlug] = useState('');
  const [genre, setGenre] = useState('Contemporary Fusion');
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [coverUrl, setCoverUrl] = useState('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80');
  const [previewAudioUrl, setPreviewAudioUrl] = useState('https://actions.google.com/sounds/v1/ambient/rain_heavy.ogg');
  const [description, setDescription] = useState('Official release distributed by Rudraatma Music. Stream or save on your favorite music platform below.');
  const [stores, setStores] = useState<SmartLinkStores>({
    spotify: 'https://open.spotify.com/album/37i9dQZF1DXcBWIGoYBM5M',
    apple: 'https://music.apple.com/in/album/midnight-ragas/1594839201',
    youtube: 'https://music.youtube.com/playlist?list=OLAK5uy_mN37a',
    amazon: 'https://music.amazon.in/albums/B09X123456',
    jiosaavn: 'https://www.jiosaavn.com/album/midnight-ragas/abc123xyz',
    wynk: 'https://wynk.in/music/album/midnight-ragas/sr_12345',
    gaana: 'https://gaana.com/album/midnight-ragas-session',
    tidal: 'https://tidal.com/browse/album/184920481'
  });

  // Simulated audio preview in live phone
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const fetchDashboardData = () => {
    if (!token) return;
    setLoading(true);
    fetch(apiUrl('/api/dashboard/data'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => {
        if (d.smartLinks) setLinks(d.smartLinks);
        if (d.releases) setReleases(d.releases);
      })
      .catch(() => showToast('Failed to load smart links data', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token]);

  // When user selects an existing release from catalogue
  const handleSelectRelease = (relId: string) => {
    setSelectedReleaseId(relId);
    if (!relId) return;

    const rel = releases.find(r => r.id === relId);
    if (rel) {
      setTitle(rel.title);
      setArtist(rel.artist || user?.fullName || 'Rudraatma Artist');
      setGenre(rel.genre || rel.primaryGenre || 'Indian Fusion / Master');
      setCoverUrl(rel.coverUrl || rel.artworkUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80');
      const cleanSlug = rel.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setSlug(cleanSlug);
      setDescription(`Listen to "${rel.title}" by ${rel.artist}. Distributed globally by Rudraatma Music on all major streaming services.`);
      if (rel.releaseDate) setReleaseDate(rel.releaseDate);
      if (rel.tracks && rel.tracks[0]?.audioFileUrl) {
        setPreviewAudioUrl(rel.tracks[0].audioFileUrl);
      }
      showToast(`Auto-filled metadata for "${rel.title}"`, 'info');
    }
  };

  // Helper to populate sample demo URLs across stores
  const handleFillDemoUrls = () => {
    const safeSlug = slug || 'new-master';
    setStores({
      spotify: `https://open.spotify.com/album/${safeSlug}-track`,
      apple: `https://music.apple.com/in/album/${safeSlug}/1609823`,
      youtube: `https://music.youtube.com/playlist?list=${safeSlug}`,
      amazon: `https://music.amazon.in/albums/${safeSlug}`,
      jiosaavn: `https://www.jiosaavn.com/album/${safeSlug}/saavn901`,
      wynk: `https://wynk.in/music/album/${safeSlug}/wnk_4401`,
      gaana: `https://gaana.com/album/${safeSlug}-special`,
      tidal: `https://tidal.com/browse/album/${safeSlug}-master`,
      instagram: `https://instagram.com/reels/audio/${safeSlug}`
    });
    showToast('Populated streaming store URLs with demo tracks', 'info');
  };

  // Preset cover artworks
  const PRESET_COVERS = [
    { label: 'Neon Stage', url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80' },
    { label: 'Acoustic Guitar', url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80' },
    { label: 'Sound Studio', url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80' },
    { label: 'Classical Violin', url: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&auto=format&fit=crop&q=80' }
  ];

  // Store definitions with distinct colors and badges
  const STORE_ITEMS = [
    { key: 'spotify', name: 'Spotify', color: 'emerald', border: 'border-emerald-500/40', badge: 'bg-emerald-500/20 text-emerald-400', placeholder: 'https://open.spotify.com/track/...' },
    { key: 'apple', name: 'Apple Music', color: 'rose', border: 'border-rose-500/40', badge: 'bg-rose-500/20 text-rose-400', placeholder: 'https://music.apple.com/...' },
    { key: 'youtube', name: 'YouTube Music', color: 'red', border: 'border-red-500/40', badge: 'bg-red-500/20 text-red-400', placeholder: 'https://music.youtube.com/watch?v=...' },
    { key: 'amazon', name: 'Amazon Music', color: 'amber', border: 'border-amber-500/40', badge: 'bg-amber-500/20 text-amber-400', placeholder: 'https://music.amazon.in/...' },
    { key: 'jiosaavn', name: 'JioSaavn', color: 'teal', border: 'border-teal-500/40', badge: 'bg-teal-500/20 text-teal-400', placeholder: 'https://www.jiosaavn.com/song/...' },
    { key: 'wynk', name: 'Wynk Music', color: 'blue', border: 'border-blue-500/40', badge: 'bg-blue-500/20 text-blue-400', placeholder: 'https://wynk.in/music/song/...' },
    { key: 'gaana', name: 'Gaana', color: 'orange', border: 'border-orange-500/40', badge: 'bg-orange-500/20 text-orange-400', placeholder: 'https://gaana.com/song/...' },
    { key: 'tidal', name: 'Tidal', color: 'cyan', border: 'border-cyan-500/40', badge: 'bg-cyan-500/20 text-cyan-400', placeholder: 'https://tidal.com/browse/track/...' },
    { key: 'instagram', name: 'Instagram Audio', color: 'fuchsia', border: 'border-fuchsia-500/40', badge: 'bg-fuchsia-500/20 text-fuchsia-400', placeholder: 'https://instagram.com/reels/audio/...' }
  ] as const;

  const countActiveStores = (storeMap: SmartLinkStores) => {
    return Object.values(storeMap).filter(val => typeof val === 'string' && val.trim().length > 0).length;
  };

  const handleCopyLink = (slugToCopy: string, id: string) => {
    const fullUrl = `${window.location.origin}/link/${slugToCopy}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedId(id);
      showToast(`Copied ${fullUrl} to clipboard!`, 'success');
      setTimeout(() => setCopiedId(null), 3000);
    }).catch(() => {
      showToast('Could not copy to clipboard automatically', 'error');
    });
  };

  const handleEdit = (link: SmartLink) => {
    setEditingId(link.id);
    setTitle(link.title);
    setArtist(link.artist);
    setSlug(link.slug);
    setGenre(link.genre || 'Contemporary Master');
    setReleaseDate(link.releaseDate || new Date().toISOString().split('T')[0]);
    setCoverUrl(link.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80');
    setPreviewAudioUrl(link.previewAudioUrl || '');
    setDescription(link.description || '');
    setStores(link.stores || {});
    setShowBuilder(true);
    window.scrollTo({ top: 180, behavior: 'smooth' });
    showToast(`Loaded "${link.title}" into the generator`, 'info');
  };

  const handleResetForm = () => {
    setEditingId(null);
    setSelectedReleaseId('');
    setTitle('');
    setArtist(user?.fullName || '');
    setSlug('');
    setGenre('Contemporary Fusion');
    setCoverUrl('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80');
    setPreviewAudioUrl('');
    setDescription('Official release distributed by Rudraatma Music. Stream on your favorite platform.');
    setStores({
      spotify: '',
      apple: '',
      youtube: '',
      amazon: '',
      jiosaavn: '',
      wynk: '',
      gaana: '',
      tidal: ''
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('Please enter a release title', 'error');
      return;
    }
    if (!slug.trim()) {
      showToast('Please specify a custom link slug', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      const payload = {
        id: editingId || undefined,
        title: title.trim(),
        artist: artist.trim() || user?.fullName || 'Rudraatma Artist',
        slug: cleanSlug,
        genre: genre.trim(),
        releaseDate,
        coverUrl: coverUrl.trim(),
        previewAudioUrl: previewAudioUrl.trim(),
        description: description.trim(),
        stores
      };

      const endpoint = apiUrl(editingId ? `/api/dashboard/smart-links/${editingId}` : '/api/dashboard/smart-links');
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast(editingId ? 'Smart link updated successfully!' : 'Smart link created successfully!', 'success');
        fetchDashboardData();
        handleResetForm();
      } else {
        showToast(data.error || 'Failed to save smart link', 'error');
      }
    } catch {
      showToast('Network error while saving smart link', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, linkTitle: string) => {
    if (!confirm(`Are you sure you want to delete the smart link for "${linkTitle}"?`)) return;

    try {
      const res = await fetch(apiUrl(`/api/dashboard/smart-links/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`Smart link for "${linkTitle}" deleted`, 'info');
        setLinks(prev => prev.filter(l => l.id !== id));
        if (editingId === id) handleResetForm();
      } else {
        showToast(data.error || 'Could not delete link', 'error');
      }
    } catch {
      showToast('Failed to delete smart link', 'error');
    }
  };

  // Filter links for display
  const filteredLinks = links.filter(l => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return l.title.toLowerCase().includes(q) || l.artist.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q);
  });

  const totalClicks = links.reduce((sum, l) => sum + (l.clicks || 0), 0);
  const activeStoresInForm = countActiveStores(stores);

  return (
    <DashboardLayout title="Smart Links">
      <div className="space-y-8 max-w-7xl mx-auto pb-16">
        {/* TOAST NOTIFICATION BANNER */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm backdrop-blur-xl animate-in fade-in slide-in-from-top-3 ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-300'
                : 'bg-blue-950/90 border-blue-500/50 text-blue-300'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
            {toast.type === 'info' && <Sparkles className="w-5 h-5 text-blue-400 shrink-0" />}
            <span className="font-medium">{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* PAGE HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30">
                Direct-to-Fan Marketing
              </span>
              <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Link Engine
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-white font-display tracking-tight">
              Smart Landing Pages & Link Generator
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Create high-converting, single landing pages for your music across Spotify, Apple Music, YouTube Music, Amazon, JioSaavn, Wynk, Gaana, and Tidal.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setShowBuilder(true);
                handleResetForm();
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Smart Link</span>
            </button>
          </div>
        </div>

        {/* METRICS OVERVIEW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Total Smart Links</span>
              <Globe className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white font-display">{links.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">Unified landing hubs</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Total Clicks Tracked</span>
              <Eye className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400 font-display">
              {totalClicks.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Fan conversions & plays</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Supported DSPs</span>
              <Radio className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white font-display">9 Platforms</div>
            <div className="text-[11px] text-slate-500 mt-1">India & Global streaming</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span>Smart Link Domain</span>
              <Link2 className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xs font-mono font-bold text-cyan-300 truncate">rudraatmamusic.com/link</div>
            <div className="text-[11px] text-emerald-400 mt-1">SSL Encrypted & Ultra Fast</div>
          </div>
        </div>

        {/* GENERATOR / BUILDER WORKSPACE */}
        {showBuilder && (
          <div className="p-6 lg:p-8 rounded-3xl bg-[#090e1a] border border-blue-500/30 shadow-2xl relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 blur-3xl pointer-events-none rounded-full" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-600/5 blur-3xl pointer-events-none rounded-full" />

            <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white font-display">
                    {editingId ? 'Edit Smart Landing Page' : 'Smart Link Studio & URL Builder'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Input your DSP track URLs and preview your direct-to-fan landing page in real-time.
                  </p>
                </div>
              </div>

              {editingId && (
                <button
                  type="button"
                  onClick={handleResetForm}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel Editing</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT COLUMN: BUILDER FORM (7 COLS) */}
              <div className="lg:col-span-7 space-y-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* AUTO-FILL FROM RELEASES */}
                  {releases.length > 0 && !editingId && (
                    <div className="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-blue-300 flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                          <span>Quick Auto-fill from My Catalog:</span>
                        </label>
                        <span className="text-[11px] text-slate-400">Select to load metadata</span>
                      </div>
                      <select
                        value={selectedReleaseId}
                        onChange={(e) => handleSelectRelease(e.target.value)}
                        className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                      >
                        <option value="">-- Choose one of your releases --</option>
                        {releases.map(rel => (
                          <option key={rel.id} value={rel.id}>
                            {rel.title} • {rel.artist} ({rel.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* SECTION 1: RELEASE ESSENTIALS */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                      1. Release Essentials
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300">
                          Release Title <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={title}
                          onChange={(e) => {
                            setTitle(e.target.value);
                            if (!editingId && !slug) {
                              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                            }
                          }}
                          placeholder="e.g. Midnight Ragas"
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300">
                          Primary Artist <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={artist}
                          onChange={(e) => setArtist(e.target.value)}
                          placeholder="e.g. Aarav Mehta"
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                          <span>Custom URL Slug <span className="text-rose-400">*</span></span>
                          <span className="text-[10px] font-mono text-cyan-400">Unique Link</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={slug}
                            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                            placeholder="midnight-ragas"
                            className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-cyan-300 font-mono placeholder-slate-500 transition-colors"
                          />
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                          <LinkIcon className="w-3 h-3 text-slate-400" />
                          <span>Link: https://rudraatmamusic.com/link/{slug || 'your-slug'}</span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300">Genre / Style</label>
                        <input
                          type="text"
                          value={genre}
                          onChange={(e) => setGenre(e.target.value)}
                          placeholder="e.g. Contemporary Classical / Indian Fusion"
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 transition-colors"
                        />
                      </div>
                    </div>

                    {/* COVER ARTWORK URL & PRESETS */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-slate-300">
                          Cover Artwork Image URL
                        </label>
                        <span className="text-[11px] text-slate-400">High-res 3000x3000px recommended</span>
                      </div>
                      <div className="flex gap-3">
                        <input
                          type="url"
                          value={coverUrl}
                          onChange={(e) => setCoverUrl(e.target.value)}
                          placeholder="https://images.unsplash.com/..."
                          className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 transition-colors"
                        />
                        {coverUrl && (
                          <div className="w-9 h-9 rounded-lg overflow-hidden border border-slate-700 shrink-0">
                            <img src={coverUrl} alt="Cover preview" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>

                      {/* Cover Presets */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11px] text-slate-500">Quick Presets:</span>
                        {PRESET_COVERS.map(preset => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setCoverUrl(preset.url);
                              showToast(`Loaded "${preset.label}" cover artwork`, 'info');
                            }}
                            className="px-2.5 py-1 rounded-md text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 30-SEC AUDIO PREVIEW & NOTE */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                          <span>Audio Snippet Preview (MP3/OGG URL)</span>
                          <span className="text-[10px] text-slate-500">Optional</span>
                        </label>
                        <input
                          type="url"
                          value={previewAudioUrl}
                          onChange={(e) => setPreviewAudioUrl(e.target.value)}
                          placeholder="https://.../preview.mp3"
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-300">Release Date</label>
                        <input
                          type="date"
                          value={releaseDate}
                          onChange={(e) => setReleaseDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-white transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Description / Liner Note for Fans
                      </label>
                      <textarea
                        rows={2}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Stream the brand new master release on your favorite platform..."
                        className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 transition-colors resize-none"
                      />
                    </div>
                  </div>

                  {/* SECTION 2: STREAMING DSP STORE URLS */}
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
                          <span>2. Streaming Platforms & Store URLs</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-400 font-sans normal-case">
                            {activeStoresInForm} Connected
                          </span>
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Paste the exact link for each store where your release is available.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleFillDemoUrls}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 hover:text-cyan-200 rounded-xl text-[11px] font-medium flex items-center gap-1.5 self-start sm:self-auto transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Auto-Fill Demo DSP Links</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {STORE_ITEMS.map((store) => (
                        <div key={store.key} className="space-y-1.5">
                          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${stores[store.key] ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                              <span>{store.name}</span>
                            </span>
                            {stores[store.key] ? (
                              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                <span>Active</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-500">Not configured</span>
                            )}
                          </label>

                          <div className="relative">
                            <input
                              type="url"
                              value={stores[store.key] || ''}
                              onChange={(e) => setStores(prev => ({ ...prev, [store.key]: e.target.value }))}
                              placeholder={store.placeholder}
                              className={`w-full px-3 py-2 bg-slate-900 border ${
                                stores[store.key] ? store.border : 'border-slate-800'
                              } focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-600 transition-colors`}
                            />
                            {stores[store.key] && (
                              <button
                                type="button"
                                onClick={() => setStores(prev => ({ ...prev, [store.key]: '' }))}
                                className="absolute right-2 top-2.5 text-slate-500 hover:text-slate-300"
                                title="Clear URL"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* FORM ACTIONS */}
                  <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-slate-800">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50 transition-all"
                    >
                      {submitting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>
                        {editingId ? 'Save Smart Link Changes' : 'Generate & Publish Smart Link'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetForm}
                      className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                    >
                      Reset Form
                    </button>

                    <div className="ml-auto text-xs text-slate-400 font-mono">
                      Stores configured: <strong className="text-blue-400">{activeStoresInForm} / 9</strong>
                    </div>
                  </div>
                </form>
              </div>

              {/* RIGHT COLUMN: REAL-TIME INTERACTIVE PHONE / CARD LIVE PREVIEW (5 COLS) */}
              <div className="lg:col-span-5 lg:sticky lg:top-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-blue-400" />
                      <span>Live Fan Page Preview</span>
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Real-time
                    </span>
                  </div>

                  {/* PHONE FRAME CONTAINER */}
                  <div className="w-full max-w-sm mx-auto rounded-[36px] bg-[#05070e] border-4 border-slate-800 p-4 shadow-2xl relative overflow-hidden">
                    {/* Ambient glow from album cover */}
                    {coverUrl && (
                      <div
                        className="absolute inset-0 opacity-20 blur-2xl scale-125 pointer-events-none"
                        style={{
                          backgroundImage: `url(${coverUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }}
                      />
                    )}

                    {/* Top Device Notch */}
                    <div className="w-28 h-4 bg-slate-800 rounded-full mx-auto mb-4 relative z-10 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-slate-900" />
                    </div>

                    {/* Inside Phone Content */}
                    <div className="relative z-10 space-y-4 max-h-[580px] overflow-y-auto pr-1">
                      {/* Rudraatma Logo pill */}
                      <div className="flex justify-center">
                        <span className="px-3 py-1 rounded-full text-[10px] font-mono tracking-widest uppercase bg-black/60 border border-slate-700/80 text-blue-400">
                          RUDRAATMA MUSIC
                        </span>
                      </div>

                      {/* Artwork */}
                      <div className="relative mx-auto w-48 h-48 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/50 group">
                        <img
                          src={coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'}
                          alt={title || 'Album Cover'}
                          className="w-full h-full object-cover"
                        />
                        {previewAudioUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewPlaying(!previewPlaying)}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-90 hover:opacity-100 transition-opacity"
                          >
                            <div className="w-12 h-12 rounded-full bg-blue-600/90 text-white flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform">
                              {previewPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                            </div>
                          </button>
                        )}
                      </div>

                      {/* Release Titles */}
                      <div className="text-center px-2">
                        <div className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30 mb-1">
                          {genre || 'Master Track'}
                        </div>
                        <h4 className="text-base font-bold text-white font-display truncate">
                          {title || 'Release Title'}
                        </h4>
                        <p className="text-xs text-slate-400 truncate">
                          {artist || 'Artist Name'}
                        </p>
                      </div>

                      {/* Audio simulation state badge */}
                      {previewPlaying && (
                        <div className="p-2 rounded-xl bg-blue-950/80 border border-blue-500/50 flex items-center justify-between text-[11px] text-blue-300">
                          <span className="flex items-center gap-1.5 font-mono">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                            Playing audio snippet
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">0:18 / 0:30</span>
                        </div>
                      )}

                      {/* Platforms List in Preview */}
                      <div className="space-y-2 pt-1">
                        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider text-center">
                          Choose Music Service
                        </div>

                        {STORE_ITEMS.map(store => {
                          const hasUrl = !!stores[store.key];
                          if (!hasUrl && activeStoresInForm > 0) return null;

                          return (
                            <div
                              key={store.key}
                              className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                                hasUrl
                                  ? 'bg-slate-900/90 border-slate-700/80 text-white hover:border-slate-500'
                                  : 'bg-slate-950/40 border-slate-800/40 text-slate-600'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs">{store.name}</span>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                                  hasUrl
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-800 text-slate-500'
                                }`}
                              >
                                {store.key === 'youtube' ? 'Watch' : store.key === 'instagram' ? 'Use Audio' : 'Play'}
                              </span>
                            </div>
                          );
                        })}

                        {activeStoresInForm === 0 && (
                          <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                            Enter store URLs above to see platform buttons here
                          </div>
                        )}
                      </div>

                      {/* Share & Preview link triggers */}
                      <div className="pt-2 pb-1 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (slug) {
                              navigate(`/link/${slug}`);
                            } else {
                              showToast('Please specify a slug first', 'error');
                            }
                          }}
                          className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                          <span>Open Public Landing Page</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: MANAGE EXISTING SMART LINKS */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white font-display flex items-center gap-2">
                <span>Active Smart Landing Pages</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-blue-500/20 text-blue-400">
                  {links.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Share these single links on your Instagram Bio, YouTube descriptions, WhatsApp, and marketing campaigns.
              </p>
            </div>

            {/* Search filter */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, artist, or slug..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs font-mono text-slate-500 bg-[#090e1a] rounded-2xl border border-slate-800">
              Loading your smart landing pages...
            </div>
          ) : filteredLinks.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[#090e1a] border border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mx-auto">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">No Smart Links Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery
                  ? `No links matched your search "${searchQuery}".`
                  : 'You have not created any smart links yet. Use the studio generator above to create your first one!'}
              </p>
              {!showBuilder && (
                <button
                  onClick={() => setShowBuilder(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
                >
                  Open Smart Link Builder
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredLinks.map((sml) => {
                const storeCount = countActiveStores(sml.stores || {});
                const isCopied = copiedId === sml.id;

                return (
                  <div
                    key={sml.id}
                    className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      {/* Top Header Row */}
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-700 shrink-0 bg-slate-900 shadow-lg">
                          <img
                            src={sml.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'}
                            alt={sml.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/30">
                              {sml.genre || 'Independent Master'}
                            </span>
                            <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 font-bold">
                              <Eye className="w-3.5 h-3.5" />
                              <span>{sml.clicks} Clicks</span>
                            </div>
                          </div>

                          <h3 className="font-bold text-white text-base truncate mt-1">
                            {sml.title}
                          </h3>
                          <p className="text-xs text-slate-400 truncate">
                            {sml.artist}
                          </p>
                        </div>
                      </div>

                      {/* Public URL Box */}
                      <div className="mt-4 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 font-mono text-xs">
                        <div className="truncate text-cyan-300">
                          https://rudraatmamusic.com/link/<span className="font-bold text-white">{sml.slug}</span>
                        </div>
                        <button
                          onClick={() => handleCopyLink(sml.slug, sml.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-sans font-semibold flex items-center gap-1 shrink-0 transition-colors ${
                            isCopied
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          {isCopied ? (
                            <>
                              <CheckCheck className="w-3.5 h-3.5 text-white" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Connected Store Badges */}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-500 mr-1">
                          {storeCount} Stores:
                        </span>
                        {sml.stores?.spotify && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            Spotify
                          </span>
                        )}
                        {sml.stores?.apple && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/30">
                            Apple Music
                          </span>
                        )}
                        {sml.stores?.youtube && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-red-500/10 text-red-400 border border-red-500/30">
                            YouTube
                          </span>
                        )}
                        {sml.stores?.jiosaavn && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/30">
                            JioSaavn
                          </span>
                        )}
                        {sml.stores?.wynk && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30">
                            Wynk
                          </span>
                        )}
                        {sml.stores?.gaana && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/30">
                            Gaana
                          </span>
                        )}
                        {sml.stores?.amazon && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            Amazon
                          </span>
                        )}
                        {sml.stores?.tidal && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                            Tidal
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="mt-5 pt-3.5 border-t border-slate-800 flex items-center justify-between text-xs">
                      <button
                        onClick={() => navigate(`/link/${sml.slug}`)}
                        className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Visit Landing Page</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(sml)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(sml.id, sml.title)}
                          className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 13. OTHER REQUESTS ========================
export const OtherRequestsPage: React.FC = () => {
  const { token } = useAuth();
  const [requests, setRequests] = useState<OtherRequest[]>([]);
  const [type, setType] = useState<'Metadata Correction' | 'Takedown' | 'Artist Name Update' | 'Other'>('Metadata Correction');
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl('/api/dashboard/data'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => setRequests(d.requests || []));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!details.trim()) return;
    const res = await fetch(apiUrl('/api/dashboard/other-requests'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type, details })
    });
    const d = await res.json();
    if (d.success) {
      setRequests(prev => [d.request, ...prev]);
      setDetails('');
    }
  };

  return (
    <DashboardLayout title="Other Requests">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Formal Change Requests</h1>
          <p className="text-xs text-slate-400">Submit metadata corrections, platform takedowns, or artist name changes</p>
        </div>

        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white font-display">Submit New Request</h2>
          <form onSubmit={handleSubmit} className="space-y-3 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Request Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              >
                <option value="Metadata Correction">Metadata Correction</option>
                <option value="Takedown">Release Takedown Request</option>
                <option value="Artist Name Update">Artist Name Spelling Update</option>
                <option value="Other">Other Administrative Request</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Request Specifications & Reason</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="Specify release UPC or track title along with the exact adjustment needed..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
            >
              Submit Request
            </button>
          </form>
        </div>

        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="pb-3">Type</th>
                <th className="pb-3">Details</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 font-semibold text-white">{r.type}</td>
                  <td className="py-3 text-slate-300">{r.details}</td>
                  <td className="py-3 font-mono text-emerald-400 text-[11px]">{r.status}</td>
                  <td className="py-3 font-mono text-[11px] text-slate-400">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

// ======================== 14. ADMIN PANEL ========================
export const AdminDashboardPage: React.FC = () => {
  const { token, user } = useAuth();
  const { navigate } = useRouter();

  // Tab Navigation State
  const [activeTab, setActiveTab] = useState<'customers' | 'plans' | 'releases' | 'payments' | 'audit'>('customers');

  // Overview Metrics
  const [overview, setOverview] = useState<any>(null);
  const [allReleases, setAllReleases] = useState<any[]>([]);

  // Subscriptions & Customers State
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerFilter, setCustomerFilter] = useState<'all' | 'active' | 'expired' | 'pending' | 'revoked'>('all');
  const [customerSearch, setCustomerSearch] = useState('');

  // Plans Catalog State
  const [adminPlans, setAdminPlans] = useState<any[]>([]);

  // Payments State
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentMetrics, setPaymentMetrics] = useState<any>(null);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'failed' | 'created'>('all');
  const [paymentSearch, setPaymentSearch] = useState('');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Review Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<any>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'request_changes' | 'reject'>('approve');
  const [adminNotes, setAdminNotes] = useState('');
  const [adminReason, setAdminReason] = useState('');

  // Grant Subscription Modal State
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [selectedCustomerForGrant, setSelectedCustomerForGrant] = useState<any>(null);
  const [grantPlanId, setGrantPlanId] = useState('growth-monthly');
  const [grantValidityDays, setGrantValidityDays] = useState(30);
  const [grantAdminNote, setGrantAdminNote] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);

  // Revoke Subscription Modal State
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [selectedCustomerForRevoke, setSelectedCustomerForRevoke] = useState<any>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeLoading, setRevokeLoading] = useState(false);

  // Edit / Create Plan Modal State
  const [editPlanModalOpen, setEditPlanModalOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    id: '',
    name: '',
    type: 'monthly' as 'one-time' | 'monthly' | 'annual',
    priceINR: 199,
    billingText: '/month',
    allowance: '',
    description: '',
    validityDays: 30,
    features: '',
    enabled: true
  });
  const [planSaveLoading, setPlanSaveLoading] = useState(false);

  // Feedback Messages
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchAllData = () => {
    if (!token) return;
    fetch(apiUrl('/api/admin/overview'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => {
        setOverview(d.metrics);
      })
      .catch(() => {});

    fetch(apiUrl('/api/admin/releases'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => setAllReleases(d.releases || []))
      .catch(() => {});

    fetch(apiUrl('/api/admin/payments'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => {
        setPayments(d.payments || []);
        setPaymentMetrics(d.metrics || null);
      })
      .catch(() => {});

    fetch(apiUrl('/api/admin/customers'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => setCustomers(d.customers || []))
      .catch(() => {});

    fetch(apiUrl('/api/admin/plans'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => setAdminPlans(d.plans || []))
      .catch(() => {});

    fetch(apiUrl('/api/admin/audit-logs'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(d => setAuditLogs(d.logs || []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchAllData();
  }, [token]);

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#070b14] text-white flex items-center justify-center p-4">
        <div className="text-center p-8 bg-slate-900 border border-slate-800 rounded-2xl max-w-md">
          <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h1 className="text-lg font-bold font-display">Administrator Access Required</h1>
          <p className="text-xs text-slate-400 mt-2">
            You must be signed in with an administrative account to access this operational console.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold"
          >
            Log In as Admin Desk
          </button>
        </div>
      </div>
    );
  }

  // Handlers
  const handleTogglePlan = async (planId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/admin/plans/${planId}/toggle`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(data.message);
        fetchAllData();
        setTimeout(() => setActionSuccess(null), 3000);
      } else {
        setActionError(data.error || 'Failed to toggle plan status.');
      }
    } catch {
      setActionError('Network error toggling plan status.');
    }
  };

  const handleOpenEditPlan = (plan?: any) => {
    if (plan) {
      setPlanForm({
        id: plan.id,
        name: plan.name,
        type: plan.type,
        priceINR: plan.priceINR,
        billingText: plan.billingText,
        allowance: plan.allowance,
        description: plan.description,
        validityDays: plan.validityDays || 30,
        features: Array.isArray(plan.features) ? plan.features.join('\n') : '',
        enabled: plan.enabled !== false
      });
    } else {
      setPlanForm({
        id: `plan-custom-${Date.now().toString().slice(-4)}`,
        name: 'New Custom Tier',
        type: 'monthly',
        priceINR: 199,
        billingText: '/month',
        allowance: '5 Master Releases / month',
        description: 'Custom distribution package configured by administrator.',
        validityDays: 30,
        features: 'All Standard Features\nFree ISRC & Barcodes\nDedicated Support',
        enabled: true
      });
    }
    setEditPlanModalOpen(true);
  };

  const handleSavePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanSaveLoading(true);
    setActionError(null);
    try {
      const feats = planForm.features.split('\n').map(s => s.trim()).filter(Boolean);
      const res = await fetch(apiUrl('/api/admin/plans'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: planForm.id.trim(),
          name: planForm.name.trim(),
          type: planForm.type,
          priceINR: Number(planForm.priceINR),
          billingText: planForm.billingText.trim(),
          allowance: planForm.allowance.trim(),
          description: planForm.description.trim(),
          validityDays: Number(planForm.validityDays) || 30,
          features: feats,
          enabled: planForm.enabled
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(data.message);
        setEditPlanModalOpen(false);
        fetchAllData();
        setTimeout(() => setActionSuccess(null), 3000);
      } else {
        setActionError(data.error || 'Failed to save plan.');
      }
    } catch {
      setActionError('Network communication error while saving plan.');
    } finally {
      setPlanSaveLoading(false);
    }
  };

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForGrant) return;
    setGrantLoading(true);
    setActionError(null);
    try {
      const res = await fetch(apiUrl('/api/admin/subscriptions/grant'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: selectedCustomerForGrant.userId,
          planId: grantPlanId,
          customValidityDays: Number(grantValidityDays),
          adminNote: grantAdminNote
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(data.message);
        setGrantModalOpen(false);
        setSelectedCustomerForGrant(null);
        setGrantAdminNote('');
        fetchAllData();
        setTimeout(() => setActionSuccess(null), 3000);
      } else {
        setActionError(data.error || 'Failed to grant plan.');
      }
    } catch {
      setActionError('Network error while granting plan.');
    } finally {
      setGrantLoading(false);
    }
  };

  const handleRevokeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerForRevoke) return;
    setRevokeLoading(true);
    setActionError(null);
    try {
      const res = await fetch(apiUrl('/api/admin/subscriptions/revoke'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: selectedCustomerForRevoke.userId,
          reason: revokeReason
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(data.message);
        setRevokeModalOpen(false);
        setSelectedCustomerForRevoke(null);
        setRevokeReason('');
        fetchAllData();
        setTimeout(() => setActionSuccess(null), 3000);
      } else {
        setActionError(data.error || 'Failed to revoke plan.');
      }
    } catch {
      setActionError('Network error while revoking plan.');
    } finally {
      setRevokeLoading(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRelease) return;

    const res = await fetch(apiUrl(`/api/admin/releases/${selectedRelease.id}/review`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        action: reviewAction,
        notes: adminNotes,
        reason: adminReason
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      setActionSuccess(data.message);
      setAllReleases(prev => prev.map(r => r.id === selectedRelease.id ? data.release : r));
      setTimeout(() => {
        setReviewModalOpen(false);
        setSelectedRelease(null);
        setActionSuccess(null);
        setAdminNotes('');
        setAdminReason('');
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#060912] text-slate-100 font-sans p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800">
                Staff Administrator Console
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white font-display mt-1">
              Rudraatma Music Technical & Review Desk
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-lg hover:text-white"
            >
              Artist Portal
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-lg hover:text-white"
            >
              Public Site
            </button>
          </div>
        </div>

        {/* Overview Metrics */}
        {overview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400">Total Registered Users</span>
              <div className="text-2xl font-bold font-mono text-white mt-1">{overview.registeredUsers}</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400">Awaiting Technical Review</span>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{overview.releasesAwaitingReview}</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400">Approved Releases</span>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{overview.approvedReleases}</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400">Verified Payment Total</span>
              <div className="text-2xl font-bold font-mono text-blue-400 mt-1">₹{overview.verifiedPaymentTotals}</div>
            </div>
          </div>
        )}

        {/* Releases Queue & Approval Desk */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white font-display">
              Submitted Releases Queue (Approve / Request Changes / Reject)
            </h2>
            <span className="text-xs font-mono text-slate-400">{allReleases.length} releases logged</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="pb-3">Title</th>
                  <th className="pb-3">Artist</th>
                  <th className="pb-3">UPC</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Current Status</th>
                  <th className="pb-3 text-right">Review Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {allReleases.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 font-semibold text-white">{r.title}</td>
                    <td className="py-3">{r.artist}</td>
                    <td className="py-3 font-mono text-[11px]">{r.upc}</td>
                    <td className="py-3 font-mono text-[11px]">{r.type}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        r.status === 'Approved' ? 'bg-emerald-950 text-emerald-400' :
                        r.status === 'Action Required' ? 'bg-orange-950 text-orange-400' :
                        'bg-amber-950 text-amber-400'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedRelease(r);
                          setReviewModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs"
                      >
                        Review Song
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Management List */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h2 className="text-base font-bold text-white font-display">Registered User Accounts</h2>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                <th className="pb-3">Name</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Country</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {customers.map((u: any) => (
                <tr key={u.id}>
                  <td className="py-3 font-semibold text-white">{u.fullName}</td>
                  <td className="py-3 font-mono text-slate-400">{u.email}</td>
                  <td className="py-3">{u.country}</td>
                  <td className="py-3 font-mono text-blue-400">{u.role}</td>
                  <td className="py-3 text-emerald-400">{u.isActive ? 'Active' : 'Pending OTP'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Razorpay Payments & Subscriptions Ledger */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase bg-blue-950 text-blue-400 px-2 py-0.5 rounded border border-blue-800">
                  Razorpay Payment Records
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {payments.length} Transactions Recorded
                </span>
              </div>
              <h2 className="text-base font-bold text-white font-display mt-1">
                Payments & Subscriptions Ledger
              </h2>
            </div>

            {paymentMetrics && (
              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="text-right">
                  <div className="text-slate-400 text-[10px]">VERIFIED REVENUE</div>
                  <div className="text-emerald-400 font-bold text-base tabular-nums">
                    ₹{paymentMetrics.totalRevenue}
                  </div>
                </div>
                <div className="text-right border-l border-slate-800 pl-4">
                  <div className="text-slate-400 text-[10px]">PAID / FAILED</div>
                  <div className="text-white">
                    <span className="text-emerald-400 font-bold">{paymentMetrics.paidCount}</span> /{' '}
                    <span className="text-rose-400">{paymentMetrics.failedCount}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              {(['all', 'paid', 'failed', 'created'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setPaymentFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-all ${
                    paymentFilter === filter
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={paymentSearch}
              onChange={(e) => setPaymentSearch(e.target.value)}
              placeholder="Search by Order ID, Payment ID, or Email..."
              className="px-3.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 max-w-xs font-mono"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="pb-3">Order ID</th>
                  <th className="pb-3">Payment ID</th>
                  <th className="pb-3">Customer</th>
                  <th className="pb-3">Plan / Product</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Gateway Mode</th>
                  <th className="pb-3">Payment Status</th>
                  <th className="pb-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {payments
                  .filter((p) => {
                    if (paymentFilter !== 'all' && p.status !== paymentFilter) return false;
                    if (paymentSearch) {
                      const q = paymentSearch.toLowerCase();
                      return (
                        p.orderId?.toLowerCase().includes(q) ||
                        p.paymentId?.toLowerCase().includes(q) ||
                        p.userEmail?.toLowerCase().includes(q) ||
                        p.planName?.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  })
                  .map((p) => (
                    <tr key={p.orderId}>
                      <td className="py-3 font-mono text-[11px] text-blue-400">{p.orderId}</td>
                      <td className="py-3 font-mono text-[11px] text-slate-300">
                        {p.paymentId || '—'}
                      </td>
                      <td className="py-3">
                        <div className="font-semibold text-white">{p.userName || 'Artist'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{p.userEmail}</div>
                      </td>
                      <td className="py-3">
                        <span className="font-semibold text-white">{p.planName}</span>
                        <div className="text-[10px] text-slate-400 uppercase font-mono">
                          {p.planType}
                        </div>
                      </td>
                      <td className="py-3 font-mono text-white font-bold tabular-nums">
                        ₹{p.amount}.00
                      </td>
                      <td className="py-3 font-mono text-[11px]">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          p.isTestMode ? 'bg-amber-950 text-amber-400' : 'bg-emerald-950 text-emerald-400'
                        }`}>
                          {p.isTestMode ? 'Test Sandbox' : 'Live Gateway'}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          p.status === 'paid' ? 'bg-emerald-950 text-emerald-400' :
                          p.status === 'failed' ? 'bg-rose-950 text-rose-400' :
                          p.status === 'cancelled' ? 'bg-slate-800 text-slate-400' :
                          'bg-amber-950 text-amber-400'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-[11px] text-slate-400">
                        {new Date(p.createdAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {reviewModalOpen && selectedRelease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setReviewModalOpen(false)} />
          <div className="relative w-full max-w-lg bg-[#0b1120] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-white font-display">
              Review Release: {selectedRelease.title} ({selectedRelease.artist})
            </h2>

            {actionSuccess ? (
              <div className="p-4 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-lg text-center">
                {actionSuccess}
              </div>
            ) : (
              <form onSubmit={handleReviewSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Select Action *</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setReviewAction('approve')}
                      className={`p-2 rounded-lg border font-semibold ${
                        reviewAction === 'approve' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      Approve Release
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewAction('request_changes')}
                      className={`p-2 rounded-lg border font-semibold ${
                        reviewAction === 'request_changes' ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      Request Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewAction('reject')}
                      className={`p-2 rounded-lg border font-semibold ${
                        reviewAction === 'reject' ? 'bg-rose-600 text-white border-rose-500' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      Reject Release
                    </button>
                  </div>
                </div>

                {reviewAction === 'approve' && (
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Optional Reviewer Notes</label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={3}
                      placeholder="e.g. Master passed technical inspection. Dispatched to candidate store endpoints."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                )}

                {(reviewAction === 'request_changes' || reviewAction === 'reject') && (
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Explanation Reason (Mandatory) *</label>
                    <textarea
                      value={adminReason}
                      onChange={(e) => setAdminReason(e.target.value)}
                      required
                      rows={3}
                      placeholder="Explain required artwork/audio revisions or reason for rejection respectfully..."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                )}

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewModalOpen(false)}
                    className="px-4 py-2 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg"
                  >
                    Save Decision & Dispatch 48h Artist Popup
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
