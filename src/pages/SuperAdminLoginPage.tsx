import React, { useState } from 'react';
import { Shield, Lock, Mail, Eye, EyeOff, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { apiUrl } from '../utils/api';

export const SuperAdminLoginPage: React.FC = () => {
  const { login } = useAuth();
  const { navigate } = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorPin, setTwoFactorPin] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Super Admin email and password are required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/api/super-admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          ...(requiresTwoFactor && twoFactorPin ? { twoFactorPin } : {})
        })
      });
      const rawText = await res.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        setError(`Authentication server returned an unexpected response (${res.status}). Check VITE_API_BASE_URL and CORS settings.`);
        return;
      }

      if (data.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setLoading(false);
        return;
      }

      if (!res.ok || !data.success) {
        setError(data.error || `Authentication failed (${res.status}).`);
        return;
      }

      if (data.token && data.user) {
        login(data.token, data.user);
        navigate('/super-admin');
      }
    } catch (err: any) {
      setError(
        err?.message && err.message !== 'Failed to fetch'
          ? err.message
          : 'Unable to reach authentication server (CORS or backend offline). Please verify https://rudraatma-music.onrender.com/api/health.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050507] text-slate-100 flex flex-col justify-between px-4 py-8">
      <div className="max-w-md w-full mx-auto my-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#11100c] border border-[#d4af37]/40 mb-4 shadow-[0_0_30px_rgba(212,175,55,0.12)]">
            <Shield className="w-7 h-7 text-[#d4af37]" />
          </div>
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[#d4af37] mb-1">
            Rudraatma Music Distribution
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-white font-display">
            Super Admin Command
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Direct executive authentication · Role: SUPER_ADMIN
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-7 rounded-2xl bg-[#0b0c10] border border-[#d4af37]/25 shadow-[0_24px_64px_rgba(0,0,0,0.75)] space-y-5"
        >
          {error && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-700/50 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Super Admin Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#d4af37]/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="rudraatmamusic@gmail.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#050507] border border-slate-800 focus:border-[#d4af37] focus:outline-none text-sm text-white placeholder:text-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#d4af37]/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter executive password"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#050507] border border-slate-800 focus:border-[#d4af37] focus:outline-none text-sm text-white placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#d4af37]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {requiresTwoFactor && (
            <div>
              <label className="block text-xs font-medium text-[#d4af37] mb-1.5">
                Two-Factor Security PIN
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#d4af37] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={twoFactorPin}
                  onChange={e => setTwoFactorPin(e.target.value)}
                  placeholder="Enter 2FA security PIN"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#050507] border border-[#d4af37]/50 focus:border-[#d4af37] focus:outline-none text-sm text-white font-mono"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#f0cf65] to-[#b8891b] text-[#050507] font-bold text-sm flex items-center justify-center gap-2 hover:brightness-105 transition disabled:opacity-50"
          >
            <span>{loading ? 'Authenticating...' : 'Enter Super Admin Console'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="hover:text-[#d4af37] transition"
            >
              Artist / Label Login
            </button>
            <span className="font-mono text-slate-600">Audit-Logged Session</span>
          </div>
        </form>
      </div>

      <p className="text-center text-[11px] text-slate-600 mt-8">
        Protected executive portal · Unauthorized access attempts are logged.
      </p>
    </div>
  );
};
