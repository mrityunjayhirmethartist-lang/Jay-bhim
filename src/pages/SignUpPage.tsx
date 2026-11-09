import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAuth } from '../context/AuthContext';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { Disc3, Lock, Mail, User as UserIcon, Globe, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, KeyRound, ServerCrash, ShieldCheck, ArrowLeft, Edit3, Check, X } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { OtpInput } from '../components/auth/OtpInput';

export const SignUpPage: React.FC = () => {
  const { navigate, queryParam } = useRouter();
  const { login, selectedPlanId, setSelectedPlanId } = useAuth();

  const planFromQuery = queryParam('planId') || queryParam('plan');
  const noticeParam = queryParam('notice');
  const verifyEmailFromQuery = queryParam('verifyEmail');
  const redirectTarget = queryParam('redirect') || (planFromQuery ? `/checkout?planId=${planFromQuery}` : (selectedPlanId ? `/checkout?planId=${selectedPlanId}` : '/dashboard'));

  useEffect(() => {
    if (planFromQuery) setSelectedPlanId(planFromQuery);
  }, [planFromQuery, setSelectedPlanId]);

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('India');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 6-Digit Email OTP Verification State
  const [otpStep, setOtpStep] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [expirySeconds, setExpirySeconds] = useState(300); // 5 minutes strictly

  // Change Email State during OTP verification
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  // If arriving from login with ?verifyEmail=...
  useEffect(() => {
    if (verifyEmailFromQuery) {
      setEmail(verifyEmailFromQuery);
      try {
        sessionStorage.setItem('pending_verification_email', verifyEmailFromQuery);
      } catch {
        // Ignore
      }
      setOtpStep(true);
      setCooldown(60);
      setExpirySeconds(300);
    }
  }, [verifyEmailFromQuery]);

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
    if (otpStep && expirySeconds > 0) {
      timer = setInterval(() => {
        setExpirySeconds((s) => Math.max(0, s - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [otpStep, expirySeconds]);

  const countries = [
    'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
    'Germany', 'France', 'United Arab Emirates', 'Singapore', 'Nepal', 'Bangladesh', 'Other'
  ];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Full name, email address, and password are required.');
      return;
    }

    if (!termsAccepted) {
      setError('You must accept the Terms & Conditions and Privacy Policy.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          country,
          password,
          confirmPassword,
          termsAccepted,
          selectedPlanId: selectedPlanId || 'growth-monthly'
        })
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned HTTP ${res.status}. Please check server connectivity.`);
      }

      if (res.ok && data.success) {
        try {
          sessionStorage.setItem('pending_verification_email', email.trim());
        } catch {
          // Ignore
        }
        setOtpStep(true);
        setOtpDigits(['', '', '', '', '', '']);
        setCooldown(data.cooldownSeconds || 60);
        setExpirySeconds(data.expiresInSeconds || 300);
      } else {
        setError(data?.error || 'Registration failed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Network communication failure. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setOtpError('Please enter the complete 6-digit verification code.');
      return;
    }

    if (expirySeconds <= 0) {
      setOtpError('This verification code has expired (5-minute limit). Please request a fresh code.');
      return;
    }

    setOtpLoading(true);
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code, type: 'signup' })
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server returned HTTP ${res.status}.`);
      }

      if (res.ok && data.success && data.token && data.user) {
        try {
          sessionStorage.removeItem('pending_verification_email');
        } catch {
          // Ignore
        }
        // Account verified and activated! Open session
        login(data.token, data.user);
        const target = redirectTarget.startsWith('/') ? redirectTarget : '/dashboard';
        navigate(target);
      } else {
        setOtpError(data?.error || 'Invalid or expired verification code.');
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Verification failed due to a network error. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleChangeEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNewEmail = newEmailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanNewEmail)) {
      setChangeError('Please enter a valid email address.');
      return;
    }

    if (cleanNewEmail === email.trim().toLowerCase()) {
      setChangeError('The new email address is identical to the current one.');
      return;
    }

    setChangeLoading(true);
    setChangeError(null);

    try {
      const res = await fetch('/api/auth/change-registration-email', {
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
        setOtpError(null);
      } else {
        setChangeError(data.error || 'Failed to update email address.');
      }
    } catch {
      setChangeError('Network communication error while updating email.');
    } finally {
      setChangeLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0) return;
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), type: 'signup' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCooldown(data.cooldownSeconds || 60);
        setExpirySeconds(data.expiresInSeconds || 300);
        setOtpDigits(['', '', '', '', '', '']);
      } else {
        setOtpError(data.error || 'Failed to resend code.');
      }
    } catch {
      setOtpError('Failed to resend code.');
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      <PublicHeader />

      <main className="flex-1 py-12 sm:py-16 flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="p-7 sm:p-9 rounded-2xl bg-[#090e1a] border border-slate-800 shadow-2xl">
            {otpStep ? (
              /* STEP 2: 6-DIGIT EMAIL OTP VERIFICATION */
              <div className="space-y-6">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck className="w-6 h-6 text-cyan-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-white font-display">
                    Verify Your Email Address
                  </h1>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    A 6-digit activation code was dispatched to:
                  </p>
                  <div className="mt-2 flex flex-col items-center gap-1.5">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-mono font-semibold text-cyan-300 shadow-inner">
                      <Mail className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{email}</span>
                      {!isChangingEmail && (
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

                  {/* Change Email Inline Card */}
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
                        Mistyped your email? Enter your correct email address below to receive a fresh 6-digit code.
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

                  {/* Verified Sender & Official Company Reply-To Badge */}
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

                {otpError && (
                  <div className="p-3 rounded-lg text-xs text-rose-300 bg-rose-950/40 border border-rose-800/80 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{otpError}</span>
                  </div>
                )}

                <form onSubmit={handleVerifyOtp} className="space-y-6">
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
                        <span>Verifying Code...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Verify Email & Activate Account</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      disabled={cooldown > 0}
                      onClick={handleResendOtp}
                      className={`flex items-center gap-1.5 transition-colors ${
                        cooldown > 0 ? 'text-slate-600 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300 font-medium'
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOtpStep(false)}
                      className="text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Change Email / Details</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* STEP 1: INITIAL REGISTRATION FORM */
              <div className="space-y-6">
                <div className="text-center">
                  <div className="flex justify-center mb-3">
                    <BrandLogo size="lg" variant="icon" />
                  </div>
                  <h1 className="text-2xl font-bold text-white font-display">
                    Create Artist Account
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">
                    Register with Rudraatma Music to distribute and monetize your catalog
                  </p>
                </div>

                {/* Mandatory Authentication Notice */}
                {noticeParam && (
                  <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/60 flex items-start gap-3 text-amber-200 text-xs shadow-lg shadow-amber-950/30">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-100">{noticeParam}</p>
                      {(planFromQuery || selectedPlanId) && (
                        <p className="text-[11px] text-amber-300/80 mt-1">
                          Plan Selected: <span className="font-mono text-white font-bold">{planFromQuery || selectedPlanId}</span>. Complete registration to continue straight to checkout.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-lg text-xs text-rose-300 bg-rose-950/40 border border-rose-800/80 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Full Legal Name / Stage Name *
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        placeholder="Aarav Mehta"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

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
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Country of Residence *
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {countries.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Password *
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          placeholder="Min 8 characters"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Confirm Password *
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          placeholder="Re-enter password"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        required
                        className="mt-0.5 rounded border-slate-800 bg-slate-900 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="leading-relaxed">
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={() => navigate('/terms')}
                          className="text-blue-400 hover:underline"
                        >
                          Terms & Conditions
                        </button>{' '}
                        and{' '}
                        <button
                          type="button"
                          onClick={() => navigate('/privacy')}
                          className="text-blue-400 hover:underline"
                        >
                          Privacy Policy
                        </button>.
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 mt-2"
                  >
                    <span>{loading ? 'Creating Account...' : 'Continue to Email Verification'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>

                {/* Login Link */}
                <div className="text-center text-xs text-slate-400 pt-4 border-t border-slate-800">
                  Already registered?{' '}
                  <button
                    onClick={() => {
                      const p = new URLSearchParams();
                      const effectivePlan = planFromQuery || selectedPlanId;
                      if (effectivePlan) p.set('planId', effectivePlan);
                      if (redirectTarget) p.set('redirect', redirectTarget);
                      if (noticeParam) p.set('notice', noticeParam);
                      const q = p.toString();
                      navigate(q ? `/login?${q}` : '/login');
                    }}
                    className="text-blue-400 hover:underline font-semibold"
                  >
                    Log In with 2FA
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
