import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAuth } from '../context/AuthContext';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { Eye, EyeOff, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2, ShieldCheck, RefreshCw, KeyRound, ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { OtpInput } from '../components/auth/OtpInput';

export const LoginPage: React.FC = () => {
  const { navigate, queryParam } = useRouter();
  const { login, selectedPlanId } = useAuth();

  const redirectTarget = queryParam('redirect') || (selectedPlanId ? `/checkout?planId=${selectedPlanId}` : '/dashboard');

  // Step 1: Credentials State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2: 6-Digit OTP Verification State (Mandatory 2FA for every login)
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [expirySeconds, setExpirySeconds] = useState(300); // 5 minutes strictly

  // Forgot password modal state
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [forgotOtpDigits, setForgotOtpDigits] = useState(['', '', '', '', '', '']);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Cooldown countdown timers
  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((c) => Math.max(0, c - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    let timer: any;
    if (forgotCooldown > 0) {
      timer = setInterval(() => {
        setForgotCooldown((c) => Math.max(0, c - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [forgotCooldown]);

  // 5-minute expiration countdown timer for Login OTP
  useEffect(() => {
    let timer: any;
    if (requiresOtp && expirySeconds > 0) {
      timer = setInterval(() => {
        setExpirySeconds((s) => Math.max(0, s - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [requiresOtp, expirySeconds]);

  // Step 1: Submit Credentials
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email address and password are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.requiresOtp) {
          // Transition to Step 2: 6-digit OTP verification
          setRequiresOtp(true);
          setOtpDigits(['', '', '', '', '', '']);
          setOtpError(null);
          setCooldown(data.cooldownSeconds || 60);
          setExpirySeconds(data.expiresInSeconds || 300);
        } else if (data.token && data.user) {
          // Fallback if session token provided directly
          login(data.token, data.user);
          const target = redirectTarget.startsWith('/') ? redirectTarget : '/dashboard';
          navigate(target);
        }
      } else {
        if (data.needsVerification) {
          // Account unverified - navigate to signup verification
          navigate(`/signup?verifyEmail=${encodeURIComponent(data.email || email)}`);
        } else {
          setError(data.error || 'Invalid email or password.');
        }
      }
    } catch {
      setError('Network communication failure. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Submit 6-digit Login OTP
  const handleLoginOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setOtpError('Please enter the complete 6-digit verification code.');
      return;
    }

    if (expirySeconds <= 0) {
      setOtpError('This verification code has expired (5-minute limit). Please request a new code.');
      return;
    }

    setOtpLoading(true);
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/verify-login-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code })
      });
      const data = await res.json();

      if (res.ok && data.success && data.token && data.user) {
        // Authenticated successfully! Grant access to dashboard
        login(data.token, data.user);
        const target = redirectTarget.startsWith('/') ? redirectTarget : '/dashboard';
        navigate(target);
      } else {
        setOtpError(data.error || 'Invalid or expired verification code.');
      }
    } catch {
      setOtpError('Verification failed due to a network communication error.');
    } finally {
      setOtpLoading(false);
    }
  };

  // Resend Login OTP
  const handleResendLoginOtp = async () => {
    if (cooldown > 0) return;
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), type: 'login' })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setCooldown(data.cooldownSeconds || 60);
        setExpirySeconds(data.expiresInSeconds || 300);
        setOtpDigits(['', '', '', '', '', '']);
      } else {
        setOtpError(data.error || 'Failed to dispatch new verification code.');
      }
    } catch {
      setOtpError('Failed to resend verification code. Please check your network.');
    }
  };

  // Format mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Forgot password request code
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotLoading(true);
    setForgotError(null);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setForgotStep('verify');
        setForgotCooldown(data.cooldownSeconds || 60);
      } else {
        setForgotError(data.error || 'Failed to dispatch password reset code.');
      }
    } catch {
      setForgotError('Request failed due to a network error.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Forgot password verify code & reset password
  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = forgotOtpDigits.join('');
    if (code.length !== 6) {
      setForgotError('Please enter the complete 6-digit reset code.');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setForgotError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setForgotError('Password and Confirm Password do not match.');
      return;
    }

    setForgotLoading(true);
    setForgotError(null);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code,
          newPassword,
          confirmPassword
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setResetSuccess(true);
        setTimeout(() => {
          setForgotModalOpen(false);
          setForgotStep('request');
          setResetSuccess(false);
          setEmail(forgotEmail);
          setPassword('');
        }, 2200);
      } else {
        setForgotError(data.error || 'Password reset failed.');
      }
    } catch {
      setForgotError('Password reset failed due to a network error.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Quick Demo Account Pre-fills
  const fillDemoArtist = () => {
    setEmail('demo@rudraatmamusic.com');
    setPassword('Password123!');
    setRequiresOtp(false);
    setError(null);
  };

  const fillAdmin = () => {
    setEmail('admin@rudraatmamusic.com');
    setPassword('AdminPass123!');
    setRequiresOtp(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      <PublicHeader />

      <main className="flex-1 py-12 sm:py-16 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="p-7 sm:p-9 rounded-2xl bg-[#090e1a] border border-slate-800 shadow-2xl">
            {requiresOtp ? (
              /* STEP 2: 6-DIGIT TWO-FACTOR LOGIN OTP VERIFICATION */
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck className="w-6 h-6 text-cyan-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-white font-display">
                    Two-Factor Login Verification
                  </h1>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    A 6-digit authorization code was dispatched to:
                  </p>
                  <div className="inline-block mt-1 px-3 py-1 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-mono font-semibold text-cyan-300">
                    {email}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-center gap-1.5">
                    <span>Code expires in:</span>
                    <strong className={`font-mono font-bold ${expirySeconds < 60 ? 'text-rose-400' : 'text-amber-400'}`}>
                      {formatTime(expirySeconds)}
                    </strong>
                  </p>
                </div>

                {otpError && (
                  <div className="p-3 rounded-lg text-xs text-rose-300 bg-rose-950/40 border border-rose-800/80 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{otpError}</span>
                  </div>
                )}

                <form onSubmit={handleLoginOtpSubmit} className="space-y-6">
                  {/* 6-Digit OTP Inputs */}
                  <div className="py-2">
                    <OtpInput
                      digits={otpDigits}
                      onChange={setOtpDigits}
                      disabled={otpLoading}
                      autoFocus={true}
                      hasError={Boolean(otpError)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={otpLoading || otpDigits.join('').length !== 6 || expirySeconds <= 0}
                    className="w-full py-3.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {otpLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Verifying Passcode...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify & Open Dashboard</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      disabled={cooldown > 0}
                      onClick={handleResendLoginOtp}
                      className={`flex items-center gap-1.5 transition-colors ${
                        cooldown > 0 ? 'text-slate-600 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300 font-medium'
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRequiresOtp(false);
                        setOtpError(null);
                      }}
                      className="text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Login</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* STEP 1: INITIAL CREDENTIALS LOGIN */
              <div>
                <div className="text-center mb-6">
                  <div className="flex justify-center mb-3">
                    <BrandLogo size="lg" variant="icon" />
                  </div>
                  <h1 className="text-2xl font-bold text-white font-display">
                    Sign In to Rudraatma Music
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter your email and password to receive your 6-digit login authorization code
                  </p>
                </div>

                {/* Quick Test Demo Helper */}
                <div className="mb-6 p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] space-y-2">
                  <div className="text-slate-400 font-mono flex items-center justify-between">
                    <span>Platform Pre-Seeded Accounts:</span>
                    <span className="text-cyan-400">2FA Protected</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={fillDemoArtist}
                      className="flex-1 py-1.5 px-2 bg-blue-950/60 border border-blue-800/80 hover:bg-blue-900/60 text-blue-300 rounded font-medium transition-colors text-center"
                    >
                      Artist Demo
                    </button>
                    <button
                      type="button"
                      onClick={fillAdmin}
                      className="flex-1 py-1.5 px-2 bg-emerald-950/60 border border-emerald-800/80 hover:bg-emerald-900/60 text-emerald-300 rounded font-medium transition-colors text-center"
                    >
                      Admin Desk
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mb-5 p-3 rounded-lg text-xs text-rose-300 bg-rose-950/40 border border-rose-800/80 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Email Address *
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

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-slate-300">
                        Password *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotModalOpen(true);
                          setForgotEmail(email);
                          setForgotStep('request');
                          setForgotError(null);
                        }}
                        className="text-xs text-blue-400 hover:underline"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1 text-slate-400 hover:text-white absolute right-3 top-1/2 -translate-y-1/2 focus:outline-none"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-800 bg-slate-900 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Remember session securely</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 mt-2"
                  >
                    <span>{loading ? 'Verifying Credentials...' : 'Continue to 2FA Verification'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                {/* Registration Link */}
                <div className="mt-6 text-center text-xs text-slate-400 pt-5 border-t border-slate-800">
                  New to Rudraatma Music?{' '}
                  <button
                    onClick={() => navigate('/signup')}
                    className="text-blue-400 hover:underline font-semibold"
                  >
                    Sign Up First
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Forgot Password Modal (6-digit OTP verification) */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setForgotModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-[#0b1120] border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-2xl animate-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-white font-display mb-1">
              Reset Your Account Password
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {forgotStep === 'request'
                ? 'Enter your registered email address to receive a 6-digit password reset code.'
                : `Enter the 6-digit code sent to ${forgotEmail} along with your new password.`}
            </p>

            {forgotError && (
              <div className="mb-4 p-3 rounded-lg text-xs text-rose-300 bg-rose-950/40 border border-rose-800/80 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{forgotError}</span>
              </div>
            )}

            {resetSuccess ? (
              <div className="p-4 rounded-xl bg-slate-900 border border-emerald-800/60 text-xs text-emerald-300 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="font-semibold text-white">Password Updated Successfully!</p>
                <p className="text-slate-400">Returning to login to sign in with your new credentials...</p>
              </div>
            ) : forgotStep === 'request' ? (
              <form onSubmit={handleForgotRequest} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Registered Email Address</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    placeholder="artist@rudraatmamusic.com"
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotModalOpen(false)}
                    className="px-3.5 py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {forgotLoading ? 'Sending Code...' : 'Send 6-Digit Code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleForgotReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-2">6-Digit Reset Code (Expires in 5 min)</label>
                  <OtpInput
                    digits={forgotOtpDigits}
                    onChange={setForgotOtpDigits}
                    disabled={forgotLoading}
                    hasError={Boolean(forgotError)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">New Password (Min 8 characters)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={forgotCooldown > 0}
                    onClick={handleForgotRequest}
                    className={`text-xs ${forgotCooldown > 0 ? 'text-slate-600' : 'text-blue-400 hover:underline'}`}
                  >
                    {forgotCooldown > 0 ? `Resend in ${forgotCooldown}s` : 'Resend Code'}
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForgotStep('request')}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={forgotLoading || forgotOtpDigits.join('').length !== 6}
                      className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm disabled:opacity-50"
                    >
                      {forgotLoading ? 'Updating...' : 'Set New Password'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <PublicFooter />
    </div>
  );
};
