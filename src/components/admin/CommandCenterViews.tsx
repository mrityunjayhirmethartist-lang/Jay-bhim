import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileDown,
  FileSpreadsheet,
  Sliders,
  RefreshCw,
  LogOut,
  Lock
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import type {
  OwnerApprovalProposalInput,
  ExecutiveSessionInfo,
  AdminTab
} from './adminTypes';

// ======================== 6-STEP OWNER APPROVAL CONFIRMATION MODAL ========================

interface OwnerApprovalModalProps {
  proposal: OwnerApprovalProposalInput | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirmExecute: (reasonOverride: string) => void;
}

export const OwnerApprovalModal: React.FC<OwnerApprovalModalProps> = ({
  proposal,
  submitting,
  onCancel,
  onConfirmExecute
}) => {
  const [confirmedCheck, setConfirmedCheck] = useState(false);
  const [reasonText, setReasonText] = useState('');

  useEffect(() => {
    setConfirmedCheck(false);
    setReasonText('');
  }, [proposal?.actionType, proposal?.targetId, proposal?.title]);

  if (!proposal) return null;

  const needsReason =
    proposal.requiresReason ||
    ['KYC_REJECT', 'KYC_REQUEST_REUPLOAD', 'RELEASE_REJECT', 'RELEASE_REQUEST_CORRECTIONS', 'USER_SUSPEND', 'USER_TERMINATE'].includes(
      proposal.actionType
    );

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4">
      <div className="max-w-xl w-full rounded-2xl bg-[#0b0c10] border border-[#d4af37]/50 p-6 space-y-4 text-xs shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-[#d4af37]">
              Owner Approval System · 6-Step Verification
            </p>
            <h3 className="text-base font-bold text-white mt-0.5">{proposal.title}</h3>
          </div>
          <span className="font-mono text-[11px] text-[#f0cf65]">{proposal.actionType}</span>
        </div>

        {/* Step 1: Explanation */}
        <div className="p-3 rounded-xl bg-[#050507] border border-slate-800 space-y-1">
          <p className="font-mono text-[10px] text-slate-400 uppercase">1. Proposed Action</p>
          <p className="text-slate-200 leading-relaxed">{proposal.explanation}</p>
        </div>

        {/* Step 2: Consequences */}
        <div className="p-3 rounded-xl bg-[#050507] border border-amber-700/40 space-y-1">
          <p className="font-mono text-[10px] text-amber-300 uppercase">2. Consequences & Impact</p>
          <p className="text-amber-100/90 leading-relaxed">{proposal.consequences}</p>
        </div>

        {/* Step 3: Exact Proposed Changes */}
        <div className="p-3 rounded-xl bg-[#050507] border border-slate-800 space-y-1">
          <p className="font-mono text-[10px] text-slate-400 uppercase">3. Exact Proposed Changes</p>
          <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(proposal.proposedChanges, null, 2)}
          </pre>
        </div>

        {/* Step 4: Reason + Explicit Owner Confirmation */}
        <div className="space-y-2.5">
          <div>
            <label className="block font-mono text-[10px] text-slate-400 uppercase mb-1">
              4. Administrative Reason / Audit Note {needsReason ? '(Required)' : '(Optional)'}
            </label>
            <textarea
              rows={2}
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              placeholder={
                needsReason
                  ? 'Enter mandatory justification for the audit log...'
                  : 'Optional review note for the immutable audit log...'
              }
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#121318] border border-[#d4af37]/30 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedCheck}
              onChange={e => setConfirmedCheck(e.target.checked)}
              className="mt-0.5 accent-[#d4af37]"
            />
            <span className="text-slate-200 leading-relaxed">
              I confirm as the verified <span className="font-mono text-[#f0cf65]">SUPER_ADMIN</span>{' '}
              that I have reviewed the proposed changes and consequences, and explicitly authorize
              execution with immutable audit logging.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800 text-[11px] text-slate-500 font-mono">
          <span>Step 5–6: Server-Side Execution & Audit Log</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans font-medium"
            >
              Cancel
            </button>
            <button
              disabled={submitting || !confirmedCheck || (needsReason && !reasonText.trim())}
              onClick={() => onConfirmExecute(reasonText.trim())}
              className="px-4 py-2 rounded-xl bg-[#d4af37] hover:bg-[#f0cf65] disabled:opacity-40 text-black font-sans font-bold"
            >
              {submitting ? 'Executing...' : 'Approve & Execute'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ======================== OWNER APPROVALS QUEUE PANEL ========================

export const OwnerApprovalsQueue: React.FC<{
  approvals: any[];
  onExecute: (id: string) => void;
  onDismiss: (id: string) => void;
  onRefresh: () => void;
}> = ({ approvals, onExecute, onDismiss, onRefresh }) => {
  return (
    <div className="rounded-2xl bg-[#0b0c10] border border-[#d4af37]/35 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#f0cf65] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Owner Approval Queue
          </h3>
          <p className="text-[11px] text-slate-400">
            Sensitive changes proposed by admins or AI wait here until explicitly approved and executed by the Super Admin.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 rounded-lg bg-[#050507] border border-slate-800 text-xs text-slate-300 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Queue
        </button>
      </div>

      {approvals.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">
          No approval requests recorded yet. Sensitive actions triggered in the dashboard or suggested by AI appear here.
        </p>
      ) : (
        <div className="space-y-2.5 max-h-96 overflow-y-auto">
          {approvals.map(item => (
            <div
              key={item.id}
              className="p-3.5 rounded-xl bg-[#050507] border border-slate-800 flex flex-wrap items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{item.title}</span>
                  <span className="font-mono text-[11px] text-[#d4af37]">{item.actionType}</span>
                  <span className="text-slate-600">·</span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      item.status === 'PENDING_OWNER_APPROVAL'
                        ? 'text-amber-300'
                        : item.status === 'EXECUTED'
                          ? 'text-emerald-300'
                          : 'text-slate-400'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="text-slate-300">{item.explanation}</p>
                <p className="text-[11px] text-amber-200/80">Impact: {item.consequences}</p>
                <p className="text-[10px] font-mono text-slate-500">
                  Requested {new Date(item.createdAt).toLocaleString()} by {item.requestedBy}
                </p>
              </div>

              {item.status === 'PENDING_OWNER_APPROVAL' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onDismiss(item.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => onExecute(item.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#d4af37] hover:bg-[#f0cf65] text-black font-bold"
                  >
                    Confirm & Execute
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ======================== AI PLATFORM INTELLIGENCE & NEXT-STEP ENGINE ========================

export const PlatformIntelligencePanel: React.FC<{
  intelligence: any;
  loading: boolean;
  onRefresh: () => void;
  onNavigateTab: (tab: AdminTab, submenuId: string) => void;
  onTriggerApproval: (proposal: OwnerApprovalProposalInput) => void;
}> = ({ intelligence, loading, onRefresh, onNavigateTab, onTriggerApproval }) => {
  if (!intelligence) {
    return (
      <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800 text-xs text-slate-400">
        {loading ? 'Analyzing platform architecture and live database state...' : 'Intelligence report unavailable.'}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-2xl bg-[#0b0c10] border border-[#d4af37]/30 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#f0cf65] flex items-center gap-2">
              <Sliders className="w-4 h-4" /> AI Platform Intelligence & Next-Step Engine
            </h3>
            <p className="text-[11px] text-slate-400">
              Real-time architectural inspection across Database, Email Relay, Razorpay, KYC, Releases, Gemini AI, Audio QC, and Security Logs.
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-[#050507] border border-[#d4af37]/30 text-xs text-[#f0cf65] inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Re-scan Platform
          </button>
        </div>

        {/* 6 Status Buckets */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          {[
            { label: 'Completed Work', count: intelligence.counts?.completed ?? 0, tone: 'text-emerald-300' },
            { label: 'Working Systems', count: intelligence.counts?.working ?? 0, tone: 'text-emerald-300' },
            { label: 'Not Working', count: intelligence.counts?.notWorking ?? 0, tone: 'text-red-300' },
            { label: 'Pending Tasks', count: intelligence.counts?.pending ?? 0, tone: 'text-amber-300' },
            { label: 'Needs Config', count: intelligence.counts?.needsConfiguration ?? 0, tone: 'text-amber-300' },
            { label: 'Immediate Attn', count: intelligence.counts?.immediateAttention ?? 0, tone: 'text-[#f0cf65]' }
          ].map(b => (
            <div key={b.label} className="p-3 rounded-xl bg-[#050507] border border-slate-800">
              <p className="text-[11px] text-slate-400">{b.label}</p>
              <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${b.tone}`}>{b.count}</p>
            </div>
          ))}
        </div>

        {/* Prioritized Issues & Next Steps */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-white">Prioritized Recommended Next Steps</p>
          {(intelligence.nextSteps || []).map((step: any) => (
            <div
              key={step.id}
              className="p-4 rounded-xl bg-[#050507] border border-slate-800 space-y-2 text-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[#d4af37] font-bold">#{step.order}</span>
                  <span className="font-semibold text-white">{step.title}</span>
                  <span className="text-slate-600">·</span>
                  <span className="font-mono text-[11px] text-slate-400">{step.category}</span>
                </div>
                <span
                  className={`font-mono text-[11px] font-semibold uppercase ${
                    step.severity === 'critical'
                      ? 'text-red-400'
                      : step.severity === 'high'
                        ? 'text-amber-300'
                        : step.severity === 'medium'
                          ? 'text-[#f0cf65]'
                          : 'text-emerald-300'
                  }`}
                >
                  {step.severity} · {step.actualStatus}
                </span>
              </div>

              <p className="text-slate-300">{step.technicalExplanation}</p>
              <p className="text-slate-200">
                <span className="text-[#d4af37] font-semibold">Recommended Solution:</span>{' '}
                {step.recommendedSolution}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-slate-400">
                <span>
                  Required Permissions: {step.requiredPermissions} · Owner Approval:{' '}
                  {step.ownerApprovalRequired ? 'REQUIRED' : 'No'}
                </span>
                <div className="flex items-center gap-2">
                  {step.category === 'KYC Verification' && (
                    <button
                      onClick={() => onNavigateTab('users', 'kyc-pending')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans whitespace-nowrap"
                    >
                      Open Pending KYC
                    </button>
                  )}
                  {step.category === 'Release Operations' && (
                    <button
                      onClick={() => onNavigateTab('releases', 'pending-releases')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans whitespace-nowrap"
                    >
                      Open Pending Releases
                    </button>
                  )}
                  {step.category === 'Email & Auth' && (
                    <button
                      onClick={() => onNavigateTab('health', 'email-status')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans whitespace-nowrap"
                    >
                      Check Email Diagnostics
                    </button>
                  )}
                  {step.ownerApprovalRequired && step.suggestedActionType && step.targetId && (
                    <button
                      onClick={() =>
                        onTriggerApproval({
                          actionType: step.suggestedActionType,
                          targetType: step.suggestedActionType.startsWith('KYC') ? 'kyc' : 'release',
                          targetId: step.targetId,
                          title: step.title,
                          explanation: step.technicalExplanation,
                          consequences: step.recommendedSolution,
                          proposedChanges: { actionType: step.suggestedActionType, targetId: step.targetId },
                          payload: {}
                        })
                      }
                      className="px-2.5 py-1 rounded bg-[#d4af37]/20 border border-[#d4af37]/50 text-[#f0cf65] font-sans font-semibold"
                    >
                      Propose Approval
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detailed Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2">
          <div className="p-3.5 rounded-xl bg-[#050507] border border-slate-800 space-y-1.5">
            <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Working & Verified
            </p>
            <ul className="space-y-1 text-slate-300">
              {(intelligence.working || []).map((w: string, i: number) => (
                <li key={i}>• {w}</li>
              ))}
              {(intelligence.completed || []).map((c: string, i: number) => (
                <li key={`c_${i}`} className="text-slate-400">
                  • {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-[#050507] border border-slate-800 space-y-1.5">
            <p className="font-semibold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Needs Configuration / Attention
            </p>
            <ul className="space-y-1 text-slate-300">
              {(intelligence.notWorking || []).map((n: string, i: number) => (
                <li key={`nw_${i}`} className="text-red-300">
                  • [Not Working] {n}
                </li>
              ))}
              {(intelligence.needsConfiguration || []).map((nc: string, i: number) => (
                <li key={`nc_${i}`}>• [Config] {nc}</li>
              ))}
              {(intelligence.pending || []).map((p: string, i: number) => (
                <li key={`p_${i}`} className="text-[#f0cf65]">
                  • [Pending] {p}
                </li>
              ))}
              {!(intelligence.notWorking?.length || intelligence.needsConfiguration?.length || intelligence.pending?.length) && (
                <li className="text-slate-500">All integrations configured cleanly.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// ======================== EXECUTIVE REPORTS PANEL (8 REPORTS) ========================

export const ExecutiveReportsPanel: React.FC<{
  token: string | null;
  includeTest: boolean;
  showToast: (type: 'ok' | 'err', text: string) => void;
}> = ({ token, includeTest, showToast }) => {
  const [selectedType, setSelectedType] = useState('daily');
  const [report, setReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const reportTypes = [
    { id: 'daily', label: 'Daily Platform' },
    { id: 'weekly', label: 'Weekly Platform' },
    { id: 'monthly', label: 'Monthly Platform' },
    { id: 'users', label: 'User Registration' },
    { id: 'releases', label: 'Release Operations' },
    { id: 'revenue', label: 'Revenue Report' },
    { id: 'security', label: 'Security Report' },
    { id: 'ai', label: 'AI Activity' }
  ];

  const loadReport = async (type = selectedType) => {
    if (!token) return;
    setSelectedType(type);
    setLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/api/super-admin/reports?type=${encodeURIComponent(type)}&includeTest=${includeTest}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate report.');
      setReport(data);
    } catch (err: any) {
      setReport({ dataUnavailable: true, error: err.message });
      showToast('err', err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (format: 'csv' | 'json') => {
    if (!token) return;
    try {
      const res = await fetch(
        apiUrl(`/api/super-admin/reports?type=${encodeURIComponent(selectedType)}&includeTest=${includeTest}&format=${format}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Report export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rudraatma-${selectedType}-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#d4af37]" /> Real-Database Executive Reports
          </h3>
          <p className="text-[11px] text-slate-400">
            All 8 platform reports generated directly from live records with missing data explicitly flagged.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadReport(selectedType)}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-xs text-[#f0cf65] inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {report ? 'Regenerate' : 'Generate Report'}
          </button>
          {report && !report.dataUnavailable && (
            <>
              <button
                onClick={() => downloadFile('csv')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={() => downloadFile('json')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" /> JSON
              </button>
            </>
          )}
        </div>
      </div>

      {/* Report Selector Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {reportTypes.map(rt => (
          <button
            key={rt.id}
            onClick={() => loadReport(rt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              selectedType === rt.id
                ? 'bg-[#d4af37]/20 border border-[#d4af37]/50 text-[#f0cf65]'
                : 'bg-[#050507] border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {rt.label}
          </button>
        ))}
      </div>

      {report?.dataUnavailable && (
        <div className="p-4 rounded-xl bg-red-950/50 border border-red-700/50 text-xs text-red-200">
          Data Unavailable: {report.error}
        </div>
      )}

      {report && !report.dataUnavailable && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
            <span>{report.title}</span>
            <span>
              Source: {report.dataSource} · Generated {new Date(report.generatedAt).toLocaleString()}
            </span>
          </div>

          {report.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {Object.entries(report.summary).map(([k, v]) => (
                <div key={k} className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                  <p className="text-[11px] text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="text-base font-bold font-mono tabular-nums text-[#f0cf65] mt-0.5">
                    {String(v)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {report.missingOrUnavailable?.length > 0 && (
            <div className="p-3 rounded-xl bg-[#050507] border border-amber-700/40 text-[11px] text-amber-200">
              {report.missingOrUnavailable.map((m: string, i: number) => (
                <p key={i}>• Note: {m}</p>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-slate-800 overflow-x-auto max-h-72">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#050507] text-slate-400">
                  {(report.headers || []).map((h: string) => (
                    <th key={h} className="py-2.5 px-3 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {(report.rows || []).slice(0, 50).map((row: any, rIdx: number) => (
                  <tr key={rIdx} className="hover:bg-white/[0.02]">
                    {Object.values(row).map((cell: any, cIdx: number) => (
                      <td key={cIdx} className="py-2 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        {String(cell ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
                {(report.rows || []).length === 0 && (
                  <tr>
                    <td colSpan={report.headers?.length || 1} className="py-6 text-center text-slate-500">
                      0 records found in database for this report window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ======================== EXECUTIVE SESSION PANEL MODAL ========================

export const ExecutiveSessionModal: React.FC<{
  open: boolean;
  sessionInfo: ExecutiveSessionInfo | null;
  onClose: () => void;
  onSignOut: () => void;
}> = ({ open, sessionInfo, onClose, onSignOut }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl bg-[#0b0c10] border border-[#d4af37]/45 p-6 space-y-4 text-xs shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-[#f0cf65]">
            <Lock className="w-4 h-4" />
            <h3 className="text-sm font-bold uppercase tracking-wide">Executive Session Panel</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            Close
          </button>
        </div>

        <div className="space-y-2 font-mono text-[11px]">
          <div className="p-3 rounded-xl bg-[#050507] border border-slate-800 flex justify-between gap-2">
            <span className="text-slate-400">Authenticated Admin</span>
            <span className="text-white">{sessionInfo?.email || '—'}</span>
          </div>
          <div className="p-3 rounded-xl bg-[#050507] border border-slate-800 flex justify-between gap-2">
            <span className="text-slate-400">Verified Role</span>
            <span className="text-[#f0cf65] font-bold">{sessionInfo?.role || 'SUPER_ADMIN'}</span>
          </div>
          <div className="p-3 rounded-xl bg-[#050507] border border-slate-800 flex justify-between gap-2">
            <span className="text-slate-400">Login Timestamp</span>
            <span className="text-slate-200">
              {sessionInfo?.loginAt ? new Date(sessionInfo.loginAt).toLocaleString() : 'Active Session'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#050507] border border-slate-800 flex justify-between gap-2">
            <span className="text-slate-400">Last Activity</span>
            <span className="text-slate-200">
              {sessionInfo?.lastActivityAt ? new Date(sessionInfo.lastActivityAt).toLocaleString() : 'Just now'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#050507] border border-slate-800 flex justify-between gap-2">
            <span className="text-slate-400">Session Expires</span>
            <span className="text-slate-200">
              {sessionInfo?.expiresAt ? new Date(sessionInfo.expiresAt).toLocaleString() : '12h Rolling'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#050507] border border-slate-800 space-y-1">
            <span className="text-slate-400 block">Security & Storage Status</span>
            <span className="text-emerald-300 block">{sessionInfo?.securityStatus || 'Verified'}</span>
            <span className="text-slate-300 block">Backend: {sessionInfo?.databaseStatus || 'Verified'}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
          >
            Keep Working
          </button>
          <button
            onClick={onSignOut}
            className="px-4 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-700/50 text-red-200 font-bold inline-flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
