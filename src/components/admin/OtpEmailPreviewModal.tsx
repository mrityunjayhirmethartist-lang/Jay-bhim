import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Mail,
  Eye,
  Code2,
  FileText,
  Smartphone,
  Monitor,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { apiUrl } from '../../utils/api';

interface OtpEmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
}

interface PreviewResponse {
  previewOnly: boolean;
  purpose: 'signup' | 'login' | 'reset';
  dummyOtp: string;
  recipientEmail: string;
  senderEmail: string;
  websiteUrl: string;
  expiryMinutes: number;
  subject: string;
  htmlBody: string;
  textBody: string;
}

export const OtpEmailPreviewModal: React.FC<OtpEmailPreviewModalProps> = ({
  isOpen,
  onClose,
  token
}) => {
  const [purpose, setPurpose] = useState<'signup' | 'login' | 'reset'>('signup');
  const [dummyOtp, setDummyOtp] = useState('482917');
  const [recipientEmail, setRecipientEmail] = useState('artist.preview@rudraatmamusic.com');
  const [viewMode, setViewMode] = useState<'html' | 'text' | 'source'>('html');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [copiedField, setCopiedField] = useState<'subject' | 'html' | 'text' | null>(null);

  const loadPreview = useCallback(
    async (opts?: { purpose?: 'signup' | 'login' | 'reset'; dummyOtp?: string; recipientEmail?: string }) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl('/api/super-admin/otp-email-preview'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            purpose: opts?.purpose ?? purpose,
            dummyOtp: opts?.dummyOtp ?? dummyOtp,
            recipientEmail: opts?.recipientEmail ?? recipientEmail
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to render OTP email template preview.');
        }
        setPreview(data);
      } catch (err: any) {
        setError(err?.message || 'Unable to load OTP email preview.');
      } finally {
        setLoading(false);
      }
    },
    [token, purpose, dummyOtp, recipientEmail]
  );

  useEffect(() => {
    if (isOpen && token) {
      loadPreview();
    }
  }, [isOpen, token, purpose]);

  if (!isOpen) return null;

  const generateDummyOtp = () => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setDummyOtp(code);
    loadPreview({ dummyOtp: code });
  };

  const handleCopy = async (field: 'subject' | 'html' | 'text', content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-preview-modal-title"
    >
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl bg-[#0b0c10] border border-[#d4af37]/40 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-800/90 bg-[#07070a] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/40 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-[#facc15]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="otp-preview-modal-title" className="text-sm sm:text-base font-bold text-white truncate">
                  OTP Email Template Preview
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-700/50 text-[10px] font-mono font-semibold text-emerald-300 uppercase tracking-wider">
                  Dummy Data · Zero Send
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Renders the exact server-side HTML and plain-text OTP template used by Google Apps Script MailApp.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            aria-label="Close email preview modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Controls */}
        <div className="px-5 py-3.5 border-b border-slate-800/80 bg-[#0d0e13] grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">OTP Flow Purpose</label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as 'signup' | 'login' | 'reset')}
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-white focus:outline-none focus:border-[#d4af37]/60"
            >
              <option value="signup">Account Signup Verification</option>
              <option value="login">Login 2FA Verification</option>
              <option value="reset">Password Reset OTP</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-[11px] text-slate-400 mb-1">Dummy 6-Digit Code</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={dummyOtp}
                onChange={(e) => setDummyOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="482917"
                className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-[#facc15] font-mono font-bold tracking-widest focus:outline-none focus:border-[#d4af37]/60"
              />
              <button
                type="button"
                onClick={generateDummyOtp}
                title="Generate random 6-digit dummy OTP"
                className="px-2.5 py-2 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] hover:bg-[#d4af37]/25 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] text-slate-400 mb-1">Sample Recipient Address</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="artist.preview@rudraatmamusic.com"
              className="w-full px-3 py-2 rounded-xl bg-[#050507] border border-slate-800 text-slate-200 focus:outline-none focus:border-[#d4af37]/60"
            />
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              type="button"
              onClick={() => loadPreview()}
              disabled={loading}
              className="w-full py-2 px-3 rounded-xl bg-[#d4af37] hover:bg-[#e0be4c] text-black font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Rendering...' : 'Render'}</span>
            </button>
          </div>
        </div>

        {/* Envelope Header & View Switcher */}
        <div className="px-5 py-3 border-b border-slate-800/80 bg-[#08090c] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400">Subject:</span>
              <span className="font-semibold text-white">
                {preview?.subject || 'Your Rudraatma Music Verification Code'}
              </span>
              {preview?.subject && (
                <button
                  type="button"
                  onClick={() => handleCopy('subject', preview.subject)}
                  className="text-[11px] text-[#f0cf65] hover:text-[#facc15] inline-flex items-center gap-1"
                >
                  {copiedField === 'subject' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'subject' ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 font-mono">
              <span>From: {preview?.senderEmail || 'rudraatmamusic@gmail.com'}</span>
              <span>To: {preview?.recipientEmail || recipientEmail}</span>
              <span>TTL: {preview?.expiryMinutes ?? 10} min</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Render mode buttons */}
            <div className="inline-flex rounded-xl bg-[#050507] border border-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('html')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 ${
                  viewMode === 'html' ? 'bg-[#d4af37] text-black font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> HTML Preview
              </button>
              <button
                type="button"
                onClick={() => setViewMode('text')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 ${
                  viewMode === 'text' ? 'bg-[#d4af37] text-black font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Plain-Text
              </button>
              <button
                type="button"
                onClick={() => setViewMode('source')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium inline-flex items-center gap-1.5 ${
                  viewMode === 'source' ? 'bg-[#d4af37] text-black font-bold' : 'text-slate-300 hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" /> HTML Source
              </button>
            </div>

            {viewMode === 'html' && (
              <div className="inline-flex rounded-xl bg-[#050507] border border-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewport('desktop')}
                  title="Desktop preview width"
                  className={`px-2 py-1.5 rounded-lg text-[11px] inline-flex items-center gap-1 ${
                    viewport === 'desktop' ? 'bg-slate-800 text-[#facc15]' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" /> Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('mobile')}
                  title="Mobile preview width (390px)"
                  className={`px-2 py-1.5 rounded-lg text-[11px] inline-flex items-center gap-1 ${
                    viewport === 'mobile' ? 'bg-slate-800 text-[#facc15]' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Mobile
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Preview Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#050507]">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-700/60 text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {!preview && loading ? (
            <div className="h-[460px] flex items-center justify-center text-xs text-slate-400 gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#d4af37]" />
              <span>Rendering live email template from server...</span>
            </div>
          ) : preview && viewMode === 'html' ? (
            <div className="flex justify-center">
              <div
                className={`w-full transition-all duration-200 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-[#07070a] ${
                  viewport === 'mobile' ? 'max-w-[390px]' : 'max-w-[680px]'
                }`}
              >
                <iframe
                  title="Rudraatma OTP HTML Email Preview"
                  srcDoc={preview.htmlBody}
                  sandbox=""
                  className="w-full h-[640px] border-0 bg-[#07070a]"
                />
              </div>
            </div>
          ) : preview && viewMode === 'text' ? (
            <div className="max-w-3xl mx-auto rounded-2xl bg-[#0b0c10] border border-[#d4af37]/30 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#f0cf65]">
                  Plain-Text Email Fallback (textBody)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('text', preview.textBody)}
                  className="px-2.5 py-1 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[11px] text-[#f0cf65] inline-flex items-center gap-1"
                >
                  {copiedField === 'text' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'text' ? 'Copied' : 'Copy Plain-Text'}</span>
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200 bg-[#050507] border border-slate-800 rounded-xl p-4">
                {preview.textBody}
              </pre>
            </div>
          ) : preview && viewMode === 'source' ? (
            <div className="max-w-4xl mx-auto rounded-2xl bg-[#0b0c10] border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#f0cf65]">
                  Compiled HTML Payload (htmlBody)
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('html', preview.htmlBody)}
                  className="px-2.5 py-1 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[11px] text-[#f0cf65] inline-flex items-center gap-1"
                >
                  {copiedField === 'html' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedField === 'html' ? 'Copied' : 'Copy HTML'}</span>
                </button>
              </div>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-slate-300 bg-[#050507] border border-slate-800 rounded-xl p-4 max-h-[520px] overflow-y-auto">
                {preview.htmlBody}
              </pre>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800/90 bg-[#07070a] flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>Preview only — no real OTP is persisted and no email is sent to users.</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
