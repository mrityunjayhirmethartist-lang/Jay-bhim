import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { KeyRound, Mail, Lock, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { OtpInput } from '../components/auth/OtpInput';

export const ForgotPasswordPage: React.FC = () => {
  const { navigate, queryParam } = useRouter();

  const [email, setEmail] = useState(() => queryParam('email') || '');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((c) => Math.max(0, c - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your registered email address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setStep('verify');
        setCooldown(data.cooldownSeconds || 60);
        setOtpDigits(['', '', '', '', '', '']);
      } else {
        setError(data.error || 'Failed to dispatch reset code.');
      }
    } catch {
      setError('Network communication failure. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code,
          newPassword,
          confirmPassword
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setResetSuccess(true);
      } else {
        setError(data.error || 'Password reset failed. Invalid or expired code.');
      }
    } catch {
      setError('Network communication failure. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setError(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCooldown(data.cooldownSeconds || 60);
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
                <KeyRound className="w-6 h-6 text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold text-white font-display">
                Reset Account Password
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {step === 'request'
                  ? 'Enter your registered email to receive a secure 6-digit verification code'
                  : `Enter the 6-digit code dispatched to ${email}`}
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-lg text-xs text-rose-300 bg-rose-950/40 border border-rose-800/80 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {resetSuccess ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-display">Password Updated</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Your password has been successfully reset. All previous sessions have been securely terminated.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/login')}
                  className="w-full py-3 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  <span>Proceed to Log In</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : step === 'request' ? (
              <form onSubmit={handleRequestCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Registered Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="artist@rudraatmamusic.com"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 mt-2"
                >
                  <span>{loading ? 'Dispatching Code...' : 'Send 6-Digit Reset Code'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="text-center pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-xs text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1.5 mx-auto"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Return to Login</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2 text-center">
                    Enter 6-Digit Reset Code (Expires in 5 min)
                  </label>
                  <OtpInput
                    digits={otpDigits}
                    onChange={setOtpDigits}
                    disabled={loading}
                    hasError={Boolean(error)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    New Password (Min 8 characters) *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirm New Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otpDigits.join('').length !== 6}
                  className="w-full py-3.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Updating Password...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Save New Password</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    disabled={cooldown > 0}
                    onClick={handleResendCode}
                    className={`flex items-center gap-1.5 transition-colors ${
                      cooldown > 0 ? 'text-slate-600 cursor-not-allowed' : 'text-blue-400 hover:underline'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep('request')}
                    className="text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
