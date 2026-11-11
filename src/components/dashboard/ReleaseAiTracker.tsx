import React, { useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  RefreshCw,
  Upload,
  Send
} from 'lucide-react';
import { apiUrl } from '../../utils/api';

interface Props {
  releaseId: string;
  releaseTitle: string;
  releaseArtist: string;
  token: string | null;
  onUpdated?: () => void;
}

const STAGES = [
  'Release Submitted',
  'Audio Processing',
  'Fingerprint Generation',
  'Music Database Matching',
  'AI Metadata Review',
  'Audio Quality Review',
  'Copyright Risk Assessment',
  'Admin Review',
  'Approved'
];

export const ReleaseAiTracker: React.FC<Props> = ({
  releaseId,
  releaseTitle,
  releaseArtist,
  token,
  onUpdated
}) => {
  const [statusData, setStatusData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Appeal modal state
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealExplanation, setAppealExplanation] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<Array<{ fileId: string; fileName: string; fileUrl: string }>>([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [submittingAppeal, setSubmittingAppeal] = useState(false);

  // Resubmission modal state
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitTitle, setResubmitTitle] = useState(releaseTitle);
  const [resubmitArtist, setResubmitArtist] = useState(releaseArtist);
  const [resubmitLyrics, setResubmitLyrics] = useState('');
  const [resubmitting, setResubmitting] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/ai/releases/${releaseId}/status`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      }
    } finally {
      setLoading(false);
    }
  }, [releaseId, token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!statusData) return;
    if (statusData.jobStatus === 'queued' || statusData.jobStatus === 'processing') {
      const timer = setInterval(fetchStatus, 3000);
      return () => clearInterval(timer);
    }
  }, [statusData, fetchStatus]);

  const handleEvidenceUpload = async (file: File) => {
    if (!token) return;
    setUploadingEvidence(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(apiUrl('/api/ai/upload/evidence'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setEvidenceFiles(prev => [...prev, { fileId: data.fileId, fileName: data.fileName, fileUrl: data.fileUrl }]);
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message });
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !appealExplanation.trim()) return;
    setSubmittingAppeal(true);
    setFeedback(null);
    try {
      const res = await fetch(apiUrl(`/api/ai/releases/${releaseId}/appeal`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          explanation: appealExplanation.trim(),
          evidenceFiles
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit appeal.');
      setAppealOpen(false);
      setAppealExplanation('');
      setEvidenceFiles([]);
      setFeedback({ type: 'ok', text: 'Your appeal and licensing documents have been submitted for Super Admin review.' });
      fetchStatus();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message });
    } finally {
      setSubmittingAppeal(false);
    }
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setResubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(apiUrl(`/api/ai/releases/${releaseId}/resubmit`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: resubmitTitle,
          artist: resubmitArtist,
          ...(resubmitLyrics.trim() ? { lyrics: resubmitLyrics } : {}),
          rightsConfirmed: true
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resubmission failed.');
      setResubmitOpen(false);
      setFeedback({ type: 'ok', text: 'Corrected release resubmitted. AI review pipeline has restarted.' });
      fetchStatus();
      onUpdated?.();
    } catch (err: any) {
      setFeedback({ type: 'err', text: err.message });
    } finally {
      setResubmitting(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!token) return;
    const res = await fetch(apiUrl(`/api/ai/releases/${releaseId}/report`), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      setFeedback({ type: 'err', text: 'Compliance report is still being generated.' });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rudraatma_Compliance_Report_${releaseId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !statusData) {
    return (
      <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800 text-xs text-slate-400">
        Loading AI review status...
      </div>
    );
  }

  const currentStageIdx = STAGES.indexOf(statusData.stage);
  const isRejectedOrAction =
    statusData.releaseStatus === 'Rejected' || statusData.releaseStatus === 'Action Required';

  return (
    <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Rudraatma AI Review & Compliance Tracker
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{statusData.userMessage}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadReport}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Compliance Report
          </button>
          <button
            onClick={fetchStatus}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
            title="Refresh AI Status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-[11px] font-mono text-slate-400">
          <span>Stage: <span className="text-amber-300 font-semibold">{statusData.stage}</span></span>
          <span>{statusData.progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              statusData.releaseStatus === 'Rejected'
                ? 'bg-red-500'
                : statusData.releaseStatus === 'Approved' || statusData.releaseStatus === 'Live'
                  ? 'bg-emerald-500'
                  : 'bg-amber-400'
            }`}
            style={{ width: `${statusData.progress}%` }}
          />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5 pt-1">
          {STAGES.map((st, idx) => {
            const done = currentStageIdx >= idx || statusData.releaseStatus === 'Approved';
            return (
              <div
                key={st}
                className={`text-[10px] px-1.5 py-1 rounded text-center truncate ${
                  done ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-slate-900/60 text-slate-500'
                }`}
                title={st}
              >
                {st}
              </div>
            );
          })}
        </div>
      </div>

      {statusData.audioTechnicalWarnings?.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-700/40 text-xs text-amber-200 space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Technical Audio Quality Notes
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {statusData.audioTechnicalWarnings.map((w: string, i: number) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {(statusData.rejectionReason || statusData.changesRequired) && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-700/40 text-xs text-red-200 space-y-2">
          <p className="font-semibold flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-red-400" />
            {statusData.rejectionReason ? 'Rejection Explanation' : 'Corrections / Documentation Required'}
          </p>
          <p>{statusData.rejectionReason || statusData.changesRequired}</p>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs border ${
            feedback.type === 'ok'
              ? 'bg-emerald-950/50 border-emerald-700/40 text-emerald-200'
              : 'bg-red-950/50 border-red-700/40 text-red-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {isRejectedOrAction && (
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            onClick={() => setResubmitOpen(true)}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
          >
            Submit Corrected Release
          </button>
          <button
            onClick={() => setAppealOpen(true)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
          >
            Submit Ownership Appeal
          </button>
        </div>
      )}

      {/* Appeal Modal */}
      {appealOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleSubmitAppeal} className="max-w-lg w-full rounded-2xl bg-[#090e1a] border border-slate-700 p-6 space-y-4 text-xs">
            <h4 className="text-base font-bold text-white">Submit Ownership Appeal & Licensing Evidence</h4>
            <textarea
              rows={4}
              required
              value={appealExplanation}
              onChange={e => setAppealExplanation(e.target.value)}
              placeholder="Explain your ownership of the recording/composition, sample clearances, or licensing permissions..."
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
            />
            <div className="space-y-2">
              <label className="block text-slate-300 font-medium">Upload Licensing / Permission Documents (PDF, JPG, PNG, max 5MB)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleEvidenceUpload(f);
                }}
                className="block w-full text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200"
              />
              {uploadingEvidence && <p className="text-amber-400">Uploading document...</p>}
              {evidenceFiles.map(ef => (
                <p key={ef.fileId} className="text-emerald-400 font-mono">Attached: {ef.fileName}</p>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAppealOpen(false)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">
                Cancel
              </button>
              <button type="submit" disabled={submittingAppeal} className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold">
                {submittingAppeal ? 'Submitting...' : 'Submit Appeal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Corrected Resubmission Modal */}
      {resubmitOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleResubmit} className="max-w-lg w-full rounded-2xl bg-[#090e1a] border border-slate-700 p-6 space-y-4 text-xs">
            <h4 className="text-base font-bold text-white">Corrected Release Resubmission</h4>
            <div>
              <label className="block text-slate-300 mb-1">Song Title</label>
              <input
                type="text"
                required
                value={resubmitTitle}
                onChange={e => setResubmitTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Primary Artist</label>
              <input
                type="text"
                required
                value={resubmitArtist}
                onChange={e => setResubmitArtist(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Updated Lyrics (Optional)</label>
              <textarea
                rows={4}
                value={resubmitLyrics}
                onChange={e => setResubmitLyrics(e.target.value)}
                placeholder="Paste corrected lyrics if applicable..."
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResubmitOpen(false)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">
                Cancel
              </button>
              <button type="submit" disabled={resubmitting} className="px-4 py-2 rounded-xl bg-amber-500 text-black font-bold">
                {resubmitting ? 'Resubmitting...' : 'Resubmit for AI Review'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
