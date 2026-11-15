import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { useRouter } from '../../context/RouterContext';
import { useAuth } from '../../context/AuthContext';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import {
  Release,
  MonthlyRoyalty,
  DspRoyaltyShare,
  UploadEligibilityReport
} from '../../types';
import { apiUrl } from '../../utils/api';
import {
  Disc3,
  Wallet,
  Receipt,
  CreditCard,
  Plus,
  ArrowRight,
  BarChart2,
  AlertCircle,
  UserCheck,
  Gift,
  HardDrive,
  FileSpreadsheet,
  ShieldAlert
} from 'lucide-react';

export const DashboardOverviewPage: React.FC = () => {
  const { navigate } = useRouter();
  const { user, token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState<string>(user?.fullName || 'Artist');
  const [releases, setReleases] = useState<Release[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [lastPayout, setLastPayout] = useState<number>(0);
  const [pendingRoyalties, setPendingRoyalties] = useState<number>(0);
  const [projectedRoyalties, setProjectedRoyalties] = useState<number>(0);
  const [totalNetRoyalties, setTotalNetRoyalties] = useState<number>(0);
  const [subscription, setSubscription] = useState<any>(null);
  const [currentPlanLabel, setCurrentPlanLabel] = useState<string>('No Active Plan');
  const [monthlyRoyalties, setMonthlyRoyalties] = useState<MonthlyRoyalty[]>([]);
  const [dspBreakdown, setDspBreakdown] = useState<DspRoyaltyShare[]>([]);
  const [eligibility, setEligibility] = useState<UploadEligibilityReport | null>(null);
  const [promoSummary, setPromoSummary] = useState<{
    totalSlots: number;
    slotsUsed: number;
    slotsRemaining: number;
    userAllocation: any;
  } | null>(null);

  const [timeRange, setTimeRange] = useState<'6m' | 'all'>('6m');
  const [trendFilter, setTrendFilter] = useState<'Platform' | 'Monthly Trend'>('Platform');

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      setLoading(true);
      setDataUnavailable(false);
      setDataError(null);
      try {
        const res = await fetch(apiUrl('/api/dashboard/data'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 503 || data.dataUnavailable) {
          setDataUnavailable(true);
          setDataError(data.error || 'Data Unavailable: Financial and catalog service temporarily unreachable.');
          return;
        }
        if (res.ok) {
          setDisplayName(
            data.user?.artistProfile?.displayName ||
              data.user?.fullName ||
              user?.fullName ||
              'Artist'
          );
          setReleases(data.releases || []);
          setBalance(Number(data.balance ?? 0));
          setLastPayout(Number(data.lastPayout ?? 0));
          setPendingRoyalties(Number(data.pendingRoyalties ?? 0));
          setProjectedRoyalties(Number(data.projectedRoyalties ?? 0));
          setTotalNetRoyalties(Number(data.totalNetRoyalties ?? 0));
          setMonthlyRoyalties(data.monthlyRoyalties || []);
          setDspBreakdown(data.dspBreakdown || []);
          setSubscription(data.subscription || null);
          setEligibility(data.eligibility || null);
          setPromoSummary(data.promotionalProgram || null);

          if (data.subscription?.planName) {
            setCurrentPlanLabel(data.subscription.planName);
          } else {
            setCurrentPlanLabel('No Active Plan');
          }
        }
      } catch (err: any) {
        setDataUnavailable(true);
        setDataError(err?.message || 'Data Unavailable');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token]);

  const approvedCatalogCount = releases.filter(
    r => r.status === 'Approved' || r.status === 'Live'
  ).length;

  const profileStatus = eligibility?.profileStatus || user?.artistProfileStatus || 'Incomplete';
  const profileCompletion = eligibility?.profileCompletion ?? 0;

  const subStatusLabel = !subscription
    ? 'No Active Subscription'
    : subscription.status === 'active'
      ? subscription.isPromotional
        ? `COMPED / PROMOTIONAL · ${subscription.daysRemaining ?? 30}d left`
        : `Active · ${subscription.daysRemaining ?? 30}d left`
      : subscription.status === 'expired'
        ? 'Expired'
        : subscription.status === 'revoked'
          ? 'Revoked'
          : 'Pending Payment';

  return (
    <DashboardLayout title="Overview">
      <div className="space-y-6">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white font-display tracking-tight">
              Welcome back, {displayName}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Artist onboarding status, verified financial balances, and catalog distribution controls.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => navigate('/dashboard/profile')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <UserCheck className="w-4 h-4 text-blue-400" />
              <span>Artist Profile ({profileCompletion}%)</span>
            </button>

            <button
              onClick={() => navigate('/dashboard/releases/new')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{eligibility?.eligible ? 'Submit New Release' : 'Release Access'}</span>
            </button>
          </div>
        </div>

        {/* Data Unavailable Error State (Zero Fabrication) */}
        {dataUnavailable && (
          <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <div className="font-semibold text-white">Data Unavailable</div>
                <div className="text-rose-200/90 mt-0.5">{dataError || 'Unable to reach PostgreSQL database.'}</div>
              </div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-lg bg-rose-900/70 hover:bg-rose-800 text-white text-xs font-semibold whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {/* Onboarding & Release Gate Banner */}
        {!loading && !dataUnavailable && eligibility && !eligibility.eligible && (
          <div className="p-5 rounded-2xl bg-[#090e1a] border border-amber-800/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-white">
                  Onboarding Status: {profileStatus} · Profile Completion: <span className="font-mono tabular-nums text-amber-300">{profileCompletion}%</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                  {eligibility.blockingMessage}
                </p>
                {promoSummary && promoSummary.slotsRemaining > 0 && profileStatus !== 'Approved' && (
                  <p className="text-xs text-emerald-400 font-medium">
                    First-10 Artists Offer: {promoSummary.slotsRemaining} of 10 complimentary 1-month slots still available upon Super Admin profile approval.
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {profileStatus !== 'Approved' ? (
                <button
                  onClick={() => navigate('/dashboard/profile')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black rounded-xl text-xs font-bold whitespace-nowrap"
                >
                  {profileStatus === 'Rejected' || profileStatus === 'Changes Requested'
                    ? 'Update & Resubmit Profile'
                    : profileStatus === 'Submitted' || profileStatus === 'Under Review'
                      ? 'View Profile Status'
                      : 'Complete Artist Profile'}
                </button>
              ) : (
                <button
                  onClick={() => navigate('/dashboard/subscription')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold whitespace-nowrap"
                >
                  Activate Distribution Plan
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active Promotional Access Banner */}
        {!loading && subscription?.isPromotional && subscription?.status === 'active' && (
          <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Gift className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-xs">
                <div className="font-semibold text-white">
                  First-10 Complimentary Plan Active · Slot #{subscription.promoSlotNumber || promoSummary?.userAllocation?.slotNumber || '1'} of 10
                </div>
                <div className="text-emerald-300/90 mt-0.5">
                  COMPED / PROMOTIONAL · Valid for <span className="font-mono tabular-nums">{subscription.daysRemaining ?? 30}</span> days (expires {subscription.expiresAt ? String(subscription.expiresAt).split('T')[0] : 'after 1 month'}). Zero automatic charges.
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/dashboard/subscription')}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-emerald-800/60 text-emerald-300 rounded-xl text-xs font-semibold whitespace-nowrap"
            >
              Manage Plan
            </button>
          </div>
        )}

        {/* 5 Real KPI Cards (Strictly Zero Fake Numbers) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Profile Completion</span>
                <UserCheck className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {profileCompletion}%
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{profileStatus}</div>
            </div>
            <button
              onClick={() => navigate('/dashboard/profile')}
              className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center justify-between"
            >
              <span>Artist Profile</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Approved Catalog</span>
                <Disc3 className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                {approvedCatalogCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{releases.length} total release(s)</div>
            </div>
            <button
              onClick={() => navigate('/dashboard/releases')}
              className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center justify-between"
            >
              <span>View Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Cleared Balance</span>
                <Wallet className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Pending: ₹{pendingRoyalties.toFixed(2)} · Projected: ₹{projectedRoyalties.toFixed(2)}
              </div>
            </div>
            <button
              onClick={() => navigate('/dashboard/financial')}
              className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300 hover:text-white font-semibold flex items-center justify-between"
            >
              <span>Financial Ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Last Completed Payout</span>
                <Receipt className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                ₹{lastPayout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Verified Net Royalties: ₹{totalNetRoyalties.toFixed(2)}
              </div>
            </div>
            <button
              onClick={() => navigate('/dashboard/wallet-transactions')}
              className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300 hover:text-white font-semibold flex items-center justify-between"
            >
              <span>Transactions</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-5 rounded-2xl bg-[#090e1a] border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Current Plan</span>
                <CreditCard className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-sm font-bold text-white font-display truncate">
                {currentPlanLabel}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">{subStatusLabel}</div>
            </div>
            <button
              onClick={() => navigate('/dashboard/subscription')}
              className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center justify-between"
            >
              <span>Manage Plan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Google Workspace Shortcuts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-[#090e1a] border border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Google Drive Master Vault</div>
                <p className="text-xs text-slate-400">Store uncompressed WAV masters and cover artwork in Drive.</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/dashboard/drive')}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Open Drive
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-[#090e1a] border border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Google Sheets Catalog Sync</div>
                <p className="text-xs text-slate-400">Export releases and verified statements directly to Sheets.</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/dashboard/sheets')}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Open Sheets
            </button>
          </div>
        </div>

        {/* Latest Releases Section */}
        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-white font-display">Latest Releases</h2>
              <p className="text-xs text-slate-400">Submission status, barcode assignments, and catalog records</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard/releases')}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300"
              >
                See All
              </button>
              <button
                onClick={() => navigate('/dashboard/releases/new')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Submit Release</span>
              </button>
            </div>
          </div>

          {releases.length === 0 ? (
            <div className="py-10 text-center bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3 px-4">
              <Disc3 className="w-9 h-9 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-200">Catalog Empty</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Your catalog is currently empty. Your first release can be submitted after your Artist Profile is approved.
              </p>
              {profileStatus !== 'Approved' ? (
                <button
                  onClick={() => navigate('/dashboard/profile')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
                >
                  Go to Artist Profile
                </button>
              ) : (
                <button
                  onClick={() => navigate('/dashboard/releases/new')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
                >
                  Submit First Release
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <th className="pb-3 font-medium">Release Title</th>
                    <th className="pb-3 font-medium">Primary Artist</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">UPC Barcode</th>
                    <th className="pb-3 font-medium">Submitted</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {releases.slice(0, 5).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 font-medium text-white flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-slate-800 flex items-center justify-center text-slate-500 overflow-hidden shrink-0">
                          {r.artworkUrl ? (
                            <img src={r.artworkUrl} alt={r.title} className="w-full h-full object-cover" />
                          ) : (
                            <Disc3 className="w-4 h-4 text-blue-400" />
                          )}
                        </div>
                        <span className="truncate max-w-[200px]">{r.title}</span>
                      </td>
                      <td className="py-3">{r.artist}</td>
                      <td className="py-3 font-mono text-[11px]">{r.type}</td>
                      <td className="py-3 font-mono text-[11px] tabular-nums">{r.upc}</td>
                      <td className="py-3 font-mono text-[11px] text-slate-400 tabular-nums">
                        {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : 'Draft'}
                      </td>
                      <td className="py-3">
                        <span
                          className={`text-[11px] font-semibold ${
                            r.status === 'Approved' || r.status === 'Live'
                              ? 'text-emerald-400'
                              : r.status === 'Submitted' || r.status === 'Under Review'
                                ? 'text-amber-400'
                                : 'text-rose-400'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => navigate(`/dashboard/releases/${r.id}`)}
                          className="text-blue-400 hover:text-blue-300 font-semibold"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Verified Royalties Section */}
        <div className="p-6 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white font-display">Verified Royalties & DSP Statements</h2>
              <p className="text-xs text-slate-400">
                Cleared, pending clearance, and projected royalty figures derived strictly from verified statements
              </p>
            </div>

            {monthlyRoyalties.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
                  {(['Platform', 'Monthly Trend'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setTrendFilter(f)}
                      className={`px-2.5 py-1 rounded font-medium ${
                        trendFilter === f ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
                  {(['6m', 'all'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`px-2.5 py-1 rounded font-medium ${
                        timeRange === range ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {range === '6m' ? '6M' : 'All'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {monthlyRoyalties.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <span className="text-slate-400">Verified Net Royalties: </span>
                    <span className="font-mono font-bold text-emerald-400 tabular-nums">
                      ₹{totalNetRoyalties.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Pending Clearance: </span>
                    <span className="font-mono font-semibold text-amber-400 tabular-nums">
                      ₹{pendingRoyalties.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/dashboard/financial')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
                >
                  <span>Full Financial Ledger</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {trendFilter === 'Platform' ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dspBreakdown} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 11 }}
                        formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Royalties']}
                      />
                      <Bar dataKey="royalties" name="Royalties (₹)" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={timeRange === '6m' ? monthlyRoyalties.slice(-6) : monthlyRoyalties}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="ovRoyaltyGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="monthLabel" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, fontSize: 11 }}
                        formatter={(val: any) => [`₹${Number(val).toLocaleString('en-IN')}`, 'Net Royalty']}
                      />
                      <Area
                        type="monotone"
                        dataKey="netRoyalty"
                        name="Net Artist Share (₹)"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#ovRoyaltyGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 sm:p-10 text-center rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
              <BarChart2 className="w-9 h-9 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-200">
                No verified royalty statements are available yet.
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                DSP streaming statements are credited only after verified settlement feeds are imported and approved.
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};
