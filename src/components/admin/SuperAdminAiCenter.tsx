import React, { useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  FileText,
  Sliders,
  Activity,
  ShieldAlert,
  Play
} from 'lucide-react';
import { apiUrl } from '../../utils/api';

interface Props {
  token: string | null;
  showToast: (type: 'ok' | 'err', text: string) => void;
}

export const SuperAdminAiReviewCenter: React.FC<Props> = ({ token, showToast }) => {
  const [stats, setStats] = useState<Record<string, number>>({});
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
        fetch(apiUrl('/api/super-admin/ai/overview'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl(`/api/super-admin/ai/reviews?risk=${encodeURIComponent(riskFilter)}&q=${encodeURIComponent(search)}`), {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      if (ovRes.ok) {
        const d = await ovRes.json();
        setStats(d.stats || {});
      }
      if (revRes.ok) {
        const d = await revRes.json();
        setReviews(d.reviews || []);
      }
    } catch (err: any) {
      showToast('err', err.message || 'Failed to load AI Review Center.');
    } finally {
      setLoading(false);
    }
  }, [token, riskFilter, search, showToast]);

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

  const kpis = [
    { label: 'Total AI Scans', value: stats.totalAiScans ?? 0 },
    { label: 'Pending AI Reviews', value: stats.pendingAiReviews ?? 0, gold: true },
    { label: 'Low Risk Releases', value: stats.lowRiskReleases ?? 0 },
    { label: 'Medium Risk Releases', value: stats.mediumRiskReleases ?? 0 },
    { label: 'High Risk Releases', value: stats.highRiskReleases ?? 0, gold: true },
    { label: 'Approved Releases', value: stats.approvedReleases ?? 0 },
    { label: 'Rejected Releases', value: stats.rejectedReleases ?? 0 },
    { label: 'Failed Scans', value: stats.failedScans ?? 0 },
    { label: 'Avg Review Time', value: `${stats.avgReviewTimeSec ?? 0}s` },
    { label: 'Potential Copyright Matches', value: stats.potentialCopyrightMatches ?? 0, gold: true }
  ];

  return (
    <div className="space-y-6">
      {/* 10 AI KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div
            key={k.label}
            className={`p-4 rounded-xl bg-[#0b0c10] border ${
              k.gold ? 'border-[#d4af37]/40' : 'border-slate-800/90'
            }`}
          >
            <p className="text-[11px] text-slate-400">{k.label}</p>
            <p className={`text-xl font-bold font-mono tabular-nums mt-1 ${k.gold ? 'text-[#f0cf65]' : 'text-white'}`}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="p-4 rounded-2xl bg-[#0b0c10] border border-slate-800/90 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by song title, artist, user email, or release ID..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
          />
        </div>
        <select
          value={riskFilter}
          onChange={e => setRiskFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
        >
          <option value="all">All Risk Levels</option>
          <option value="LOW">LOW RISK</option>
          <option value="MEDIUM">MEDIUM RISK</option>
          <option value="HIGH">HIGH RISK</option>
          <option value="PENDING">NOT SCANNED</option>
        </select>
        <button
          onClick={loadData}
          className="px-3 py-2 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/40 text-xs text-[#f0cf65] flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* AI Review Table */}
      <div className="rounded-2xl bg-[#0b0c10] border border-slate-800/90 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="py-3 px-4">Release & Artist</th>
              <th className="py-3 px-4">Submitter</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">AI Risk</th>
              <th className="py-3 px-4">AcoustID / Dup</th>
              <th className="py-3 px-4">Quality / AI</th>
              <th className="py-3 px-4">Decision</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {reviews.map(r => (
              <tr key={r.releaseId} className="hover:bg-white/[0.02]">
                <td className="py-3 px-4">
                  <div className="font-semibold text-white">{r.title}</div>
                  <div className="text-[11px] text-slate-400">{r.artist} · {r.releaseId}</div>
                </td>
                <td className="py-3 px-4">
                  <div className="text-slate-200 font-mono text-[11px]">{r.userEmail}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{r.userId}</div>
                </td>
                <td className="py-3 px-4 font-mono tabular-nums text-slate-300">
                  {r.durationSec ? `${Math.round(r.durationSec)}s` : '—'}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      r.riskLevel === 'HIGH'
                        ? 'bg-red-500/20 text-red-300'
                        : r.riskLevel === 'MEDIUM'
                          ? 'bg-amber-500/20 text-amber-300'
                          : r.riskLevel === 'LOW'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {r.riskLevel}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-[11px]">
                  <div className="text-slate-200">{r.acoustIdStatus}</div>
                  {(r.acoustIdMatchesCount > 0 || r.duplicateCount > 0) && (
                    <div className="text-amber-400">
                      {r.acoustIdMatchesCount} ext · {r.duplicateCount} dup
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 text-[11px]">
                  <span className={r.audioQualityValid ? 'text-emerald-300' : 'text-amber-300'}>
                    Audio: {r.audioQualityValid === null ? '—' : r.audioQualityValid ? 'OK' : 'Warn'}
                  </span>
                  <div className="text-slate-400">AI: {r.metadataStatus}</div>
                </td>
                <td className="py-3 px-4">
                  <div className="text-[11px] font-semibold text-[#f0cf65]">{r.finalDecision}</div>
                  {r.pendingAppeals > 0 && (
                    <span className="text-[10px] text-amber-300 font-mono">{r.pendingAppeals} appeal(s)</span>
                  )}
                </td>
                <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                  <button
                    onClick={() => openDetail(r.releaseId)}
                    className="px-2.5 py-1 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] inline-flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" /> Report
                  </button>
                  <button
                    onClick={() => runAction(r.releaseId, 'rerun_scan')}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1"
                    title="Re-run AI Scan"
                  >
                    <Play className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
            {reviews.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  No releases found in AI Review queue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detailed AI Report & Override Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="max-w-5xl w-full max-h-[92vh] overflow-y-auto rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-5 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#d4af37]" />
                  {detail.release.title} — AI Compliance & Risk Report
                </h3>
                <p className="text-slate-400 font-mono mt-0.5">
                  {detail.release.artist} · {detail.owner?.email} · Status: {detail.release.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadReport(detail.release.id)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Download Report
                </button>
                <button onClick={() => setDetail(null)} className="px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white">
                  Close
                </button>
              </div>
            </div>

            {detail.aiResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                    <p className="text-slate-400">Risk Classification</p>
                    <p className="text-base font-bold text-[#f0cf65] mt-0.5">{detail.aiResult.riskLevel}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                    <p className="text-slate-400">Recommended Decision</p>
                    <p className="text-sm font-semibold text-white mt-0.5">{detail.aiResult.recommendedDecision}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                    <p className="text-slate-400">AcoustID Status</p>
                    <p className="text-sm font-mono text-white mt-0.5">{detail.aiResult.acoustIdStatus}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#050507] border border-slate-800">
                    <p className="text-slate-400">Fingerprint</p>
                    <p className="text-[11px] font-mono text-slate-300 truncate mt-0.5">
                      {detail.aiResult.fingerprintHash || detail.aiResult.fingerprintStatus}
                    </p>
                  </div>
                </div>

                {/* Audio Technical Quality */}
                <div className="p-4 rounded-xl bg-[#050507] border border-slate-800 space-y-2">
                  <h4 className="font-semibold text-[#f0cf65]">Audio Technical Analysis (FFmpeg)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-[11px] text-slate-300">
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

                {/* AcoustID & Duplicate Evidence */}
                <div className="p-4 rounded-xl bg-[#050507] border border-slate-800 space-y-2">
                  <h4 className="font-semibold text-[#f0cf65]">AcoustID & Duplicate Evidence</h4>
                  {detail.aiResult.acoustIdMatches?.length > 0 ? (
                    <div className="space-y-1.5">
                      {detail.aiResult.acoustIdMatches.map((m: any, idx: number) => (
                        <div key={idx} className="p-2 rounded bg-[#0b0c10] border border-slate-800 flex justify-between font-mono text-[11px]">
                          <span>{m.title || 'Untitled'} — {m.artist || 'Unknown'} (MBID: {m.musicbrainzId || '—'})</span>
                          <span className="text-amber-400">Score: {Math.round((m.score || 0) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400">AcoustID Result: {detail.aiResult.acoustIdStatus} (not legal proof of originality).</p>
                  )}
                  {detail.aiResult.duplicateCheck?.matches?.length > 0 && (
                    <div className="pt-2 space-y-1">
                      <p className="text-red-300 font-semibold">Internal Catalog Duplicates:</p>
                      {detail.aiResult.duplicateCheck.matches.map((d: any, i: number) => (
                        <div key={i} className="text-red-200 font-mono text-[11px]">
                          {d.matchType}: {d.title} by {d.artist} ({d.releaseId})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Gemini Report */}
                <div className="p-4 rounded-xl bg-[#050507] border border-slate-800 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-[#f0cf65]">Gemini AI Compliance Analysis</h4>
                    <span className="font-mono text-[11px] text-slate-400">
                      {detail.aiResult.geminiReport?.status} · {detail.aiResult.geminiReport?.model}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
                    <div><span className="text-slate-400 font-semibold">Copyright Risk:</span> {detail.aiResult.geminiReport?.copyrightRiskExplanation}</div>
                    <div><span className="text-slate-400 font-semibold">Metadata Accuracy:</span> {detail.aiResult.geminiReport?.metadataAccuracyReport}</div>
                    <div><span className="text-slate-400 font-semibold">Missing Info:</span> {detail.aiResult.geminiReport?.missingInformationReport}</div>
                    <div><span className="text-slate-400 font-semibold">Artwork Compliance:</span> {detail.aiResult.geminiReport?.artworkComplianceReport}</div>
                    <div className="md:col-span-2"><span className="text-slate-400 font-semibold">Policy & Recommendation:</span> {detail.aiResult.geminiReport?.distributionPolicyReport} — {detail.aiResult.geminiReport?.recommendedAction}</div>
                  </div>
                  <p className="text-[11px] text-slate-500 italic">{detail.aiResult.geminiReport?.disclaimer}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#050507] border border-slate-800 text-slate-400">
                No AI scan result recorded for this release yet. Click "Re-run AI Scan" below.
              </div>
            )}

            {/* User Appeals */}
            {detail.appeals?.length > 0 && (
              <div className="p-4 rounded-xl bg-[#050507] border border-amber-700/40 space-y-3">
                <h4 className="font-semibold text-amber-300">Submitted Appeals ({detail.appeals.length})</h4>
                {detail.appeals.map((apl: any) => (
                  <div key={apl.id} className="p-3 rounded-lg bg-[#0b0c10] border border-slate-800 space-y-2">
                    <div className="flex justify-between">
                      <span className="font-mono text-slate-400">{apl.id} · {new Date(apl.createdAt).toLocaleString()}</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[#f0cf65]">{apl.status}</span>
                    </div>
                    <p className="text-slate-200">{apl.explanation}</p>
                    {apl.status === 'Pending' && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() =>
                            setActionModal({
                              releaseId: detail.release.id,
                              title: detail.release.title,
                              action: 'review_appeal',
                              appealId: apl.id,
                              appealDecision: 'approve'
                            })
                          }
                          className="px-3 py-1 rounded bg-emerald-600 text-white font-semibold"
                        >
                          Approve Appeal
                        </button>
                        <button
                          onClick={() =>
                            setActionModal({
                              releaseId: detail.release.id,
                              title: detail.release.title,
                              action: 'review_appeal',
                              appealId: apl.id,
                              appealDecision: 'reject'
                            })
                          }
                          className="px-3 py-1 rounded bg-red-600 text-white font-semibold"
                        >
                          Reject Appeal
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Admin Actions */}
            <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-slate-800">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => runAction(detail.release.id, 'rerun_scan')}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium"
                >
                  Re-run AI Scan
                </button>
                <button
                  onClick={() => setActionModal({ releaseId: detail.release.id, title: detail.release.title, action: 'add_note' })}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Add Internal Note
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActionModal({ releaseId: detail.release.id, title: detail.release.title, action: 'request_rights_docs' })}
                  className="px-3 py-2 rounded-xl bg-amber-950/70 border border-amber-700/50 text-amber-300 font-semibold"
                >
                  Request Rights Docs
                </button>
                <button
                  onClick={() => setActionModal({ releaseId: detail.release.id, title: detail.release.title, action: 'request_corrections' })}
                  className="px-3 py-2 rounded-xl bg-amber-950/70 border border-amber-700/50 text-amber-300 font-semibold"
                >
                  Request Corrections
                </button>
                <button
                  onClick={() => setActionModal({ releaseId: detail.release.id, title: detail.release.title, action: 'reject' })}
                  className="px-3 py-2 rounded-xl bg-red-950/80 border border-red-700/50 text-red-300 font-semibold"
                >
                  Reject
                </button>
                <button
                  onClick={() => runAction(detail.release.id, 'override_approve', { notes: 'Approved by Super Admin' })}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Approve / Override
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Reason Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase">
              {actionModal.action.replace(/_/g, ' ')} · {actionModal.title}
            </h3>
            <textarea
              rows={3}
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="Enter reason, instructions, or internal note..."
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setActionModal(null)} className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300">
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
                className="px-4 py-2 rounded-xl bg-[#d4af37] text-black text-xs font-bold"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const SuperAdminAiSettings: React.FC<Props> = ({ token, showToast }) => {
  const [settings, setSettings] = useState<any>(null);
  const [integrations, setIntegrations] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const loadSettings = useCallback(async () => {
    if (!token) return;
    const res = await fetch(apiUrl('/api/super-admin/ai/settings'), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setIntegrations(data.integrations || {});
    }
  }, [token]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!token || !settings) return;
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
      setTestResults(prev => ({ ...prev, [service]: { ok: Boolean(data.ok), message: data.message || data.status } }));
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
    { key: 'autoApprovalEnabled', label: 'AI Auto-Approval (Low Risk Only)', desc: 'Disabled by default; requires passing threshold & all checks' },
    { key: 'autoRejectionEnabled', label: 'AI Auto-Rejection', desc: 'Disabled by default; keep off unless strictly tested' }
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="p-6 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#d4af37]" /> AI Engine Controls & Thresholds
        </h3>
        <div className="space-y-2.5">
          {toggles.map(t => (
            <label
              key={t.key}
              className="flex items-center justify-between p-3 rounded-xl bg-[#050507] border border-slate-800 cursor-pointer"
            >
              <div>
                <p className="text-xs font-semibold text-white">{t.label}</p>
                <p className="text-[11px] text-slate-400">{t.desc}</p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(settings[t.key])}
                onChange={e => setSettings({ ...settings, [t.key]: e.target.checked })}
                className="w-4 h-4 accent-[#d4af37]"
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Confidence Threshold (%)</label>
            <input
              type="number"
              min={50}
              max={100}
              value={settings.confidenceThreshold}
              onChange={e => setSettings({ ...settings, confidenceThreshold: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-[#f0cf65] font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Max Audio Size (MB)</label>
            <input
              type="number"
              min={10}
              max={500}
              value={settings.maxAudioFileSizeMB}
              onChange={e => setSettings({ ...settings, maxAudioFileSizeMB: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-[#f0cf65] font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Job Concurrency</label>
            <input
              type="number"
              min={1}
              max={5}
              value={settings.jobConcurrency}
              onChange={e => setSettings({ ...settings, jobConcurrency: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-xs text-[#f0cf65] font-mono"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b8891b] text-black font-bold text-xs"
        >
          Save AI Configuration
        </button>
      </div>

      {/* Live Integration Status & Connection Tests */}
      <div className="p-6 rounded-2xl bg-[#0b0c10] border border-slate-800/90 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#d4af37]" /> Service Integration Status
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            API secrets remain isolated in Render environment variables and are never exposed to the browser.
          </p>
        </div>

        <div className="space-y-3">
          {[
            { id: 'gemini', label: 'Google Gemini API' },
            { id: 'acoustid', label: 'AcoustID Web Service' },
            { id: 'chromaprint', label: 'Chromaprint (fpcalc)' },
            { id: 'ffmpeg', label: 'FFmpeg Audio Engine' },
            { id: 'database', label: 'PostgreSQL Database' },
            { id: 'storage', label: 'Media & DBbyte Storage' }
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
              <div key={svc.id} className="p-3.5 rounded-xl bg-[#050507] border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white">{svc.label}</p>
                    <p className={`text-[11px] font-mono ${isOk ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {statusText}
                    </p>
                  </div>
                  <button
                    onClick={() => handleTest(svc.id)}
                    disabled={testing === svc.id}
                    className="px-3 py-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-xs text-[#f0cf65] hover:bg-[#d4af37]/25 disabled:opacity-50"
                  >
                    {testing === svc.id ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
                {tr && (
                  <p className={`text-[11px] ${tr.ok ? 'text-emerald-400' : 'text-red-300'}`}>
                    {tr.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
