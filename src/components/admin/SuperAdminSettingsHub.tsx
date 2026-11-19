import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings,
  MessageSquare,
  Users,
  Shield,
  Bot,
  Mail,
  LifeBuoy,
  CheckSquare,
  Cpu,
  UserCog,
  Save,
  Eye,
  Lock,
  Megaphone,
  Send,
  PauseCircle,
  PlayCircle,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import type { AdminTab, OwnerApprovalProposalInput, DataIntegrityMeta } from './adminTypes';

interface Props {
  token: string | null;
  activeSubmenu: string;
  onSelectSubmenu: (tab: AdminTab, submenuId: string) => void;
  platformSettings: any;
  onChangePlatformSettings: (next: any) => void;
  emailConfig: any;
  gatewayConfig: any;
  integrity: DataIntegrityMeta | null;
  testingEmail: boolean;
  emailTestResult: { ok: boolean; message: string } | null;
  onTestEmailRelay: () => void;
  onOpenOtpPreview: () => void;
  onProposeOwnerApproval: (prop: OwnerApprovalProposalInput) => void;
  onOpenSessionModal: () => void;
  adminEmail?: string;
  showToast: (type: 'ok' | 'err', text: string) => void;
}

const SECTIONS = [
  { id: 'general-settings', label: 'General Settings', icon: Settings },
  { id: 'chat-history', label: 'Chat History Management', icon: MessageSquare },
  { id: 'user-permissions', label: 'User Permissions', icon: Users },
  { id: 'privacy-security', label: 'Privacy & Security', icon: Shield },
  { id: 'ai-behaviour', label: 'AI Behaviour', icon: Bot },
  { id: 'email-notifications', label: 'Email & Notifications', icon: Mail },
  { id: 'support-management', label: 'Support Management', icon: LifeBuoy },
  { id: 'automation-approvals', label: 'Automation & Approvals', icon: CheckSquare },
  { id: 'api-integrations', label: 'API & Integrations', icon: Cpu },
  { id: 'account-management', label: 'Account Management', icon: UserCog }
] as const;

const ToggleRow: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <label className="p-3.5 rounded-xl bg-[#050507] border border-slate-800 hover:border-slate-700 flex items-start justify-between gap-4 cursor-pointer">
    <div className="space-y-0.5">
      <span className="text-xs font-semibold text-white block">{label}</span>
      <span className="text-[11px] text-slate-400 block">{description}</span>
    </div>
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="w-4 h-4 mt-0.5 accent-[#d4af37] shrink-0"
    />
  </label>
);

export const SuperAdminSettingsHub: React.FC<Props> = ({
  token,
  activeSubmenu,
  onSelectSubmenu,
  platformSettings,
  onChangePlatformSettings,
  emailConfig,
  gatewayConfig,
  integrity,
  testingEmail,
  emailTestResult,
  onTestEmailRelay,
  onOpenOtpPreview,
  onProposeOwnerApproval,
  onOpenSessionModal,
  adminEmail,
  showToast
}) => {
  const [autoSettings, setAutoSettings] = useState<any>(null);
  const [integrations, setIntegrations] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [chatTurns, setChatTurns] = useState<any[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);

  const [new2faPin, setNew2faPin] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [serviceTestMsg, setServiceTestMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  const activeSection = useMemo(() => {
    if (activeSubmenu === 'email-configuration' || activeSubmenu === 'broadcast-notifications') {
      return 'email-notifications';
    }
    if (activeSubmenu === 'payment-gateway') {
      return 'api-integrations';
    }
    const found = SECTIONS.find(s => s.id === activeSubmenu);
    return found ? found.id : 'general-settings';
  }, [activeSubmenu]);

  const loadSettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/super-admin/ai-automation/settings'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        setAutoSettings(d.settings);
        setIntegrations(d.integrations);
      }
    } catch {
      // Ignore transient error
    }
  }, [token]);

  const loadChatHistory = useCallback(async () => {
    if (!token) return;
    setLoadingChats(true);
    setChatError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/super-admin/ai-automation/chat-history?q=${encodeURIComponent(chatSearch)}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d = await res.json();
      if (!res.ok) {
        setChatTurns([]);
        setChatError(d.error || 'Chat history restricted.');
      } else {
        setChatTurns(d.turns || []);
      }
    } catch (err: any) {
      setChatError(err?.message || 'Failed to load chat history.');
    } finally {
      setLoadingChats(false);
    }
  }, [token, chatSearch]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (activeSection === 'chat-history') {
      loadChatHistory();
    }
  }, [activeSection, loadChatHistory]);

  const saveAutoSettings = async (patch?: any) => {
    if (!token || !autoSettings) return;
    setSaving(true);
    try {
      const payload = patch || autoSettings;
      const res = await fetch(apiUrl('/api/super-admin/ai-automation/settings'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings.');
      setAutoSettings(data.settings);
      showToast('ok', 'Settings & AI Automation permissions saved cleanly.');
    } catch (err: any) {
      showToast('err', err?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyPauseOrRevoke = async (revokeSub: boolean) => {
    if (!token) return;
    const isPaused = Boolean(autoSettings?.aiBehaviour?.aiMasterPaused);
    try {
      const endpoint =
        isPaused && !revokeSub
          ? '/api/super-admin/ai-automation/resume'
          : '/api/super-admin/ai-automation/pause';
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          reason: revokeSub
            ? 'Emergency pause & revoke sub-permissions triggered in Settings'
            : 'Super Admin toggled master automation switch in Settings',
          revokeAllSubPermissions: revokeSub
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed.');
      setAutoSettings(d.settings);
      showToast(
        'ok',
        revokeSub
          ? 'All AI automation paused and sub-permissions revoked.'
          : isPaused
            ? 'AI automation resumed.'
            : 'AI automation paused.'
      );
    } catch (err: any) {
      showToast('err', err?.message || 'Action failed.');
    }
  };

  const handleDeleteChatTurn = async (id?: string) => {
    if (!token) return;
    try {
      const endpoint = id
        ? `/api/super-admin/ai-automation/chat-history/${id}`
        : '/api/super-admin/ai-automation/chat-history';
      const res = await fetch(apiUrl(endpoint), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Delete failed.');
      showToast('ok', id ? 'Chat turn removed.' : 'All stored chat history cleared.');
      await loadChatHistory();
    } catch (err: any) {
      showToast('err', err?.message || 'Failed to delete chat history.');
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSendingBroadcast(true);
    try {
      const res = await fetch(apiUrl('/api/super-admin/notifications/broadcast'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ title: broadcastTitle, message: broadcastMessage })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Broadcast failed.');
      showToast('ok', `Broadcast delivered to ${d.deliveredCount} active users.`);
      setBroadcastTitle('');
      setBroadcastMessage('');
    } catch (err: any) {
      showToast('err', err?.message || 'Broadcast failed.');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleTestIntegration = async (service: string) => {
    if (!token) return;
    setTestingService(service);
    try {
      const res = await fetch(apiUrl('/api/super-admin/ai/test-connection'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ service })
      });
      const d = await res.json();
      setServiceTestMsg(prev => ({
        ...prev,
        [service]: { ok: Boolean(d.ok), text: d.message || d.status || 'Checked' }
      }));
    } catch (err: any) {
      setServiceTestMsg(prev => ({
        ...prev,
        [service]: { ok: false, text: err?.message || 'Test failed' }
      }));
    } finally {
      setTestingService(null);
    }
  };

  const updateSectionField = (section: string, key: string, value: any) => {
    setAutoSettings((prev: any) => ({
      ...prev,
      [section]: {
        ...(prev?.[section] || {}),
        [key]: value
      }
    }));
  };

  if (!autoSettings) {
    return (
      <div className="p-8 rounded-xl bg-[#0b0c10] border border-slate-800 text-xs text-slate-400">
        Loading Settings & AI Automation Configuration...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 10-Section Settings Index */}
      <aside className="lg:col-span-3 rounded-xl bg-[#0b0c10] border border-slate-800 p-3 space-y-1 h-fit">
        <p className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#f0cf65]">
          Settings Modules (10)
        </p>
        {SECTIONS.map(sec => {
          const Icon = sec.icon;
          const active = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => onSelectSubmenu('settings', sec.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-colors ${
                active
                  ? 'bg-[#d4af37]/15 text-[#f0cf65] border border-[#d4af37]/40 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-[#121318] border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#d4af37]' : 'text-slate-400'}`} />
              <span className="truncate">{sec.label}</span>
            </button>
          );
        })}
      </aside>

      {/* Right Active Settings Section Panel */}
      <div className="lg:col-span-9 space-y-5">
        {/* Top Save & Status Bar */}
        <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">
              {SECTIONS.find(s => s.id === activeSection)?.label || 'Settings'}
            </h2>
            <p className="text-[11px] font-mono text-slate-400 tabular-nums">
              {autoSettings.updatedAt
                ? `Last saved ${new Date(autoSettings.updatedAt).toLocaleString()} by ${autoSettings.updatedBy}`
                : 'Super Admin Enforced Governance'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onSelectSubmenu('ai-automation', 'automation-overview')}
              className="px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 hover:border-[#d4af37]/40 text-xs text-slate-200"
            >
              Open AI Automation Dashboard
            </button>
            <button
              onClick={() => saveAutoSettings()}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#d4af37] hover:bg-[#f0cf65] disabled:opacity-50 text-black text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* 1. GENERAL SETTINGS */}
        {activeSection === 'general-settings' && (
          <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Brand Display Name</label>
                <input
                  type="text"
                  value={autoSettings.general.brandName}
                  onChange={e => updateSectionField('general', 'brandName', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Official Support Email</label>
                <input
                  type="email"
                  value={autoSettings.general.supportEmail}
                  onChange={e => updateSectionField('general', 'supportEmail', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Default Platform Language</label>
                <select
                  value={autoSettings.general.defaultLanguage}
                  onChange={e => updateSectionField('general', 'defaultLanguage', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white"
                >
                  <option value="English">English</option>
                  <option value="Hindi">Hindi</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Operations Timezone</label>
                <input
                  type="text"
                  value={autoSettings.general.timezone}
                  onChange={e => updateSectionField('general', 'timezone', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* 2. CHAT HISTORY MANAGEMENT */}
        {activeSection === 'chat-history' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3">
              <ToggleRow
                label="Allow Chat History Access"
                description="When disabled, Rudra AI stops persisting conversation history and blocks history reads with audit logging."
                checked={Boolean(autoSettings.chatHistory.allowChatHistoryAccess)}
                onChange={v => updateSectionField('chatHistory', 'allowChatHistoryAccess', v)}
              />
              <ToggleRow
                label="Auto-Summarize Executive Sessions"
                description="Automatically tag chat history turns by admin module context."
                checked={Boolean(autoSettings.chatHistory.autoSummarizeSessions)}
                onChange={v => updateSectionField('chatHistory', 'autoSummarizeSessions', v)}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Retention Period (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={730}
                    value={autoSettings.chatHistory.retentionDays}
                    onChange={e =>
                      updateSectionField('chatHistory', 'retentionDays', Number(e.target.value))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white font-mono tabular-nums"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={loadChatHistory}
                    className="px-3.5 py-2 rounded-lg bg-[#050507] border border-slate-800 text-xs text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingChats ? 'animate-spin' : ''}`} />
                    Reload Chat Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteChatTurn()}
                    className="px-3.5 py-2 rounded-lg bg-red-950/70 border border-red-700/50 text-xs text-red-300 inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear All History
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-white">
                  Stored Rudra AI Chat History ({chatTurns.length})
                </h3>
                <input
                  type="text"
                  value={chatSearch}
                  onChange={e => setChatSearch(e.target.value)}
                  placeholder="Filter chat content..."
                  className="px-3 py-1.5 rounded-lg bg-[#050507] border border-slate-800 text-xs text-white"
                />
              </div>

              {chatError ? (
                <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-700/50 text-xs text-amber-200">
                  {chatError}
                </div>
              ) : chatTurns.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No stored AI chat turns found yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-800/70 max-h-80 overflow-y-auto text-xs">
                  {chatTurns.map(t => (
                    <div key={t.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-mono text-[10px] text-[#f0cf65] tabular-nums">
                          {t.role.toUpperCase()} · {t.actorEmail} ·{' '}
                          {new Date(t.timestamp).toLocaleString()}
                        </p>
                        <p className="text-slate-200 line-clamp-2">{t.content}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteChatTurn(t.id)}
                        className="p-1.5 rounded bg-[#050507] border border-slate-800 text-slate-400 hover:text-red-300 shrink-0"
                        aria-label="Delete chat turn"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. USER PERMISSIONS */}
        {activeSection === 'user-permissions' && (
          <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3">
            <ToggleRow
              label="Allow AI Access to User Data Context"
              description="Allows Rudra AI Executive Assistant to include registered artist counts and KYC/user status metrics during analysis."
              checked={Boolean(autoSettings.userPermissions.allowAiUserDataAccess)}
              onChange={v => updateSectionField('userPermissions', 'allowAiUserDataAccess', v)}
            />
            <ToggleRow
              label="Allow User Promotional Email Opt-Out"
              description="Enables self-service opt-out toggles in the Artist Dashboard profile and honors one-click unsubscribe links."
              checked={Boolean(autoSettings.userPermissions.allowUserPromoOptOut)}
              onChange={v => updateSectionField('userPermissions', 'allowUserPromoOptOut', v)}
            />
            <ToggleRow
              label="Allow Artist Support Ticket Submissions"
              description="Controls whether authenticated artists can open new support desk tickets."
              checked={Boolean(autoSettings.userPermissions.allowArtistSupportTickets)}
              onChange={v => updateSectionField('userPermissions', 'allowArtistSupportTickets', v)}
            />
          </div>
        )}

        {/* 4. PRIVACY & SECURITY */}
        {activeSection === 'privacy-security' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3">
              <ToggleRow
                label="Redact Sensitive PII in AI Prompts"
                description="Automatically masks email addresses, phone numbers, Aadhaar, and PAN identifiers before sending support text to Gemini."
                checked={Boolean(autoSettings.privacySecurity.redactPiiInPrompts)}
                onChange={v => updateSectionField('privacySecurity', 'redactPiiInPrompts', v)}
              />
              <ToggleRow
                label="Allow External LLM Analysis (Gemini API)"
                description="When OFF, AI support triage uses local deterministic rule evaluation only and makes zero external LLM API calls."
                checked={Boolean(autoSettings.privacySecurity.allowExternalAiContext)}
                onChange={v => updateSectionField('privacySecurity', 'allowExternalAiContext', v)}
              />
              <ToggleRow
                label="Require Reason on Emergency Pause"
                description="Logs mandatory justification when suspending automated workflows."
                checked={Boolean(autoSettings.privacySecurity.requireReasonOnRevoke)}
                onChange={v => updateSectionField('privacySecurity', 'requireReasonOnRevoke', v)}
              />
            </div>

            {platformSettings && (
              <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-4">
                <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-[#d4af37]" />
                  Executive 2FA Security PIN (Owner Approval Required)
                </h3>
                <div className="p-3.5 rounded-xl bg-[#050507] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[#f0cf65]">
                        Enforce Super Admin 2FA PIN on Sign-In
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Requires 4+ digit executive PIN alongside password
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(platformSettings.adminTwoFactorEnabled)}
                      onChange={e =>
                        onChangePlatformSettings({
                          ...platformSettings,
                          adminTwoFactorEnabled: e.target.checked
                        })
                      }
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
                  type="button"
                  onClick={() =>
                    onProposeOwnerApproval({
                      actionType: 'SETTINGS_UPDATE',
                      targetType: 'settings',
                      targetId: 'global',
                      title: 'Save General & 2FA Security Settings',
                      explanation: 'Updates Super Admin 2FA PIN enforcement.',
                      consequences: 'Applies immediately to Super Admin authentication.',
                      proposedChanges: {
                        adminTwoFactorEnabled: platformSettings.adminTwoFactorEnabled,
                        pinUpdated: new2faPin.trim().length >= 4
                      },
                      payload: {
                        settings: platformSettings,
                        ...(new2faPin.trim().length >= 4
                          ? { newAdminTwoFactorPin: new2faPin.trim() }
                          : {})
                      }
                    })
                  }
                  className="px-4 py-2.5 rounded-lg bg-[#d4af37] hover:bg-[#f0cf65] text-black font-bold text-xs"
                >
                  Save 2FA Security Policy (Owner Approval)
                </button>
              </div>
            )}
          </div>
        )}

        {/* 5. AI BEHAVIOUR */}
        {activeSection === 'ai-behaviour' && (
          <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-4">
            <ToggleRow
              label="Master AI Engine Enabled"
              description="Global permission required for any AI analysis, drafting, or executive assistant inference."
              checked={Boolean(autoSettings.aiBehaviour.aiEnabled)}
              onChange={v => updateSectionField('aiBehaviour', 'aiEnabled', v)}
            />
            <ToggleRow
              label="Emergency Kill Switch — Pause All AI Automation"
              description="Immediately blocks all automated AI chat, promotional drafting/sending, and ticket auto-processing."
              checked={Boolean(autoSettings.aiBehaviour.aiMasterPaused)}
              onChange={v => updateSectionField('aiBehaviour', 'aiMasterPaused', v)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Active Gemini Model</label>
                <select
                  value={autoSettings.aiBehaviour.activeModel}
                  onChange={e => updateSectionField('aiBehaviour', 'activeModel', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white font-mono"
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-3.8-flash">gemini-3.8-flash</option>
                  <option value="gemini-4-hydrogen">gemini-4-hydrogen</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Response Tone</label>
                <select
                  value={autoSettings.aiBehaviour.responseTone}
                  onChange={e => updateSectionField('aiBehaviour', 'responseTone', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white"
                >
                  <option value="professional">Professional</option>
                  <option value="concise">Concise</option>
                  <option value="warm">Warm & Supportive</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Confidence Threshold ({autoSettings.aiBehaviour.confidenceThreshold}%)
                </label>
                <input
                  type="number"
                  min={40}
                  max={100}
                  value={autoSettings.aiBehaviour.confidenceThreshold}
                  onChange={e =>
                    updateSectionField(
                      'aiBehaviour',
                      'confidenceThreshold',
                      Number(e.target.value)
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block text-[11px] text-slate-400 mb-1">
                System Guidance Prompt
              </label>
              <textarea
                rows={3}
                value={autoSettings.aiBehaviour.systemGuidance}
                onChange={e => updateSectionField('aiBehaviour', 'systemGuidance', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white"
              />
            </div>
          </div>
        )}

        {/* 6. EMAIL & NOTIFICATIONS */}
        {activeSection === 'email-notifications' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3">
              <ToggleRow
                label="Allow AI Promotional Email Automation"
                description="Master toggle controlling promotional emails. OFF = AI cannot prepare or send promotional emails. ON = AI can prepare/send per Super Admin approval policy."
                checked={Boolean(autoSettings.emailNotifications.allowAiPromotionalEmailAutomation)}
                onChange={v =>
                  updateSectionField('emailNotifications', 'allowAiPromotionalEmailAutomation', v)
                }
              />
              <ToggleRow
                label="Allow Automatic Email Sending"
                description="Master outbound email permission for campaigns and automated ticket email notifications. OTP security verification emails always operate independently."
                checked={Boolean(autoSettings.emailNotifications.allowAutomaticEmailSending)}
                onChange={v =>
                  updateSectionField('emailNotifications', 'allowAutomaticEmailSending', v)
                }
              />
              <ToggleRow
                label="Require Super Admin Approval Before Promotional Dispatch"
                description="When ON, promotional campaigns must be explicitly approved by Super Admin before sending or scheduled dispatch."
                checked={Boolean(autoSettings.emailNotifications.promoRequireSuperAdminApproval)}
                onChange={v =>
                  updateSectionField('emailNotifications', 'promoRequireSuperAdminApproval', v)
                }
              />
              <div className="pt-2 text-xs">
                <label className="block text-[11px] text-slate-400 mb-1">
                  Daily Promotional Email Send Cap (24h Rolling)
                </label>
                <input
                  type="number"
                  min={1}
                  max={50000}
                  value={autoSettings.emailNotifications.dailyPromoSendCap}
                  onChange={e =>
                    updateSectionField(
                      'emailNotifications',
                      'dailyPromoSendCap',
                      Number(e.target.value)
                    )
                  }
                  className="w-48 px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white font-mono tabular-nums"
                />
              </div>
            </div>

            {/* Preserved Email Relay Diagnostics & OTP Email Preview + Broadcast */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3 text-xs">
                <p className="font-semibold text-[#f0cf65] flex items-center gap-1.5">
                  <Mail className="w-4 h-4" /> Transactional OTP & Relay Status (Isolated Channel)
                </p>
                <p className="font-mono text-[11px] text-slate-300">
                  Provider: {emailConfig?.provider || 'Google Apps Script HTTPS Relay'}
                </p>
                <p
                  className={`font-mono text-[11px] ${
                    emailConfig?.configured && emailConfig?.validHttpsUrl
                      ? 'text-emerald-300'
                      : 'text-red-300'
                  }`}
                >
                  Status:{' '}
                  {emailConfig?.configured && emailConfig?.validHttpsUrl
                    ? 'CONFIGURED & READY'
                    : 'MISCONFIGURED / MISSING ENV'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onTestEmailRelay}
                    disabled={testingEmail}
                    className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65]"
                  >
                    {testingEmail ? 'Checking...' : 'Test Email Relay'}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenOtpPreview}
                    className="px-3 py-1.5 rounded-lg bg-[#050507] border border-slate-700 hover:border-[#d4af37]/50 text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview OTP Email
                  </button>
                </div>
                {emailTestResult && (
                  <p className={`text-[11px] ${emailTestResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                    {emailTestResult.message}
                  </p>
                )}
              </div>

              <form
                onSubmit={handleBroadcast}
                className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3"
              >
                <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-[#d4af37]" /> Broadcast In-App Notification
                </h3>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={e => setBroadcastTitle(e.target.value)}
                  placeholder="Notification title..."
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-xs text-white"
                />
                <textarea
                  rows={2}
                  required
                  value={broadcastMessage}
                  onChange={e => setBroadcastMessage(e.target.value)}
                  placeholder="Message to all active artists..."
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-xs text-white"
                />
                <button
                  type="submit"
                  disabled={sendingBroadcast}
                  className="px-4 py-2 rounded-lg bg-[#d4af37]/20 border border-[#d4af37]/50 text-[#f0cf65] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> {sendingBroadcast ? 'Sending...' : 'Send Broadcast'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 7. SUPPORT MANAGEMENT */}
        {activeSection === 'support-management' && (
          <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3">
            <ToggleRow
              label="Allow AI to Read Support Tickets"
              description="Allows AI automation to read newly created support tickets for category classification and urgency triage."
              checked={Boolean(autoSettings.supportManagement.allowAiReadSupportTickets)}
              onChange={v => updateSectionField('supportManagement', 'allowAiReadSupportTickets', v)}
            />
            <ToggleRow
              label="Allow AI to Generate Replies"
              description="Allows AI to prepare a suggested reply draft. When Automatic Reply is OFF, drafts wait for Super Admin approval."
              checked={Boolean(autoSettings.supportManagement.allowAiGenerateSupportReplies)}
              onChange={v =>
                updateSectionField('supportManagement', 'allowAiGenerateSupportReplies', v)
              }
            />
            <ToggleRow
              label="Allow AI to Automatically Reply"
              description="When ON (for non-escalated tickets above confidence threshold), posts automated replies immediately without holding for approval."
              checked={Boolean(autoSettings.supportManagement.allowAiAutoReplyTickets)}
              onChange={v => updateSectionField('supportManagement', 'allowAiAutoReplyTickets', v)}
            />
            <ToggleRow
              label="Allow AI to Escalate Tickets"
              description="Flags complex, legal, refund, copyright, or low-confidence tickets directly to the Super Admin Escalation Desk."
              checked={Boolean(autoSettings.supportManagement.allowAiEscalateTickets)}
              onChange={v => updateSectionField('supportManagement', 'allowAiEscalateTickets', v)}
            />
            <ToggleRow
              label="Allow AI to Send Ticket Notifications"
              description="Allows automated email alerts to artists when AI auto-replies to their support ticket."
              checked={Boolean(autoSettings.supportManagement.allowAiSendTicketNotifications)}
              onChange={v =>
                updateSectionField('supportManagement', 'allowAiSendTicketNotifications', v)
              }
            />

            <div className="pt-2 text-xs">
              <label className="block text-[11px] text-slate-400 mb-1">
                Mandatory Escalation Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={(autoSettings.supportManagement.escalationKeywords || []).join(', ')}
                onChange={e =>
                  updateSectionField(
                    'supportManagement',
                    'escalationKeywords',
                    e.target.value
                      .split(',')
                      .map(s => s.trim())
                      .filter(Boolean)
                  )
                }
                className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white font-mono"
              />
            </div>
          </div>
        )}

        {/* 8. AUTOMATION & APPROVALS */}
        {activeSection === 'automation-approvals' && (
          <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3">
            <ToggleRow
              label="Require Super Admin Approval for Bulk Promotional Sends"
              description="Prevents unapproved promotional broadcasts from executing via scheduler or manual dispatch."
              checked={Boolean(autoSettings.automationApprovals.requireApprovalForBulkPromo)}
              onChange={v =>
                updateSectionField('automationApprovals', 'requireApprovalForBulkPromo', v)
              }
            />
            <ToggleRow
              label="Auto-Pause Automated Emails on High Failure Rate"
              description="Automatically turns off Automatic Email Sending if campaign relay failure exceeds the threshold percentage."
              checked={Boolean(autoSettings.automationApprovals.autoPauseEmailOnHighFailureRate)}
              onChange={v =>
                updateSectionField('automationApprovals', 'autoPauseEmailOnHighFailureRate', v)
              }
            />
            <div className="pt-2 text-xs">
              <label className="block text-[11px] text-slate-400 mb-1">
                Failure Rate Auto-Pause Threshold (%)
              </label>
              <input
                type="number"
                min={5}
                max={100}
                value={autoSettings.automationApprovals.failureRatePauseThresholdPct}
                onChange={e =>
                  updateSectionField(
                    'automationApprovals',
                    'failureRatePauseThresholdPct',
                    Number(e.target.value)
                  )
                }
                className="w-40 px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white font-mono tabular-nums"
              />
            </div>
          </div>
        )}

        {/* 9. API & INTEGRATIONS */}
        {activeSection === 'api-integrations' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {[
              {
                key: 'gemini',
                title: 'Gemini AI (@google/genai)',
                configured: Boolean(integrations?.geminiConfigured),
                detail: integrations?.geminiConfigured
                  ? 'API key isolated in server environment'
                  : 'GEMINI_API_KEY missing (safe fallback active)'
              },
              {
                key: 'database',
                title: 'PostgreSQL Persistent Store',
                configured: Boolean(integrations?.databaseConnected),
                detail: `Source: ${integrity?.dataSource || 'Checking...'} · ${integrity?.connectionStatus || ''}`
              },
              {
                key: 'email',
                title: 'Google Apps Script Mail Relay',
                configured: Boolean(emailConfig?.configured && emailConfig?.validHttpsUrl),
                detail: `Provider: ${emailConfig?.provider || 'unconfigured'}`
              },
              {
                key: 'razorpay',
                title: 'Razorpay Payment Gateway',
                configured: Boolean(gatewayConfig?.razorpayKeyConfigured),
                detail: `Key ID: ${gatewayConfig?.razorpayKeyConfigured ? 'Set' : 'Not Set'} · Webhook: ${gatewayConfig?.webhookSecretConfigured ? 'Set' : 'Not Set'}`
              }
            ].map(item => (
              <div
                key={item.key}
                className="p-4 rounded-xl bg-[#0b0c10] border border-slate-800 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#f0cf65]">{item.title}</span>
                  <span
                    className={`font-mono text-[11px] inline-flex items-center gap-1 ${
                      item.configured ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {item.configured ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5" />
                    )}
                    {item.configured ? 'CONNECTED' : 'NOT CONFIGURED'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-400">{item.detail}</p>
                {item.key !== 'razorpay' && (
                  <button
                    type="button"
                    disabled={testingService === item.key}
                    onClick={() =>
                      item.key === 'email'
                        ? onTestEmailRelay()
                        : handleTestIntegration(item.key)
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#050507] border border-slate-700 hover:border-[#d4af37]/50 text-slate-200 text-[11px]"
                  >
                    {testingService === item.key ? 'Testing...' : 'Verify Connectivity'}
                  </button>
                )}
                {serviceTestMsg[item.key] && (
                  <p
                    className={`text-[11px] ${
                      serviceTestMsg[item.key].ok ? 'text-emerald-300' : 'text-red-300'
                    }`}
                  >
                    {serviceTestMsg[item.key].text}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 10. ACCOUNT MANAGEMENT */}
        {activeSection === 'account-management' && (
          <div className="rounded-xl bg-[#0b0c10] border border-slate-800 p-5 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Super Admin Primary Email
                </label>
                <input
                  type="text"
                  disabled
                  value={adminEmail || 'SUPER_ADMIN'}
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-slate-400 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Emergency Escalation Contact Email
                </label>
                <input
                  type="email"
                  value={autoSettings.accountManagement.emergencyContactEmail}
                  onChange={e =>
                    updateSectionField(
                      'accountManagement',
                      'emergencyContactEmail',
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#050507] border border-slate-800 text-white"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#050507] border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-white">
                    Emergency AI Automation Revocation & Session Controls
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Immediately pause all automated AI execution or revoke sensitive email &
                    auto-reply permissions across the platform.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenSessionModal}
                  className="px-3 py-1.5 rounded-lg bg-[#0b0c10] border border-slate-700 text-slate-200"
                >
                  Inspect Active Session
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleEmergencyPauseOrRevoke(false)}
                  className={`px-3.5 py-2 rounded-lg font-bold inline-flex items-center gap-1.5 ${
                    autoSettings.aiBehaviour.aiMasterPaused
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-950/70 border border-amber-700/60 text-amber-200'
                  }`}
                >
                  {autoSettings.aiBehaviour.aiMasterPaused ? (
                    <>
                      <PlayCircle className="w-4 h-4" /> Resume Master Engine
                    </>
                  ) : (
                    <>
                      <PauseCircle className="w-4 h-4" /> Pause Master Engine
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleEmergencyPauseOrRevoke(true)}
                  className="px-3.5 py-2 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 font-bold"
                >
                  Pause & Revoke Email / Auto-Reply Permissions
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
