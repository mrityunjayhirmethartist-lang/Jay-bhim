import React, { useState, useEffect } from 'react';
import { useRouter } from '../context/RouterContext';
import { useAuth } from '../context/AuthContext';
import { PublicHeader } from '../components/layout/PublicHeader';
import { PublicFooter } from '../components/layout/PublicFooter';
import { Disc3, Lock, Mail, User as UserIcon, Globe, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, KeyRound, ServerCrash, ShieldCheck, ArrowLeft } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { OtpInput } from '../components/auth/OtpInput';

export const SignUpPage: React.FC = () => {
  const { navigate, queryParam } = useRouter();
  const { login, selectedPlanId, setSelectedPlanId } = useAuth();

  const planFromQuery = queryParam('plan');
  const verifyEmailFromQuery = queryParam('verifyEmail');

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

  // If arriving from login with ?verifyEmail=...
  useEffect(() => {
    if (verifyEmailFromQuery) {
      setEmail(verifyEmailFromQuery);
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

      const data = await res.json();
      if (res.ok && data.success) {
        setOtpStep(true);
        setOtpDigits(['', '', '', '', '', '']);
        setCooldown(data.cooldownSeconds || 60);
        setExpirySeconds(data.expiresInSeconds || 300);
      } else {
        setError(data.error || 'Registration failed.');
      }
    } catch {
      setError('Network communication failure. Please check your connection and try again.');
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

      const data = await res.json();
      if (res.ok && data.success && data.token && data.user) {
        // Account verified and activated! Open session
        login(data.token, data.user);
        if (selectedPlanId) {
          navigate(`/checkout?planId=${selectedPlanId}`);
        } else {
          navigate('/dashboard');
        }
      } else {
        setOtpError(data.error || 'Invalid or expired verification code.');
      }
    } catch {
      setOtpError('Verification failed due to a network error. Please try again.');
    } finally {
      setOtpLoading(false);
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
                  <div className="inline-block mt-1 px-3.5 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs font-mono font-semibold text-cyan-300">
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
                    onClick={() => navigate('/login')}
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
