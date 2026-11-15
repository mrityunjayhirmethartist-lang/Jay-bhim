import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Search,
  AlertTriangle,
  RefreshCw,
  Eye,
  Send,
  Lock,
  Megaphone,
  RotateCcw,
  FileText,
  Menu,
  Sparkles,
  CheckCircle2,
  XCircle,
  Mail,
  CreditCard,
  HardDrive,
  ShieldCheck,
  UserCheck
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
import { RightAdminSidebar } from '../components/admin/RightAdminSidebar';
import { DataIntegrityBanner } from '../components/admin/DataIntegrityBanner';
import { AiExecutiveAssistant } from '../components/admin/AiExecutiveAssistant';
import {
  OwnerApprovalModal,
  OwnerApprovalsQueue,
  PlatformIntelligencePanel,
  ExecutiveReportsPanel,
  ExecutiveSessionModal
} from '../components/admin/CommandCenterViews';
import {
  ArtistOnboardingPanel,
  PromotionalProgramPanel,
  FinancialGovernancePanel,
  InfrastructurePanel
} from '../components/admin/OnboardingFinancePanels';
import {
  ADMIN_NAV_CATEGORIES,
  type AdminTab,
  type DataIntegrityMeta,
  type OwnerApprovalProposalInput,
  type ExecutiveSessionInfo
} from '../components/admin/adminTypes';

const PAGE_SIZE = 15;

export const SuperAdminDashboardPage: React.FC = () => {
  const { user, token, logout } = useAuth();
  const { navigate } = useRouter();

  // Navigation state (10 categories + 59 submenus)
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [activeSubmenu, setActiveSubmenu] = useState<string>('executive-overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global integrity & toast state
  const [loading, setLoading] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);
  const [integrity, setIntegrity] = useState<DataIntegrityMeta | null>(null);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [dataErrorMsg, setDataErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Command Center 2.0: Session, Intelligence, Approvals
  const [sessionInfo, setSessionInfo] = useState<ExecutiveSessionInfo | null>(null);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [intelligence, setIntelligence] = useState<any | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [pendingProposal, setPendingProposal] = useState<OwnerApprovalProposalInput | null>(null);
  const [executingApproval, setExecutingApproval] = useState(false);
  const [showApprovalsDrawer, setShowApprovalsDrawer] = useState(false);

  // Overview state
  const [kpis, setKpis] = useState<Record<string, number> | null>(null);
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
  const [userPage, setUserPage] = useState(1);
  const [inspectedUser, setInspectedUser] = useState<any | null>(null);

  // KYC state
  const [kycRecords, setKycRecords] = useState<any[]>([]);
  const [kycStatusFilter, setKycStatusFilter] = useState('all');
  const [inspectedKyc, setInspectedKyc] = useState<any | null>(null);
  const [kycDocPreviews, setKycDocPreviews] = useState<Record<string, string>>({});

  // Releases state
  const [releasesList, setReleasesList] = useState<any[]>([]);
  const [takedownsList, setTakedownsList] = useState<any[]>([]);
  const [releaseSearch, setReleaseSearch] = useState('');
  const [releaseStatusFilter, setReleaseStatusFilter] = useState('all');
  const [releasePage, setReleasePage] = useState(1);
  const [inspectedRelease, setInspectedRelease] = useState<any | null>(null);

  // Payments state
  const [orders, setOrders] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<any | null>(null);
  const [paymentPage, setPaymentPage] = useState(1);
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
    userEmail?: string;
    category?: string;
    body?: string;
  } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<'Open' | 'Pending' | 'Resolved'>('Resolved');
  const [draftingAiReply, setDraftingAiReply] = useState(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditPage, setAuditPage] = useState(1);

  // Settings state
  const [settings, setSettings] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [emailConfig, setEmailConfig] = useState<any>(null);
  const [gatewayConfig, setGatewayConfig] = useState<any>(null);
  const [emailTestResult, setEmailTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [new2faPin, setNew2faPin] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');

  const showToast = useCallback((type: 'ok' | 'err', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

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
      if (res.status === 401) {
        logout();
        navigate('/super-admin/login');
        throw new Error('Session expired. Please sign in again.');
      }
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Access denied.');
      }
      return res;
    },
    [token, logout, navigate]
  );

  // Load Session + Approvals + Intelligence
  const loadCommandCenterMeta = useCallback(async () => {
    if (!token) return;
    setIntelLoading(true);
    try {
      const [sessRes, appRes, intRes] = await Promise.all([
        authFetch('/api/super-admin/session'),
        authFetch('/api/super-admin/approvals'),
        authFetch(`/api/super-admin/intelligence?includeTest=${includeTest}`)
      ]);
      if (sessRes.ok) {
        const s = await sessRes.json();
        setSessionInfo(s.session || null);
      }
      if (appRes.ok) {
        const a = await appRes.json();
        setApprovals(a.approvals || []);
      }
      const iData = await intRes.json().catch(() => ({}));
      if (iData.intelligence) setIntelligence(iData.intelligence);
      if (iData.integrity) setIntegrity(iData.integrity);
      if (!intRes.ok || iData.dataUnavailable) {
        setDataUnavailable(true);
        setDataErrorMsg(iData.error || 'Database unavailable.');
      }
    } catch {
      // Handled per primary view
    } finally {
      setIntelLoading(false);
    }
  }, [token, includeTest, authFetch]);

  const loadTabData = useCallback(
    async (tab: AdminTab) => {
      if (!token) return;
      setLoading(true);
      try {
        if (tab === 'overview') {
          const res = await authFetch(`/api/super-admin/overview?includeTest=${includeTest}`);
          const data = await res.json();
          if (data._integrity) setIntegrity(data._integrity);
          if (!res.ok || data.dataUnavailable) {
            setDataUnavailable(true);
            setDataErrorMsg(data.error || 'Database unavailable for overview analytics.');
            setKpis(null);
            return;
          }
          setDataUnavailable(false);
          setDataErrorMsg(null);
          setKpis(data.kpis || {});
          setCharts(data.charts || {});
        } else if (tab === 'users') {
          const params = new URLSearchParams();
          params.set('includeTest', String(includeTest));
          if (userSearch) params.set('q', userSearch);
          if (userStatusFilter !== 'all') params.set('status', userStatusFilter);
          if (userDateFrom) params.set('dateFrom', userDateFrom);
          if (userDateTo) params.set('dateTo', userDateTo);
          const res = await authFetch(`/api/super-admin/users?${params.toString()}`);
          const data = await res.json();
          if (data._integrity) setIntegrity(data._integrity);
          if (!res.ok || data.dataUnavailable) {
            setDataUnavailable(true);
            setDataErrorMsg(data.error || 'Failed to load users.');
            return;
          }
          setDataUnavailable(false);
          setUsersList(data.users || []);
          setUserPage(1);
        } else if (tab === 'kyc') {
          const params = new URLSearchParams();
          params.set('includeTest', String(includeTest));
          if (kycStatusFilter !== 'all') params.set('status', kycStatusFilter);
          const res = await authFetch(`/api/super-admin/kyc?${params.toString()}`);
          const data = await res.json();
          if (data._integrity) setIntegrity(data._integrity);
          if (!res.ok || data.dataUnavailable) {
            setDataUnavailable(true);
            setDataErrorMsg(data.error || 'Failed to load KYC records.');
            return;
          }
          setDataUnavailable(false);
          setKycRecords(data.records || []);
        } else if (tab === 'releases') {
          const params = new URLSearchParams();
          params.set('includeTest', String(includeTest));
          if (releaseSearch) params.set('q', releaseSearch);
          if (releaseStatusFilter !== 'all') params.set('status', releaseStatusFilter);
          const res = await authFetch(`/api/super-admin/releases?${params.toString()}`);
          const data = await res.json();
          if (data._integrity) setIntegrity(data._integrity);
          if (!res.ok || data.dataUnavailable) {
            setDataUnavailable(true);
            setDataErrorMsg(data.error || 'Failed to load releases.');
            return;
          }
          setDataUnavailable(false);
          setReleasesList(data.releases || []);
          setTakedownsList(data.takedownRequests || []);
          setReleasePage(1);
        } else if (tab === 'payments') {
          const res = await authFetch(`/api/super-admin/payments?includeTest=${includeTest}`);
          const data = await res.json();
          if (data._integrity) setIntegrity(data._integrity);
          if (!res.ok || data.dataUnavailable) {
            setDataUnavailable(true);
            setDataErrorMsg(data.error || 'Failed to load payment records.');
            setPaymentSummary(null);
            return;
          }
          setDataUnavailable(false);
          setOrders(data.orders || []);
          setSubscriptions(data.subscriptions || []);
          setPaymentSummary(data.summary || {});
          setPaymentPage(1);
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
          if (data._integrity) setIntegrity(data._integrity);
          if (!res.ok || data.dataUnavailable) {
            setDataUnavailable(true);
            setDataErrorMsg(data.error || 'Failed to load audit logs.');
            return;
          }
          setDataUnavailable(false);
          setAuditLogs(data.logs || []);
          setAuditPage(1);
        } else if (tab === 'settings') {
          const res = await authFetch('/api/super-admin/settings');
          const data = await res.json();
          if (res.ok) {
            setSettings(data.settings);
            setPlans(data.plans || []);
            setEmailConfig(data.emailConfig || null);
            setGatewayConfig(data.gatewayConfig || null);
          }
        }
      } catch (err: any) {
        setDataUnavailable(true);
        setDataErrorMsg(err.message || 'Network or backend error.');
        showToast('err', err.message || 'Failed to load data.');
      } finally {
        setLoading(false);
      }
    },
    [
      token,
      includeTest,
      authFetch,
      userSearch,
      userStatusFilter,
      userDateFrom,
      userDateTo,
      kycStatusFilter,
      releaseSearch,
      releaseStatusFilter,
      auditSearch,
      showToast
    ]
  );

  useEffect(() => {
    loadCommandCenterMeta();
  }, [loadCommandCenterMeta]);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  // Synchronize submenu selection -> appropriate data filter
  const handleSelectNavigation = (tab: AdminTab, submenuId: string) => {
    setActiveTab(tab);
    setActiveSubmenu(submenuId);

    if (tab === 'users') {
      if (submenuId === 'suspended-accounts') setUserStatusFilter('suspended');
      else if (submenuId === 'terminated-accounts') setUserStatusFilter('terminated');
      else setUserStatusFilter('all');
    } else if (tab === 'kyc') {
      if (submenuId === 'pending-verification') setKycStatusFilter('pending');
      else if (submenuId === 'approved-kyc') setKycStatusFilter('approved');
      else if (submenuId === 'rejected-kyc') setKycStatusFilter('rejected');
      else setKycStatusFilter('all');
    } else if (tab === 'releases') {
      if (submenuId === 'pending-releases') setReleaseStatusFilter('pending');
      else if (submenuId === 'approved-releases') setReleaseStatusFilter('approved');
      else if (submenuId === 'rejected-releases') setReleaseStatusFilter('rejected');
      else if (submenuId === 'published-releases') setReleaseStatusFilter('published');
      else setReleaseStatusFilter('all');
    }
  };

  // ======================== 6-STEP OWNER APPROVAL EXECUTION ========================

  const handleConfirmAndExecuteProposal = async (reasonOverride: string) => {
    if (!pendingProposal) return;
    setExecutingApproval(true);
    try {
      // Step 1-4: Create formal approval proposal record in DB
      const propRes = await authFetch('/api/super-admin/approvals/propose', {
        method: 'POST',
        body: JSON.stringify({
          actionType: pendingProposal.actionType,
          targetType: pendingProposal.targetType,
          targetId: pendingProposal.targetId,
          title: pendingProposal.title,
          explanation: pendingProposal.explanation,
          consequences: pendingProposal.consequences,
          proposedChanges: pendingProposal.proposedChanges,
          payload: {
            ...pendingProposal.payload,
            ...(reasonOverride ? { reason: reasonOverride } : {})
          }
        })
      });
      const propData = await propRes.json();
      if (!propRes.ok) throw new Error(propData.error || 'Failed to register approval proposal.');

      // Step 5-6: Execute ONLY with explicit ownerConfirmed: true + immutable audit log
      const execRes = await authFetch(`/api/super-admin/approvals/${propData.approval.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          ownerConfirmed: true,
          ...(reasonOverride ? { reasonOverride } : {})
        })
      });
      const execData = await execRes.json();
      if (!execRes.ok) throw new Error(execData.error || 'Approval execution failed.');

      // Also apply plan price updates if SETTINGS_UPDATE included planUpdates
      if (
        pendingProposal.actionType === 'SETTINGS_UPDATE' &&
        Array.isArray(pendingProposal.payload?.planUpdates)
      ) {
        await authFetch('/api/super-admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            ...pendingProposal.payload.settings,
            ...(pendingProposal.payload.newAdminTwoFactorPin
              ? { newAdminTwoFactorPin: pendingProposal.payload.newAdminTwoFactorPin }
              : {}),
            planUpdates: pendingProposal.payload.planUpdates
          })
        });
      }

      showToast('ok', `Owner-approved action completed & logged: ${pendingProposal.title}`);
      setPendingProposal(null);
      setInspectedKyc(null);
      setInspectedRelease(null);
      await Promise.all([loadTabData(activeTab), loadCommandCenterMeta()]);
    } catch (err: any) {
      showToast('err', err.message);
    } finally {
      setExecutingApproval(false);
    }
  };

  const executeQueuedProposalById = async (proposalId: string) => {
    try {
      const execRes = await authFetch(`/api/super-admin/approvals/${proposalId}/execute`, {
        method: 'POST',
        body: JSON.stringify({ ownerConfirmed: true })
      });
      const data = await execRes.json();
      if (!execRes.ok) throw new Error(data.error || 'Execution failed.');
      showToast('ok', 'Queued proposal approved & executed.');
      await Promise.all([loadTabData(activeTab), loadCommandCenterMeta()]);
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const dismissQueuedProposalById = async (proposalId: string) => {
    try {
      const res = await authFetch(`/api/super-admin/approvals/${proposalId}/dismiss`, {
        method: 'POST'
      });
      if (res.ok) {
        showToast('ok', 'Proposal dismissed.');
        loadCommandCenterMeta();
      }
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  // KYC Document inspector
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
        // Ignore individual load failures
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

  const handleAiDraftSupportReply = async () => {
    if (!replyModal) return;
    setDraftingAiReply(true);
    try {
      const res = await authFetch(`/api/super-admin/support/${replyModal.id}/ai-suggest`, {
        method: 'POST',
        body: JSON.stringify({
          subject: replyModal.title,
          userEmail: replyModal.userEmail,
          category: replyModal.category,
          body: replyModal.body
        })
      });
      const data = await res.json();
      if (data.draft) {
        setReplyText(data.draft);
        showToast(
          'ok',
          data.aiStatus === 'CONNECTED'
            ? 'AI draft generated. Review carefully before sending.'
            : 'Generated template draft (Gemini API not configured).'
        );
      }
    } catch (err: any) {
      showToast('err', err.message);
    } finally {
      setDraftingAiReply(false);
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

  const handleTestEmailRelay = async () => {
    setTestingEmail(true);
    try {
      const res = await authFetch('/api/super-admin/test-smtp', { method: 'POST' });
      const data = await res.json();
      setEmailTestResult({
        ok: Boolean(data.connected),
        message: data.connected
          ? `Relay reachable (${data.method || 'HTTPS POST'}).`
          : data.error || 'Email relay diagnostic failed.'
      });
    } catch (err: any) {
      setEmailTestResult({ ok: false, message: err.message });
    } finally {
      setTestingEmail(false);
    }
  };

  const activeCategoryObj = ADMIN_NAV_CATEGORIES.find(c => c.id === activeTab);
  const activeSubmenuObj = activeCategoryObj?.submenus.find(s => s.id === activeSubmenu);
  const pendingApprovalsCount = approvals.filter(a => a.status === 'PENDING_OWNER_APPROVAL').length;

  // Derived submenu views
  const filteredUsers = useMemo(() => {
    if (activeTab !== 'users') return usersList;
    if (activeSubmenu === 'artist-accounts') return usersList.filter(u => u.role === 'artist');
    if (activeSubmenu === 'new-registrations') {
      const sevenDaysAgo = Date.now() - 7 * 86400000;
      return usersList.filter(u => new Date(u.createdAt).getTime() >= sevenDaysAgo);
    }
    return usersList;
  }, [usersList, activeTab, activeSubmenu]);

  const paginatedUsers = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);
  const paginatedReleases = releasesList.slice((releasePage - 1) * PAGE_SIZE, releasePage * PAGE_SIZE);

  const filteredOrders = useMemo(() => {
    if (activeSubmenu === 'failed-payments') {
      return orders.filter(o => o.status === 'failed' || o.status === 'cancelled');
    }
    if (activeSubmenu === 'refund-requests') {
      return orders.filter(o => o.status === 'refunded' || o.status === 'paid');
    }
    return orders;
  }, [orders, activeSubmenu]);
  const paginatedOrders = filteredOrders.slice((paymentPage - 1) * PAGE_SIZE, paymentPage * PAGE_SIZE);

  const filteredAuditLogs = useMemo(() => {
    if (activeTab !== 'audit') return auditLogs;
    if (activeSubmenu === 'login-history') {
      return auditLogs.filter(l => String(l.action || '').includes('LOGIN'));
    }
    if (activeSubmenu === 'security-events' || activeSubmenu === 'permission-changes') {
      return auditLogs.filter(l =>
        /USER_|KYC_|OWNER_|SETTINGS_|BOOTSTRAP|SECURITY/i.test(String(l.action || ''))
      );
    }
    return auditLogs;
  }, [auditLogs, activeTab, activeSubmenu]);
  const paginatedAuditLogs = filteredAuditLogs.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);

  const formatMetric = (val: number | undefined, isCurrency = false) => {
    if (dataUnavailable || !kpis) return 'Data Unavailable';
    const num = Number(val ?? 0);
    return isCurrency ? `₹${num.toLocaleString('en-IN')}` : num.toLocaleString('en-IN');
  };

  const kpiCards = [
    { label: 'Total Registered Users', value: formatMetric(kpis?.totalRegisteredUsers) },
    { label: 'Active Users', value: formatMetric(kpis?.activeUsers) },
    { label: 'Pending KYC Verification', value: formatMetric(kpis?.pendingKycVerification), accent: 'gold' },
    { label: 'Approved Profiles', value: formatMetric(kpis?.approvedProfiles) },
    { label: 'Rejected Profiles', value: formatMetric(kpis?.rejectedProfiles) },
    { label: 'Suspended Users', value: formatMetric(kpis?.suspendedUsers) },
    { label: 'Terminated Accounts', value: formatMetric(kpis?.terminatedAccounts) },
    { label: 'Total Releases', value: formatMetric(kpis?.totalReleases) },
    { label: 'Pending Release Reviews', value: formatMetric(kpis?.pendingReleaseReviews), accent: 'gold' },
    { label: 'Approved Releases', value: formatMetric(kpis?.approvedReleases) },
    { label: 'Published Releases', value: formatMetric(kpis?.publishedReleases) },
    { label: 'Rejected Releases', value: formatMetric(kpis?.rejectedReleases) },
    { label: 'Active Subscriptions', value: formatMetric(kpis?.activeSubscriptions) },
    { label: 'Successful Paid Orders', value: formatMetric(kpis?.successfulPayments) },
    { label: 'Failed / Pending Orders', value: dataUnavailable || !kpis ? 'Data Unavailable' : `${kpis.failedPayments ?? 0} / ${kpis.pendingPayments ?? 0}` },
    { label: 'Verified Paid Revenue', value: formatMetric(kpis?.totalRevenue, true), accent: 'gold' }
  ];

  return (
    <div className="min-h-screen bg-[#050507] text-slate-100 flex flex-row">
      {/* Main Content (Left/Center Workspace) */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto pb-24">
        <header className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#d4af37] uppercase tracking-wider">
              <span>{activeCategoryObj?.label}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300">{activeSubmenuObj?.label || activeSubmenu}</span>
            </div>
            <h1 className="text-xl font-bold text-white font-display mt-0.5">
              Rudraatma Command Center 2.0
            </h1>
            <p className="text-xs text-slate-400">
              Platform Governance · Absolute Database Integrity · Owner-Approved Execution
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSessionModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-[#0b0c10] border border-slate-800 hover:border-[#d4af37]/40 text-xs text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#d4af37]" />
              <span className="hidden sm:inline">Executive Session</span>
            </button>

            <button
              onClick={() => {
                loadTabData(activeTab);
                loadCommandCenterMeta();
              }}
              className="px-3.5 py-2 rounded-xl bg-[#0b0c10] border border-[#d4af37]/30 hover:border-[#d4af37] text-xs text-[#f0cf65] flex items-center gap-2 transition whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync Live DB
            </button>

            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden px-3 py-2 rounded-xl bg-[#0b0c10] border border-[#d4af37]/40 text-[#f0cf65] inline-flex items-center gap-1.5 text-xs"
              aria-label="Open right navigation drawer"
            >
              <Menu className="w-4 h-4" /> Menu
            </button>
          </div>
        </header>

        {/* Data Integrity Banner */}
        <DataIntegrityBanner
          integrity={integrity}
          dataUnavailable={dataUnavailable}
          errorMessage={dataErrorMsg}
          includeTest={includeTest}
          onToggleIncludeTest={() => setIncludeTest(v => !v)}
          pendingApprovalsCount={pendingApprovalsCount}
          onOpenApprovals={() => {
            setActiveTab('overview');
            setShowApprovalsDrawer(true);
          }}
        />

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
                    className={`text-xl sm:text-2xl font-bold font-mono tabular-nums ${
                      dataUnavailable
                        ? 'text-red-300 text-sm'
                        : card.accent === 'gold'
                          ? 'text-[#f0cf65]'
                          : 'text-white'
                    }`}
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Real-DB Charts */}
            {!dataUnavailable && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {(activeSubmenu === 'executive-overview' || activeSubmenu === 'user-analytics') && (
                  <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                    <h3 className="text-sm font-semibold text-white mb-4">
                      User Growth Trajectory (Database Verified)
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={charts.userGrowth || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                          <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#0b0c10', borderColor: '#d4af37', fontSize: 12 }} />
                          <Area type="monotone" dataKey="totalUsers" stroke="#d4af37" fill="#d4af37" fillOpacity={0.18} name="Total Users" />
                          <Area type="monotone" dataKey="newUsers" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.12} name="New Signups" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {(activeSubmenu === 'executive-overview' || activeSubmenu === 'revenue-analytics') && (
                  <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                    <h3 className="text-sm font-semibold text-white mb-4">
                      Verified Paid Revenue (INR) & Releases
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={charts.revenueTrend || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                          <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#0b0c10', borderColor: '#d4af37', fontSize: 12 }} />
                          <Bar dataKey="revenue" fill="#d4af37" radius={[4, 4, 0, 0]} name="Paid Revenue (₹)" />
                          <Bar dataKey="releases" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Releases" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {(activeSubmenu === 'executive-overview' || activeSubmenu === 'release-analytics') && (
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
                )}

                {(activeSubmenu === 'executive-overview' || activeSubmenu === 'platform-activity') && (
                  <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                    <h3 className="text-sm font-semibold text-white mb-4">7-Day Platform Activity</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={charts.platformActivity || []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
                          <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: '#0b0c10', borderColor: '#d4af37', fontSize: 12 }} />
                          <Bar dataKey="adminActions" fill="#d4af37" name="Admin Actions" />
                          <Bar dataKey="releases" fill="#10b981" name="Releases" />
                          <Bar dataKey="payments" fill="#f59e0b" name="Paid Orders" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Next-Step Recommendation Engine & Platform Intelligence */}
            <PlatformIntelligencePanel
              intelligence={intelligence}
              loading={intelLoading}
              onRefresh={loadCommandCenterMeta}
              onNavigateTab={handleSelectNavigation}
              onTriggerApproval={prop => setPendingProposal(prop)}
            />

            {/* Owner Approvals Queue */}
            {(showApprovalsDrawer || approvals.length > 0) && (
              <OwnerApprovalsQueue
                approvals={approvals}
                onExecute={executeQueuedProposalById}
                onDismiss={dismissQueuedProposalById}
                onRefresh={loadCommandCenterMeta}
              />
            )}

            {/* 8 Real-DB Executive Reports */}
            <ExecutiveReportsPanel
              token={token}
              includeTest={includeTest}
              showToast={showToast}
            />
          </div>
        )}

        {/* ==================== 2. AI REVIEW CENTER ==================== */}
        {activeTab === 'ai-review' && (
          <SuperAdminAiReviewCenter
            token={token}
            showToast={showToast}
            activeSubmenu={activeSubmenu}
            includeTest={includeTest}
            onProposeOwnerApproval={prop => setPendingProposal(prop)}
          />
        )}

        {/* ==================== 3. AI CONFIGURATION SETTINGS ==================== */}
        {activeTab === 'ai-settings' && (
          <SuperAdminAiSettings
            token={token}
            showToast={showToast}
            activeSubmenu={activeSubmenu}
            onProposeOwnerApproval={prop => setPendingProposal(prop)}
          />
        )}

        {/* ==================== 4. USER MANAGEMENT & ARTIST ONBOARDING ==================== */}
        {activeTab === 'users' && (
          [
            'artist-onboarding',
            'incomplete-profiles',
            'pending-profile-reviews',
            'approved-artists',
            'rejected-profiles'
          ].includes(activeSubmenu) ? (
            <ArtistOnboardingPanel
              token={token}
              includeTest={includeTest}
              activeSubmenu={activeSubmenu}
              showToast={showToast}
              onProposeOwnerApproval={prop => setPendingProposal(prop)}
            />
          ) : (
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
                    <th className="py-3 px-4 font-medium text-right">Actions (Owner Approved)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {paginatedUsers.map(u => (
                    <tr key={u.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">
                          {u.fullName}{' '}
                          {u.isTestRecord && (
                            <span className="font-mono text-[10px] text-amber-300">[TEST/DEMO]</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#f0cf65]">{u.profileCompletion}%</td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span
                          className={
                            u.kycStatus === 'Approved'
                              ? 'text-emerald-300'
                              : u.kycStatus === 'Pending'
                                ? 'text-amber-300'
                                : 'text-slate-400'
                          }
                        >
                          {u.kycStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{u.planName}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-300">{u.releasesCount}</td>
                      <td className="py-3 px-4 font-mono uppercase text-[11px]">
                        <span
                          className={
                            u.accountStatus === 'active'
                              ? 'text-emerald-300'
                              : u.accountStatus === 'suspended'
                                ? 'text-amber-300'
                                : 'text-red-300'
                          }
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
                            onClick={() =>
                              setPendingProposal({
                                actionType: 'USER_SUSPEND',
                                targetType: 'user',
                                targetId: u.id,
                                title: `Suspend Account · ${u.email}`,
                                explanation: `Suspends user ${u.email} and revokes all active login tokens immediately.`,
                                consequences: 'Artist loses dashboard access until explicitly reactivated; financial/audit records remain intact.',
                                proposedChanges: { userId: u.id, email: u.email, newStatus: 'suspended' },
                                payload: {},
                                requiresReason: true
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-700/40"
                          >
                            Suspend
                          </button>
                        )}
                        {u.accountStatus !== 'active' && (
                          <button
                            onClick={() =>
                              setPendingProposal({
                                actionType: 'USER_REACTIVATE',
                                targetType: 'user',
                                targetId: u.id,
                                title: `Reactivate Account · ${u.email}`,
                                explanation: `Restores login & distribution access for ${u.email}.`,
                                consequences: 'User can authenticate again using verified credentials & 2FA.',
                                proposedChanges: { userId: u.id, email: u.email, newStatus: 'active' },
                                payload: {}
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/40"
                          >
                            Reactivate
                          </button>
                        )}
                        {u.accountStatus !== 'terminated' && (
                          <button
                            onClick={() =>
                              setPendingProposal({
                                actionType: 'USER_TERMINATE',
                                targetType: 'user',
                                targetId: u.id,
                                title: `Terminate Account · ${u.email}`,
                                explanation: `Permanently terminates account ${u.email} and invalidates all active sessions.`,
                                consequences: 'Blocks future logins permanently unless explicitly restored by Super Admin. Financial ledger stays preserved.',
                                proposedChanges: { userId: u.id, email: u.email, newStatus: 'terminated' },
                                payload: {},
                                requiresReason: true
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-700/40"
                          >
                            Terminate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        {dataUnavailable ? 'Data Unavailable — database error.' : '0 users match your current filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {filteredUsers.length > PAGE_SIZE && (
                <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>
                    Page {userPage} of {Math.ceil(filteredUsers.length / PAGE_SIZE)} ({filteredUsers.length} users)
                  </span>
                  <div className="space-x-2">
                    <button
                      disabled={userPage <= 1}
                      onClick={() => setUserPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-40 text-white"
                    >
                      Prev
                    </button>
                    <button
                      disabled={userPage >= Math.ceil(filteredUsers.length / PAGE_SIZE)}
                      onClick={() => setUserPage(p => p + 1)}
                      className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-40 text-white"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )
        )}

        {/* ==================== 5. KYC VERIFICATION ==================== */}
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
                      <td className="py-3 px-4 text-slate-400 font-mono">
                        {rec.kyc?.submittedAt ? new Date(rec.kyc.submittedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold">
                        <span
                          className={
                            rec.kyc?.status === 'Approved'
                              ? 'text-emerald-300'
                              : rec.kyc?.status === 'Pending'
                                ? 'text-amber-300'
                                : 'text-red-300'
                          }
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
                        {dataUnavailable ? 'Data Unavailable.' : 'No KYC submissions found for this filter.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== 6. RELEASE MANAGEMENT ==================== */}
        {activeTab === 'releases' && (
          <div className="space-y-4">
            {activeSubmenu === 'takedown-requests' ? (
              <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">Takedown Requests ({takedownsList.length})</h3>
                {takedownsList.length === 0 ? (
                  <p className="text-xs text-slate-500">0 takedown requests found in database.</p>
                ) : (
                  <div className="space-y-2">
                    {takedownsList.map((td: any) => (
                      <div key={td.id} className="p-3.5 rounded-xl bg-[#050507] border border-slate-800 text-xs flex justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">{td.userName} ({td.userEmail})</p>
                          <p className="text-slate-300 mt-0.5">{td.details}</p>
                        </div>
                        <span className="font-mono text-amber-300 shrink-0">{td.status} · {td.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
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
                    <option value="pending">Pending / Under Review</option>
                    <option value="approved">Approved</option>
                    <option value="published">Published / Live</option>
                    <option value="rejected">Rejected</option>
                    <option value="action required">Action Required</option>
                    <option value="draft">Draft</option>
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
                      {paginatedReleases.map(r => (
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
                          <td className="py-3 px-4 font-mono font-semibold">
                            <span
                              className={
                                r.status === 'Approved' || r.status === 'Live' || r.status === 'Published'
                                  ? 'text-emerald-300'
                                  : r.status === 'Rejected'
                                    ? 'text-red-300'
                                    : 'text-amber-300'
                              }
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
                            {dataUnavailable ? 'Data Unavailable.' : '0 releases match your filter.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {releasesList.length > PAGE_SIZE && (
                    <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>
                        Page {releasePage} of {Math.ceil(releasesList.length / PAGE_SIZE)} ({releasesList.length} releases)
                      </span>
                      <div className="space-x-2">
                        <button
                          disabled={releasePage <= 1}
                          onClick={() => setReleasePage(p => Math.max(1, p - 1))}
                          className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-40 text-white"
                        >
                          Prev
                        </button>
                        <button
                          disabled={releasePage >= Math.ceil(releasesList.length / PAGE_SIZE)}
                          onClick={() => setReleasePage(p => p + 1)}
                          className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-40 text-white"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== 7. PAYMENTS & SUBSCRIPTIONS ==================== */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
              {[
                { label: 'Total Orders', value: dataUnavailable || !paymentSummary ? 'Data Unavailable' : paymentSummary.totalOrders ?? 0 },
                { label: 'Verified Paid Orders', value: dataUnavailable || !paymentSummary ? 'Data Unavailable' : paymentSummary.paidOrders ?? 0 },
                { label: 'Failed / Pending', value: dataUnavailable || !paymentSummary ? 'Data Unavailable' : `${paymentSummary.failedOrders ?? 0} / ${paymentSummary.pendingOrders ?? 0}` },
                { label: 'Refunded Orders', value: dataUnavailable || !paymentSummary ? 'Data Unavailable' : paymentSummary.refundedOrders ?? 0 },
                { label: 'Verified Paid Revenue', value: dataUnavailable || !paymentSummary ? 'Data Unavailable' : `₹${Number(paymentSummary.totalRevenue ?? 0).toLocaleString('en-IN')}` }
              ].map(s => (
                <div key={s.label} className="p-4 rounded-xl bg-[#0b0c10] border border-slate-800">
                  <p className="text-[11px] text-slate-400">{s.label}</p>
                  <p className="text-lg font-bold font-mono tabular-nums text-[#f0cf65] mt-1">{s.value}</p>
                </div>
              ))}
            </div>

            {activeSubmenu === 'revenue-reports' ? (
              <ExecutiveReportsPanel token={token} includeTest={includeTest} showToast={showToast} />
            ) : activeSubmenu === 'promotional-program' ? (
              <PromotionalProgramPanel
                token={token}
                includeTest={includeTest}
                showToast={showToast}
                onProposeOwnerApproval={prop => setPendingProposal(prop)}
              />
            ) : activeSubmenu === 'financial-governance' ? (
              <FinancialGovernancePanel
                token={token}
                includeTest={includeTest}
                showToast={showToast}
                onProposeOwnerApproval={prop => setPendingProposal(prop)}
              />
            ) : (
              <>
                <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Razorpay Transactions</h3>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Revenue sums paid orders only · Secrets isolated server-side
                    </span>
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
                      {paginatedOrders.map(o => (
                        <tr key={o.orderId} className="hover:bg-white/[0.02]">
                          <td className="py-3 px-4 font-mono">
                            <div className="text-white">
                              {o.orderId} {o.isTestMode && <span className="text-amber-300">[TEST]</span>}
                            </div>
                            <div className="text-[11px] text-slate-500">{o.paymentId || o.failureReason || '—'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-slate-200">{o.userName}</div>
                            <div className="text-[11px] text-slate-500">{o.userEmail}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-300">{o.planName}</td>
                          <td className="py-3 px-4 font-mono tabular-nums text-[#f0cf65]">₹{o.amount}</td>
                          <td className="py-3 px-4 font-mono uppercase text-[11px]">
                            <span
                              className={
                                o.status === 'paid'
                                  ? 'text-emerald-300'
                                  : o.status === 'refunded'
                                    ? 'text-blue-300'
                                    : 'text-red-300'
                              }
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
                                onClick={() =>
                                  setPendingProposal({
                                    actionType: 'PAYMENT_REFUND',
                                    targetType: 'payment',
                                    targetId: o.orderId,
                                    title: `Refund Paid Order · ${o.orderId} (₹${o.amount})`,
                                    explanation: `Marks verified paid order ${o.orderId} for ${o.userEmail} as refunded.`,
                                    consequences: 'Deducts ₹' + o.amount + ' from verified revenue totals and writes an immutable financial audit entry.',
                                    proposedChanges: { orderId: o.orderId, amountINR: o.amount, newStatus: 'refunded' },
                                    payload: {},
                                    requiresReason: true
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-700/40 inline-flex items-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3" /> Refund
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filteredOrders.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-slate-500">
                            {dataUnavailable ? 'Data Unavailable.' : '0 payment orders recorded.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
                  <div className="p-4 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">User Subscriptions ({subscriptions.length})</h3>
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
                          <td className="py-3 px-4 font-mono uppercase text-[11px] text-[#f0cf65]">
                            {s.status}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400">
                            {(s.expiresAt || s.renewsAt || '—').slice(0, 10)}
                          </td>
                        </tr>
                      ))}
                      {subscriptions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500">
                            0 subscriptions found in database.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== 8. REVIEWS & SUPPORT ==================== */}
        {activeTab === 'support' && (
          <div className="space-y-6">
            {[
              { title: 'Artist Support Tickets', items: supportData.tickets, sourceType: 'ticket' as const },
              { title: 'Contact & Complaint Inquiries', items: supportData.contacts, sourceType: 'contact' as const },
              { title: 'User Reviews & Feedback', items: supportData.feedbacks, sourceType: 'feedback' as const }
            ]
              .filter(sec => {
                if (activeSubmenu === 'user-complaints') return sec.sourceType === 'contact';
                if (activeSubmenu === 'platform-reviews') return sec.sourceType === 'feedback';
                if (activeSubmenu === 'support-tickets') return sec.sourceType === 'ticket';
                return true;
              })
              .map(section => {
                const items =
                  activeSubmenu === 'resolved-tickets'
                    ? section.items.filter((i: any) => i.status === 'Resolved')
                    : section.items;

                return (
                  <div key={section.title} className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-white">
                      {section.title} ({items.length})
                    </h3>
                    {items.length === 0 ? (
                      <p className="text-xs text-slate-500">No entries in this queue.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {items.map((item: any) => (
                          <div
                            key={item.id}
                            className="p-4 rounded-xl bg-[#050507] border border-slate-800 flex flex-wrap items-start justify-between gap-4"
                          >
                            <div className="space-y-1 max-w-2xl">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-white">
                                  {item.subject || item.name || 'Inquiry'}
                                </span>
                                <span className="font-mono text-[10px] text-[#f0cf65] uppercase">
                                  · {item.status || 'Open'}
                                </span>
                                {item.rating && (
                                  <span className="text-[11px] font-mono text-amber-400">
                                    · Rating: {item.rating}/5
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
                                  title: item.subject || item.name || item.id,
                                  userEmail: item.userEmail || item.email,
                                  category: item.category || item.role,
                                  body: item.message || item.feedback || item.messages?.[0]?.text || ''
                                });
                                setReplyText(item.adminResponse || '');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-xs text-[#f0cf65] hover:bg-[#d4af37]/25"
                            >
                              Respond & Draft with AI
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* ==================== 9. AUDIT & SECURITY LOGS ==================== */}
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
                  {paginatedAuditLogs.map(log => (
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
                  {filteredAuditLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-slate-500">
                        No audit entries found for "{activeSubmenu.replace(/-/g, ' ')}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {filteredAuditLogs.length > PAGE_SIZE && (
                <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>
                    Page {auditPage} of {Math.ceil(filteredAuditLogs.length / PAGE_SIZE)} ({filteredAuditLogs.length} events)
                  </span>
                  <div className="space-x-2">
                    <button
                      disabled={auditPage <= 1}
                      onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-40 text-white"
                    >
                      Prev
                    </button>
                    <button
                      disabled={auditPage >= Math.ceil(filteredAuditLogs.length / PAGE_SIZE)}
                      onClick={() => setAuditPage(p => p + 1)}
                      className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-40 text-white"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== 10. PLATFORM SETTINGS & INTEGRATIONS ==================== */}
        {activeTab === 'settings' && activeSubmenu === 'infrastructure-scalability' && (
          <InfrastructurePanel token={token} showToast={showToast} />
        )}
        {activeTab === 'settings' && activeSubmenu !== 'infrastructure-scalability' && settings && (
          <div className="space-y-6">
            {/* Diagnostics Row for Email Relay & Gateway */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-2">
                <p className="font-semibold text-[#f0cf65] flex items-center gap-1.5">
                  <Mail className="w-4 h-4" /> Email Relay & SMTP Status
                </p>
                <p className="font-mono text-[11px] text-slate-300">
                  Provider: {emailConfig?.provider || 'Google Apps Script HTTPS Relay'}
                </p>
                <p
                  className={`font-mono text-[11px] ${
                    emailConfig?.configured && emailConfig?.validHttpsUrl ? 'text-emerald-300' : 'text-red-300'
                  }`}
                >
                  Status:{' '}
                  {emailConfig?.configured && emailConfig?.validHttpsUrl
                    ? 'CONFIGURED & READY'
                    : 'MISCONFIGURED / MISSING ENV'}
                </p>
                <button
                  onClick={handleTestEmailRelay}
                  disabled={testingEmail}
                  className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65]"
                >
                  {testingEmail ? 'Checking...' : 'Test Email Relay'}
                </button>
                {emailTestResult && (
                  <p className={`text-[11px] ${emailTestResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                    {emailTestResult.message}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-2">
                <p className="font-semibold text-[#f0cf65] flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4" /> Razorpay Payment Gateway
                </p>
                <p className="font-mono text-[11px] text-slate-300">
                  Key ID: {gatewayConfig?.razorpayKeyConfigured ? 'Set (Server-Side)' : 'Not Set'}
                </p>
                <p className="font-mono text-[11px] text-slate-300">
                  Secret: {gatewayConfig?.razorpaySecretConfigured ? 'Set (Isolated)' : 'Not Set'}
                </p>
                <p className="font-mono text-[11px] text-slate-300">
                  Webhook Secret: {gatewayConfig?.webhookSecretConfigured ? 'Configured' : 'Not Set'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-2">
                <p className="font-semibold text-[#f0cf65] flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4" /> Database & Storage Status
                </p>
                <p className="font-mono text-[11px] text-slate-300">
                  Source: {integrity?.dataSource || 'Checking...'}
                </p>
                <p className="font-mono text-[11px] text-slate-300">
                  Connection: {integrity?.connectionStatus || 'Checking...'}
                </p>
                <p className="text-[11px] text-slate-400">
                  All secrets remain exclusively in server environment variables.
                </p>
              </div>
            </div>

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
                        Extra security PIN setting (Super Admin login bypasses email OTP)
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
                  onClick={() =>
                    setPendingProposal({
                      actionType: 'SETTINGS_UPDATE',
                      targetType: 'settings',
                      targetId: 'global',
                      title: 'Save Platform Settings & Subscription Pricing',
                      explanation:
                        'Updates global Maintenance Mode, Service Module switches, Payment Gateway preferences, and Plan Pricing.',
                      consequences:
                        'Changes apply immediately across the Rudraatma Music storefront and checkout APIs.',
                      proposedChanges: {
                        maintenanceMode: settings.maintenanceMode,
                        services: settings.services,
                        planUpdates: plans.map(p => ({ id: p.id, priceINR: Number(p.priceINR) }))
                      },
                      payload: {
                        settings,
                        ...(new2faPin.trim().length >= 4 ? { newAdminTwoFactorPin: new2faPin.trim() } : {}),
                        planUpdates: plans.map(p => ({ id: p.id, name: p.name, priceINR: Number(p.priceINR) }))
                      }
                    })
                  }
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b8891b] text-black font-bold text-xs"
                >
                  Save Settings & Pricing (Owner Approval)
                </button>
              </div>

              <div className="space-y-6">
                {/* Plan Pricing Editor */}
                <div className="p-6 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-3">
                  <h3 className="text-sm font-semibold text-white">Subscription Plans & Pricing (INR)</h3>
                  <div className="space-y-2.5">
                    {plans.map((p, idx) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#050507] border border-slate-800"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {p.id} · {p.type}
                          </p>
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
          </div>
        )}
      </main>

      {/* Right-Side Collapsible Admin Navigation */}
      <RightAdminSidebar
        activeTab={activeTab}
        activeSubmenu={activeSubmenu}
        onSelect={handleSelectNavigation}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        sessionInfo={sessionInfo}
        userEmail={user?.email}
        onOpenSessionPanel={() => setSessionModalOpen(true)}
        onSignOut={() => {
          logout();
          navigate('/super-admin/login');
        }}
      />

      {/* Persistent Floating Bottom-Right Rudra AI Assistant */}
      <AiExecutiveAssistant
        token={token}
        activeTab={activeTab}
        activeSubmenu={activeSubmenu}
        onTriggerApproval={prop => setPendingProposal(prop)}
        onNavigateTab={handleSelectNavigation}
      />

      {/* ==================== MODALS ==================== */}

      {/* 6-Step Owner Approval Safeguard Modal */}
      <OwnerApprovalModal
        proposal={pendingProposal}
        submitting={executingApproval}
        onCancel={() => setPendingProposal(null)}
        onConfirmExecute={handleConfirmAndExecuteProposal}
      />

      {/* Executive Session Panel Modal */}
      <ExecutiveSessionModal
        open={sessionModalOpen}
        sessionInfo={sessionInfo}
        onClose={() => setSessionModalOpen(false)}
        onSignOut={() => {
          logout();
          navigate('/super-admin/login');
        }}
      />

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
                    <span>
                      {r.title} ({r.artist})
                    </span>
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
                    <span>
                      {p.orderId} · {p.planName}
                    </span>
                    <span>
                      ₹{p.amount} ({p.status})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KYC Verification Modal (Routes Actions to 6-Step Owner Approval) */}
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
                  setPendingProposal({
                    actionType: 'KYC_REQUEST_REUPLOAD',
                    targetType: 'kyc',
                    targetId: inspectedKyc.userId,
                    title: `Request KYC Re-upload · ${inspectedKyc.email}`,
                    explanation: `Requests corrected KYC documents from ${inspectedKyc.fullName} (${inspectedKyc.email}).`,
                    consequences: 'Keeps distribution services locked until user submits updated identity files.',
                    proposedChanges: { userId: inspectedKyc.userId, kycStatus: 'Reupload Required' },
                    payload: {},
                    requiresReason: true
                  })
                }
                className="px-4 py-2 rounded-xl bg-amber-950/70 border border-amber-700/50 text-amber-300 text-xs font-semibold"
              >
                Request Re-upload
              </button>
              <button
                onClick={() =>
                  setPendingProposal({
                    actionType: 'KYC_REJECT',
                    targetType: 'kyc',
                    targetId: inspectedKyc.userId,
                    title: `Reject KYC Verification · ${inspectedKyc.email}`,
                    explanation: `Rejects submitted KYC verification for ${inspectedKyc.fullName} (${inspectedKyc.email}).`,
                    consequences: 'Locks distribution services and displays rejection reason on the artist profile.',
                    proposedChanges: { userId: inspectedKyc.userId, kycStatus: 'Rejected' },
                    payload: {},
                    requiresReason: true
                  })
                }
                className="px-4 py-2 rounded-xl bg-red-950/70 border border-red-700/50 text-red-300 text-xs font-semibold"
              >
                Reject KYC
              </button>
              <button
                onClick={() =>
                  setPendingProposal({
                    actionType: 'KYC_APPROVE',
                    targetType: 'kyc',
                    targetId: inspectedKyc.userId,
                    title: `Approve KYC & Unlock Services · ${inspectedKyc.email}`,
                    explanation: `Verifies and approves KYC documents for ${inspectedKyc.fullName} (${inspectedKyc.email}).`,
                    consequences: 'Unlocks full music distribution & payout eligibility for this artist account.',
                    proposedChanges: { userId: inspectedKyc.userId, kycStatus: 'Approved', servicesUnlocked: true },
                    payload: {}
                  })
                }
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                Approve KYC (Owner Confirm)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Inspector Modal (Routes Actions to 6-Step Owner Approval) */}
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
                <p>
                  <span className="text-slate-500">Copyright:</span> © {inspectedRelease.copyrightYear} {inspectedRelease.copyrightOwner}
                </p>
                <p>
                  <span className="text-slate-500">Recording Owner:</span> ℗ {inspectedRelease.recordingOwner}
                </p>
                <p>
                  <span className="text-slate-500">Territories:</span> {inspectedRelease.territories}
                </p>
                <p>
                  <span className="text-slate-500">Language / Genre:</span> {inspectedRelease.language} / {inspectedRelease.primaryGenre}
                </p>
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
                  {t.audioFileUrl && <audio controls src={apiUrl(t.audioFileUrl)} className="w-full h-8" />}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() =>
                  setPendingProposal({
                    actionType: 'RELEASE_REQUEST_CORRECTIONS',
                    targetType: 'release',
                    targetId: inspectedRelease.id,
                    title: `Request Corrections · ${inspectedRelease.title}`,
                    explanation: `Marks release "${inspectedRelease.title}" as Action Required with correction notes.`,
                    consequences: 'Artist must edit and resubmit metadata/audio before delivery.',
                    proposedChanges: { releaseId: inspectedRelease.id, newStatus: 'Action Required' },
                    payload: {},
                    requiresReason: true
                  })
                }
                className="px-4 py-2 rounded-xl bg-amber-950/70 border border-amber-700/50 text-amber-300 text-xs font-semibold"
              >
                Request Corrections
              </button>
              <button
                onClick={() =>
                  setPendingProposal({
                    actionType: 'RELEASE_REJECT',
                    targetType: 'release',
                    targetId: inspectedRelease.id,
                    title: `Reject Release · ${inspectedRelease.title}`,
                    explanation: `Marks release "${inspectedRelease.title}" as Rejected and notifies owner ${inspectedRelease.ownerEmail}.`,
                    consequences: 'Release is withheld from distribution; artist can view reason and appeal.',
                    proposedChanges: { releaseId: inspectedRelease.id, newStatus: 'Rejected' },
                    payload: {},
                    requiresReason: true
                  })
                }
                className="px-4 py-2 rounded-xl bg-red-950/70 border border-red-700/50 text-red-300 text-xs font-semibold"
              >
                Reject Release
              </button>
              <button
                onClick={() =>
                  setPendingProposal({
                    actionType: 'RELEASE_APPROVE',
                    targetType: 'release',
                    targetId: inspectedRelease.id,
                    title: `Approve Release · ${inspectedRelease.title}`,
                    explanation: `Approves release "${inspectedRelease.title}" for catalog distribution.`,
                    consequences: 'Updates database status to Approved and dispatches artist approval notification.',
                    proposedChanges: { releaseId: inspectedRelease.id, newStatus: 'Approved' },
                    payload: {}
                  })
                }
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                Approve Release
              </button>
              <button
                onClick={() =>
                  setPendingProposal({
                    actionType: 'RELEASE_PUBLISH',
                    targetType: 'release',
                    targetId: inspectedRelease.id,
                    title: `Publish Release Live · ${inspectedRelease.title}`,
                    explanation: `Marks release "${inspectedRelease.title}" as Live / Published across the Rudraatma catalog.`,
                    consequences: 'Updates database status to Live and records publication timestamp.',
                    proposedChanges: { releaseId: inspectedRelease.id, newStatus: 'Live' },
                    payload: {}
                  })
                }
                className="px-4 py-2 rounded-xl bg-[#d4af37] hover:bg-[#f0cf65] text-black text-xs font-bold"
              >
                Publish Live
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
              <button onClick={() => setInvoiceModal(null)} className="text-slate-400 hover:text-white">
                Close
              </button>
            </div>
            <div className="space-y-1.5 font-mono text-slate-300">
              <p>Invoice / Order ID: {invoiceModal.orderId}</p>
              <p>Payment ID: {invoiceModal.paymentId || 'N/A'}</p>
              <p>
                Customer: {invoiceModal.userName} ({invoiceModal.userEmail})
              </p>
              <p>Plan: {invoiceModal.planName}</p>
              <p>
                Amount: ₹{invoiceModal.amount} {invoiceModal.currency}
              </p>
              <p>Status: {invoiceModal.status.toUpperCase()}</p>
              <p>Date: {new Date(invoiceModal.paidAt || invoiceModal.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Support Reply Modal with AI Draft Assistant */}
      {replyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white truncate">Respond · {replyModal.title}</h3>
              <button
                onClick={handleAiDraftSupportReply}
                disabled={draftingAiReply}
                className="px-2.5 py-1 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[11px] text-[#f0cf65] inline-flex items-center gap-1 shrink-0"
              >
                <Sparkles className="w-3 h-3" />
                {draftingAiReply ? 'Drafting...' : 'AI Draft Reply'}
              </button>
            </div>
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
              rows={5}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Write official response (AI never sends replies without your review)..."
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReplyModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSupportReplyConfirm}
                className="px-4 py-2 rounded-xl bg-[#d4af37] text-black text-xs font-bold"
              >
                Send Response
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
