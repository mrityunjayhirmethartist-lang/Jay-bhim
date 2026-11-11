import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Disc3,
  CreditCard,
  MessageSquare,
  FileSearch,
  Settings,
  LogOut,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Ban,
  RefreshCw,
  Eye,
  Send,
  Shield,
  Lock,
  Megaphone,
  RotateCcw,
  FileText
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { apiUrl } from '../utils/api';
import { SuperAdminAiReviewCenter, SuperAdminAiSettings } from '../components/admin/SuperAdminAiCenter';
import { Sparkles, Sliders } from 'lucide-react';

type AdminTab =
  | 'overview'
  | 'ai-review'
  | 'ai-settings'
  | 'users'
  | 'kyc'
  | 'releases'
  | 'payments'
  | 'support'
  | 'audit'
  | 'settings';

export const SuperAdminDashboardPage: React.FC = () => {
  const { user, token, logout } = useAuth();
  const { navigate } = useRouter();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Overview state
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [charts, setCharts] = useState<any>({
    userGrowth: [],
    revenueTrend: [],
    releaseStatusBreakdown: [],
    platformActivity: []
  });

  // Users state
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [userDateFrom, setUserDateFrom] = useState('');
  const [userDateTo, setUserDateTo] = useState('');
  const [inspectedUser, setInspectedUser] = useState<any | null>(null);

  // Status confirmation modal
  const [statusModal, setStatusModal] = useState<{
    userId: string;
    email: string;
    action: 'suspend' | 'reactivate' | 'terminate';
  } | null>(null);
  const [statusReason, setStatusReason] = useState('');

  // KYC state
  const [kycRecords, setKycRecords] = useState<any[]>([]);
  const [kycStatusFilter, setKycStatusFilter] = useState('all');
  const [inspectedKyc, setInspectedKyc] = useState<any | null>(null);
  const [kycDocPreviews, setKycDocPreviews] = useState<Record<string, string>>({});
  const [kycActionModal, setKycActionModal] = useState<{
    userId: string;
    email: string;
    decision: 'approve' | 'reject' | 'request_reupload';
  } | null>(null);
  const [kycActionReason, setKycActionReason] = useState('');

  // Releases state
  const [releasesList, setReleasesList] = useState<any[]>([]);
  const [releaseSearch, setReleaseSearch] = useState('');
  const [releaseStatusFilter, setReleaseStatusFilter] = useState('all');
  const [inspectedRelease, setInspectedRelease] = useState<any | null>(null);
  const [releaseReviewAction, setReleaseReviewAction] = useState<{
    id: string;
    title: string;
    action: 'approve' | 'reject' | 'request_corrections';
  } | null>(null);
  const [releaseReviewReason, setReleaseReviewReason] = useState('');

  // Payments state
  const [orders, setOrders] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<any>({});
  const [refundModal, setRefundModal] = useState<any | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundRevokeSub, setRefundRevokeSub] = useState(true);
  const [invoiceModal, setInvoiceModal] = useState<any | null>(null);

  // Support state
  const [supportData, setSupportData] = useState<{ tickets: any[]; contacts: any[]; feedbacks: any[] }>({
    tickets: [],
    contacts: [],
    feedbacks: []
  });
  const [replyModal, setReplyModal] = useState<{
    id: string;
    sourceType: 'ticket' | 'contact' | 'feedback';
    title: string;
  } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<'Open' | 'Pending' | 'Resolved'>('Resolved');

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditSearch, setAuditSearch] = useState('');

  // Settings state
  const [settings, setSettings] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [new2faPin, setNew2faPin] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');

  const showToast = (type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  };

  const authFetch = useCallback(
    async (endpoint: string, init?: RequestInit) => {
      const res = await fetch(apiUrl(endpoint), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {})
        }
      });
      if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          logout();
          navigate('/super-admin/login');
        }
        throw new Error(data.error || 'Access denied.');
      }
      return res;
    },
    [token, logout, navigate]
  );

  const loadTabData = useCallback(
    async (tab: AdminTab) => {
      if (!token) return;
      setLoading(true);
      try {
        if (tab === 'overview') {
          const res = await authFetch('/api/super-admin/overview');
          const data = await res.json();
          if (res.ok) {
            setKpis(data.kpis || {});
            setCharts(data.charts || {});
          }
        } else if (tab === 'users') {
          const params = new URLSearchParams();
          if (userSearch) params.set('q', userSearch);
          if (userStatusFilter !== 'all') params.set('status', userStatusFilter);
          if (userDateFrom) params.set('dateFrom', userDateFrom);
          if (userDateTo) params.set('dateTo', userDateTo);
          const res = await authFetch(`/api/super-admin/users?${params.toString()}`);
          const data = await res.json();
          if (res.ok) setUsersList(data.users || []);
        } else if (tab === 'kyc') {
          const params = new URLSearchParams();
          if (kycStatusFilter !== 'all') params.set('status', kycStatusFilter);
          const res = await authFetch(`/api/super-admin/kyc?${params.toString()}`);
          const data = await res.json();
          if (res.ok) setKycRecords(data.records || []);
        } else if (tab === 'releases') {
          const params = new URLSearchParams();
          if (releaseSearch) params.set('q', releaseSearch);
          if (releaseStatusFilter !== 'all') params.set('status', releaseStatusFilter);
          const res = await authFetch(`/api/super-admin/releases?${params.toString()}`);
          const data = await res.json();
          if (res.ok) setReleasesList(data.releases || []);
        } else if (tab === 'payments') {
          const res = await authFetch('/api/super-admin/payments');
          const data = await res.json();
          if (res.ok) {
            setOrders(data.orders || []);
            setSubscriptions(data.subscriptions || []);
            setPaymentSummary(data.summary || {});
          }
        } else if (tab === 'support') {
          const res = await authFetch('/api/super-admin/support');
          const data = await res.json();
          if (res.ok) {
            setSupportData({
              tickets: data.tickets || [],
              contacts: data.contacts || [],
              feedbacks: data.feedbacks || []
            });
          }
        } else if (tab === 'audit') {
          const params = new URLSearchParams();
          if (auditSearch) params.set('q', auditSearch);
          const res = await authFetch(`/api/super-admin/audit-logs?${params.toString()}`);
          const data = await res.json();
          if (res.ok) setAuditLogs(data.logs || []);
        } else if (tab === 'settings') {
          const res = await authFetch('/api/super-admin/settings');
          const data = await res.json();
          if (res.ok) {
            setSettings(data.settings);
            setPlans(data.plans || []);
          }
        }
      } catch (err: any) {
        showToast('err', err.message || 'Failed to load data.');
      } finally {
        setLoading(false);
      }
    },
    [
      token,
      authFetch,
      userSearch,
      userStatusFilter,
      userDateFrom,
      userDateTo,
      kycStatusFilter,
      releaseSearch,
      releaseStatusFilter,
      auditSearch
    ]
  );

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  // Load private KYC document blobs with Bearer auth when inspecting KYC
  const openKycInspector = async (record: any) => {
    setInspectedKyc(record);
    setKycDocPreviews({});
    const k = record.kyc || {};
    const docFields = [
      { key: 'aadhaarFront', fileId: k.aadhaarFrontFileId },
      { key: 'aadhaarBack', fileId: k.aadhaarBackFileId },
      { key: 'panCard', fileId: k.panCardFileId },
      { key: 'profilePhoto', fileId: k.profilePhotoFileId }
    ];
    for (const d of docFields) {
      if (!d.fileId) continue;
      try {
        const res = await fetch(apiUrl(`/api/super-admin/kyc/document/${d.fileId}`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setKycDocPreviews(prev => ({ ...prev, [d.key]: url }));
        }
      } catch {
        // Ignore individual preview load errors
      }
    }
  };

  const inspectUserDetail = async (userId: string) => {
    try {
      const res = await authFetch(`/api/super-admin/users/${userId}`);
      const data = await res.json();
      if (res.ok) setInspectedUser(data);
    } catch (err: any) {
      showToast('err', err.message || 'Unable to load user details.');
    }
  };

  const handleStatusConfirm = async () => {
    if (!statusModal) return;
    if ((statusModal.action === 'suspend' || statusModal.action === 'terminate') && !statusReason.trim()) {
      showToast('err', 'Please provide a mandatory reason.');
      return;
    }
    try {
      const res = await authFetch(`/api/super-admin/users/${statusModal.userId}/status`, {
        method: 'POST',
        body: JSON.stringify({
          action: statusModal.action,
          reason: statusReason.trim(),
          forceReactivate: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed.');
      showToast('ok', `Account ${statusModal.email} updated to ${data.accountStatus}.`);
      setStatusModal(null);
      setStatusReason('');
      loadTabData('users');
      if (inspectedUser?.user?.id === statusModal.userId) {
        inspectUserDetail(statusModal.userId);
      }
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const handleKycReviewConfirm = async () => {
    if (!kycActionModal) return;
    if (
      (kycActionModal.decision === 'reject' || kycActionModal.decision === 'request_reupload') &&
      !kycActionReason.trim()
    ) {
      showToast('err', 'A reason is required for rejection or re-upload request.');
      return;
    }
    try {
      const res = await authFetch(`/api/super-admin/kyc/${kycActionModal.userId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision: kycActionModal.decision,
          reason: kycActionReason.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'KYC review failed.');
      showToast('ok', `KYC updated to ${data.kyc.status} for ${kycActionModal.email}.`);
      setKycActionModal(null);
      setKycActionReason('');
      setInspectedKyc(null);
      loadTabData('kyc');
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const handleReleaseReviewConfirm = async () => {
    if (!releaseReviewAction) return;
    if (
      (releaseReviewAction.action === 'reject' || releaseReviewAction.action === 'request_corrections') &&
      !releaseReviewReason.trim()
    ) {
      showToast('err', 'Please provide a clear reason.');
      return;
    }
    try {
      const res = await authFetch(`/api/super-admin/releases/${releaseReviewAction.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          action: releaseReviewAction.action,
          reason: releaseReviewReason.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Release review failed.');
      showToast('ok', `Release "${releaseReviewAction.title}" marked as ${data.release.status}.`);
      setReleaseReviewAction(null);
      setReleaseReviewReason('');
      setInspectedRelease(null);
      loadTabData('releases');
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const handleRefundConfirm = async () => {
    if (!refundModal) return;
    try {
      const res = await authFetch(`/api/super-admin/payments/${refundModal.orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          reason: refundReason.trim() || 'Refunded by Super Admin',
          revokeSubscription: refundRevokeSub
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refund failed.');
      showToast('ok', `Order ${refundModal.orderId} marked as refunded.`);
      setRefundModal(null);
      setRefundReason('');
      loadTabData('payments');
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const handleSupportReplyConfirm = async () => {
    if (!replyModal || !replyText.trim()) return;
    try {
      const res = await authFetch(`/api/super-admin/support/${replyModal.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({
          sourceType: replyModal.sourceType,
          status: replyStatus,
          response: replyText.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send response.');
      showToast('ok', 'Response recorded and status updated.');
      setReplyModal(null);
      setReplyText('');
      loadTabData('support');
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    try {
      const res = await authFetch('/api/super-admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...settings,
          ...(new2faPin.trim().length >= 4 ? { newAdminTwoFactorPin: new2faPin.trim() } : {}),
          planUpdates: plans.map(p => ({ id: p.id, name: p.name, priceINR: Number(p.priceINR) }))
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings.');
      setSettings(data.settings);
      setPlans(data.plans || []);
      setNew2faPin('');
      showToast('ok', 'Platform settings & pricing updated.');
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
    try {
      const res = await authFetch('/api/super-admin/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify({ title: broadcastTitle, message: broadcastMessage })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Broadcast failed.');
      showToast('ok', `Broadcast delivered to ${data.deliveredCount} active users.`);
      setBroadcastTitle('');
      setBroadcastMessage('');
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview & Analytics', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'ai-review', label: 'AI Review Center', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'ai-settings', label: 'AI Configuration', icon: <Sliders className="w-4 h-4" /> },
    { id: 'users', label: 'User Management', icon: <Users className="w-4 h-4" /> },
    { id: 'kyc', label: 'KYC Verification', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'releases', label: 'Release Management', icon: <Disc3 className="w-4 h-4" /> },
    { id: 'payments', label: 'Payments & Plans', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'support', label: 'Reviews & Support', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit & Security Logs', icon: <FileSearch className="w-4 h-4" /> },
    { id: 'settings', label: 'Platform Settings', icon: <Settings className="w-4 h-4" /> }
  ];

  const kpiCards = [
    { label: 'Total Registered Users', value: kpis.totalRegisteredUsers ?? 0 },
    { label: 'Active Users', value: kpis.activeUsers ?? 0 },
    { label: 'Pending KYC Verification', value: kpis.pendingKycVerification ?? 0, accent: 'gold' },
    { label: 'Approved Profiles', value: kpis.approvedProfiles ?? 0 },
    { label: 'Rejected Profiles', value: kpis.rejectedProfiles ?? 0 },
    { label: 'Suspended Users', value: kpis.suspendedUsers ?? 0 },
    { label: 'Terminated Accounts', value: kpis.terminatedAccounts ?? 0 },
    { label: 'Total Releases', value: kpis.totalReleases ?? 0 },
    { label: 'Pending Release Reviews', value: kpis.pendingReleaseReviews ?? 0, accent: 'gold' },
    { label: 'Approved Releases', value: kpis.approvedReleases ?? 0 },
    { label: 'Rejected Releases', value: kpis.rejectedReleases ?? 0 },
    { label: 'Active Subscriptions', value: kpis.activeSubscriptions ?? 0 },
    { label: 'Total Payments', value: kpis.totalPayments ?? 0 },
    { label: 'Successful Payments', value: kpis.successfulPayments ?? 0 },
    { label: 'Failed Payments', value: kpis.failedPayments ?? 0 },
    { label: 'Total Revenue', value: `₹${Number(kpis.totalRevenue ?? 0).toLocaleString('en-IN')}`, accent: 'gold' }
  ];

  return (
    <div className="min-h-screen bg-[#050507] text-slate-100 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-[#090a0f] border-b lg:border-b-0 lg:border-r border-[#d4af37]/20 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-5 border-b border-[#d4af37]/20 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#14120b] border border-[#d4af37]/50 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#d4af37]" />
            </div>
            <div>
              <p className="text-xs font-bold tracking-wide text-[#f0cf65] uppercase">Rudraatma</p>
              <p className="text-[11px] font-mono text-slate-400">SUPER_ADMIN</p>
            </div>
          </div>

          <nav className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-1">
            {navItems.map(item => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition text-left ${
                    active
                      ? 'bg-[#d4af37]/15 text-[#f0cf65] border border-[#d4af37]/40'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className={active ? 'text-[#d4af37]' : 'text-slate-500'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#d4af37]/15 space-y-3">
          <div className="text-[11px] text-slate-400 truncate">
            <span className="block text-[#d4af37] font-semibold">Executive Session</span>
            {user?.email}
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/super-admin/login');
            }}
            className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-red-950/50 border border-slate-800 hover:border-red-700/50 text-xs text-slate-300 hover:text-red-200 flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-5 lg:p-8 space-y-6 overflow-y-auto">
        <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h1 className="text-xl font-bold text-white font-display">
              {navItems.find(n => n.id === activeTab)?.label}
            </h1>
            <p className="text-xs text-slate-400">
              Rudraatma Music Distribution · Platform Governance & Operations
            </p>
          </div>
          <button
            onClick={() => loadTabData(activeTab)}
            className="px-3.5 py-2 rounded-xl bg-[#0b0c10] border border-[#d4af37]/30 hover:border-[#d4af37] text-xs text-[#f0cf65] flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        {toast && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              toast.type === 'ok'
                ? 'bg-emerald-950/60 border-emerald-700/50 text-emerald-200'
                : 'bg-red-950/60 border-red-700/50 text-red-200'
            }`}
          >
            <span>{toast.text}</span>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white ml-4">
              Dismiss
            </button>
          </div>
        )}

        {/* ==================== 1. OVERVIEW & ANALYTICS ==================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-3.5">
              {kpiCards.map(card => (
                <div
                  key={card.label}
                  className={`p-4 rounded-xl bg-[#0b0c10] border ${
                    card.accent === 'gold' ? 'border-[#d4af37]/40' : 'border-slate-800/90'
                  }`}
                >
                  <p className="text-[11px] text-slate-400 mb-1.5">{card.label}</p>
                  <p
                    className={`text-2xl font-bold font-mono tabular-nums ${
                      card.accent === 'gold' ? 'text-[#f0cf65]' : 'text-white'
                    }`}
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {/* User Growth Chart */}
              <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                <h3 className="text-sm font-semibold text-white mb-4">User Growth Trajectory</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={charts.userGrowth || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0c10', borderColor: '#d4af37', fontSize: 12 }} />
                      <Area type="monotone" dataKey="totalUsers" stroke="#d4af37" fill="#d4af37" fillOpacity={0.18} name="Total Users" />
                      <Area type="monotone" dataKey="newUsers" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.12} name="New Signups" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Revenue & Releases Trend */}
              <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                <h3 className="text-sm font-semibold text-white mb-4">Monthly Revenue (INR) & Releases</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.revenueTrend || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0c10', borderColor: '#d4af37', fontSize: 12 }} />
                      <Bar dataKey="revenue" fill="#d4af37" radius={[4, 4, 0, 0]} name="Revenue (₹)" />
                      <Bar dataKey="releases" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Releases" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Release Status Breakdown */}
              <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                <h3 className="text-sm font-semibold text-white mb-4">Catalog Release Status</h3>
                <div className="h-64 flex items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts.releaseStatusBreakdown || []}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={84}
                        paddingAngle={3}
                      >
                        {(charts.releaseStatusBreakdown || []).map((entry: any, idx: number) => (
                          <Cell key={idx} fill={entry.color || '#d4af37'} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#0b0c10', borderColor: '#d4af37', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 7-Day Platform Activity */}
              <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                <h3 className="text-sm font-semibold text-white mb-4">7-Day Platform Activity</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.platformActivity || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0c10', borderColor: '#d4af37', fontSize: 12 }} />
                      <Bar dataKey="adminActions" fill="#d4af37" name="Admin Actions" />
                      <Bar dataKey="releases" fill="#10b981" name="Releases" />
                      <Bar dataKey="payments" fill="#f59e0b" name="Payments" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 2. USER MANAGEMENT ==================== */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#0b0c10] border border-slate-800/90 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Search by name, email, or user ID..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
                />
              </div>
              <select
                value={userStatusFilter}
                onChange={e => setUserStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="terminated">Terminated</option>
              </select>
              <input
                type="date"
                value={userDateFrom}
                onChange={e => setUserDateFrom(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
                title="Registered From"
              />
              <input
                type="date"
                value={userDateTo}
                onChange={e => setUserDateTo(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
                title="Registered To"
              />
            </div>

            <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4 font-medium">User</th>
                    <th className="py-3 px-4 font-medium">Completion</th>
                    <th className="py-3 px-4 font-medium">KYC</th>
                    <th className="py-3 px-4 font-medium">Plan</th>
                    <th className="py-3 px-4 font-medium">Releases</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {usersList.map(u => (
                    <tr key={u.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{u.fullName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#f0cf65]">{u.profileCompletion}%</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            u.kycStatus === 'Approved'
                              ? 'bg-emerald-950 text-emerald-300'
                              : u.kycStatus === 'Pending'
                                ? 'bg-amber-950 text-amber-300'
                                : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {u.kycStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{u.planName}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-300">{u.releasesCount}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                            u.accountStatus === 'active'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : u.accountStatus === 'suspended'
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-red-500/15 text-red-300'
                          }`}
                        >
                          {u.accountStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => inspectUserDetail(u.id)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Inspect
                        </button>
                        {u.accountStatus === 'active' && (
                          <button
                            onClick={() => setStatusModal({ userId: u.id, email: u.email, action: 'suspend' })}
                            className="px-2.5 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-700/40"
                          >
                            Suspend
                          </button>
                        )}
                        {u.accountStatus !== 'active' && (
                          <button
                            onClick={() => setStatusModal({ userId: u.id, email: u.email, action: 'reactivate' })}
                            className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/40"
                          >
                            Reactivate
                          </button>
                        )}
                        {u.accountStatus !== 'terminated' && (
                          <button
                            onClick={() => setStatusModal({ userId: u.id, email: u.email, action: 'terminate' })}
                            className="px-2.5 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-700/40"
                          >
                            Terminate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {usersList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        No users match your current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 3. KYC VERIFICATION ==================== */}
        {activeTab === 'kyc' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <select
                value={kycStatusFilter}
                onChange={e => setKycStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#0b0c10] border border-slate-800 text-xs text-white"
              >
                <option value="all">All Submitted KYCs</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="reupload required">Reupload Required</option>
              </select>
            </div>

            <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4">Applicant</th>
                    <th className="py-3 px-4">Legal Name</th>
                    <th className="py-3 px-4">Mobile / PAN</th>
                    <th className="py-3 px-4">Submitted</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {kycRecords.map(rec => (
                    <tr key={rec.userId} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{rec.fullName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{rec.email}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-200">{rec.kyc?.fullLegalName || '—'}</td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {rec.kyc?.mobileNumber || '—'}
                        {rec.kyc?.panNumber ? ` · ${rec.kyc.panNumber}` : ''}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {rec.kyc?.submittedAt ? new Date(rec.kyc.submittedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            rec.kyc?.status === 'Approved'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : rec.kyc?.status === 'Pending'
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-red-500/15 text-red-300'
                          }`}
                        >
                          {rec.kyc?.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openKycInspector(rec)}
                          className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] hover:bg-[#d4af37]/25 font-medium"
                        >
                          Verify Documents
                        </button>
                      </td>
                    </tr>
                  ))}
                  {kycRecords.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        No KYC submissions found for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 4. RELEASE MANAGEMENT ==================== */}
        {activeTab === 'releases' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#0b0c10] border border-slate-800/90 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={releaseSearch}
                  onChange={e => setReleaseSearch(e.target.value)}
                  placeholder="Search by release title, artist, UPC, or owner email..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
                />
              </div>
              <select
                value={releaseStatusFilter}
                onChange={e => setReleaseStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
              >
                <option value="all">All Releases</option>
                <option value="submitted">Submitted</option>
                <option value="under review">Under Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="action required">Action Required</option>
              </select>
            </div>

            <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4">Release</th>
                    <th className="py-3 px-4">Owner</th>
                    <th className="py-3 px-4">UPC / Tracks</th>
                    <th className="py-3 px-4">Release Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {releasesList.map(r => (
                    <tr key={r.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{r.title}</div>
                        <div className="text-[11px] text-slate-400">
                          {r.artist} · {r.type} · {r.primaryGenre}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{r.ownerName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{r.ownerEmail}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {r.upc || 'Pending'} · {r.tracks?.length || 0} trk
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">{r.releaseDate}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            r.status === 'Approved' || r.status === 'Live'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : r.status === 'Rejected'
                                ? 'bg-red-500/15 text-red-300'
                                : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setInspectedRelease(r)}
                          className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] hover:bg-[#d4af37]/25"
                        >
                          Inspect & Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {releasesList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        No releases match your filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 5. PAYMENTS & SUBSCRIPTIONS ==================== */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              {[
                { label: 'Total Orders', value: paymentSummary.totalOrders ?? 0 },
                { label: 'Paid Orders', value: paymentSummary.paidOrders ?? 0 },
                { label: 'Failed / Cancelled', value: paymentSummary.failedOrders ?? 0 },
                { label: 'Refunded', value: paymentSummary.refundedOrders ?? 0 },
                { label: 'Total Revenue', value: `₹${Number(paymentSummary.totalRevenue ?? 0).toLocaleString('en-IN')}` }
              ].map(s => (
                <div key={s.label} className="p-4 rounded-xl bg-[#0b0c10] border border-slate-800">
                  <p className="text-[11px] text-slate-400">{s.label}</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-[#f0cf65] mt-1">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Razorpay Transactions</h3>
                <span className="text-[11px] text-slate-500 font-mono">Keys isolated server-side</span>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4">Order / Payment ID</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {orders.map(o => (
                    <tr key={o.orderId} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-mono">
                        <div className="text-white">{o.orderId}</div>
                        <div className="text-[11px] text-slate-500">{o.paymentId || o.failureReason || '—'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{o.userName}</div>
                        <div className="text-[11px] text-slate-500">{o.userEmail}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{o.planName}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#f0cf65]">₹{o.amount}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                            o.status === 'paid'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : o.status === 'refunded'
                                ? 'bg-blue-500/15 text-blue-300'
                                : 'bg-red-500/15 text-red-300'
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => setInvoiceModal(o)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1"
                        >
                          <FileText className="w-3 h-3" /> Invoice
                        </button>
                        {o.status === 'paid' && (
                          <button
                            onClick={() => setRefundModal(o)}
                            className="px-2.5 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-700/40 inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" /> Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        No payment orders recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
              <div className="p-4 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white">User Subscriptions</h3>
              </div>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Billing</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Expires / Renews</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {subscriptions.map((s, idx) => (
                    <tr key={idx}>
                      <td className="py-3 px-4">
                        <div className="text-white">{s.userName}</div>
                        <div className="text-[11px] text-slate-500">{s.userEmail}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-200">{s.planName}</td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        ₹{s.amount} / {s.billingFrequency}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[#f0cf65] uppercase text-[11px]">
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {(s.expiresAt || s.renewsAt || '—').slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 6. REVIEWS & SUPPORT ==================== */}
        {activeTab === 'support' && (
          <div className="space-y-6">
            {[
              { title: 'Artist Support Tickets', items: supportData.tickets, sourceType: 'ticket' as const },
              { title: 'Contact & Complaint Inquiries', items: supportData.contacts, sourceType: 'contact' as const },
              { title: 'User Reviews & Feedback', items: supportData.feedbacks, sourceType: 'feedback' as const }
            ].map(section => (
              <div key={section.title} className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">{section.title} ({section.items.length})</h3>
                {section.items.length === 0 ? (
                  <p className="text-xs text-slate-500">No entries in this queue.</p>
                ) : (
                  <div className="space-y-2.5">
                    {section.items.map((item: any) => (
                      <div key={item.id} className="p-4 rounded-xl bg-[#050507] border border-slate-800 flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1 max-w-2xl">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">
                              {item.subject || item.name || 'Inquiry'}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-[#f0cf65] uppercase">
                              {item.status || 'Open'}
                            </span>
                            {item.rating && (
                              <span className="text-[11px] font-mono text-amber-400">
                                Rating: {item.rating}/5
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {item.userEmail || item.email} · {item.category || item.role || 'General'}
                          </p>
                          <p className="text-xs text-slate-300">
                            {item.message || item.feedback || item.messages?.[0]?.text || ''}
                          </p>
                          {item.adminResponse && (
                            <p className="text-xs text-emerald-300 mt-1">
                              Admin Response: {item.adminResponse}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setReplyModal({
                              id: item.id,
                              sourceType: section.sourceType,
                              title: item.subject || item.name || item.id
                            });
                            setReplyText(item.adminResponse || '');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-xs text-[#f0cf65] hover:bg-[#d4af37]/25"
                        >
                          Respond & Resolve
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ==================== 7. AUDIT & SECURITY LOGS ==================== */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#0b0c10] border border-slate-800/90 flex items-center gap-3">
              <Search className="w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                placeholder="Filter audit logs by actor email, action, or details..."
                className="flex-1 bg-transparent text-xs text-white focus:outline-none"
              />
            </div>

            <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-300">
                        {log.actorEmail}
                        <span className="ml-2 text-[10px] text-[#d4af37]">({log.actorRole})</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[#f0cf65] whitespace-nowrap">{log.action}</td>
                      <td className="py-2.5 px-4 text-slate-300">{log.details}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-500">
                        No audit entries recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 8. PLATFORM SETTINGS & BROADCASTS ==================== */}
        {activeTab === 'settings' && settings && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-5">
              <h3 className="text-sm font-semibold text-white">Service Availability & Maintenance</h3>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#050507] border border-slate-800">
                <div>
                  <p className="text-xs font-semibold text-white">Maintenance Mode</p>
                  <p className="text-[11px] text-slate-400">Display platform-wide maintenance notice</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings.maintenanceMode)}
                  onChange={e => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                  className="w-4 h-4 accent-[#d4af37]"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Website Announcement Banner</label>
                <input
                  type="text"
                  value={settings.websiteAnnouncement || ''}
                  onChange={e => setSettings({ ...settings, websiteAnnouncement: e.target.value })}
                  placeholder="Optional global announcement shown to users..."
                  className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-300">Module Toggles</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(settings.services || {}).map(([key, val]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#050507] border border-slate-800 text-xs text-slate-200"
                    >
                      <span className="capitalize">{key}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(val)}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            services: { ...settings.services, [key]: e.target.checked }
                          })
                        }
                        className="accent-[#d4af37]"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#050507] border border-[#d4af37]/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#f0cf65] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" /> Optional Super Admin 2FA PIN
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Require an extra security PIN on Super Admin login (no email OTP)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(settings.adminTwoFactorEnabled)}
                    onChange={e => setSettings({ ...settings, adminTwoFactorEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[#d4af37]"
                  />
                </div>
                <input
                  type="password"
                  value={new2faPin}
                  onChange={e => setNew2faPin(e.target.value)}
                  placeholder="Set or update 4+ digit 2FA PIN"
                  className="w-full px-3 py-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-xs text-white font-mono"
                />
              </div>

              <button
                onClick={handleSaveSettings}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b8891b] text-black font-bold text-xs"
              >
                Save Platform Settings & Pricing
              </button>
            </div>

            <div className="space-y-6">
              {/* Plan Pricing Editor */}
              <div className="p-6 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-3">
                <h3 className="text-sm font-semibold text-white">Subscription Plans & Pricing (INR)</h3>
                <div className="space-y-2.5">
                  {plans.map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#050507] border border-slate-800">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono">{p.id} · {p.type}</p>
                      </div>
                      <input
                        type="number"
                        value={p.priceINR}
                        onChange={e => {
                          const next = [...plans];
                          next[idx] = { ...p, priceINR: Number(e.target.value) };
                          setPlans(next);
                        }}
                        className="w-28 px-2.5 py-1.5 rounded-lg bg-[#0b0c10] border border-slate-700 text-xs text-[#f0cf65] font-mono text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Platform Broadcast */}
              <form onSubmit={handleBroadcast} className="p-6 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[#d4af37]" /> Broadcast User Notification
                </h3>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={e => setBroadcastTitle(e.target.value)}
                  placeholder="Notification title..."
                  className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
                />
                <textarea
                  rows={3}
                  required
                  value={broadcastMessage}
                  onChange={e => setBroadcastMessage(e.target.value)}
                  placeholder="Message to all active artists & label managers..."
                  className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#d4af37]/20 border border-[#d4af37]/50 text-[#f0cf65] text-xs font-semibold inline-flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" /> Send Broadcast
                </button>
              </form>
            </div>
          </div>
        )}
        {/* ==================== 9. AI REVIEW CENTER ==================== */}
        {activeTab === 'ai-review' && (
          <SuperAdminAiReviewCenter token={token} showToast={showToast} />
        )}

        {/* ==================== 10. AI CONFIGURATION SETTINGS ==================== */}
        {activeTab === 'ai-settings' && (
          <SuperAdminAiSettings token={token} showToast={showToast} />
        )}
      </main>

      {/* ==================== MODALS ==================== */}

      {/* User Inspector Modal */}
      {inspectedUser && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[88vh] overflow-y-auto rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">{inspectedUser.user.fullName}</h3>
                <p className="text-xs font-mono text-slate-400">
                  {inspectedUser.user.email} · {inspectedUser.user.id} · Completion {inspectedUser.user.profileCompletion}%
                </p>
              </div>
              <button onClick={() => setInspectedUser(null)} className="text-xs text-slate-400 hover:text-white">
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                <p className="text-slate-400">Account Status</p>
                <p className="font-semibold text-[#f0cf65] uppercase mt-1">{inspectedUser.user.accountStatus}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                <p className="text-slate-400">KYC Status</p>
                <p className="font-semibold text-white mt-1">{inspectedUser.user.kyc?.status || 'Not Submitted'}</p>
              </div>
              <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                <p className="text-slate-400">Subscription</p>
                <p className="font-semibold text-white mt-1">
                  {inspectedUser.subscription?.planName || 'None'} ({inspectedUser.subscription?.status || 'none'})
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#f0cf65]">Releases ({inspectedUser.releases?.length || 0})</h4>
              <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs">
                {(inspectedUser.releases || []).map((r: any) => (
                  <div key={r.id} className="p-2.5 rounded-lg bg-[#050507] border border-slate-800 flex justify-between">
                    <span>{r.title} ({r.artist})</span>
                    <span className="font-mono text-slate-400">{r.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#f0cf65]">Payments ({inspectedUser.payments?.length || 0})</h4>
              <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs">
                {(inspectedUser.payments || []).map((p: any) => (
                  <div key={p.orderId} className="p-2.5 rounded-lg bg-[#050507] border border-slate-800 flex justify-between font-mono">
                    <span>{p.orderId} · {p.planName}</span>
                    <span>₹{p.amount} ({p.status})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Status Confirmation Modal */}
      {statusModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#0b0c10] border border-red-500/40 p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold uppercase tracking-wide">
                Confirm Account {statusModal.action}
              </h3>
            </div>
            <p className="text-xs text-slate-300">
              Target account: <span className="font-mono text-white">{statusModal.email}</span>.
              {statusModal.action !== 'reactivate' &&
                ' All active sessions will be revoked immediately and future logins blocked while preserving financial records.'}
            </p>
            <textarea
              rows={3}
              value={statusReason}
              onChange={e => setStatusReason(e.target.value)}
              placeholder="Mandatory administrative reason..."
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setStatusModal(null);
                  setStatusReason('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusConfirm}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white"
              >
                Confirm {statusModal.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC Verification Modal */}
      {inspectedKyc && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">KYC Verification · {inspectedKyc.fullName}</h3>
                <p className="text-xs font-mono text-slate-400">{inspectedKyc.email} · Private Audit-Logged Viewer</p>
              </div>
              <button onClick={() => setInspectedKyc(null)} className="text-xs text-slate-400 hover:text-white">
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                <span className="text-slate-400">Full Legal Name:</span>{' '}
                <span className="text-white font-semibold">{inspectedKyc.kyc?.fullLegalName}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                <span className="text-slate-400">Date of Birth:</span>{' '}
                <span className="text-white font-mono">{inspectedKyc.kyc?.dateOfBirth}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                <span className="text-slate-400">Mobile Number:</span>{' '}
                <span className="text-white font-mono">{inspectedKyc.kyc?.mobileNumber}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                <span className="text-slate-400">PAN / Aadhaar Last 4:</span>{' '}
                <span className="text-white font-mono">
                  {inspectedKyc.kyc?.panNumber || '—'} / {inspectedKyc.kyc?.aadhaarNumberLast4 || '—'}
                </span>
              </div>
              <div className="sm:col-span-2 p-3 rounded-xl bg-[#050507] border border-slate-800">
                <span className="text-slate-400">Address:</span>{' '}
                <span className="text-white">{inspectedKyc.kyc?.address}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'aadhaarFront', label: 'Aadhaar Front' },
                { key: 'aadhaarBack', label: 'Aadhaar Back' },
                { key: 'panCard', label: 'PAN Card' },
                { key: 'profilePhoto', label: 'Profile Photograph' }
              ].map(d => (
                <div key={d.key} className="p-3 rounded-xl bg-[#050507] border border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-[#f0cf65]">{d.label}</p>
                  {kycDocPreviews[d.key] ? (
                    <img src={kycDocPreviews[d.key]} alt={d.label} className="w-full h-44 object-contain rounded-lg bg-black" />
                  ) : (
                    <div className="h-24 flex items-center justify-center text-[11px] text-slate-500 border border-dashed border-slate-800 rounded-lg">
                      Not uploaded or preview loading
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                onClick={() =>
                  setKycActionModal({ userId: inspectedKyc.userId, email: inspectedKyc.email, decision: 'request_reupload' })
                }
                className="px-4 py-2 rounded-xl bg-amber-950/70 border border-amber-700/50 text-amber-300 text-xs font-semibold"
              >
                Request Re-upload
              </button>
              <button
                onClick={() =>
                  setKycActionModal({ userId: inspectedKyc.userId, email: inspectedKyc.email, decision: 'reject' })
                }
                className="px-4 py-2 rounded-xl bg-red-950/70 border border-red-700/50 text-red-300 text-xs font-semibold"
              >
                Reject KYC
              </button>
              <button
                onClick={() =>
                  setKycActionModal({ userId: inspectedKyc.userId, email: inspectedKyc.email, decision: 'approve' })
                }
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                Approve KYC & Unlock Services
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KYC Decision Modal */}
      {kycActionModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase">
              Confirm KYC {kycActionModal.decision.replace('_', ' ')}
            </h3>
            <p className="text-xs text-slate-300">Applicant: {kycActionModal.email}</p>
            {kycActionModal.decision !== 'approve' && (
              <textarea
                rows={3}
                value={kycActionReason}
                onChange={e => setKycActionReason(e.target.value)}
                placeholder="Reason for rejection or re-upload request..."
                className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
              />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setKycActionModal(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300">
                Cancel
              </button>
              <button onClick={handleKycReviewConfirm} className="px-4 py-2 rounded-xl bg-[#d4af37] text-black text-xs font-bold">
                Confirm Decision
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Inspector Modal */}
      {inspectedRelease && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[88vh] overflow-y-auto rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">{inspectedRelease.title}</h3>
                <p className="text-xs text-slate-400">
                  {inspectedRelease.artist} · Label: {inspectedRelease.label} · UPC: {inspectedRelease.upc || 'Pending'}
                </p>
              </div>
              <button onClick={() => setInspectedRelease(null)} className="text-xs text-slate-400 hover:text-white">
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {(inspectedRelease.artworkUrl || inspectedRelease.coverUrl) && (
                <img
                  src={inspectedRelease.artworkUrl || inspectedRelease.coverUrl}
                  alt={inspectedRelease.title}
                  className="w-40 h-40 object-cover rounded-xl border border-slate-800"
                />
              )}
              <div className="space-y-1.5 text-slate-300">
                <p><span className="text-slate-500">Copyright:</span> © {inspectedRelease.copyrightYear} {inspectedRelease.copyrightOwner}</p>
                <p><span className="text-slate-500">Recording Owner:</span> ℗ {inspectedRelease.recordingOwner}</p>
                <p><span className="text-slate-500">Territories:</span> {inspectedRelease.territories}</p>
                <p><span className="text-slate-500">Language / Genre:</span> {inspectedRelease.language} / {inspectedRelease.primaryGenre}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#f0cf65]">Tracks ({inspectedRelease.tracks?.length || 0})</h4>
              {(inspectedRelease.tracks || []).map((t: any, idx: number) => (
                <div key={idx} className="p-3 rounded-xl bg-[#050507] border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-semibold text-white">
                      {t.trackNumber}. {t.title} {t.explicit ? '[E]' : ''}
                    </span>
                    <span className="font-mono text-slate-400">ISRC: {t.isrc || 'Auto'}</span>
                  </div>
                  {t.audioFileUrl && (
                    <audio controls src={apiUrl(t.audioFileUrl)} className="w-full h-8" />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setReleaseReviewAction({ id: inspectedRelease.id, title: inspectedRelease.title, action: 'request_corrections' })}
                className="px-4 py-2 rounded-xl bg-amber-950/70 border border-amber-700/50 text-amber-300 text-xs font-semibold"
              >
                Request Corrections
              </button>
              <button
                onClick={() => setReleaseReviewAction({ id: inspectedRelease.id, title: inspectedRelease.title, action: 'reject' })}
                className="px-4 py-2 rounded-xl bg-red-950/70 border border-red-700/50 text-red-300 text-xs font-semibold"
              >
                Reject Release
              </button>
              <button
                onClick={() => setReleaseReviewAction({ id: inspectedRelease.id, title: inspectedRelease.title, action: 'approve' })}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                Approve Release
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Review Confirmation Modal */}
      {releaseReviewAction && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase">
              {releaseReviewAction.action.replace('_', ' ')} · {releaseReviewAction.title}
            </h3>
            {releaseReviewAction.action !== 'approve' && (
              <textarea
                rows={3}
                value={releaseReviewReason}
                onChange={e => setReleaseReviewReason(e.target.value)}
                placeholder="Reason or correction instructions for the artist..."
                className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
              />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setReleaseReviewAction(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300">
                Cancel
              </button>
              <button onClick={handleReleaseReviewConfirm} className="px-4 py-2 rounded-xl bg-[#d4af37] text-black text-xs font-bold">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Confirmation Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#0b0c10] border border-red-500/40 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Confirm Payment Refund</h3>
            <p className="text-xs text-slate-300 font-mono">
              Order: {refundModal.orderId} · ₹{refundModal.amount} ({refundModal.userEmail})
            </p>
            <textarea
              rows={2}
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
              placeholder="Refund reason..."
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
            />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={refundRevokeSub}
                onChange={e => setRefundRevokeSub(e.target.checked)}
                className="accent-[#d4af37]"
              />
              Revoke associated subscription plan
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRefundModal(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300">
                Cancel
              </button>
              <button onClick={handleRefundConfirm} className="px-4 py-2 rounded-xl bg-red-600 text-xs font-bold text-white">
                Process Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {invoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-[#f0cf65]">TAX INVOICE · RUDRAATMA MUSIC</h3>
              <button onClick={() => setInvoiceModal(null)} className="text-slate-400 hover:text-white">Close</button>
            </div>
            <div className="space-y-1.5 font-mono text-slate-300">
              <p>Invoice / Order ID: {invoiceModal.orderId}</p>
              <p>Payment ID: {invoiceModal.paymentId || 'N/A'}</p>
              <p>Customer: {invoiceModal.userName} ({invoiceModal.userEmail})</p>
              <p>Plan: {invoiceModal.planName}</p>
              <p>Amount: ₹{invoiceModal.amount} {invoiceModal.currency}</p>
              <p>Status: {invoiceModal.status.toUpperCase()}</p>
              <p>Date: {new Date(invoiceModal.paidAt || invoiceModal.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Support Reply Modal */}
      {replyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white">Respond · {replyModal.title}</h3>
            <select
              value={replyStatus}
              onChange={e => setReplyStatus(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
            >
              <option value="Open">Open</option>
              <option value="Pending">Pending</option>
              <option value="Resolved">Resolved</option>
            </select>
            <textarea
              rows={4}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Write official response..."
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReplyModal(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300">
                Cancel
              </button>
              <button onClick={handleSupportReplyConfirm} className="px-4 py-2 rounded-xl bg-[#d4af37] text-black text-xs font-bold">
                Send Response
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
