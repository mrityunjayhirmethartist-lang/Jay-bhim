import React, { useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  Search,
  RefreshCw,
  Eye,
  Download,
  Sliders,
  Activity,
  Play,
  Cpu
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import type { OwnerApprovalProposalInput } from './adminTypes';

interface Props {
  token: string | null;
  showToast: (type: 'ok' | 'err', text: string) => void;
  activeSubmenu?: string;
  includeTest?: boolean;
  onProposeOwnerApproval?: (proposal: OwnerApprovalProposalInput) => void;
}

export const SuperAdminAiReviewCenter: React.FC<Props> = ({
  token,
  showToast,
  activeSubmenu = 'pending-ai-reviews',
  includeTest = false,
  onProposeOwnerApproval
}) => {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');

  const [detail, setDetail] = useState<any | null>(null);
  const [actionModal, setActionModal] = useState<{
    releaseId: string;
    title: string;
    action: string;
    appealId?: string;
    appealDecision?: 'approve' | 'reject';
  } | null>(null);
  const [actionReason, setActionReason] = useState('');

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [ovRes, revRes] = await Promise.all([
        fetch(apiUrl(`/api/super-admin/ai/overview?includeTest=${includeTest}`), {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(
          apiUrl(
            `/api/super-admin/ai/reviews?risk=${encodeURIComponent(riskFilter)}&q=${encodeURIComponent(search)}&includeTest=${includeTest}`
          ),
          { headers: { Authorization: `Bearer ${token}` } }
        )
      ]);
      if (ovRes.ok) {
        const d = await ovRes.json();
        setStats(d.stats || {});
        setDataUnavailable(false);
      } else {
        setStats(null);
        setDataUnavailable(true);
      }
      if (revRes.ok) {
        const d = await revRes.json();
        setReviews(d.reviews || []);
      }
    } catch (err: any) {
      setDataUnavailable(true);
      showToast('err', err.message || 'Failed to load AI Review Center.');
    } finally {
      setLoading(false);
    }
  }, [token, riskFilter, search, includeTest, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openDetail = async (releaseId: string) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/super-admin/ai/reviews/${releaseId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load review detail.');
      setDetail(data);
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const runAction = async (
    releaseId: string,
    action: string,
    extra: Record<string, any> = {}
  ) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/super-admin/ai/reviews/${releaseId}/action`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action, ...extra })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed.');
      showToast('ok', `Action "${action}" completed.`);
      setActionModal(null);
      setActionReason('');
      loadData();
      if (detail?.release?.id === releaseId) {
        openDetail(releaseId);
      }
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const downloadReport = async (releaseId: string) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/ai/releases/${releaseId}/report`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Compliance report not available yet.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rudraatma_Compliance_Report_${releaseId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  const filteredBySubmenu = reviews.filter(r => {
    if (activeSubmenu === 'pending-ai-reviews') return r.finalDecision === 'PENDING';
    if (activeSubmenu === 'copyright-risk-analysis') {
      return r.riskLevel === 'HIGH' || r.riskLevel === 'MEDIUM' || r.acoustIdMatchesCount > 0 || r.duplicateCount > 0;
    }
    if (activeSubmenu === 'review-history') return r.finalDecision !== 'PENDING';
    return true;
  });

  const kpis = [
    { label: 'Total AI Scans', value: dataUnavailable || !stats ? 'Data Unavailable' : stats.totalAiScans ?? 0 },
    { label: 'Pending AI Reviews', value: dataUnavailable || !stats ? 'Data Unavailable' : stats.pendingAiReviews ?? 0, gold: true },
    { label: 'Low Risk Releases', value: dataUnavailable || !stats ? 'Data Unavailable' : stats.lowRiskReleases ?? 0 },
    { label: 'Medium Risk Releases', value: dataUnavailable || !stats ? 'Data Unavailable' : stats.mediumRiskReleases ?? 0 },
    { label: 'High Risk Releases', value: dataUnavailable || !stats ? 'Data Unavailable' : stats.highRiskReleases ?? 0, gold: true },
    { label: 'Approved Releases', value: dataUnavailable || !stats ? 'Data Unavailable' : stats.approvedReleases ?? 0 },
    { label: 'Rejected Releases', value: dataUnavailable || !stats ? 'Data Unavailable' : stats.rejectedReleases ?? 0 },
    { label: 'Failed Scans', value: dataUnavailable || !stats ? 'Data Unavailable' : stats.failedScans ?? 0 },
    { label: 'Avg Review Time', value: dataUnavailable || !stats ? 'Data Unavailable' : `${stats.avgReviewTimeSec ?? 0}s` },
    { label: 'Copyright Matches', value: dataUnavailable || !stats ? 'Data Unavailable' : stats.potentialCopyrightMatches ?? 0, gold: true }
  ];

  const triggerProtectedDecision = (
    relId: string,
    title: string,
    actionType: 'RELEASE_APPROVE' | 'RELEASE_REJECT' | 'RELEASE_REQUEST_CORRECTIONS',
    explanation: string,
    consequences: string
  ) => {
    if (onProposeOwnerApproval) {
      setDetail(null);
      onProposeOwnerApproval({
        actionType,
        targetType: 'release',
        targetId: relId,
        title: `${actionType.replace(/_/g, ' ')} · ${title}`,
        explanation,
        consequences,
        proposedChanges: { releaseId: relId, decision: actionType },
        payload: {},
        requiresReason: actionType !== 'RELEASE_APPROVE'
      });
    } else if (actionType === 'RELEASE_APPROVE') {
      runAction(relId, 'override_approve', { notes: 'Approved by Super Admin' });
    } else {
      setActionModal({
        releaseId: relId,
        title,
        action: actionType === 'RELEASE_REJECT' ? 'reject' : 'request_corrections'
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-[#f0cf65] capitalize">
          {activeSubmenu.replace(/-/g, ' ')}
        </span>
        <span className="text-slate-400">
          AI provides evidence & risk scores only — final release decisions require Owner confirmation.
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div
            key={k.label}
            className={`p-4 rounded-2xl bg-[#111319] border ${
              k.gold ? 'border-[#d4af37]/30' : 'border-white/[0.08]'
            }`}
          >
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums mt-1.5 ${k.gold ? 'text-[#f0cf65]' : 'text-white'}`}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by song title, artist, user email, or release ID..."
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-xs text-white focus:border-[#d4af37]/60 focus:outline-none"
          />
        </div>
        <select
          value={riskFilter}
          onChange={e => setRiskFilter(e.target.value)}
          className="h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-xs text-white"
        >
          <option value="all">All Risk Levels</option>
          <option value="LOW">Low Risk</option>
          <option value="MEDIUM">Medium Risk</option>
          <option value="HIGH">High Risk</option>
          <option value="PENDING">Not Scanned</option>
        </select>
        <button
          onClick={loadData}
          className="h-10 px-3.5 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/40 text-xs font-medium text-[#f0cf65] flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* AI Review Table */}
      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
              <th className="py-3 px-4 font-medium">Release & Artist</th>
              <th className="py-3 px-4 font-medium">Submitter</th>
              <th className="py-3 px-4 font-medium">Duration</th>
              <th className="py-3 px-4 font-medium">AI Risk</th>
              <th className="py-3 px-4 font-medium">AcoustID / Dup</th>
              <th className="py-3 px-4 font-medium">Quality / AI</th>
              <th className="py-3 px-4 font-medium">Decision</th>
              <th className="py-3 px-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {filteredBySubmenu.map(r => (
              <tr key={r.releaseId} className="hover:bg-white/[0.02]">
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-white">{r.title}</div>
                  <div className="text-xs text-slate-400">
                    {r.artist} · {r.releaseId}
                  </div>
                </td>
                <td className="py-3.5 px-4">
                  <div className="text-slate-200">{r.userEmail}</div>
                  <div className="text-[11px] text-slate-500">{r.userId}</div>
                </td>
                <td className="py-3.5 px-4 tabular-nums text-slate-300">
                  {r.durationSec ? `${Math.round(r.durationSec)}s` : '—'}
                </td>
                <td className="py-3.5 px-4 font-semibold">
                  <span
                    className={
                      r.riskLevel === 'HIGH'
                        ? 'text-red-400'
                        : r.riskLevel === 'MEDIUM'
                          ? 'text-amber-300'
                          : r.riskLevel === 'LOW'
                            ? 'text-emerald-300'
                            : 'text-slate-400'
                    }
                  >
                    {r.riskLevel}
                  </span>
                </td>
                <td className="py-3.5 px-4 tabular-nums">
                  <div className="text-slate-200">{r.acoustIdStatus}</div>
                  {(r.acoustIdMatchesCount > 0 || r.duplicateCount > 0) && (
                    <div className="text-amber-400 text-[11px]">
                      {r.acoustIdMatchesCount} ext · {r.duplicateCount} dup
                    </div>
                  )}
                </td>
                <td className="py-3.5 px-4">
                  <span className={r.audioQualityValid ? 'text-emerald-300' : 'text-amber-300'}>
                    Audio: {r.audioQualityValid === null ? '—' : r.audioQualityValid ? 'OK' : 'Warn'}
                  </span>
                  <div className="text-slate-400">AI: {r.metadataStatus}</div>
                </td>
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-[#f0cf65]">{r.finalDecision}</div>
                  {r.pendingAppeals > 0 && (
                    <span className="text-[11px] text-amber-300">{r.pendingAppeals} appeal(s)</span>
                  )}
                </td>
                <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                  <button
                    onClick={() => openDetail(r.releaseId)}
                    className="h-8 px-3 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] inline-flex items-center gap-1.5 font-medium"
                  >
                    <Eye className="w-3.5 h-3.5" /> Report
                  </button>
                  <button
                    onClick={() => runAction(r.releaseId, 'rerun_scan')}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 inline-flex items-center"
                    title="Re-run AI Scan"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {filteredBySubmenu.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  No releases found for "{activeSubmenu.replace(/-/g, ' ')}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detailed AI Report & Override Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-5xl w-full max-h-[92vh] overflow-y-auto rounded-2xl bg-[#111319] border border-white/[0.1] p-6 space-y-5 text-xs shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#d4af37]" />
                  {detail.release.title} — Compliance & Risk Report
                </h3>
                <p className="text-slate-400 mt-0.5">
                  {detail.release.artist} · {detail.owner?.email} · Status: {detail.release.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadReport(detail.release.id)}
                  className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 inline-flex items-center gap-1.5 font-medium"
                >
                  <Download className="w-3.5 h-3.5" /> Download Report
                </button>
                <button
                  onClick={() => setDetail(null)}
                  className="h-9 px-3 rounded-xl bg-[#090a0e] text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            {detail.aiResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
                    <p className="text-slate-400">Risk Classification</p>
                    <p className="text-base font-bold text-[#f0cf65] mt-0.5">{detail.aiResult.riskLevel}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
                    <p className="text-slate-400">Recommended Decision</p>
                    <p className="text-sm font-semibold text-white mt-0.5">{detail.aiResult.recommendedDecision}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
                    <p className="text-slate-400">AcoustID Status</p>
                    <p className="text-sm font-medium text-white mt-0.5">{detail.aiResult.acoustIdStatus}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
                    <p className="text-slate-400">Fingerprint</p>
                    <p className="text-xs text-slate-300 truncate mt-0.5 tabular-nums">
                      {detail.aiResult.fingerprintHash || detail.aiResult.fingerprintStatus}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-2">
                  <h4 className="font-semibold text-[#f0cf65]">Audio Technical Analysis (FFmpeg)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-slate-300 tabular-nums">
                    <div>Format: {detail.aiResult.audioQuality?.codec}</div>
                    <div>Duration: {Math.round(detail.aiResult.audioQuality?.durationSec || 0)}s</div>
                    <div>Sample Rate: {detail.aiResult.audioQuality?.sampleRateHz} Hz</div>
                    <div>Bitrate: {detail.aiResult.audioQuality?.bitrateKbps} kbps</div>
                    <div>Max dB: {detail.aiResult.audioQuality?.maxVolumeDb ?? '—'} dB</div>
                  </div>
                  {(detail.aiResult.audioQuality?.warnings || []).length > 0 && (
                    <ul className="list-disc pl-5 text-amber-300 space-y-0.5">
                      {detail.aiResult.audioQuality.warnings.map((w: string, i: number) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-2">
                  <h4 className="font-semibold text-[#f0cf65]">AcoustID & Duplicate Evidence</h4>
                  {detail.aiResult.acoustIdMatches?.length > 0 ? (
                    <div className="space-y-1.5">
                      {detail.aiResult.acoustIdMatches.map((m: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-[#111319] border border-white/[0.06] flex justify-between text-xs">
                          <span>
                            {m.title || 'Untitled'} — {m.artist || 'Unknown'} (MBID: {m.musicbrainzId || '—'})
                          </span>
                          <span className="text-amber-400 tabular-nums">Score: {Math.round((m.score || 0) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400">
                      AcoustID Result: {detail.aiResult.acoustIdStatus}
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-2.5">
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-[#f0cf65]">Gemini AI Compliance Analysis</h4>
                    <span className="text-xs text-slate-400">
                      {detail.aiResult.geminiReport?.status} · {detail.aiResult.geminiReport?.model}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
                    <div>
                      <span className="text-slate-400 font-semibold">Copyright Risk:</span>{' '}
                      {detail.aiResult.geminiReport?.copyrightRiskExplanation}
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold">Metadata Accuracy:</span>{' '}
                      {detail.aiResult.geminiReport?.metadataAccuracyReport}
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold">Missing Info:</span>{' '}
                      {detail.aiResult.geminiReport?.missingInformationReport}
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold">Artwork Compliance:</span>{' '}
                      {detail.aiResult.geminiReport?.artworkComplianceReport}
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-slate-400 font-semibold">Policy & Recommendation:</span>{' '}
                      {detail.aiResult.geminiReport?.distributionPolicyReport} —{' '}
                      {detail.aiResult.geminiReport?.recommendedAction}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 italic">{detail.aiResult.geminiReport?.disclaimer}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] text-slate-400">
                No AI scan result recorded for this release yet. Click "Re-run AI Scan" below.
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-white/[0.08]">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => runAction(detail.release.id, 'rerun_scan')}
                  className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium"
                >
                  Re-run AI Scan
                </button>
                <button
                  onClick={() =>
                    setActionModal({ releaseId: detail.release.id, title: detail.release.title, action: 'add_note' })
                  }
                  className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 font-medium"
                >
                  Add Internal Note
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    triggerProtectedDecision(
                      detail.release.id,
                      detail.release.title,
                      'RELEASE_REQUEST_CORRECTIONS',
                      `Request metadata/audio corrections on release "${detail.release.title}".`,
                      'Sets release status to Action Required and notifies the artist.'
                    )
                  }
                  className="h-9 px-3.5 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-300 font-semibold"
                >
                  Request Corrections
                </button>
                <button
                  onClick={() =>
                    triggerProtectedDecision(
                      detail.release.id,
                      detail.release.title,
                      'RELEASE_REJECT',
                      `Reject release "${detail.release.title}" after compliance review.`,
                      'Marks release Rejected and dispatches official rejection notice to artist.'
                    )
                  }
                  className="h-9 px-3.5 rounded-xl bg-red-950/70 border border-red-500/40 text-red-300 font-semibold"
                >
                  Reject Release
                </button>
                <button
                  onClick={() =>
                    triggerProtectedDecision(
                      detail.release.id,
                      detail.release.title,
                      'RELEASE_APPROVE',
                      `Approve release "${detail.release.title}" for distribution.`,
                      'Marks release Approved and sends approval notification to artist.'
                    )
                  }
                  className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Approve Release
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fallback Note/Reason Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#111319] border border-white/[0.1] p-6 space-y-4">
            <h3 className="text-sm font-bold text-white capitalize">
              {actionModal.action.replace(/_/g, ' ')} · {actionModal.title}
            </h3>
            <textarea
              rows={3}
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="Enter instructions or internal note..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090a0e] border border-white/[0.08] text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActionModal(null)}
                className="h-9 px-4 rounded-xl bg-white/[0.06] text-xs text-slate-300 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  runAction(actionModal.releaseId, actionModal.action, {
                    reason: actionReason,
                    notes: actionReason,
                    appealId: actionModal.appealId,
                    appealDecision: actionModal.appealDecision
                  })
                }
                className="h-9 px-4 rounded-xl bg-[#d4af37] text-[#090a0e] text-xs font-semibold"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const SuperAdminAiSettings: React.FC<Props> = ({
  token,
  showToast,
  activeSubmenu = 'ai-provider-settings',
  onProposeOwnerApproval
}) => {
  const [settings, setSettings] = useState<any>(null);
  const [integrations, setIntegrations] = useState<Record<string, string>>({});
  const [usageData, setUsageData] = useState<{ logs: any[]; summary: any } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const loadSettings = useCallback(async () => {
    if (!token) return;
    const [setRes, usageRes] = await Promise.all([
      fetch(apiUrl('/api/super-admin/ai/settings'), { headers: { Authorization: `Bearer ${token}` } }),
      fetch(apiUrl('/api/super-admin/ai/usage'), { headers: { Authorization: `Bearer ${token}` } })
    ]);
    if (setRes.ok) {
      const data = await setRes.json();
      setSettings(data.settings);
      setIntegrations(data.integrations || {});
    }
    if (usageRes.ok) {
      const uData = await usageRes.json();
      setUsageData(uData);
    }
  }, [token]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!token || !settings) return;
    if (onProposeOwnerApproval) {
      onProposeOwnerApproval({
        actionType: 'AI_SETTINGS_UPDATE',
        targetType: 'ai_settings',
        targetId: 'global_ai_config',
        title: 'Save AI Configuration & Governance Permissions',
        explanation: 'Updates server-side AI pipeline switches, model selection, thresholds, and permissions.',
        consequences: 'Affects automated metadata/audio analysis and Rudra AI model routing.',
        proposedChanges: settings,
        payload: { aiSettings: settings }
      });
      return;
    }

    const res = await fetch(apiUrl('/api/super-admin/ai/settings'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    if (res.ok) {
      setSettings(data.settings);
      showToast('ok', 'AI configuration settings saved.');
    } else {
      showToast('err', data.error || 'Failed to save AI settings.');
    }
  };

  const handleTest = async (service: string) => {
    if (!token) return;
    setTesting(service);
    try {
      const res = await fetch(apiUrl('/api/super-admin/ai/test-connection'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ service })
      });
      const data = await res.json();
      setTestResults(prev => ({
        ...prev,
        [service]: { ok: Boolean(data.ok), message: data.message || data.status }
      }));
      if (data.status) {
        setIntegrations(prev => ({ ...prev, [service]: data.status }));
      }
    } finally {
      setTesting(null);
    }
  };

  if (!settings) return <div className="text-xs text-slate-400">Loading AI configuration...</div>;

  const toggles: Array<{ key: string; label: string; desc: string }> = [
    { key: 'aiReviewEnabled', label: 'Master AI Review Pipeline', desc: 'Run background AI & fingerprint review on new submissions' },
    { key: 'geminiAnalysisEnabled', label: 'Gemini Metadata & Compliance Analysis', desc: 'Analyze lyrics, metadata, rights, and artwork' },
    { key: 'audioFingerprintingEnabled', label: 'Chromaprint Audio Fingerprinting', desc: 'Generate audio fingerprints via fpcalc' },
    { key: 'acoustIdMatchingEnabled', label: 'AcoustID Reference Matching', desc: 'Query official AcoustID database for existing recordings' },
    { key: 'duplicateDetectionEnabled', label: 'Internal Duplicate Detection', desc: 'Detect duplicate audio hashes, ISRC, and UPC in Rudraatma' },
    { key: 'artworkReviewEnabled', label: 'Artwork Compliance Review', desc: 'Inspect cover art for policy compliance' },
    { key: 'metadataReviewEnabled', label: 'Metadata Validation', desc: 'Validate credits, explicit tags, and missing fields' },
    { key: 'autoApprovalEnabled', label: 'AI Auto-Approval (Disabled by Policy)', desc: 'Must remain OFF so Owner Approval is strictly enforced' },
    { key: 'autoRejectionEnabled', label: 'AI Auto-Rejection (Disabled by Policy)', desc: 'Must remain OFF so Owner Approval is strictly enforced' }
  ];

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-[#f0cf65] capitalize">
          {activeSubmenu.replace(/-/g, ' ')}
        </span>
        <span className="text-slate-400">
          API secrets stay isolated on the server backend; AI remains strictly advisory.
        </span>
      </div>

      {/* Real AI Usage & Tokens Section */}
      {(activeSubmenu === 'ai-usage-costs' || usageData) && (
        <div className="p-5 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#d4af37]" /> AI Usage & Token Logs
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Measured directly from backend Gemini API invocations.
              </p>
            </div>
            <span className="text-xs font-medium text-[#f0cf65]">
              Model: {usageData?.summary?.activeModel || settings.activeModel || 'gemini-4-hydrogen'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
              <p className="text-slate-400">Logged AI Calls</p>
              <p className="text-lg font-bold tabular-nums text-white mt-1">
                {usageData?.summary?.totalCalls ?? 0}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
              <p className="text-slate-400">Successful Calls</p>
              <p className="text-lg font-bold tabular-nums text-emerald-300 mt-1">
                {usageData?.summary?.successfulCalls ?? 0}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
              <p className="text-slate-400">Failed / Unconfigured</p>
              <p className="text-lg font-bold tabular-nums text-amber-300 mt-1">
                {usageData?.summary?.failedCalls ?? 0}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
              <p className="text-slate-400">Total Tokens Logged</p>
              <p className="text-lg font-bold tabular-nums text-[#f0cf65] mt-1">
                {(usageData?.summary?.totalTokens ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          {(usageData?.logs || []).length > 0 && activeSubmenu === 'ai-usage-costs' && (
            <div className="rounded-xl border border-white/[0.07] overflow-x-auto max-h-56">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
                    <th className="py-2.5 px-3 font-medium">Timestamp</th>
                    <th className="py-2.5 px-3 font-medium">Source</th>
                    <th className="py-2.5 px-3 font-medium">Model</th>
                    <th className="py-2.5 px-3 font-medium">Tokens</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-xs">
                  {usageData!.logs.slice(0, 20).map((l: any) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-3 text-slate-400 tabular-nums">{new Date(l.createdAt).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-slate-200">{l.source}</td>
                      <td className="py-2.5 px-3 text-slate-300">{l.model}</td>
                      <td className="py-2.5 px-3 text-[#f0cf65] tabular-nums">{l.totalTokens}</td>
                      <td className={`py-2.5 px-3 font-medium ${l.status === 'SUCCESS' ? 'text-emerald-300' : 'text-red-300'}`}>
                        {l.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#d4af37]" /> AI Engine Controls & Model
          </h3>

          <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-1.5">
            <label className="block text-xs font-semibold text-[#f0cf65]">
              Active Gemini Model
            </label>
            <select
              value={settings.activeModel || 'gemini-4-hydrogen'}
              onChange={e => setSettings({ ...settings, activeModel: e.target.value })}
              className="w-full h-10 px-3 rounded-xl bg-[#111319] border border-white/[0.1] text-xs text-white"
            >
              <option value="gemini-4-hydrogen">gemini-4-hydrogen (Recommended Executive Reasoning)</option>
              <option value="gemini-4-argon">gemini-4-argon</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
            </select>
          </div>

          <div className="space-y-2.5">
            {toggles.map(t => (
              <label
                key={t.key}
                className="flex items-center justify-between p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06] cursor-pointer"
              >
                <div className="pr-3">
                  <p className="text-xs font-semibold text-white">{t.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(settings[t.key])}
                  onChange={e => setSettings({ ...settings, [t.key]: e.target.checked })}
                  className="w-4 h-4 accent-[#d4af37] shrink-0"
                />
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Confidence Threshold (%)</label>
              <input
                type="number"
                min={50}
                max={100}
                value={settings.confidenceThreshold}
                onChange={e => setSettings({ ...settings, confidenceThreshold: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-xs text-[#f0cf65] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Max Audio Size (MB)</label>
              <input
                type="number"
                min={10}
                max={500}
                value={settings.maxAudioFileSizeMB}
                onChange={e => setSettings({ ...settings, maxAudioFileSizeMB: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-xs text-[#f0cf65] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Job Concurrency</label>
              <input
                type="number"
                min={1}
                max={5}
                value={settings.jobConcurrency}
                onChange={e => setSettings({ ...settings, jobConcurrency: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-xs text-[#f0cf65] tabular-nums"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            className="w-full h-10 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] text-[#090a0e] font-semibold text-xs transition-colors"
          >
            Save AI Configuration
          </button>
        </div>

        <div className="p-6 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#d4af37]" /> Service Integration Status
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              API secrets remain isolated in server environment variables and are never exposed to the browser.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { id: 'gemini', label: 'Google Gemini API' },
              { id: 'acoustid', label: 'AcoustID Web Service' },
              { id: 'chromaprint', label: 'Chromaprint (fpcalc)' },
              { id: 'ffmpeg', label: 'FFmpeg Audio Engine' },
              { id: 'database', label: 'PostgreSQL Database' },
              { id: 'storage', label: 'Media Storage' }
            ].map(svc => {
              const statusText = integrations[svc.id] || 'Unknown';
              const isOk =
                statusText.startsWith('Connected') ||
                statusText.startsWith('Installed') ||
                statusText === 'POSTGRES' ||
                statusText === 'S3' ||
                statusText.includes('In-Memory');
              const tr = testResults[svc.id];
              return (
                <div key={svc.id} className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-white">{svc.label}</p>
                      <p className={`text-xs ${isOk ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {statusText}
                      </p>
                    </div>
                    <button
                      onClick={() => handleTest(svc.id)}
                      disabled={testing === svc.id}
                      className="h-8 px-3 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-xs font-medium text-[#f0cf65] hover:bg-[#d4af37]/25 disabled:opacity-50"
                    >
                      {testing === svc.id ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                  {tr && (
                    <p className={`text-xs ${tr.ok ? 'text-emerald-400' : 'text-red-300'}`}>
                      {tr.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
