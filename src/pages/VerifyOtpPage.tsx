import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAuth } from '../context/AuthContext';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { OtpInput } from '../components/auth/OtpInput';

export const VerifyOtpPage: React.FC = () => {
  const { navigate, queryParam } = useRouter();
  const { login, selectedPlanId } = useAuth();

  const emailParam = queryParam('email') || '';
  const typeParam = (queryParam('type') || 'signup') as 'signup' | 'login';

  const [email, setEmail] = useState(emailParam);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [expirySeconds, setExpirySeconds] = useState(300); // 5 minutes

  // Cooldown timer
  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((c) => Math.max(0, c - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  // 5-minute expiry timer
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
      setError('Email address is missing. Please restart the login or registration process.');
      return;
    }

    setLoading(true);
    setError(null);

    const endpoint = typeParam === 'login' ? '/api/auth/verify-login-otp' : '/api/auth/verify-otp';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code, type: typeParam })
      });
      const data = await res.json();

      if (res.ok && data.success && data.token && data.user) {
        login(data.token, data.user);
        if (selectedPlanId) {
          navigate(`/checkout?planId=${selectedPlanId}`);
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(data.error || 'Invalid or expired verification code.');
      }
    } catch {
      setError('Verification failed due to a network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError(null);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), type: typeParam })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCooldown(data.cooldownSeconds || 60);
        setExpirySeconds(data.expiresInSeconds || 300);
        setOtpDigits(['', '', '', '', '', '']);
      } else {
        setError(data.error || 'Failed to resend code.');
      }
    } catch {
      setError('Failed to resend code.');
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
              {email ? (
                <div className="inline-block mt-1 px-3.5 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-mono font-semibold text-cyan-300">
                  {email}
                </div>
              ) : (
                <div className="mt-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your registered email"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-center gap-1.5">
                <span>Code expires in:</span>
                <strong className={`font-mono font-bold ${expirySeconds < 60 ? 'text-rose-400' : 'text-amber-400'}`}>
                  {formatTime(expirySeconds)}
                </strong>
              </p>
            </div>

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
