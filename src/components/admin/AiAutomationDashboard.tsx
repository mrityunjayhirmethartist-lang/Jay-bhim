import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bot,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Mail,
  Send,
  Eye,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Trash2,
  Pencil,
  ShieldCheck,
  MessageSquare
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import type { AdminTab } from './adminTypes';

interface Props {
  token: string | null;
  includeTest: boolean;
  activeSubmenu: string;
  onSelectSubmenu: (tab: AdminTab, submenuId: string) => void;
  showToast: (type: 'ok' | 'err', text: string) => void;
}

const formatLogStatus = (status: string) => {
  if (status === 'SUCCESS') return 'Success';
  if (status === 'BLOCKED') return 'Blocked';
  if (status === 'FAILED') return 'Failed';
  return status || 'Unknown';
};

export const AiAutomationDashboard: React.FC<Props> = ({
  token,
  includeTest,
  activeSubmenu,
  onSelectSubmenu,
  showToast
}) => {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [dailyStats, setDailyStats] = useState<{ dailySentLast24h: number; dailyCap: number }>({
    dailySentLast24h: 0,
    dailyCap: 1000
  });
  const [tickets, setTickets] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [logStatusFilter, setLogStatusFilter] = useState<string>('ALL');
  const [logSearch, setLogSearch] = useState('');

  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    subject: '',
    headline: '',
    preheader: '',
    categoryLabel: 'ANNOUNCEMENT & OFFERS',
    bodyText: '',
    ctaLabel: 'Open Artist Dashboard',
    ctaUrl: 'https://rudraatma-music.onrender.com/dashboard',
    segment: 'all_eligible',
    specificEmailsRaw: '',
    scheduledFor: ''
  });
  const [aiTopic, setAiTopic] = useState('');
  const [generatingAiDraft, setGeneratingAiDraft] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);

  const [previewData, setPreviewData] = useState<{
    subject: string;
    htmlBody: string;
    textBody: string;
    audiencePreview?: {
      eligibleCount: number;
      skippedOptOutCount: number;
      skippedInactiveCount: number;
    };
  } | null>(null);
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html');
  const [inspectedCampaign, setInspectedCampaign] = useState<any | null>(null);

  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [sendEmailOnApprove, setSendEmailOnApprove] = useState<Record<string, boolean>>({});
  const [ticketBusyId, setTicketBusyId] = useState<string | null>(null);

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
      return res;
    },
    [token]
  );

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [ovRes, campRes, supRes, logRes] = await Promise.all([
        authFetch(`/api/super-admin/ai-automation/overview?includeTest=${includeTest}`),
        authFetch('/api/super-admin/ai-automation/campaigns'),
        authFetch('/api/super-admin/support'),
        authFetch(`/api/super-admin/ai-automation/logs?status=${logStatusFilter}&q=${encodeURIComponent(logSearch)}`)
      ]);

      if (ovRes.ok) {
        setOverview(await ovRes.json());
      }
      if (campRes.ok) {
        const cData = await campRes.json();
        setCampaigns(cData.campaigns || []);
        setDailyStats({
          dailySentLast24h: Number(cData.dailySentLast24h || 0),
          dailyCap: Number(cData.dailyCap || 1000)
        });
      }
      if (supRes.ok) {
        const sData = await supRes.json();
        setTickets(sData.tickets || []);
      }
      if (logRes.ok) {
        const lData = await logRes.json();
        setLogs(lData.logs || []);
      }
    } catch (err: any) {
      showToast('err', err?.message || 'Failed to load AI Automation metrics.');
    } finally {
      setLoading(false);
    }
  }, [token, includeTest, logStatusFilter, logSearch, authFetch, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleToggleMasterPause = async () => {
    const currentlyPaused = Boolean(overview?.statusSummary?.aiMasterPaused);
    try {
      const res = await authFetch(
        currentlyPaused
          ? '/api/super-admin/ai-automation/resume'
          : '/api/super-admin/ai-automation/pause',
        {
          method: 'POST',
          body: JSON.stringify({
            reason: currentlyPaused
              ? 'Super Admin resumed AI automation from dashboard'
              : 'Immediate pause triggered from AI Automation Dashboard'
          })
        }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to update automation state.');
      showToast(
        'ok',
        currentlyPaused
          ? 'AI Automation Engine resumed cleanly.'
          : 'All AI Automation paused immediately and logged.'
      );
      await loadAll();
    } catch (err: any) {
      showToast('err', err?.message || 'Action failed.');
    }
  };

  const resetCampaignForm = () => {
    setEditingCampaignId(null);
    setCampaignForm({
      name: '',
      subject: '',
      headline: '',
      preheader: '',
      categoryLabel: 'ANNOUNCEMENT & OFFERS',
      bodyText: '',
      ctaLabel: 'Open Artist Dashboard',
      ctaUrl: 'https://rudraatma-music.onrender.com/dashboard',
      segment: 'all_eligible',
      specificEmailsRaw: '',
      scheduledFor: ''
    });
  };

  const parseSpecificEmails = () =>
    campaignForm.specificEmailsRaw
      .split(/[\n,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

  const handleAiGenerateCampaignDraft = async () => {
    setGeneratingAiDraft(true);
    try {
      const res = await authFetch('/api/super-admin/ai-automation/campaigns/ai-draft', {
        method: 'POST',
        body: JSON.stringify({
          topic: aiTopic || campaignForm.name || 'New Music Distribution Features & Offers',
          audienceSegment: campaignForm.segment
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Permission denied or AI draft failed.');
      const d = data.draft || {};
      setCampaignForm(prev => ({
        ...prev,
        name: prev.name || d.headline || 'AI Campaign Draft',
        subject: d.subject || prev.subject,
        headline: d.headline || prev.headline,
        preheader: d.preheader || prev.preheader,
        categoryLabel: d.categoryLabel || prev.categoryLabel,
        bodyText: d.bodyText || prev.bodyText,
        ctaLabel: d.ctaLabel || prev.ctaLabel,
        ctaUrl: d.ctaUrl || prev.ctaUrl
      }));
      showToast('ok', 'AI promotional draft populated for review.');
      await loadAll();
    } catch (err: any) {
      showToast('err', err?.message || 'Unable to generate AI draft.');
    } finally {
      setGeneratingAiDraft(false);
    }
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCampaign(true);
    try {
      const payload = {
        name: campaignForm.name || campaignForm.subject,
        subject: campaignForm.subject,
        headline: campaignForm.headline || campaignForm.subject,
        preheader: campaignForm.preheader,
        categoryLabel: campaignForm.categoryLabel,
        bodyText: campaignForm.bodyText,
        ctaLabel: campaignForm.ctaLabel,
        ctaUrl: campaignForm.ctaUrl,
        segment: campaignForm.segment,
        specificEmails: parseSpecificEmails(),
        scheduledFor: campaignForm.scheduledFor || null
      };
      const res = await authFetch(
        editingCampaignId
          ? `/api/super-admin/ai-automation/campaigns/${editingCampaignId}`
          : '/api/super-admin/ai-automation/campaigns',
        {
          method: editingCampaignId ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save campaign.');
      showToast('ok', editingCampaignId ? 'Campaign updated.' : 'Promotional campaign saved.');
      resetCampaignForm();
      await loadAll();
    } catch (err: any) {
      showToast('err', err?.message || 'Save failed.');
    } finally {
      setSavingCampaign(false);
    }
  };

  const handlePreviewCampaign = async (override?: any) => {
    const src = override || {
      ...campaignForm,
      specificEmails: parseSpecificEmails()
    };
    try {
      const res = await authFetch('/api/super-admin/ai-automation/campaigns/preview', {
        method: 'POST',
        body: JSON.stringify(src)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview generation failed.');
      setPreviewData(data);
    } catch (err: any) {
      showToast('err', err?.message || 'Failed to preview email.');
    }
  };

  const handleCampaignAction = async (
    id: string,
    action: 'approve' | 'send' | 'cancel' | 'delete',
    confirmSend = false
  ) => {
    try {
      const endpoint =
        action === 'delete'
          ? `/api/super-admin/ai-automation/campaigns/${id}`
          : `/api/super-admin/ai-automation/campaigns/${id}/${action}`;
      const res = await authFetch(endpoint, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        body: action === 'send' ? JSON.stringify({ confirmSend }) : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} campaign.`);
      showToast('ok', `Campaign ${action} action completed.`);
      await loadAll();
    } catch (err: any) {
      showToast('err', err?.message || 'Campaign action blocked.');
    }
  };

  const handleAnalyzeTicket = async (ticketId: string) => {
    setTicketBusyId(ticketId);
    try {
      const res = await authFetch(`/api/super-admin/ai-automation/tickets/${ticketId}/analyze`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI ticket triage failed.');
      showToast('ok', `Ticket ${ticketId} processed (${data.actionTaken}).`);
      await loadAll();
    } catch (err: any) {
      showToast('err', err?.message || 'AI ticket triage blocked.');
    } finally {
      setTicketBusyId(null);
    }
  };

  const handleApproveTicketDraft = async (ticket: any) => {
    setTicketBusyId(ticket.id);
    try {
      const res = await authFetch(
        `/api/super-admin/ai-automation/tickets/${ticket.id}/approve-draft`,
        {
          method: 'POST',
          body: JSON.stringify({
            customReply: draftEdits[ticket.id] ?? ticket.aiDraftReply,
            status: 'Resolved',
            sendEmailNotification: Boolean(sendEmailOnApprove[ticket.id])
          })
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve ticket draft.');
      showToast('ok', `Approved and sent reply for ticket ${ticket.id}.`);
      await loadAll();
    } catch (err: any) {
      showToast('err', err?.message || 'Approval failed.');
    } finally {
      setTicketBusyId(null);
    }
  };

  const handleRejectTicketDraft = async (ticketId: string) => {
    setTicketBusyId(ticketId);
    try {
      const res = await authFetch(`/api/super-admin/ai-automation/tickets/${ticketId}/reject-draft`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject draft.');
      showToast('ok', `Rejected AI draft for ticket ${ticketId}.`);
      await loadAll();
    } catch (err: any) {
      showToast('err', err?.message || 'Action failed.');
    } finally {
      setTicketBusyId(null);
    }
  };

  const metrics = overview?.metrics || {
    totalRegisteredUsers: 0,
    promoEligibleUsers: 0,
    promoOptOutUsers: 0,
    totalTickets: 0,
    pendingTickets: 0,
    resolvedTickets: 0,
    escalatedTickets: 0,
    aiGeneratedReplies: 0,
    aiPendingDraftApprovals: 0,
    totalCampaigns: 0,
    promoEmailsSent: 0,
    promoEmailsFailed: 0,
    promoEmailsPending: 0
  };
  const statusSummary = overview?.statusSummary || {};

  const section = useMemo(() => {
    if (
      activeSubmenu === 'promo-campaigns' ||
      activeSubmenu === 'ticket-automation' ||
      activeSubmenu === 'automation-logs'
    ) {
      return activeSubmenu;
    }
    return 'automation-overview';
  }, [activeSubmenu]);

  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const score = (t: any) =>
        (t.aiDraftStatus === 'PENDING_APPROVAL' ? 3 : 0) +
        (t.escalatedToSuperAdmin ? 2 : 0) +
        (t.status !== 'Resolved' ? 1 : 0);
      return score(b) - score(a);
    });
  }, [tickets]);

  return (
    <div className="space-y-6">
      {/* Top Automation Control & Emergency Switch */}
      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/30 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-[#f0cf65]" />
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold text-white">
              AI Automation & Campaign Control Center
            </h2>
            <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                Engine:{' '}
                <span
                  className={
                    statusSummary.aiMasterPaused
                      ? 'text-rose-400 font-medium'
                      : 'text-emerald-400 font-medium'
                  }
                >
                  {statusSummary.aiMasterPaused ? 'Paused' : 'Active'}
                </span>
              </span>
              <span className="text-slate-600">·</span>
              <span>
                Promo AI:{' '}
                <span className="text-slate-200 font-medium">
                  {statusSummary.promoAutomationEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </span>
              <span className="text-slate-600">·</span>
              <span>
                Ticket Auto-Reply:{' '}
                <span className="text-slate-200 font-medium">
                  {statusSummary.ticketAutoReplyEnabled ? 'Automatic' : 'Requires Approval'}
                </span>
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => onSelectSubmenu('settings', 'support-management')}
            className="h-9 px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 transition-colors"
          >
            Configure Permissions
          </button>
          <button
            onClick={loadAll}
            disabled={loading}
            className="h-9 px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleToggleMasterPause}
            className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              statusSummary.aiMasterPaused
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300'
            }`}
          >
            {statusSummary.aiMasterPaused ? (
              <>
                <PlayCircle className="w-4 h-4" />
                Resume All AI Automation
              </>
            ) : (
              <>
                <PauseCircle className="w-4 h-4" />
                Pause All AI Automation
              </>
            )}
          </button>
        </div>
      </div>

      {/* Submenu Switcher */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-white/[0.08]">
        {[
          { id: 'automation-overview', label: 'Automation Overview' },
          { id: 'promo-campaigns', label: `Promotional Campaigns (${campaigns.length})` },
          {
            id: 'ticket-automation',
            label: `AI Support Queue (${metrics.aiPendingDraftApprovals} Pending)`
          },
          { id: 'automation-logs', label: `Audit & Activity Logs (${logs.length})` }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => onSelectSubmenu('ai-automation', tab.id)}
            className={`h-9 px-4 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors mb-2 ${
              section === tab.id
                ? 'bg-[#d4af37]/15 text-[#f0cf65] border border-[#d4af37]/40 font-semibold'
                : 'bg-[#111319] text-slate-400 hover:text-white border border-white/[0.08]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Real KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { label: 'Registered Users', value: metrics.totalRegisteredUsers, tone: 'text-white' },
          { label: 'Total Tickets', value: metrics.totalTickets, tone: 'text-white' },
          { label: 'Pending Tickets', value: metrics.pendingTickets, tone: 'text-amber-300' },
          { label: 'Resolved Tickets', value: metrics.resolvedTickets, tone: 'text-emerald-400' },
          { label: 'AI Replies Sent', value: metrics.aiGeneratedReplies, tone: 'text-[#f0cf65]' },
          { label: 'Promo Sent', value: metrics.promoEmailsSent, tone: 'text-emerald-400' },
          { label: 'Promo Failed', value: metrics.promoEmailsFailed, tone: 'text-rose-400' },
          { label: 'Promo Pending', value: metrics.promoEmailsPending, tone: 'text-amber-300' }
        ].map(card => (
          <div
            key={card.label}
            className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-1.5"
          >
            <p className="text-xs text-slate-400 truncate">{card.label}</p>
            <p className={`text-xl font-semibold tabular-nums ${card.tone}`}>
              {Number(card.value).toLocaleString('en-IN')}
            </p>
          </div>
        ))}
      </div>

      {/* ==================== SECTION 1: OVERVIEW ==================== */}
      {section === 'automation-overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Live Automation Summary</h3>
              <button
                onClick={() => onSelectSubmenu('settings', 'ai-behaviour')}
                className="text-xs font-medium text-[#f0cf65] hover:underline"
              >
                Open Settings
              </button>
            </div>
            <div className="divide-y divide-white/[0.06] text-xs">
              <div className="py-3 flex items-center justify-between gap-3">
                <span className="text-slate-400">Promotional Eligible / Opted-Out</span>
                <span className="tabular-nums font-medium text-white">
                  {metrics.promoEligibleUsers} Eligible / {metrics.promoOptOutUsers} Opted Out
                </span>
              </div>
              <div className="py-3 flex items-center justify-between gap-3">
                <span className="text-slate-400">24h Promotional Send Cap Usage</span>
                <span className="tabular-nums font-medium text-white">
                  {dailyStats.dailySentLast24h} / {dailyStats.dailyCap}
                </span>
              </div>
              <div className="py-3 flex items-center justify-between gap-3">
                <span className="text-slate-400">Escalated Support Tickets</span>
                <span className="tabular-nums font-medium text-amber-300">
                  {metrics.escalatedTickets} Flagged
                </span>
              </div>
              <div className="py-3 flex items-center justify-between gap-3">
                <span className="text-slate-400">AI Support Drafts Awaiting Approval</span>
                <span className="tabular-nums font-medium text-[#f0cf65]">
                  {metrics.aiPendingDraftApprovals} Drafts
                </span>
              </div>
              <div className="py-3 flex items-center justify-between gap-3">
                <span className="text-slate-400">Master Auto-Email Sending</span>
                <span
                  className={`font-semibold px-2.5 py-0.5 rounded-lg text-[11px] ${
                    statusSummary.autoEmailSendingEnabled
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {statusSummary.autoEmailSendingEnabled ? 'Enabled' : 'Paused'}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Recent AI Automation Activity</h3>
              <button
                onClick={() => onSelectSubmenu('ai-automation', 'automation-logs')}
                className="text-xs font-medium text-[#f0cf65] hover:underline"
              >
                View Full Audit Log
              </button>
            </div>
            {(overview?.recentActions || []).length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                No AI automation events logged yet.
              </p>
            ) : (
              <div className="divide-y divide-white/[0.06] max-h-72 overflow-y-auto text-xs">
                {(overview?.recentActions || []).slice(0, 10).map((entry: any) => (
                  <div key={entry.id} className="py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white truncate">{entry.action}</span>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 ${
                          entry.status === 'SUCCESS'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : entry.status === 'BLOCKED'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {formatLogStatus(entry.status)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{entry.details}</p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {entry.actorEmail} · {entry.permissionKey} ·{' '}
                      {new Date(entry.timestamp).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SECTION 2: PROMOTIONAL EMAIL AUTOMATION ==================== */}
      {section === 'promo-campaigns' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <form
            onSubmit={handleSaveCampaign}
            className="xl:col-span-5 rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#d4af37]" />
                {editingCampaignId ? 'Edit Promotional Campaign' : 'Create Promotional Campaign'}
              </h3>
              {editingCampaignId && (
                <button
                  type="button"
                  onClick={resetCampaignForm}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {!statusSummary.promoAutomationEnabled && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <span className="font-semibold">
                    Promotional Email Automation is currently turned off.
                  </span>{' '}
                  AI drafting and promotional campaign dispatch are paused until enabled in
                  Settings → Email & Notifications.
                </div>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] space-y-2.5">
              <label className="block text-xs font-medium text-[#f0cf65]">
                AI Campaign Copy Generator
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={aiTopic}
                  onChange={e => setAiTopic(e.target.value)}
                  placeholder="Topic (e.g., New Spotify Delivery Accelerator & Offers)"
                  className="flex-1 h-9 px-3 rounded-xl bg-[#111319] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleAiGenerateCampaignDraft}
                  disabled={generatingAiDraft}
                  className="h-9 px-3.5 rounded-xl bg-[#d4af37]/15 hover:bg-[#d4af37]/25 border border-[#d4af37]/40 text-xs font-semibold text-[#f0cf65] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {generatingAiDraft ? 'Drafting...' : 'AI Draft'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Campaign Name</label>
                <input
                  type="text"
                  value={campaignForm.name}
                  onChange={e => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  placeholder="Q3 Distribution Offer"
                  className="w-full h-9 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Category Badge</label>
                <input
                  type="text"
                  value={campaignForm.categoryLabel}
                  onChange={e =>
                    setCampaignForm({ ...campaignForm, categoryLabel: e.target.value })
                  }
                  className="w-full h-9 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white"
                />
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Email Subject *</label>
                <input
                  type="text"
                  required
                  value={campaignForm.subject}
                  onChange={e => setCampaignForm({ ...campaignForm, subject: e.target.value })}
                  placeholder="Unlock Priority Release Distribution on Rudraatma Music"
                  className="w-full h-9 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Banner Headline *</label>
                <input
                  type="text"
                  required
                  value={campaignForm.headline}
                  onChange={e => setCampaignForm({ ...campaignForm, headline: e.target.value })}
                  placeholder="Distribute Faster Across 150+ Stores"
                  className="w-full h-9 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Email Body Copy *</label>
                <textarea
                  rows={5}
                  required
                  value={campaignForm.bodyText}
                  onChange={e => setCampaignForm({ ...campaignForm, bodyText: e.target.value })}
                  placeholder="Write your announcement, feature update, or promotional offer..."
                  className="w-full p-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">CTA Button Label</label>
                  <input
                    type="text"
                    value={campaignForm.ctaLabel}
                    onChange={e => setCampaignForm({ ...campaignForm, ctaLabel: e.target.value })}
                    className="w-full h-9 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">CTA Destination URL</label>
                  <input
                    type="url"
                    value={campaignForm.ctaUrl}
                    onChange={e => setCampaignForm({ ...campaignForm, ctaUrl: e.target.value })}
                    className="w-full h-9 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Target Audience Group</label>
                  <select
                    value={campaignForm.segment}
                    onChange={e => setCampaignForm({ ...campaignForm, segment: e.target.value })}
                    className="w-full h-9 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white"
                  >
                    <option value="all_eligible">All Eligible Active Users</option>
                    <option value="active_subscribers">Active Plan Subscribers</option>
                    <option value="free_users">Free / Non-Subscribed Users</option>
                    <option value="approved_artists">Approved Artist Profiles</option>
                    <option value="specific_emails">Specific Email Addresses</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Schedule Date & Time (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={campaignForm.scheduledFor}
                    onChange={e =>
                      setCampaignForm({ ...campaignForm, scheduledFor: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white tabular-nums"
                  />
                </div>
              </div>

              {campaignForm.segment === 'specific_emails' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Specific User Emails (comma or newline separated)
                  </label>
                  <textarea
                    rows={2}
                    value={campaignForm.specificEmailsRaw}
                    onChange={e =>
                      setCampaignForm({ ...campaignForm, specificEmailsRaw: e.target.value })
                    }
                    placeholder="artist1@example.com, artist2@example.com"
                    className="w-full p-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-white"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handlePreviewCampaign()}
                className="h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview Email
              </button>
              <button
                type="submit"
                disabled={savingCampaign}
                className="flex-1 h-10 px-4 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] text-[#090a0e] text-xs font-semibold"
              >
                {savingCampaign
                  ? 'Saving...'
                  : editingCampaignId
                    ? 'Save Campaign Changes'
                    : campaignForm.scheduledFor
                      ? 'Save & Queue Schedule'
                      : 'Create Campaign'}
              </button>
            </div>
          </form>

          {/* Campaign List & Delivery Metrics */}
          <div className="xl:col-span-7 rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">
                Campaign History & Delivery Tracker ({campaigns.length})
              </h3>
              <span className="text-xs text-slate-400 tabular-nums">
                Opted-Out Users Excluded: {metrics.promoOptOutUsers}
              </span>
            </div>

            {campaigns.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-white/[0.08] rounded-xl space-y-2">
                <p className="text-xs text-slate-400">
                  No promotional campaigns created yet. Build a template on the left and preview
                  before approval.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map(camp => (
                  <div
                    key={camp.id}
                    className="p-4 rounded-2xl bg-[#090a0e] border border-white/[0.08] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{camp.name}</span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#d4af37]/15 text-[#f0cf65]">
                            {camp.status}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Segment: {camp.segment}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 break-words">{camp.subject}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          Created {new Date(camp.createdAt).toLocaleString('en-IN')}
                          {camp.scheduledFor
                            ? ` · Scheduled ${new Date(camp.scheduledFor).toLocaleString('en-IN')}`
                            : ''}
                          {camp.approvedBy ? ` · Approved by ${camp.approvedBy}` : ''}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handlePreviewCampaign(camp)}
                          className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-slate-200 inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview
                        </button>
                        {camp.status !== 'COMPLETED' && camp.status !== 'SENDING' && (
                          <button
                            onClick={() => {
                              setEditingCampaignId(camp.id);
                              setCampaignForm({
                                name: camp.name || '',
                                subject: camp.subject || '',
                                headline: camp.headline || '',
                                preheader: camp.preheader || '',
                                categoryLabel: camp.categoryLabel || 'ANNOUNCEMENT & OFFERS',
                                bodyText: camp.bodyText || '',
                                ctaLabel: camp.ctaLabel || '',
                                ctaUrl: camp.ctaUrl || '',
                                segment: camp.segment || 'all_eligible',
                                specificEmailsRaw: (camp.specificEmails || []).join(', '),
                                scheduledFor: camp.scheduledFor
                                  ? camp.scheduledFor.slice(0, 16)
                                  : ''
                              });
                            }}
                            className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-slate-200 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                        )}
                        {!camp.approvedBy && camp.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleCampaignAction(camp.id, 'approve')}
                            className="h-8 px-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 font-medium"
                          >
                            Approve
                          </button>
                        )}
                        {camp.status !== 'COMPLETED' && camp.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleCampaignAction(camp.id, 'send', true)}
                            className="h-8 px-3 rounded-lg bg-[#d4af37] hover:bg-[#e5c354] text-[#090a0e] text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Send className="w-3.5 h-3.5" /> Send Now
                          </button>
                        )}
                        <button
                          onClick={() => setInspectedCampaign(camp)}
                          className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-[#f0cf65]"
                        >
                          Report
                        </button>
                        <button
                          onClick={() => handleCampaignAction(camp.id, 'delete')}
                          aria-label="Delete campaign"
                          className="h-8 w-8 rounded-lg bg-white/[0.06] hover:bg-rose-500/15 text-slate-400 hover:text-rose-300 inline-flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Exact Recipient Delivery Counters */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-white/[0.06] text-xs tabular-nums">
                      <div>
                        <span className="text-slate-500 text-[11px] block">Recipients</span>
                        <span className="text-white font-semibold">
                          {camp.stats?.totalRecipients ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">Delivered</span>
                        <span className="text-emerald-400 font-semibold">
                          {camp.stats?.deliveredCount ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">Failed</span>
                        <span className="text-rose-400 font-semibold">
                          {camp.stats?.failedCount ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">Pending</span>
                        <span className="text-amber-300 font-semibold">
                          {camp.stats?.pendingCount ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">Opt-Out Skip</span>
                        <span className="text-slate-300 font-semibold">
                          {camp.stats?.skippedOptOutCount ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SECTION 3: AI SUPPORT TICKET QUEUE ==================== */}
      {section === 'ticket-automation' && (
        <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#d4af37]" />
                AI Support Ticket Triage, Draft Approvals & Escalations ({sortedTickets.length})
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                New artist support tickets are automatically triaged under Settings → Support
                Management permissions. Review, edit, or approve AI draft replies below.
              </p>
            </div>
          </div>

          {sortedTickets.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">
              No support tickets found in artist dashboards.
            </p>
          ) : (
            <div className="space-y-4">
              {sortedTickets.map(ticket => {
                const draftText = draftEdits[ticket.id] ?? ticket.aiDraftReply ?? '';
                const isBusy = ticketBusyId === ticket.id;
                return (
                  <div
                    key={ticket.id}
                    className="p-4 rounded-2xl bg-[#090a0e] border border-white/[0.08] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-white">{ticket.subject}</span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white/[0.06] text-slate-300">
                            {ticket.status}
                          </span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300">
                            Priority: {ticket.priority || 'Medium'}
                          </span>
                          {ticket.escalatedToSuperAdmin && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300">
                              Escalated to Super Admin
                            </span>
                          )}
                          {ticket.aiDraftStatus && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#d4af37]/15 text-[#f0cf65]">
                              AI: {ticket.aiDraftStatus}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 tabular-nums">
                          ID: {ticket.id} · {ticket.userName} ({ticket.userEmail}) · Category:{' '}
                          {ticket.aiCategory || ticket.category}
                          {typeof ticket.aiConfidence === 'number'
                            ? ` · Confidence: ${ticket.aiConfidence}%`
                            : ''}
                        </p>
                        {ticket.escalationReason && (
                          <p className="text-xs text-rose-300">
                            Escalation Reason: {ticket.escalationReason}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => handleAnalyzeTicket(ticket.id)}
                        disabled={isBusy}
                        className="h-9 px-3.5 rounded-xl bg-[#d4af37]/15 hover:bg-[#d4af37]/25 border border-[#d4af37]/40 text-xs font-medium text-[#f0cf65] inline-flex items-center gap-1.5 shrink-0 self-start"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {isBusy ? 'Processing...' : 'Run AI Triage'}
                      </button>
                    </div>

                    {/* Ticket Conversation Thread */}
                    <div className="p-3.5 rounded-xl bg-[#111319] border border-white/[0.06] space-y-2 text-xs max-h-40 overflow-y-auto">
                      {(ticket.messages || []).map((m: any, idx: number) => (
                        <div key={idx} className="text-slate-300 leading-relaxed">
                          <span className="font-semibold text-white">{m.sender}:</span> {m.text}{' '}
                          <span className="text-[11px] text-slate-500 tabular-nums">({m.time})</span>
                        </div>
                      ))}
                    </div>

                    {/* AI Draft Reply Editor & Approval Actions */}
                    <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-medium text-[#f0cf65]">
                          AI Suggested / Prepared Reply (Editable Before Sending)
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(sendEmailOnApprove[ticket.id])}
                            onChange={e =>
                              setSendEmailOnApprove(prev => ({
                                ...prev,
                                [ticket.id]: e.target.checked
                              }))
                            }
                            className="w-4 h-4 accent-[#d4af37] rounded"
                          />
                          Also send ticket email alert
                        </label>
                      </div>
                      <textarea
                        rows={3}
                        value={draftText}
                        onChange={e =>
                          setDraftEdits(prev => ({ ...prev, [ticket.id]: e.target.value }))
                        }
                        placeholder="Run AI Triage to generate a reply draft, or type a custom response..."
                        className="w-full p-3 rounded-xl bg-[#111319] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-xs text-white"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        {ticket.aiDraftStatus === 'PENDING_APPROVAL' && (
                          <button
                            onClick={() => handleRejectTicketDraft(ticket.id)}
                            disabled={isBusy}
                            className="h-9 px-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 font-medium"
                          >
                            Reject Draft
                          </button>
                        )}
                        <button
                          onClick={() => handleApproveTicketDraft(ticket)}
                          disabled={isBusy || !draftText.trim()}
                          className="h-9 px-4 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] disabled:opacity-40 text-[#090a0e] text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve & Send Reply
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== SECTION 4: AUDIT & ACTIVITY LOGS ==================== */}
      {section === 'automation-logs' && (
        <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#d4af37]" />
              AI Automation Activity & Audit Log ({logs.length})
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  placeholder="Search actor, action, permission..."
                  className="w-full sm:w-56 h-9 pl-8 pr-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-xs text-white"
                />
              </div>
              <select
                value={logStatusFilter}
                onChange={e => setLogStatusFilter(e.target.value)}
                className="h-9 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 outline-none text-xs text-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUCCESS">Success Only</option>
                <option value="BLOCKED">Blocked Only</option>
                <option value="FAILED">Failed Only</option>
              </select>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden space-y-3">
            {logs.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                No matching audit log entries found.
              </p>
            ) : (
              logs.map(l => (
                <div
                  key={l.id}
                  className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#f0cf65] truncate">{l.action}</span>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 ${
                        l.status === 'SUCCESS'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : l.status === 'BLOCKED'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {formatLogStatus(l.status)}
                    </span>
                  </div>
                  <p className="text-slate-300">{l.details}</p>
                  <div className="text-[11px] text-slate-400 tabular-nums space-y-0.5">
                    <p>Actor: {l.actorEmail}</p>
                    <p>Permission: {l.permissionKey}</p>
                    <p>Time: {new Date(l.timestamp).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400 bg-[#0d0f14]">
                  <th className="py-3 px-3 font-medium">Timestamp</th>
                  <th className="py-3 px-3 font-medium">Actor</th>
                  <th className="py-3 px-3 font-medium">Action</th>
                  <th className="py-3 px-3 font-medium">Permission Key</th>
                  <th className="py-3 px-3 font-medium">Status</th>
                  <th className="py-3 px-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No matching audit log entries found.
                    </td>
                  </tr>
                ) : (
                  logs.map(l => (
                    <tr key={l.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-3 text-slate-400 tabular-nums whitespace-nowrap">
                        {new Date(l.timestamp).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-3 text-white whitespace-nowrap">{l.actorEmail}</td>
                      <td className="py-3 px-3 font-medium text-[#f0cf65] whitespace-nowrap">
                        {l.action}
                      </td>
                      <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                        {l.permissionKey}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                            l.status === 'SUCCESS'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : l.status === 'BLOCKED'
                                ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {formatLogStatus(l.status)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300 max-w-md">{l.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Email Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-4xl w-full max-h-[90vh] flex flex-col rounded-2xl bg-[#111319] border border-[#d4af37]/30 overflow-hidden shadow-2xl">
            <div className="px-5 py-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#f0cf65] truncate">
                  Promotional Email Preview · {previewData.subject}
                </h3>
                {previewData.audiencePreview && (
                  <p className="text-xs text-slate-400 tabular-nums mt-0.5">
                    Eligible: {previewData.audiencePreview.eligibleCount} · Opted-Out Excluded:{' '}
                    {previewData.audiencePreview.skippedOptOutCount} · Inactive Skipped:{' '}
                    {previewData.audiencePreview.skippedInactiveCount}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setPreviewMode('html')}
                  className={`h-8 px-3 rounded-lg text-xs font-medium ${
                    previewMode === 'html'
                      ? 'bg-[#d4af37] text-[#090a0e] font-semibold'
                      : 'bg-white/[0.06] text-slate-300 hover:text-white'
                  }`}
                >
                  HTML Design
                </button>
                <button
                  onClick={() => setPreviewMode('text')}
                  className={`h-8 px-3 rounded-lg text-xs font-medium ${
                    previewMode === 'text'
                      ? 'bg-[#d4af37] text-[#090a0e] font-semibold'
                      : 'bg-white/[0.06] text-slate-300 hover:text-white'
                  }`}
                >
                  Plain Text
                </button>
                <button
                  onClick={() => setPreviewData(null)}
                  className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-[#090a0e]">
              {previewMode === 'html' ? (
                <iframe
                  title="Promotional Email HTML Preview"
                  srcDoc={previewData.htmlBody}
                  className="w-full h-[540px] rounded-xl border border-white/[0.08] bg-[#07070a]"
                />
              ) : (
                <pre className="p-4 rounded-xl bg-[#111319] border border-white/[0.08] text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {previewData.textBody}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Campaign Delivery Report Modal */}
      {inspectedCampaign && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[88vh] overflow-y-auto rounded-2xl bg-[#111319] border border-[#d4af37]/30 p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-3.5">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#f0cf65] truncate">
                  Campaign Delivery Breakdown · {inspectedCampaign.name}
                </h3>
                <p className="text-xs text-slate-400 tabular-nums mt-0.5">
                  ID: {inspectedCampaign.id} · Status: {inspectedCampaign.status}
                </p>
              </div>
              <button
                onClick={() => setInspectedCampaign(null)}
                className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-slate-300 hover:text-white shrink-0"
              >
                Close
              </button>
            </div>
            {inspectedCampaign.lastError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200">
                Latest Relay Error: {inspectedCampaign.lastError}
              </div>
            )}

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2.5">
              {(inspectedCampaign.recipientResults || []).length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  Campaign has not been dispatched yet.
                </p>
              ) : (
                (inspectedCampaign.recipientResults || []).map((r: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#090a0e] border border-white/[0.08] space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white break-all">{r.email}</span>
                      {r.status === 'delivered' ? (
                        <span className="text-emerald-400 inline-flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Delivered
                        </span>
                      ) : r.status === 'failed' ? (
                        <span className="text-rose-400 inline-flex items-center gap-1 shrink-0">
                          <XCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      ) : (
                        <span className="text-amber-300 inline-flex items-center gap-1 shrink-0">
                          <Clock className="w-3.5 h-3.5" /> {r.status}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-[11px] tabular-nums">
                      Sent: {r.sentAt ? new Date(r.sentAt).toLocaleString('en-IN') : '—'}
                    </p>
                    <p className="text-slate-300 text-[11px]">
                      {r.error || 'Delivered via Apps Script'}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400 bg-[#0d0f14]">
                    <th className="py-2.5 px-3 font-medium">Recipient</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3 font-medium">Sent At</th>
                    <th className="py-2.5 px-3 font-medium">Details / Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {(inspectedCampaign.recipientResults || []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">
                        Campaign has not been dispatched yet.
                      </td>
                    </tr>
                  ) : (
                    (inspectedCampaign.recipientResults || []).map((r: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 text-white">{r.email}</td>
                        <td className="py-2.5 px-3">
                          {r.status === 'delivered' ? (
                            <span className="text-emerald-400 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Delivered
                            </span>
                          ) : r.status === 'failed' ? (
                            <span className="text-rose-400 inline-flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" /> Failed
                            </span>
                          ) : (
                            <span className="text-amber-300 inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" /> {r.status}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 tabular-nums">
                          {r.sentAt ? new Date(r.sentAt).toLocaleString('en-IN') : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          {r.error || 'Delivered via Apps Script'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
