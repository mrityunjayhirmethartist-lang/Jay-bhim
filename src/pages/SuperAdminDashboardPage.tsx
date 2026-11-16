import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Eye,
  Send,
  Lock,
  Megaphone,
  RotateCcw,
  FileText,
  Sparkles,
  Mail,
  CreditCard,
  HardDrive,
  Disc3,
  Clock,
  Pencil
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
import { AdminTopNav } from '../components/admin/AdminTopNav';
import { DataIntegrityBanner } from '../components/admin/DataIntegrityBanner';
import { AiExecutiveAssistant } from '../components/admin/AiExecutiveAssistant';
import {
  WelcomeOverviewBanner,
  DistributionManagementPanel,
  SubscriptionManagementPanel,
  WebsiteManagementPanel,
  SecurityPermissionsPanel,
  SystemHealthPanel
} from '../components/admin/EnterpriseModules';
import {
  OwnerApprovalModal,
  OwnerApprovalsQueue,
  PlatformIntelligencePanel,
  ExecutiveReportsPanel,
  ExecutiveSessionModal
} from '../components/admin/CommandCenterViews';
import {
  ArtistOnboardingPanel,
  FinancialGovernancePanel
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

  // Navigation state (12 enterprise modules + submenus)
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [activeSubmenu, setActiveSubmenu] = useState<string>('executive-overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global integrity & toast state
  const [loading, setLoading] = useState(false);
  const [includeTest, setIncludeTest] = useState(false);
  const [overviewRange, setOverviewRange] = useState<'7d' | '30d' | '90d'>('30d');
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
  const [topContent, setTopContent] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Users & KYC state
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [userDateFrom, setUserDateFrom] = useState('');
  const [userDateTo, setUserDateTo] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [inspectedUser, setInspectedUser] = useState<any | null>(null);

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
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [metadataForm, setMetadataForm] = useState({
    title: '',
    artist: '',
    upc: '',
    primaryGenre: '',
    language: '',
    releaseDate: '',
    territories: '',
    label: ''
  });

  // Finance & Subscriptions state
  const [orders, setOrders] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<any | null>(null);
  const [paymentDateFrom, setPaymentDateFrom] = useState('');
  const [paymentDateTo, setPaymentDateTo] = useState('');
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
    priority?: string;
    assignedTo?: string;
  } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<'Open' | 'Pending' | 'Resolved'>('Resolved');
  const [replyPriority, setReplyPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent'>('Medium');
  const [replyAssignedTo, setReplyAssignedTo] = useState('');
  const [draftingAiReply, setDraftingAiReply] = useState(false);

  // Security / Audit logs state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditSearch, setAuditSearch] = useState('');

  // Settings & Website state
  const [settings, setSettings] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [emailConfig, setEmailConfig] = useState<any>(null);
  const [gatewayConfig, setGatewayConfig] = useState<any>(null);
  const [emailTestResult, setEmailTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [new2faPin, setNew2faPin] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');

  // AI Control sub-tab view switcher
  const aiCenterMode = useMemo(() => {
    if (['ai-provider-settings', 'ai-usage-costs', 'ai-permissions'].includes(activeSubmenu)) {
      return 'settings' as const;
    }
    return 'review' as const;
  }, [activeSubmenu]);

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
          const res = await authFetch(
            `/api/super-admin/overview?includeTest=${includeTest}&range=${overviewRange}`
          );
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
          setTopContent(data.topContent || []);
          setRecentActivity(data.recentActivity || []);
        } else if (tab === 'users') {
          const userParams = new URLSearchParams();
          userParams.set('includeTest', String(includeTest));
          if (userSearch) userParams.set('q', userSearch);
          if (userStatusFilter !== 'all') userParams.set('status', userStatusFilter);
          if (userDateFrom) userParams.set('dateFrom', userDateFrom);
          if (userDateTo) userParams.set('dateTo', userDateTo);

          const kycParams = new URLSearchParams();
          kycParams.set('includeTest', String(includeTest));
          if (kycStatusFilter !== 'all') kycParams.set('status', kycStatusFilter);

          const [uRes, kRes] = await Promise.all([
            authFetch(`/api/super-admin/users?${userParams.toString()}`),
            authFetch(`/api/super-admin/kyc?${kycParams.toString()}`)
          ]);
          const uData = await uRes.json();
          const kData = await kRes.json();
          if (uData._integrity) setIntegrity(uData._integrity);
          if (!uRes.ok || uData.dataUnavailable) {
            setDataUnavailable(true);
            setDataErrorMsg(uData.error || 'Failed to load users.');
            return;
          }
          setDataUnavailable(false);
          setUsersList(uData.users || []);
          setKycRecords(kData.records || []);
          setUserPage(1);
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
        } else if (tab === 'finance' || tab === 'subscriptions') {
          const [payRes, setRes] = await Promise.all([
            authFetch(`/api/super-admin/payments?includeTest=${includeTest}`),
            authFetch('/api/super-admin/settings')
          ]);
          const payData = await payRes.json();
          if (payData._integrity) setIntegrity(payData._integrity);
          if (!payRes.ok || payData.dataUnavailable) {
            setDataUnavailable(true);
            setDataErrorMsg(payData.error || 'Failed to load payment records.');
            setPaymentSummary(null);
            return;
          }
          setDataUnavailable(false);
          setOrders(payData.orders || []);
          setSubscriptions(payData.subscriptions || []);
          setPaymentSummary(payData.summary || {});
          setPaymentPage(1);
          if (setRes.ok) {
            const sData = await setRes.json();
            setPlans(sData.plans || []);
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
        } else if (tab === 'security') {
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
        } else if (tab === 'website' || tab === 'settings') {
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
      overviewRange,
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

      if (submenuId === 'kyc-pending') setKycStatusFilter('pending');
      else if (submenuId === 'kyc-approved') setKycStatusFilter('approved');
      else if (submenuId === 'kyc-rejected') setKycStatusFilter('rejected');
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

      const execRes = await authFetch(`/api/super-admin/approvals/${propData.approval.id}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          ownerConfirmed: true,
          ...(reasonOverride ? { reasonOverride } : {})
        })
      });
      const execData = await execRes.json();
      if (!execRes.ok) throw new Error(execData.error || 'Approval execution failed.');

      showToast('ok', `Owner-approved action completed & logged: ${pendingProposal.title}`);
      setPendingProposal(null);
      setInspectedKyc(null);
      setInspectedRelease(null);
      setEditingMetadata(false);
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

  const openReleaseInspector = (rel: any) => {
    setInspectedRelease(rel);
    setEditingMetadata(false);
    setMetadataForm({
      title: rel.title || '',
      artist: rel.artist || '',
      upc: rel.upc || '',
      primaryGenre: rel.primaryGenre || '',
      language: rel.language || '',
      releaseDate: rel.releaseDate || '',
      territories: rel.territories || '',
      label: rel.label || ''
    });
  };

  const inspectReleaseById = async (releaseId: string) => {
    const found = releasesList.find(r => r.id === releaseId);
    if (found) {
      openReleaseInspector(found);
      return;
    }
    try {
      const res = await authFetch(`/api/super-admin/releases?includeTest=${includeTest}`);
      const data = await res.json();
      const target = (data.releases || []).find((r: any) => r.id === releaseId);
      if (target) {
        setReleasesList(data.releases || []);
        openReleaseInspector(target);
      } else {
        showToast('err', 'Release record not found.');
      }
    } catch (err: any) {
      showToast('err', err.message || 'Unable to inspect release.');
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
          priority: replyPriority,
          assignedTo: replyAssignedTo.trim() || 'Unassigned',
          response: replyText.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send response.');
      showToast('ok', 'Response recorded, priority/assignment saved, and status updated.');
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
  const isUserKycView = ['kyc-pending', 'kyc-approved', 'kyc-rejected', 'kyc-history'].includes(activeSubmenu);
  const isUserOnboardingView = [
    'artist-onboarding',
    'incomplete-profiles',
    'pending-profile-reviews',
    'approved-artists',
    'rejected-profiles'
  ].includes(activeSubmenu);

  const filteredUsers = useMemo(() => {
    if (activeTab !== 'users') return usersList;
    return usersList;
  }, [usersList, activeTab]);

  const paginatedUsers = filteredUsers.slice((userPage - 1) * PAGE_SIZE, userPage * PAGE_SIZE);
  const paginatedReleases = releasesList.slice((releasePage - 1) * PAGE_SIZE, releasePage * PAGE_SIZE);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (activeSubmenu === 'failed-payments' && o.status !== 'failed' && o.status !== 'cancelled') {
        return false;
      }
      if (activeSubmenu === 'refund-requests' && o.status !== 'refunded' && o.status !== 'paid') {
        return false;
      }
      const ts = new Date(o.paidAt || o.createdAt || 0).getTime();
      if (paymentDateFrom && ts < new Date(paymentDateFrom).getTime()) return false;
      if (paymentDateTo && ts > new Date(paymentDateTo + 'T23:59:59').getTime()) return false;
      return true;
    });
  }, [orders, activeSubmenu, paymentDateFrom, paymentDateTo]);
  const paginatedOrders = filteredOrders.slice((paymentPage - 1) * PAGE_SIZE, paymentPage * PAGE_SIZE);

  const formatMetric = (val: number | undefined, isCurrency = false) => {
    if (dataUnavailable || !kpis) return 'Data Unavailable';
    const num = Number(val ?? 0);
    return isCurrency ? `₹${num.toLocaleString('en-IN')}` : num.toLocaleString('en-IN');
  };

  // Top 4 headline KPI cards + full operational breakdown
  const headlineKpis = [
    { label: 'Total Users', value: formatMetric(kpis?.totalRegisteredUsers), sub: `${kpis?.activeUsers ?? 0} active` },
    { label: 'Total Releases', value: formatMetric(kpis?.totalReleases), sub: `${kpis?.publishedReleases ?? 0} live` },
    { label: 'Total Revenue', value: formatMetric(kpis?.totalRevenue, true), sub: `${kpis?.successfulPayments ?? 0} paid orders`, gold: true },
    { label: 'Open Support Tickets', value: formatMetric(kpis?.openSupportTickets), sub: 'Tickets & inquiries' }
  ];

  const detailedKpis = [
    { label: 'Pending KYC Verification', value: formatMetric(kpis?.pendingKycVerification), accent: 'gold' },
    { label: 'Approved Profiles', value: formatMetric(kpis?.approvedProfiles) },
    { label: 'Suspended / Terminated', value: dataUnavailable || !kpis ? 'Data Unavailable' : `${kpis.suspendedUsers ?? 0} / ${kpis.terminatedAccounts ?? 0}` },
    { label: 'Pending Release Reviews', value: formatMetric(kpis?.pendingReleaseReviews), accent: 'gold' },
    { label: 'Approved Releases', value: formatMetric(kpis?.approvedReleases) },
    { label: 'Rejected Releases', value: formatMetric(kpis?.rejectedReleases) },
    { label: 'Active Subscriptions', value: formatMetric(kpis?.activeSubscriptions) },
    { label: 'Failed / Pending Orders', value: dataUnavailable || !kpis ? 'Data Unavailable' : `${kpis.failedPayments ?? 0} / ${kpis.pendingPayments ?? 0}` }
  ];

  const hasUserChartData = (charts.userGrowth || []).some((d: any) => d.totalUsers > 0 || d.newUsers > 0);
  const hasRevenueChartData = (charts.revenueTrend || []).some((d: any) => d.revenue > 0 || d.releases > 0);
  const hasReleasePieData = (charts.releaseStatusBreakdown || []).some((d: any) => d.value > 0);
  const hasActivityChartData = (charts.platformActivity || []).some(
    (d: any) => d.adminActions > 0 || d.releases > 0 || d.payments > 0
  );

  return (
    <div className="min-h-screen bg-[#050507] text-slate-100 flex flex-row">
      {/* Main Content Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Enterprise Navigation Bar */}
        <AdminTopNav
          token={token}
          includeTest={includeTest}
          loading={loading}
          categoryLabel={activeCategoryObj?.label || 'Dashboard'}
          submenuLabel={activeSubmenuObj?.label || activeSubmenu}
          sessionInfo={sessionInfo}
          userEmail={user?.email}
          onRefreshAll={() => {
            loadTabData(activeTab);
            loadCommandCenterMeta();
          }}
          onNavigateTab={handleSelectNavigation}
          onInspectUserById={inspectUserDetail}
          onInspectReleaseById={inspectReleaseById}
          onOpenSessionModal={() => setSessionModalOpen(true)}
          onOpenMobileDrawer={() => setMobileMenuOpen(true)}
          onSignOut={() => {
            logout();
            navigate('/super-admin/login');
          }}
        />

        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto pb-24">
          {/* Data Integrity Banner */}
          <DataIntegrityBanner
            integrity={integrity}
            dataUnavailable={dataUnavailable}
            errorMessage={dataErrorMsg}
            includeTest={includeTest}
            onToggleIncludeTest={() => setIncludeTest(v => !v)}
            pendingApprovalsCount={pendingApprovalsCount}
            onOpenApprovals={() => {
              setActiveTab('security');
              setActiveSubmenu('owner-approvals');
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

          {/* ==================== 1. OVERVIEW / DASHBOARD ==================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <WelcomeOverviewBanner
                intelligence={intelligence}
                kpis={kpis}
                dataUnavailable={dataUnavailable}
                range={overviewRange}
                onChangeRange={r => setOverviewRange(r)}
                onNavigateTab={handleSelectNavigation}
              />

              {/* Headline 4 KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {headlineKpis.map(card => (
                  <div
                    key={card.label}
                    className={`p-5 rounded-xl bg-[#0b0c10] border ${
                      card.gold ? 'border-[#d4af37]/45' : 'border-slate-800/90'
                    }`}
                  >
                    <p className="text-xs text-slate-400">{card.label}</p>
                    <p
                      className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums mt-2 ${
                        dataUnavailable
                          ? 'text-red-300 text-sm'
                          : card.gold
                            ? 'text-[#f0cf65]'
                            : 'text-white'
                      }`}
                    >
                      {card.value}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 mt-1.5">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Detailed Operational Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {detailedKpis.map(card => (
                  <div
                    key={card.label}
                    className={`p-4 rounded-xl bg-[#0b0c10] border ${
                      card.accent === 'gold' ? 'border-[#d4af37]/35' : 'border-slate-800/90'
                    }`}
                  >
                    <p className="text-[11px] text-slate-400 mb-1">{card.label}</p>
                    <p
                      className={`text-lg sm:text-xl font-bold font-mono tabular-nums ${
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

              {/* Real-DB Charts with Honest Empty States */}
              {!dataUnavailable && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {(activeSubmenu === 'executive-overview' || activeSubmenu === 'user-analytics') && (
                    <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                      <h3 className="text-sm font-semibold text-white mb-4">
                        User Growth ({overviewRange})
                      </h3>
                      {!hasUserChartData ? (
                        <div className="h-64 flex items-center justify-center rounded-xl bg-[#050507] border border-slate-800/80 text-xs text-slate-500">
                          No Data Available — 0 user registrations recorded in this period.
                        </div>
                      ) : (
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
                      )}
                    </div>
                  )}

                  {(activeSubmenu === 'executive-overview' || activeSubmenu === 'revenue-analytics') && (
                    <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                      <h3 className="text-sm font-semibold text-white mb-4">
                        Verified Revenue (INR) & Releases ({overviewRange})
                      </h3>
                      {!hasRevenueChartData ? (
                        <div className="h-64 flex items-center justify-center rounded-xl bg-[#050507] border border-slate-800/80 text-xs text-slate-500">
                          No Data Available — 0 paid orders or releases recorded in this window.
                        </div>
                      ) : (
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
                      )}
                    </div>
                  )}

                  {(activeSubmenu === 'executive-overview' || activeSubmenu === 'release-analytics') && (
                    <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                      <h3 className="text-sm font-semibold text-white mb-4">Catalog Release Status</h3>
                      {!hasReleasePieData ? (
                        <div className="h-64 flex items-center justify-center rounded-xl bg-[#050507] border border-slate-800/80 text-xs text-slate-500">
                          No Data Available — 0 releases uploaded to catalog.
                        </div>
                      ) : (
                        <div className="h-64 flex items-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={(charts.releaseStatusBreakdown || []).filter((x: any) => x.value > 0)}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={52}
                                outerRadius={84}
                                paddingAngle={3}
                              >
                                {(charts.releaseStatusBreakdown || [])
                                  .filter((x: any) => x.value > 0)
                                  .map((entry: any, idx: number) => (
                                    <Cell key={idx} fill={entry.color || '#d4af37'} />
                                  ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: '#0b0c10', borderColor: '#d4af37', fontSize: 12 }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  )}

                  {(activeSubmenu === 'executive-overview' || activeSubmenu === 'platform-activity') && (
                    <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90">
                      <h3 className="text-sm font-semibold text-white mb-4">
                        Platform Activity ({overviewRange})
                      </h3>
                      {!hasActivityChartData ? (
                        <div className="h-64 flex items-center justify-center rounded-xl bg-[#050507] border border-slate-800/80 text-xs text-slate-500">
                          No Data Available — 0 recorded events in this period.
                        </div>
                      ) : (
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
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Top-Performing Content & Recent Activity */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 text-xs">
                <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Disc3 className="w-4 h-4 text-[#d4af37]" /> Top Catalog Content
                    </h3>
                    <button
                      onClick={() => handleSelectNavigation('releases', 'all-releases')}
                      className="text-[11px] text-[#f0cf65] hover:underline"
                    >
                      View All Releases
                    </button>
                  </div>
                  {topContent.length === 0 ? (
                    <p className="py-6 text-center text-slate-500">
                      No Data Available — 0 catalog releases submitted.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-800/70">
                      {topContent.map(item => (
                        <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">{item.title}</p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {item.artist} · {item.type} · {item.tracksCount} track(s)
                            </p>
                          </div>
                          <div className="text-right shrink-0 font-mono tabular-nums">
                            <p className="text-[#f0cf65] text-[11px]">{item.status}</p>
                            <p className="text-[10px] text-slate-500">
                              {item.streams > 0 ? `${item.streams.toLocaleString()} streams` : 'Streams pending DSP'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#d4af37]" /> Recent Activity Feed
                    </h3>
                    <button
                      onClick={() => handleSelectNavigation('security', 'audit-logs')}
                      className="text-[11px] text-[#f0cf65] hover:underline"
                    >
                      Full Audit Trail
                    </button>
                  </div>
                  {recentActivity.length === 0 ? (
                    <p className="py-6 text-center text-slate-500">
                      No Data Available — 0 recent system events logged.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-800/70 max-h-72 overflow-y-auto">
                      {recentActivity.map(act => (
                        <div key={act.id} className="py-2.5 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-slate-200 font-medium truncate">{act.title}</p>
                            <p className="text-[11px] text-slate-400 truncate">{act.subtitle}</p>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {new Date(act.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

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

          {/* ==================== 2. USER MANAGEMENT (USERS, ONBOARDING & KYC) ==================== */}
          {activeTab === 'users' && isUserOnboardingView && (
            <ArtistOnboardingPanel
              token={token}
              includeTest={includeTest}
              activeSubmenu={activeSubmenu}
              showToast={showToast}
              onProposeOwnerApproval={prop => setPendingProposal(prop)}
            />
          )}

          {activeTab === 'users' && isUserKycView && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                <span className="text-xs font-mono text-slate-400">
                  {kycRecords.length} KYC record(s)
                </span>
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
                            className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] hover:bg-[#d4af37]/25 font-medium whitespace-nowrap"
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

          {activeTab === 'users' && !isUserOnboardingView && !isUserKycView && (
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
                      <th className="py-3 px-4 font-medium">Registered</th>
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
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
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
                        <td colSpan={8} className="py-10 text-center text-slate-500">
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
          )}

          {/* ==================== 3. MUSIC & RELEASE MANAGEMENT ==================== */}
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
                            <td className="py-3 px-4 font-mono tabular-nums text-slate-300">
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
                                onClick={() => openReleaseInspector(r)}
                                className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] hover:bg-[#d4af37]/25 whitespace-nowrap"
                              >
                                Inspect & Correct
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

          {/* ==================== 4. ROYALTY & FINANCE ==================== */}
          {activeTab === 'finance' && (
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
              ) : activeSubmenu === 'financial-governance' ? (
                <FinancialGovernancePanel
                  token={token}
                  includeTest={includeTest}
                  showToast={showToast}
                  onProposeOwnerApproval={prop => setPendingProposal(prop)}
                />
              ) : (
                <>
                  {/* Date Filter Bar */}
                  <div className="p-4 rounded-2xl bg-[#0b0c10] border border-slate-800/90 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Razorpay Transactions Ledger</h3>
                      <p className="text-[11px] text-slate-400">
                        Revenue totals sum verified paid orders only.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={paymentDateFrom}
                        onChange={e => setPaymentDateFrom(e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
                        title="From Date"
                      />
                      <input
                        type="date"
                        value={paymentDateTo}
                        onChange={e => setPaymentDateTo(e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
                        title="To Date"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
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
                            <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
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
                              {dataUnavailable ? 'Data Unavailable.' : '0 payment orders match this date filter.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Embed Financial Governance directly on financial-overview for complete royalty & payout visibility */}
                  <FinancialGovernancePanel
                    token={token}
                    includeTest={includeTest}
                    showToast={showToast}
                    onProposeOwnerApproval={prop => setPendingProposal(prop)}
                  />
                </>
              )}
            </div>
          )}

          {/* ==================== 5. SUBSCRIPTION MANAGEMENT ==================== */}
          {activeTab === 'subscriptions' && (
            <SubscriptionManagementPanel
              token={token}
              includeTest={includeTest}
              activeSubmenu={activeSubmenu}
              subscriptions={subscriptions}
              orders={orders}
              plans={plans}
              onUpdatePlansState={setPlans}
              showToast={showToast}
              onProposeOwnerApproval={prop => setPendingProposal(prop)}
            />
          )}

          {/* ==================== 6. AI CONTROL CENTRE ==================== */}
          {activeTab === 'ai-center' && (
            <div className="space-y-6">
              {activeSubmenu === 'ai-system-analysis' && (
                <PlatformIntelligencePanel
                  intelligence={intelligence}
                  loading={intelLoading}
                  onRefresh={loadCommandCenterMeta}
                  onNavigateTab={handleSelectNavigation}
                  onTriggerApproval={prop => setPendingProposal(prop)}
                />
              )}
              {aiCenterMode === 'settings' ? (
                <SuperAdminAiSettings
                  token={token}
                  showToast={showToast}
                  activeSubmenu={activeSubmenu}
                  onProposeOwnerApproval={prop => setPendingProposal(prop)}
                />
              ) : (
                <SuperAdminAiReviewCenter
                  token={token}
                  showToast={showToast}
                  activeSubmenu={activeSubmenu}
                  includeTest={includeTest}
                  onProposeOwnerApproval={prop => setPendingProposal(prop)}
                />
              )}
            </div>
          )}

          {/* ==================== 7. DISTRIBUTION MANAGEMENT ==================== */}
          {activeTab === 'distribution' && (
            <DistributionManagementPanel
              token={token}
              includeTest={includeTest}
              activeSubmenu={activeSubmenu}
              showToast={showToast}
              onInspectReleaseById={inspectReleaseById}
            />
          )}

          {/* ==================== 8. SUPPORT & COMPLAINTS ==================== */}
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
                  if (activeSubmenu === 'open-tickets') return sec.sourceType === 'ticket' || sec.sourceType === 'contact';
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
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-semibold text-white">
                                    {item.subject || item.name || 'Inquiry'}
                                  </span>
                                  <span className="font-mono text-[10px] text-[#f0cf65] uppercase">
                                    · {item.status || 'Open'}
                                  </span>
                                  <span className="font-mono text-[10px] text-amber-300 uppercase">
                                    · Priority: {item.priority || 'Medium'}
                                  </span>
                                  <span className="font-mono text-[10px] text-slate-400">
                                    · Owner: {item.assignedTo || 'Unassigned'}
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
                                {Array.isArray(item.resolutionHistory) && item.resolutionHistory.length > 0 && (
                                  <p className="text-[11px] font-mono text-slate-500">
                                    Last Updated by {item.resolutionHistory[0].actor} ·{' '}
                                    {new Date(item.resolutionHistory[0].timestamp).toLocaleString()}
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
                                    body: item.message || item.feedback || item.messages?.[0]?.text || '',
                                    priority: item.priority || 'Medium',
                                    assignedTo: item.assignedTo || ''
                                  });
                                  setReplyStatus((item.status as any) || 'Resolved');
                                  setReplyPriority((item.priority as any) || 'Medium');
                                  setReplyAssignedTo(item.assignedTo || '');
                                  setReplyText(item.adminResponse || '');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-xs text-[#f0cf65] hover:bg-[#d4af37]/25 whitespace-nowrap"
                              >
                                Respond / Assign
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

          {/* ==================== 9. WEBSITE MANAGEMENT ==================== */}
          {activeTab === 'website' && (
            <WebsiteManagementPanel
              settings={settings}
              onChangeSettings={setSettings}
              onProposeOwnerApproval={prop => setPendingProposal(prop)}
            />
          )}

          {/* ==================== 10. SECURITY & PERMISSIONS ==================== */}
          {activeTab === 'security' && (
            <SecurityPermissionsPanel
              token={token}
              activeSubmenu={activeSubmenu}
              auditLogs={auditLogs}
              auditSearch={auditSearch}
              onChangeAuditSearch={setAuditSearch}
              approvals={approvals}
              onExecuteApproval={executeQueuedProposalById}
              onDismissApproval={dismissQueuedProposalById}
              onRefreshApprovals={loadCommandCenterMeta}
            />
          )}

          {/* ==================== 11. SYSTEM HEALTH ==================== */}
          {activeTab === 'health' && (
            <SystemHealthPanel
              token={token}
              activeSubmenu={activeSubmenu}
              showToast={showToast}
              onTestEmailRelay={handleTestEmailRelay}
              testingEmail={testingEmail}
              emailTestResult={emailTestResult}
            />
          )}

          {/* ==================== 12. SETTINGS ==================== */}
          {activeTab === 'settings' && settings && (
            <div className="space-y-6">
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
                    All credentials remain isolated in server environment variables.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-5">
                  <h3 className="text-sm font-semibold text-white">Executive Security & Platform Policies</h3>

                  <div className="p-3.5 rounded-xl bg-[#050507] border border-[#d4af37]/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-[#f0cf65] flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" /> Optional Super Admin 2FA PIN
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Enforced during Super Admin sign-in when enabled with a 4+ digit PIN
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
                        title: 'Save General & Security Settings',
                        explanation:
                          'Updates executive 2FA PIN settings and global platform policies.',
                        consequences:
                          'Applies immediately to Super Admin authentication and public policies.',
                        proposedChanges: {
                          adminTwoFactorEnabled: settings.adminTwoFactorEnabled,
                          pinUpdated: new2faPin.trim().length >= 4
                        },
                        payload: {
                          settings,
                          ...(new2faPin.trim().length >= 4 ? { newAdminTwoFactorPin: new2faPin.trim() } : {})
                        }
                      })
                    }
                    className="w-full min-h-[40px] py-2.5 rounded-xl bg-[#d4af37] hover:bg-[#f0cf65] text-black font-bold text-xs"
                  >
                    Save Security Settings (Owner Approval)
                  </button>
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
        </main>
      </div>

      {/* Right-Side Collapsible Admin Navigation (12 Modules) */}
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
                    <img
                      src={kycDocPreviews[d.key]}
                      alt={d.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-44 object-contain rounded-lg bg-black"
                    />
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

      {/* Release Inspector & Metadata Correction Modal */}
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
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditingMetadata(v => !v)}
                  className="px-3 py-1.5 rounded-lg bg-[#050507] border border-[#d4af37]/40 text-xs text-[#f0cf65] inline-flex items-center gap-1.5"
                >
                  <Pencil className="w-3 h-3" /> {editingMetadata ? 'View Details' : 'Correct Metadata'}
                </button>
                <button onClick={() => setInspectedRelease(null)} className="text-xs text-slate-400 hover:text-white">
                  Close
                </button>
              </div>
            </div>

            {editingMetadata ? (
              <div className="p-4 rounded-xl bg-[#050507] border border-slate-800 space-y-3 text-xs">
                <p className="font-semibold text-[#f0cf65]">Metadata Correction (Owner Approval Required)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Release Title</label>
                    <input
                      type="text"
                      value={metadataForm.title}
                      onChange={e => setMetadataForm({ ...metadataForm, title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Primary Artist</label>
                    <input
                      type="text"
                      value={metadataForm.artist}
                      onChange={e => setMetadataForm({ ...metadataForm, artist: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">UPC Code</label>
                    <input
                      type="text"
                      value={metadataForm.upc}
                      onChange={e => setMetadataForm({ ...metadataForm, upc: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Record Label</label>
                    <input
                      type="text"
                      value={metadataForm.label}
                      onChange={e => setMetadataForm({ ...metadataForm, label: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Primary Genre</label>
                    <input
                      type="text"
                      value={metadataForm.primaryGenre}
                      onChange={e => setMetadataForm({ ...metadataForm, primaryGenre: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Language</label>
                    <input
                      type="text"
                      value={metadataForm.language}
                      onChange={e => setMetadataForm({ ...metadataForm, language: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Release Date</label>
                    <input
                      type="text"
                      value={metadataForm.releaseDate}
                      onChange={e => setMetadataForm({ ...metadataForm, releaseDate: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Territories</label>
                    <input
                      type="text"
                      value={metadataForm.territories}
                      onChange={e => setMetadataForm({ ...metadataForm, territories: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0c10] border border-slate-800 text-white"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() =>
                      setPendingProposal({
                        actionType: 'RELEASE_METADATA_UPDATE',
                        targetType: 'release',
                        targetId: inspectedRelease.id,
                        title: `Correct Release Metadata · ${inspectedRelease.title}`,
                        explanation: `Updates catalog metadata fields (Title, Artist, UPC, Genre, Language, Territories) for release ${inspectedRelease.id}.`,
                        consequences: 'Writes metadata changes directly to artist dashboard storage and logs correction history.',
                        proposedChanges: metadataForm,
                        payload: { updates: metadataForm }
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-[#d4af37] hover:bg-[#f0cf65] text-black font-bold"
                  >
                    Save Metadata Changes (Owner Approval)
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {(inspectedRelease.artworkUrl || inspectedRelease.coverUrl) ? (
                    <img
                      src={inspectedRelease.artworkUrl || inspectedRelease.coverUrl}
                      alt={inspectedRelease.title}
                      referrerPolicy="no-referrer"
                      className="w-40 h-40 object-cover rounded-xl border border-slate-800"
                    />
                  ) : (
                    <div className="w-40 h-40 rounded-xl bg-[#050507] border border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-1.5">
                      <Disc3 className="w-8 h-8 text-[#d4af37]/60" />
                      <span>No Artwork Uploaded</span>
                    </div>
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
                    <p>
                      <span className="text-slate-500">Release Date:</span> {inspectedRelease.releaseDate || '—'}
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

                {Array.isArray(inspectedRelease.metadataHistory) && inspectedRelease.metadataHistory.length > 0 && (
                  <div className="space-y-1.5 text-[11px] font-mono text-slate-400">
                    <p className="text-[#f0cf65]">Metadata Audit History</p>
                    {inspectedRelease.metadataHistory.slice(0, 5).map((mh: any, idx: number) => (
                      <div key={idx} className="p-2 rounded bg-[#050507] border border-slate-800">
                        {new Date(mh.updatedAt).toLocaleString()} by {mh.updatedBy}: {Object.keys(mh.changes || {}).join(', ')}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

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

      {/* Support Reply, Priority & Assignment Modal */}
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

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Ticket Status</label>
                <select
                  value={replyStatus}
                  onChange={e => setReplyStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-white"
                >
                  <option value="Open">Open</option>
                  <option value="Pending">Pending</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Priority</label>
                <select
                  value={replyPriority}
                  onChange={e => setReplyPriority(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-white"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Assigned Desk / Owner</label>
              <input
                type="text"
                value={replyAssignedTo}
                onChange={e => setReplyAssignedTo(e.target.value)}
                placeholder="e.g., Super Admin Desk, Royalty Desk..."
                className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
              />
            </div>

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
