import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAuth } from '../context/AuthContext';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, Edit3, Mail, Check, X } from 'lucide-react';
import { OtpInput } from '../components/auth/OtpInput';
import { apiUrl, parseJsonSafe, formatNetworkError } from '../utils/api';

export const VerifyOtpPage: React.FC = () => {
  const { navigate, queryParam } = useRouter();
  const { login, selectedPlanId } = useAuth();

  const emailParam = queryParam('email') || '';
  const typeParam = (queryParam('type') || 'signup') as 'signup' | 'login';

  const [email, setEmail] = useState(() => {
    if (emailParam) return emailParam;
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem('pending_verification_email') || '';
    }
    return '';
  });

  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [expirySeconds, setExpirySeconds] = useState(300); // 5 minutes strictly

  // Change Email State
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  // Sync emailParam if query changes
  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
      try {
        sessionStorage.setItem('pending_verification_email', emailParam);
      } catch {
        // Ignore
      }
    }
  }, [emailParam]);

  // Cooldown countdown timer
  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((c) => Math.max(0, c - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  // 5-minute expiry countdown timer
  useEffect(() => {
    let timer: any;
    if (expirySeconds > 0) {
      timer = setInterval(() => {
        setExpirySeconds((s) => Math.max(0, s - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [expirySeconds]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    if (expirySeconds <= 0) {
      setError('This verification code has expired (5-minute limit). Please request a fresh code.');
      return;
    }

    if (!email.trim()) {
      setError('Email address is missing. Please enter your registered email below.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessNotice(null);

    const endpoint = apiUrl(typeParam === 'login' ? '/api/auth/verify-login-otp' : '/api/auth/verify-otp');

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code, type: typeParam })
      });
      const data = await parseJsonSafe(res);

      if (res.ok && data.success && data.token && data.user) {
        try {
          sessionStorage.removeItem('pending_verification_email');
        } catch {
          // Ignore
        }
        login(data.token, data.user);
        if (selectedPlanId) {
          navigate(`/checkout?planId=${selectedPlanId}`);
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(data?.error || 'Invalid or expired verification code.');
      }
    } catch (err: any) {
      setError(formatNetworkError(err, 'Verification failed due to a network error. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError(null);
    setSuccessNotice(null);

    try {
      const res = await fetch(apiUrl('/api/auth/resend-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), type: typeParam })
      });
      const data = await parseJsonSafe(res);

      if (res.ok && data.success) {
        setCooldown(data.cooldownSeconds || 60);
        setExpirySeconds(data.expiresInSeconds || 300);
        setOtpDigits(['', '', '', '', '', '']);
        setSuccessNotice(`Fresh 6-digit verification code dispatched to ${email.trim()}.`);
      } else {
        setError(data?.error || 'Failed to resend verification code.');
      }
    } catch (err: any) {
      setError(formatNetworkError(err, 'Failed to resend code due to network failure.'));
    }
  };

  // Change Registration Email
  const handleChangeEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNewEmail = newEmailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanNewEmail)) {
      setChangeError('Please enter a valid email address.');
      return;
    }

    if (cleanNewEmail === email.trim().toLowerCase()) {
      setChangeError('The new email is identical to the current one.');
      return;
    }

    setChangeLoading(true);
    setChangeError(null);

    try {
      const res = await fetch(apiUrl('/api/auth/change-registration-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldEmail: email.trim(), newEmail: cleanNewEmail })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setEmail(cleanNewEmail);
        try {
          sessionStorage.setItem('pending_verification_email', cleanNewEmail);
        } catch {
          // Ignore
        }
        setIsChangingEmail(false);
        setNewEmailInput('');
        setCooldown(data.cooldownSeconds || 60);
        setExpirySeconds(data.expiresInSeconds || 300);
        setOtpDigits(['', '', '', '', '', '']);
        setSuccessNotice(`Verification code successfully dispatched to your new email: ${cleanNewEmail}`);
        setError(null);
      } else {
        setChangeError(data.error || 'Failed to update email address.');
      }
    } catch {
      setChangeError('Network communication error while updating email.');
    } finally {
      setChangeLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      <PublicHeader />

      <main className="flex-1 py-12 sm:py-16 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="p-7 sm:p-9 rounded-2xl bg-[#090e1a] border border-slate-800 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-6 h-6 text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold text-white font-display">
                {typeParam === 'login' ? 'Login Two-Factor Verification' : 'Verify Email Address'}
              </h1>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                Enter the 6-digit authorization code dispatched to:
              </p>

              {/* Recipient Email & Edit Button */}
              {email ? (
                <div className="mt-2 flex flex-col items-center gap-1.5">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-mono font-semibold text-cyan-300 shadow-inner">
                    <Mail className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{email}</span>
                    {typeParam === 'signup' && !isChangingEmail && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsChangingEmail(true);
                          setNewEmailInput(email);
                          setChangeError(null);
                        }}
                        className="ml-2 text-blue-400 hover:text-blue-300 underline font-sans text-[11px] font-normal"
                        title="Change or correct your email address"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your registered email address"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>
              )}

              {/* Change Email Inline Card (if active) */}
              {isChangingEmail && (
                <form onSubmit={handleChangeEmailSubmit} className="mt-4 p-4 rounded-xl bg-slate-900/90 border border-blue-500/30 text-left space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                      <span>Update Verification Email</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsChangingEmail(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Mistyped your email? Enter your correct email below to migrate your pending registration and receive a fresh 6-digit code.
                  </p>
                  <input
                    type="email"
                    required
                    value={newEmailInput}
                    onChange={(e) => setNewEmailInput(e.target.value)}
                    placeholder="Enter your correct email address"
                    className="w-full px-3 py-2 bg-[#070b14] border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {changeError && (
                    <div className="text-[11px] text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>{changeError}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={changeLoading || !newEmailInput.trim()}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow"
                    >
                      {changeLoading ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Update & Send OTP</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsChangingEmail(false)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Verified Sender & Company Email Info */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-[11px] text-cyan-400 bg-cyan-950/30 border border-cyan-800/40 py-1.5 px-3 rounded-xl mx-auto w-fit mt-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                  <span>Sender: noreply@rudraatmamusic.com</span>
                </span>
                <span className="hidden sm:inline text-slate-500">|</span>
                <span className="text-slate-300">
                  Reply-To: <strong className="text-white font-mono">rudraatmamusic@gmail.com</strong>
                </span>
              </div>

              <p className="text-[11px] text-slate-400 mt-2.5 flex items-center justify-center gap-1.5">
                <span>Code expires in:</span>
                <strong className={`font-mono font-bold ${expirySeconds < 60 ? 'text-rose-400' : 'text-amber-400'}`}>
                  {formatTime(expirySeconds)}
                </strong>
              </p>
            </div>

            {successNotice && (
              <div className="mb-5 p-3 rounded-lg text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/80 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{successNotice}</span>
              </div>
            )}

            {error && (
              <div className="mb-5 p-3 rounded-lg text-xs text-rose-300 bg-rose-950/40 border border-rose-800/80 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-6">
              <div className="py-2">
                <OtpInput
                  digits={otpDigits}
                  onChange={setOtpDigits}
                  disabled={loading}
                  autoFocus={true}
                  hasError={Boolean(error)}
                />
              </div>

              <button
                type="submit"
                disabled={loading || otpDigits.join('').length !== 6 || expirySeconds <= 0}
                className="w-full py-3.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{typeParam === 'login' ? 'Verify & Access Dashboard' : 'Verify & Activate Account'}</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={cooldown > 0}
                  onClick={handleResend}
                  className={`flex items-center gap-1.5 transition-colors ${
                    cooldown > 0 ? 'text-slate-600 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300 font-medium'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate(typeParam === 'login' ? '/login' : '/signup')}
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{typeParam === 'login' ? 'Return to Login' : 'Back to Sign Up'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
