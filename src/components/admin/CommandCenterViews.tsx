import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
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

// ======================== OWNER APPROVAL CONFIRMATION MODAL ========================

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
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-xl w-full rounded-2xl bg-[#111319] border border-white/[0.1] p-6 space-y-4 text-xs shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-3.5">
          <div>
            <p className="text-xs font-medium text-[#d4af37]">
              Owner Approval Required
            </p>
            <h3 className="text-base font-bold text-white mt-0.5">{proposal.title}</h3>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-[#d4af37]/15 text-[11px] font-medium text-[#f0cf65] shrink-0">
            {proposal.actionType.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-1">
          <p className="text-xs font-semibold text-slate-300">Proposed Action</p>
          <p className="text-slate-200 leading-relaxed">{proposal.explanation}</p>
        </div>

        <div className="p-3.5 rounded-xl bg-[#090a0e] border border-amber-500/30 space-y-1">
          <p className="text-xs font-semibold text-amber-300">Impact & Consequences</p>
          <p className="text-amber-100/90 leading-relaxed">{proposal.consequences}</p>
        </div>

        <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-1.5">
          <p className="text-xs font-semibold text-slate-300">Change Details</p>
          <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(proposal.proposedChanges, null, 2)}
          </pre>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Administrative Reason {needsReason ? '(Required)' : '(Optional)'}
            </label>
            <textarea
              rows={2}
              value={reasonText}
              onChange={e => setReasonText(e.target.value)}
              placeholder={
                needsReason
                  ? 'Enter mandatory justification for the audit log...'
                  : 'Optional review note for the audit log...'
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 focus:outline-none text-xs text-white"
            />
          </div>

          <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#161922] border border-[#d4af37]/25 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmedCheck}
              onChange={e => setConfirmedCheck(e.target.checked)}
              className="mt-0.5 accent-[#d4af37]"
            />
            <span className="text-slate-200 leading-relaxed">
              I confirm as the Super Admin that I have reviewed these proposed changes and authorize execution with audit logging.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={submitting || !confirmedCheck || (needsReason && !reasonText.trim())}
            onClick={() => onConfirmExecute(reasonText.trim())}
            className="h-10 px-5 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] disabled:opacity-40 text-[#090a0e] font-semibold transition-colors"
          >
            {submitting ? 'Executing...' : 'Approve & Execute'}
          </button>
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
    <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3.5">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#d4af37]" /> Owner Approval Queue
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Sensitive changes wait here until reviewed and approved by the Super Admin.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="h-9 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] hover:border-[#d4af37]/40 text-xs font-medium text-slate-300 hover:text-white inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Queue
        </button>
      </div>

      {approvals.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">
          No approval requests recorded yet.
        </p>
      ) : (
        <div className="space-y-2.5 max-h-96 overflow-y-auto">
          {approvals.map(item => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] flex flex-wrap items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{item.title}</span>
                  <span className="text-xs text-[#d4af37] font-medium">
                    {String(item.actionType || '').replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span
                    className={`text-xs font-semibold ${
                      item.status === 'PENDING_OWNER_APPROVAL'
                        ? 'text-amber-300'
                        : item.status === 'EXECUTED'
                          ? 'text-emerald-300'
                          : 'text-slate-400'
                    }`}
                  >
                    {item.status === 'PENDING_OWNER_APPROVAL'
                      ? 'Pending Approval'
                      : item.status === 'EXECUTED'
                        ? 'Executed'
                        : item.status}
                  </span>
                </div>
                <p className="text-slate-300">{item.explanation}</p>
                <p className="text-xs text-amber-200/80">Impact: {item.consequences}</p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  Requested {new Date(item.createdAt).toLocaleString()} by {item.requestedBy}
                </p>
              </div>

              {item.status === 'PENDING_OWNER_APPROVAL' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onDismiss(item.id)}
                    className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 font-medium transition-colors"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => onExecute(item.id)}
                    className="h-9 px-3.5 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] text-[#090a0e] font-semibold transition-colors"
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

// ======================== AI PLATFORM INTELLIGENCE PANEL ========================

export const PlatformIntelligencePanel: React.FC<{
  intelligence: any;
  loading: boolean;
  onRefresh: () => void;
  onNavigateTab: (tab: AdminTab, submenuId: string) => void;
  onTriggerApproval: (proposal: OwnerApprovalProposalInput) => void;
}> = ({ intelligence, loading, onRefresh, onNavigateTab, onTriggerApproval }) => {
  if (!intelligence) {
    return (
      <div className="p-5 rounded-2xl bg-[#111319] border border-white/[0.08] text-xs text-slate-400">
        {loading ? 'Analyzing platform architecture and database state...' : 'Intelligence report unavailable.'}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3.5">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#d4af37]" /> Platform Intelligence & Action Queue
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time overview across Database, Email Relay, Payments, KYC, Releases, and Security.
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="h-9 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] hover:border-[#d4af37]/40 text-xs font-medium text-[#f0cf65] inline-flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Re-scan Platform
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {[
            { label: 'Completed', count: intelligence.counts?.completed ?? 0, tone: 'text-emerald-300' },
            { label: 'Working', count: intelligence.counts?.working ?? 0, tone: 'text-emerald-300' },
            { label: 'Attention Needed', count: intelligence.counts?.notWorking ?? 0, tone: 'text-red-300' },
            { label: 'Pending Tasks', count: intelligence.counts?.pending ?? 0, tone: 'text-amber-300' },
            { label: 'Needs Config', count: intelligence.counts?.needsConfiguration ?? 0, tone: 'text-amber-300' },
            { label: 'Immediate Action', count: intelligence.counts?.immediateAttention ?? 0, tone: 'text-[#f0cf65]' }
          ].map(b => (
            <div key={b.label} className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
              <p className="text-xs text-slate-400">{b.label}</p>
              <p className={`text-xl font-bold tabular-nums mt-1 ${b.tone}`}>{b.count}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-white">Recommended Next Steps</p>
          {(intelligence.nextSteps || []).map((step: any) => (
            <div
              key={step.id}
              className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-2 text-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[#d4af37] font-semibold tabular-nums">#{step.order}</span>
                  <span className="font-semibold text-white">{step.title}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">{step.category}</span>
                </div>
                <span
                  className={`text-xs font-medium capitalize ${
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
                <span className="text-[#d4af37] font-medium">Recommended action:</span>{' '}
                {step.recommendedSolution}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-400">
                <span>
                  Approval: {step.ownerApprovalRequired ? 'Owner confirmation required' : 'Standard'}
                </span>
                <div className="flex items-center gap-2">
                  {step.category === 'KYC Verification' && (
                    <button
                      onClick={() => onNavigateTab('users', 'kyc-pending')}
                      className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 whitespace-nowrap"
                    >
                      Open Pending KYC
                    </button>
                  )}
                  {step.category === 'Release Operations' && (
                    <button
                      onClick={() => onNavigateTab('releases', 'pending-releases')}
                      className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 whitespace-nowrap"
                    >
                      Open Pending Releases
                    </button>
                  )}
                  {step.category === 'Email & Auth' && (
                    <button
                      onClick={() => onNavigateTab('health', 'email-status')}
                      className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 whitespace-nowrap"
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
                      className="h-8 px-3 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] font-semibold"
                    >
                      Review & Approve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs pt-1">
          <div className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-2">
            <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Working & Verified
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

          <div className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-2">
            <p className="font-semibold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Attention Needed
            </p>
            <ul className="space-y-1 text-slate-300">
              {(intelligence.notWorking || []).map((n: string, i: number) => (
                <li key={`nw_${i}`} className="text-red-300">
                  • {n}
                </li>
              ))}
              {(intelligence.needsConfiguration || []).map((nc: string, i: number) => (
                <li key={`nc_${i}`}>• {nc}</li>
              ))}
              {(intelligence.pending || []).map((p: string, i: number) => (
                <li key={`p_${i}`} className="text-[#f0cf65]">
                  • {p}
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

// ======================== EXECUTIVE REPORTS PANEL ========================

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
    <div className="p-5 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3.5">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#d4af37]" /> Executive Reports
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Generated directly from verified database records with CSV and JSON export.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadReport(selectedType)}
            disabled={loading}
            className="h-9 px-3.5 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/40 text-xs font-medium text-[#f0cf65] inline-flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {report ? 'Regenerate' : 'Generate Report'}
          </button>
          {report && !report.dataUnavailable && (
            <>
              <button
                onClick={() => downloadFile('csv')}
                className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={() => downloadFile('json')}
                className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-200 inline-flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" /> JSON
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {reportTypes.map(rt => (
          <button
            key={rt.id}
            onClick={() => loadReport(rt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              selectedType === rt.id
                ? 'bg-[#d4af37]/15 border border-[#d4af37]/45 text-[#f0cf65]'
                : 'bg-[#090a0e] border border-white/[0.07] text-slate-400 hover:text-white'
            }`}
          >
            {rt.label}
          </button>
        ))}
      </div>

      {report?.dataUnavailable && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200">
          Data Unavailable: {report.error}
        </div>
      )}

      {report && !report.dataUnavailable && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 tabular-nums">
            <span className="font-medium text-slate-200">{report.title}</span>
            <span>
              Generated {new Date(report.generatedAt).toLocaleString()}
            </span>
          </div>

          {report.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(report.summary).map(([k, v]) => (
                <div key={k} className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
                  <p className="text-xs text-slate-400 capitalize">{k.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="text-base font-bold tabular-nums text-[#f0cf65] mt-1">
                    {String(v)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {report.missingOrUnavailable?.length > 0 && (
            <div className="p-3 rounded-xl bg-[#090a0e] border border-amber-500/35 text-xs text-amber-200">
              {report.missingOrUnavailable.map((m: string, i: number) => (
                <p key={i}>• Note: {m}</p>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-white/[0.07] overflow-x-auto max-h-72">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.07] bg-[#090a0e] text-slate-400">
                  {(report.headers || []).map((h: string) => (
                    <th key={h} className="py-2.5 px-3.5 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {(report.rows || []).slice(0, 50).map((row: any, rIdx: number) => (
                  <tr key={rIdx} className="hover:bg-white/[0.02]">
                    {Object.values(row).map((cell: any, cIdx: number) => (
                      <td key={cIdx} className="py-2.5 px-3.5 text-slate-300 tabular-nums whitespace-nowrap">
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
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl bg-[#111319] border border-white/[0.1] p-6 space-y-4 text-xs shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
          <div className="flex items-center gap-2 text-white">
            <Lock className="w-4 h-4 text-[#d4af37]" />
            <h3 className="text-sm font-semibold">Executive Session</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            Close
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="p-3 rounded-xl bg-[#090a0e] border border-white/[0.06] flex justify-between gap-2">
            <span className="text-slate-400">Authenticated Admin</span>
            <span className="text-white font-medium truncate">{sessionInfo?.email || '—'}</span>
          </div>
          <div className="p-3 rounded-xl bg-[#090a0e] border border-white/[0.06] flex justify-between gap-2">
            <span className="text-slate-400">Role</span>
            <span className="text-[#f0cf65] font-semibold">Super Admin</span>
          </div>
          <div className="p-3 rounded-xl bg-[#090a0e] border border-white/[0.06] flex justify-between gap-2 tabular-nums">
            <span className="text-slate-400">Signed In</span>
            <span className="text-slate-200">
              {sessionInfo?.loginAt ? new Date(sessionInfo.loginAt).toLocaleString() : 'Active Session'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#090a0e] border border-white/[0.06] flex justify-between gap-2 tabular-nums">
            <span className="text-slate-400">Last Activity</span>
            <span className="text-slate-200">
              {sessionInfo?.lastActivityAt ? new Date(sessionInfo.lastActivityAt).toLocaleString() : 'Just now'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#090a0e] border border-white/[0.06] flex justify-between gap-2 tabular-nums">
            <span className="text-slate-400">Session Expires</span>
            <span className="text-slate-200">
              {sessionInfo?.expiresAt ? new Date(sessionInfo.expiresAt).toLocaleString() : 'Active Window'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-1">
            <span className="text-slate-400 block">Security & Storage Status</span>
            <span className="text-emerald-300 block">{sessionInfo?.securityStatus || 'Verified'}</span>
            <span className="text-slate-300 block">Backend: {sessionInfo?.databaseStatus || 'Verified'}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 font-medium"
          >
            Keep Working
          </button>
          <button
            onClick={onSignOut}
            className="h-10 px-4 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-semibold inline-flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
