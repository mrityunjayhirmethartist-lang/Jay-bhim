import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Globe,
  Crown,
  LayoutTemplate,
  ShieldCheck,
  Activity,
  Server,
  Mail,
  Database,
  RefreshCw,
  Search,
  Lock,
  Sparkles,
  FileWarning
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import type { AdminTab, OwnerApprovalProposalInput } from './adminTypes';
import { OwnerApprovalsQueue } from './CommandCenterViews';
import { InfrastructurePanel, PromotionalProgramPanel } from './OnboardingFinancePanels';

// ==================== 1. WELCOME & SYSTEM OVERVIEW BANNER ====================

export const WelcomeOverviewBanner: React.FC<{
  intelligence: any;
  kpis: Record<string, number> | null;
  dataUnavailable: boolean;
  range: '7d' | '30d' | '90d';
  onChangeRange: (r: '7d' | '30d' | '90d') => void;
  onNavigateTab: (tab: AdminTab, submenuId: string) => void;
}> = ({ intelligence, kpis, dataUnavailable, range, onChangeRange, onNavigateTab }) => {
  const completedItems: string[] = [
    ...(intelligence?.completed || []),
    ...(intelligence?.working || [])
  ].slice(0, 5);

  const statusItems: string[] = [];
  if (intelligence?.dataSource) {
    statusItems.push(
      `Database: ${intelligence.dataSource === 'postgresql-live' ? 'PostgreSQL Connected' : 'In-Memory Dev Store'}`
    );
  }
  if (kpis) {
    statusItems.push(`Pending KYC Queue: ${kpis.pendingKycVerification ?? 0}`);
    statusItems.push(`Pending Releases: ${kpis.pendingReleaseReviews ?? 0}`);
    statusItems.push(`Open Support Tickets: ${kpis.openSupportTickets ?? 0}`);
  }
  if (intelligence?.notWorking?.length) {
    statusItems.push(...intelligence.notWorking.slice(0, 2));
  }

  const nextSteps: any[] = intelligence?.nextSteps || [];

  return (
    <section className="rounded-2xl bg-gradient-to-br from-[#17150e] via-[#111319] to-[#0e1015] border border-[#d4af37]/25 p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#d4af37]">
            Rudraatma Music · Executive Overview
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Welcome, Super Admin
          </h1>
          <p className="text-sm text-slate-300">
            Manage artists, music releases, royalties, and distribution operations from one place.
          </p>
        </div>

        {/* Time-range Filter */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#090a0e] border border-white/[0.08] shrink-0">
          {([
            { id: '7d', label: 'Last 7 days' },
            { id: '30d', label: 'Last 30 days' },
            { id: '90d', label: 'Last 90 days' }
          ] as const).map(opt => (
            <button
              key={opt.id}
              onClick={() => onChangeRange(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                range === opt.id
                  ? 'bg-[#d4af37] text-[#090a0e] font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-xl bg-[#090a0e]/80 border border-white/[0.07] space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Completed & Verified
            </h2>
            <span className="tabular-nums text-xs text-slate-400">
              {completedItems.length} verified
            </span>
          </div>
          {dataUnavailable ? (
            <p className="text-red-300">No Data Available — backend database unavailable.</p>
          ) : completedItems.length === 0 ? (
            <p className="text-slate-500 py-2">No completed records scanned yet.</p>
          ) : (
            <ul className="space-y-1.5 text-slate-300 leading-relaxed">
              {completedItems.map((item, idx) => (
                <li key={idx} className="truncate" title={item}>
                  • {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 rounded-xl bg-[#090a0e]/80 border border-white/[0.07] space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[#f0cf65] flex items-center gap-1.5">
              <Activity className="w-4 h-4" /> Current System Status
            </h2>
            <button
              onClick={() => onNavigateTab('health', 'infra-overview')}
              className="text-xs text-slate-400 hover:text-[#f0cf65] inline-flex items-center gap-1 whitespace-nowrap"
            >
              Diagnostics <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {dataUnavailable ? (
            <p className="text-red-300">No Data Available — system status unavailable.</p>
          ) : statusItems.length === 0 ? (
            <p className="text-slate-500 py-2">No live system metrics available yet.</p>
          ) : (
            <ul className="space-y-1.5 text-slate-300 tabular-nums leading-relaxed">
              {statusItems.map((st, idx) => (
                <li key={idx} className="truncate" title={st}>
                  • {st}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 rounded-xl bg-[#090a0e]/80 border border-white/[0.07] space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Recommended Next Steps
            </h2>
            <span className="tabular-nums text-xs text-slate-400">
              {nextSteps.length} action{nextSteps.length === 1 ? '' : 's'}
            </span>
          </div>
          {dataUnavailable ? (
            <p className="text-red-300">No Data Available — unable to compute recommendations.</p>
          ) : nextSteps.length === 0 ? (
            <p className="text-slate-500 py-2">No pending actions detected across queues.</p>
          ) : (
            <div className="space-y-2">
              {nextSteps.slice(0, 3).map(step => (
                <div key={step.id} className="flex items-center justify-between gap-2">
                  <p className="text-slate-200 truncate" title={step.title}>
                    <span className="text-[#d4af37] font-semibold tabular-nums">#{step.order}</span> {step.title}
                  </p>
                  <button
                    onClick={() => {
                      if (step.category === 'KYC Verification') onNavigateTab('users', 'kyc-pending');
                      else if (step.category === 'Release Operations') onNavigateTab('releases', 'pending-releases');
                      else if (step.category === 'Email & Auth') onNavigateTab('health', 'email-status');
                      else if (step.category === 'AI Copyright Compliance') onNavigateTab('ai-center', 'copyright-risk-analysis');
                      else onNavigateTab('ai-center', 'ai-system-analysis');
                    }}
                    className="h-7 px-2.5 rounded-lg bg-[#161922] border border-white/[0.08] hover:border-[#d4af37]/50 text-xs text-[#f0cf65] whitespace-nowrap shrink-0"
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

// ==================== 2. DISTRIBUTION MANAGEMENT PANEL ====================

export const DistributionManagementPanel: React.FC<{
  token: string | null;
  includeTest: boolean;
  activeSubmenu: string;
  showToast: (type: 'ok' | 'err', text: string) => void;
  onInspectReleaseById: (releaseId: string) => void;
}> = ({ token, includeTest, activeSubmenu, showToast, onInspectReleaseById }) => {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (activeSubmenu === 'held-deliveries') setFilter('held');
    else if (activeSubmenu === 'delivery-queue') setFilter('ready');
    else setFilter('all');
  }, [activeSubmenu]);

  const loadDistribution = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/super-admin/distribution?includeTest=${includeTest}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load distribution state.');
      setData(json);
    } catch (err: any) {
      showToast('err', err.message);
    } finally {
      setLoading(false);
    }
  }, [token, includeTest, showToast]);

  useEffect(() => {
    loadDistribution();
  }, [loadDistribution]);

  const deliveries: any[] = (data?.deliveries || []).filter((d: any) => {
    if (filter === 'ready' && d.releaseStatus !== 'Approved') return false;
    if (filter === 'live' && !['Live', 'Published', 'Delivered'].includes(d.releaseStatus)) return false;
    if (filter === 'held' && !['Rejected', 'Action Required'].includes(d.releaseStatus)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        String(d.title || '').toLowerCase().includes(q) ||
        String(d.artist || '').toLowerCase().includes(q) ||
        String(d.upc || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#d4af37]" /> DSP Integration & Distribution Queue
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Delivery statuses reflect actual catalog state and configured partner feeds.
          </p>
        </div>
        <button
          onClick={loadDistribution}
          disabled={loading}
          className="h-9 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] hover:border-[#d4af37]/40 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Matrix
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {[
          { label: 'Total Catalog Releases', val: data?.summary?.totalReleases ?? 0 },
          { label: 'Ready for Delivery Queue', val: data?.summary?.readyForQueue ?? 0, gold: true },
          { label: 'Catalog Live', val: data?.summary?.catalogLive ?? 0 },
          { label: 'Held / Action Required', val: data?.summary?.heldOrRejected ?? 0 }
        ].map(k => (
          <div key={k.label} className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08]">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-1.5 ${k.gold ? 'text-[#f0cf65]' : 'text-white'}`}>
              {k.val}
            </p>
          </div>
        ))}
      </div>

      {/* DSP Providers Matrix */}
      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">External DSP & Partner Feeds</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-xs">
          {(data?.providers || []).map((p: any) => (
            <div key={p.id} className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white truncate">{p.name}</span>
                <span
                  className={`text-xs font-medium shrink-0 ${
                    p.status === 'Connected' ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {p.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {p.type} · {p.details}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery Queue Table */}
      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              { id: 'all', label: 'All Releases' },
              { id: 'ready', label: 'Ready Queue (Approved)' },
              { id: 'live', label: 'Live' },
              { id: 'held', label: 'Held / Rejected' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`h-8 px-3 rounded-lg border whitespace-nowrap ${
                  filter === tab.id
                    ? 'bg-[#d4af37]/15 border-[#d4af37]/45 text-[#f0cf65] font-semibold'
                    : 'bg-[#090a0e] border-white/[0.08] text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter title, artist, or UPC..."
              className="w-full h-9 pl-8 pr-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-xs text-white focus:border-[#d4af37]/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
                <th className="py-3 px-4 font-medium">Release</th>
                <th className="py-3 px-4 font-medium">UPC / Tracks</th>
                <th className="py-3 px-4 font-medium">Catalog Status</th>
                <th className="py-3 px-4 font-medium">DSP Delivery Status</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {deliveries.map(d => (
                <tr key={d.releaseId} className="hover:bg-white/[0.02]">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-white">{d.title}</div>
                    <div className="text-xs text-slate-400">
                      {d.artist} · {d.ownerEmail}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 tabular-nums text-slate-300">
                    {d.upc} · {d.tracksCount} tracks
                  </td>
                  <td className="py-3.5 px-4 font-medium text-[#f0cf65]">{d.releaseStatus}</td>
                  <td className="py-3.5 px-4 text-slate-300">{d.deliveryState}</td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => onInspectReleaseById(d.releaseId)}
                      className="h-8 px-3 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] hover:bg-[#d4af37]/25 font-medium whitespace-nowrap"
                    >
                      Inspect Release
                    </button>
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    0 catalog releases in this delivery view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ==================== 3. SUBSCRIPTION MANAGEMENT PANEL ====================

export const SubscriptionManagementPanel: React.FC<{
  token: string | null;
  includeTest: boolean;
  activeSubmenu: string;
  subscriptions: any[];
  orders: any[];
  plans: any[];
  onUpdatePlansState: (next: any[]) => void;
  showToast: (type: 'ok' | 'err', text: string) => void;
  onProposeOwnerApproval: (proposal: OwnerApprovalProposalInput) => void;
}> = ({
  token,
  includeTest,
  activeSubmenu,
  subscriptions,
  orders,
  plans,
  onUpdatePlansState,
  showToast,
  onProposeOwnerApproval
}) => {
  const [manageTarget, setManageTarget] = useState<any | null>(null);
  const [manageAction, setManageAction] = useState<'activate' | 'upgrade' | 'downgrade' | 'cancel'>('activate');
  const [managePlanId, setManagePlanId] = useState<string>('');

  useEffect(() => {
    if (plans.length > 0 && !managePlanId) {
      setManagePlanId(plans[0].id);
    }
  }, [plans, managePlanId]);

  if (activeSubmenu === 'promotional-program') {
    return (
      <PromotionalProgramPanel
        token={token}
        includeTest={includeTest}
        showToast={showToast}
        onProposeOwnerApproval={onProposeOwnerApproval}
      />
    );
  }

  const activeSubs = subscriptions.filter(s => s.status === 'active');
  const expiredOrCancelled = subscriptions.filter(s => s.status !== 'active');
  const pendingOrders = orders.filter(o => o.status !== 'paid' && o.status !== 'refunded');

  const visibleSubs =
    activeSubmenu === 'expired-subscriptions'
      ? expiredOrCancelled
      : activeSubmenu === 'active-subscriptions'
        ? activeSubs
        : subscriptions;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {[
          { label: 'Active Subscriptions', val: activeSubs.length, gold: true },
          { label: 'Expired / Cancelled', val: expiredOrCancelled.length },
          { label: 'Pending / Unpaid Orders', val: pendingOrders.length },
          { label: 'Configured Plans', val: plans.length }
        ].map(k => (
          <div key={k.label} className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08]">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-1.5 ${k.gold ? 'text-[#f0cf65]' : 'text-white'}`}>
              {k.val}
            </p>
          </div>
        ))}
      </div>

      {/* Plan Configuration & Pricing Editor */}
      {activeSubmenu === 'plan-pricing' ? (
        <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-3.5">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Crown className="w-4 h-4 text-[#d4af37]" /> Subscription Plan Catalog & Pricing (INR)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Changes persist to PostgreSQL and update checkout & pricing pages upon Owner Approval.
              </p>
            </div>
            <button
              onClick={() =>
                onProposeOwnerApproval({
                  actionType: 'SETTINGS_UPDATE',
                  targetType: 'plans',
                  targetId: 'plan_catalog',
                  title: 'Update Subscription Plan Pricing & Status',
                  explanation: 'Updates plan prices, validity days, and availability flags across storefront & Razorpay checkout.',
                  consequences: 'New orders will be verified against updated server plan prices.',
                  proposedChanges: {
                    planUpdates: plans.map(p => ({
                      id: p.id,
                      priceINR: Number(p.priceINR),
                      enabled: p.enabled !== false,
                      validityDays: p.validityDays
                    }))
                  },
                  payload: {
                    planUpdates: plans.map(p => ({
                      id: p.id,
                      name: p.name,
                      priceINR: Number(p.priceINR),
                      enabled: p.enabled !== false,
                      validityDays: p.validityDays ? Number(p.validityDays) : undefined
                    }))
                  }
                })
              }
              className="h-10 px-4 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] text-[#090a0e] font-semibold text-xs whitespace-nowrap"
            >
              Save Plan Catalog
            </button>
          </div>

          <div className="space-y-2.5">
            {plans.map((p, idx) => (
              <div
                key={p.id}
                className="p-4 rounded-xl bg-[#090a0e] border border-white/[0.06] flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">
                    {p.id} · {p.type}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.enabled !== false}
                      onChange={e => {
                        const next = [...plans];
                        next[idx] = { ...p, enabled: e.target.checked };
                        onUpdatePlansState(next);
                      }}
                      className="accent-[#d4af37]"
                    />
                    <span>Enabled</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">₹</span>
                    <input
                      type="number"
                      min={0}
                      value={p.priceINR}
                      onChange={e => {
                        const next = [...plans];
                        next[idx] = { ...p, priceINR: Number(e.target.value) };
                        onUpdatePlansState(next);
                      }}
                      className="w-24 h-9 px-2.5 rounded-lg bg-[#111319] border border-white/[0.1] text-xs font-semibold text-[#f0cf65] tabular-nums text-right"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeSubmenu === 'pending-payments' ? (
        <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-x-auto">
          <div className="p-4 border-b border-white/[0.07]">
            <h3 className="text-sm font-semibold text-white">Pending & Unpaid Plan Orders ({pendingOrders.length})</h3>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
                <th className="py-3 px-4 font-medium">Order ID</th>
                <th className="py-3 px-4 font-medium">Artist</th>
                <th className="py-3 px-4 font-medium">Plan</th>
                <th className="py-3 px-4 font-medium">Amount</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {pendingOrders.map(o => (
                <tr key={o.orderId}>
                  <td className="py-3 px-4 font-medium text-white tabular-nums">{o.orderId}</td>
                  <td className="py-3 px-4 text-slate-300">{o.userEmail}</td>
                  <td className="py-3 px-4 text-slate-200">{o.planName}</td>
                  <td className="py-3 px-4 font-medium tabular-nums text-[#f0cf65]">₹{o.amount}</td>
                  <td className="py-3 px-4 capitalize font-medium text-amber-300">{o.status}</td>
                  <td className="py-3 px-4 text-slate-400 tabular-nums whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {pendingOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    0 pending or unpaid orders recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-x-auto">
          <div className="p-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">
              Subscriptions ({visibleSubs.length})
            </h3>
            <span className="text-xs text-slate-400">
              Verified against active payment & approval records
            </span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
                <th className="py-3 px-4 font-medium">User</th>
                <th className="py-3 px-4 font-medium">Plan</th>
                <th className="py-3 px-4 font-medium">Amount / Billing</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Expires / Renews</th>
                <th className="py-3 px-4 font-medium text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {visibleSubs.map((s, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{s.userName}</div>
                    <div className="text-xs text-slate-400">{s.userEmail}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-200">{s.planName}</td>
                  <td className="py-3 px-4 tabular-nums text-slate-300">
                    ₹{s.amount} · {s.billingFrequency}
                  </td>
                  <td className="py-3 px-4 capitalize font-medium">
                    <span
                      className={
                        s.status === 'active'
                          ? 'text-emerald-300'
                          : s.status === 'cancelled'
                            ? 'text-red-300'
                            : 'text-amber-300'
                      }
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400 tabular-nums whitespace-nowrap">
                    {(s.expiresAt || s.renewsAt || '—').slice(0, 10)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => {
                        setManageTarget(s);
                        setManageAction(s.status === 'active' ? 'upgrade' : 'activate');
                        setManagePlanId(s.planId || plans[0]?.id || 'single_release');
                      }}
                      className="h-8 px-3 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] hover:bg-[#d4af37]/25 font-medium whitespace-nowrap"
                    >
                      Manage Plan
                    </button>
                  </td>
                </tr>
              ))}
              {visibleSubs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    0 subscription records found for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Manage Subscription Modal */}
      {manageTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#111319] border border-white/[0.1] p-6 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
              <div>
                <h3 className="text-sm font-bold text-white">Manage Subscription</h3>
                <p className="text-xs text-slate-400">{manageTarget.userEmail}</p>
              </div>
              <button onClick={() => setManageTarget(null)} className="text-slate-400 hover:text-white">
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-400 mb-1">Action</label>
                <select
                  value={manageAction}
                  onChange={e => setManageAction(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
                >
                  <option value="activate">Activate Subscription</option>
                  <option value="upgrade">Upgrade Plan</option>
                  <option value="downgrade">Downgrade Plan</option>
                  <option value="cancel">Cancel Subscription</option>
                </select>
              </div>

              {manageAction !== 'cancel' && (
                <div>
                  <label className="block text-slate-400 mb-1">Target Plan</label>
                  <select
                    value={managePlanId}
                    onChange={e => setManagePlanId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
                  >
                    {plans.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (₹{p.priceINR})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                onClick={() => setManageTarget(null)}
                className="h-9 px-4 rounded-xl bg-white/[0.06] text-slate-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const chosen = manageTarget;
                  const chosenPlan = plans.find(p => p.id === managePlanId);
                  setManageTarget(null);
                  onProposeOwnerApproval({
                    actionType: 'SUBSCRIPTION_MANAGE',
                    targetType: 'subscription',
                    targetId: chosen.userId || chosen.userEmail,
                    title: `${manageAction.toUpperCase()} Subscription · ${chosen.userEmail}`,
                    explanation: `Updates subscription state (${manageAction}${manageAction !== 'cancel' && chosenPlan ? ` -> ${chosenPlan.name}` : ''}) for ${chosen.userName}.`,
                    consequences: 'Updates user dashboard subscription record and logs audit trail entry.',
                    proposedChanges: {
                      userId: chosen.userId,
                      action: manageAction,
                      planId: manageAction === 'cancel' ? chosen.planId : managePlanId
                    },
                    payload: {
                      action: manageAction,
                      planId: managePlanId
                    },
                    requiresReason: manageAction === 'cancel'
                  });
                }}
                className="h-9 px-4 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] text-[#090a0e] font-semibold"
              >
                Propose Owner Approval
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 4. WEBSITE MANAGEMENT PANEL ====================

export const WebsiteManagementPanel: React.FC<{
  settings: any;
  onChangeSettings: (next: any) => void;
  onProposeOwnerApproval: (proposal: OwnerApprovalProposalInput) => void;
}> = ({ settings, onChangeSettings, onProposeOwnerApproval }) => {
  if (!settings) {
    return (
      <div className="p-6 rounded-2xl bg-[#111319] border border-white/[0.08] text-xs text-slate-400">
        Loading website configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-[#d4af37]" /> Public Banners, Maintenance & Announcements
          </h3>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
            <div>
              <p className="font-semibold text-white">Maintenance Mode</p>
              <p className="text-xs text-slate-400">
                Displays maintenance alert globally on public website
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(settings.maintenanceMode)}
              onChange={e => onChangeSettings({ ...settings, maintenanceMode: e.target.checked })}
              className="w-4 h-4 accent-[#d4af37]"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">Maintenance Notice Message</label>
            <input
              type="text"
              value={settings.maintenanceMessage || ''}
              onChange={e => onChangeSettings({ ...settings, maintenanceMessage: e.target.value })}
              className="w-full h-10 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">Global Announcement Banner</label>
            <input
              type="text"
              value={settings.websiteAnnouncement || ''}
              onChange={e => onChangeSettings({ ...settings, websiteAnnouncement: e.target.value })}
              placeholder="Optional announcement bar on public homepage..."
              className="w-full h-10 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">Homepage Banner Headline</label>
            <input
              type="text"
              value={settings.homepageBannerTitle || ''}
              onChange={e => onChangeSettings({ ...settings, homepageBannerTitle: e.target.value })}
              placeholder="Global Music Distribution from India to the World"
              className="w-full h-10 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">Homepage Banner Subtitle</label>
            <input
              type="text"
              value={settings.homepageBannerSubtitle || ''}
              onChange={e => onChangeSettings({ ...settings, homepageBannerSubtitle: e.target.value })}
              placeholder="Distribution · Devotion · Beyond"
              className="w-full h-10 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
            />
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-white">SEO, Analytics & Service Module Visibility</h3>

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">SEO Meta Title</label>
            <input
              type="text"
              value={settings.seoTitle || ''}
              onChange={e => onChangeSettings({ ...settings, seoTitle: e.target.value })}
              className="w-full h-10 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">SEO Meta Description</label>
            <textarea
              rows={2}
              value={settings.seoDescription || ''}
              onChange={e => onChangeSettings({ ...settings, seoDescription: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1.5 font-medium">Google Analytics ID</label>
              <input
                type="text"
                value={settings.analyticsId || ''}
                onChange={e => onChangeSettings({ ...settings, analyticsId: e.target.value })}
                placeholder="G-XXXXXXXXXX"
                className="w-full h-10 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
              />
            </div>
            <label className="flex items-center justify-between h-10 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] self-end cursor-pointer">
              <span className="text-slate-200">Promotional Ads Enabled</span>
              <input
                type="checkbox"
                checked={Boolean(settings.adsEnabled)}
                onChange={e => onChangeSettings({ ...settings, adsEnabled: e.target.checked })}
                className="accent-[#d4af37]"
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-slate-300 font-medium">Public Service Modules</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(settings.services || {}).map(([key, val]) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#090a0e] border border-white/[0.06] text-slate-200 cursor-pointer"
                >
                  <span className="capitalize">{key}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={e =>
                      onChangeSettings({
                        ...settings,
                        services: { ...settings.services, [key]: e.target.checked }
                      })
                    }
                    className="accent-[#d4af37]"
                  />
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={() =>
              onProposeOwnerApproval({
                actionType: 'SETTINGS_UPDATE',
                targetType: 'website',
                targetId: 'public_site',
                title: 'Update Website Configuration, Banners & SEO',
                explanation:
                  'Saves Maintenance Mode, global announcement, homepage banner text, SEO metadata, analytics ID, and service module visibility.',
                consequences: 'Updates public website platform settings immediately upon Owner Approval.',
                proposedChanges: {
                  maintenanceMode: settings.maintenanceMode,
                  websiteAnnouncement: settings.websiteAnnouncement,
                  homepageBannerTitle: settings.homepageBannerTitle,
                  seoTitle: settings.seoTitle,
                  services: settings.services
                },
                payload: { settings }
              })
            }
            className="w-full h-10 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] text-[#090a0e] font-semibold text-xs transition-colors"
          >
            Save Website Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== 5. SECURITY & PERMISSIONS PANEL ====================

export const SecurityPermissionsPanel: React.FC<{
  token: string | null;
  activeSubmenu: string;
  auditLogs: any[];
  auditSearch: string;
  onChangeAuditSearch: (val: string) => void;
  approvals: any[];
  onExecuteApproval: (id: string) => void;
  onDismissApproval: (id: string) => void;
  onRefreshApprovals: () => void;
}> = ({
  token,
  activeSubmenu,
  auditLogs,
  auditSearch,
  onChangeAuditSearch,
  approvals,
  onExecuteApproval,
  onDismissApproval,
  onRefreshApprovals
}) => {
  const [secData, setSecData] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const loadSecurity = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/super-admin/security-overview'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setSecData(await res.json());
    } catch {
      // Ignore transient network failure
    }
  }, [token]);

  useEffect(() => {
    loadSecurity();
  }, [loadSecurity]);

  const filteredLogs = auditLogs.filter(l => {
    if (activeSubmenu === 'login-history') return String(l.action || '').includes('LOGIN');
    if (activeSubmenu === 'failed-logins') return String(l.action || '').includes('FAILED');
    return true;
  });

  const paginatedLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08]">
          <p className="text-xs text-slate-400">Active Admin Sessions</p>
          <p className="text-2xl font-bold tabular-nums text-[#f0cf65] mt-1.5">
            {secData?.activeAdminSessions?.length ?? 1}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08]">
          <p className="text-xs text-slate-400">Total Live Sessions</p>
          <p className="text-2xl font-bold tabular-nums text-white mt-1.5">
            {secData?.totalActiveUserSessions ?? 0}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08]">
          <p className="text-xs text-slate-400">Executive 2FA PIN</p>
          <p className={`text-lg font-bold mt-2 ${secData?.twoFactorEnabled ? 'text-emerald-300' : 'text-amber-300'}`}>
            {secData?.twoFactorEnabled ? 'Enabled' : 'Optional'}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08]">
          <p className="text-xs text-slate-400">Failed Login Lockouts</p>
          <p className="text-2xl font-bold tabular-nums text-red-300 mt-1.5">
            {(secData?.failedLogins || []).filter((f: any) => f.locked).length}
          </p>
        </div>
      </div>

      {activeSubmenu === 'owner-approvals' && (
        <OwnerApprovalsQueue
          approvals={approvals}
          onExecute={onExecuteApproval}
          onDismiss={onDismissApproval}
          onRefresh={onRefreshApprovals}
        />
      )}

      {/* RBAC Matrix */}
      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-x-auto">
        <div className="p-4 border-b border-white/[0.07] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#d4af37]" /> Role-Based Access Control
          </h3>
          <button
            onClick={loadSecurity}
            className="h-8 px-3 rounded-lg bg-[#090a0e] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
              <th className="py-3 px-4 font-medium">Role</th>
              <th className="py-3 px-4 font-medium">Scope</th>
              <th className="py-3 px-4 font-medium">Command Center</th>
              <th className="py-3 px-4 font-medium">KYC Review</th>
              <th className="py-3 px-4 font-medium">Finance & Refunds</th>
              <th className="py-3 px-4 font-medium">Owner Approval Gate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {(secData?.rbacMatrix || []).map((row: any) => (
              <tr key={row.role}>
                <td className="py-3 px-4 text-[#f0cf65] font-semibold">{row.role}</td>
                <td className="py-3 px-4 text-slate-200">{row.scope}</td>
                <td className="py-3 px-4 text-slate-300">{row.dashboardAccess ? 'Allowed' : 'Restricted'}</td>
                <td className="py-3 px-4 text-slate-300">{row.kycReview ? 'Allowed' : 'Restricted'}</td>
                <td className="py-3 px-4 text-slate-300">{row.financeAndRefunds ? 'Allowed' : 'Restricted'}</td>
                <td className="py-3 px-4 text-emerald-300 font-medium">
                  {row.ownerApprovalRequiredForSensitive ? 'Enforced' : 'Standard'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Failed Logins + Active Admin Sessions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-3 text-xs">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#d4af37]" /> Active Executive Sessions
          </h3>
          {(secData?.activeAdminSessions || []).map((s: any, idx: number) => (
            <div key={idx} className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06] space-y-1">
              <div className="flex justify-between text-white">
                <span className="font-medium">{s.email}</span>
                <span className="text-emerald-300 font-medium">{s.twoFactorVerified ? '2FA Verified' : 'Password Verified'}</span>
              </div>
              <div className="text-slate-400 tabular-nums">
                IP: {s.ip} · Last Activity: {new Date(s.lastActivityAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-5 space-y-3 text-xs">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-300" /> Failed Login Tracker
          </h3>
          {(secData?.failedLogins || []).length === 0 ? (
            <p className="text-slate-500">0 active failed-login lockout records.</p>
          ) : (
            (secData?.failedLogins || []).map((f: any, idx: number) => (
              <div key={idx} className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06] flex justify-between gap-2 tabular-nums">
                <span className="text-slate-200 truncate">{f.key}</span>
                <span className={f.locked ? 'text-red-300 font-semibold' : 'text-amber-300'}>
                  {f.count} attempt(s) {f.locked ? '· Locked' : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Audit & Login Logs */}
      <div className="space-y-3">
        <div className="p-3.5 rounded-2xl bg-[#111319] border border-white/[0.08] flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={auditSearch}
            onChange={e => onChangeAuditSearch(e.target.value)}
            placeholder="Search audit logs by actor email, action, or details..."
            className="flex-1 bg-transparent text-xs text-white focus:outline-none"
          />
        </div>

        <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
                <th className="py-3 px-4 font-medium">Timestamp</th>
                <th className="py-3 px-4 font-medium">Actor</th>
                <th className="py-3 px-4 font-medium">Action</th>
                <th className="py-3 px-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {paginatedLogs.map(log => (
                <tr key={log.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-4 text-slate-400 tabular-nums whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {log.actorEmail} <span className="text-xs text-[#d4af37]">({log.actorRole})</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-[#f0cf65] whitespace-nowrap">{log.action}</td>
                  <td className="py-3 px-4 text-slate-300">{log.details}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-slate-500">
                    0 audit log entries match your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredLogs.length > PAGE_SIZE && (
            <div className="p-3.5 border-t border-white/[0.07] flex items-center justify-between text-xs text-slate-400 tabular-nums">
              <span>
                Page {page} of {Math.ceil(filteredLogs.length / PAGE_SIZE)} ({filteredLogs.length} events)
              </span>
              <div className="space-x-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="h-8 px-3 rounded-lg bg-white/[0.06] disabled:opacity-40 text-white font-medium"
                >
                  Prev
                </button>
                <button
                  disabled={page >= Math.ceil(filteredLogs.length / PAGE_SIZE)}
                  onClick={() => setPage(p => p + 1)}
                  className="h-8 px-3 rounded-lg bg-white/[0.06] disabled:opacity-40 text-white font-medium"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== 6. SYSTEM HEALTH & INFRASTRUCTURE PANEL ====================

export const SystemHealthPanel: React.FC<{
  token: string | null;
  activeSubmenu: string;
  showToast: (type: 'ok' | 'err', text: string) => void;
  onTestEmailRelay: () => void;
  onPreviewOtpEmail?: () => void;
  testingEmail: boolean;
  emailTestResult: { ok: boolean; message: string } | null;
}> = ({ token, activeSubmenu, showToast, onTestEmailRelay, onPreviewOtpEmail, testingEmail, emailTestResult }) => {
  const [health, setHealth] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHealth = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/super-admin/system-health'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setHealth(await res.json());
    } catch (err: any) {
      showToast('err', err.message || 'Failed to query system health.');
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  if (activeSubmenu === 'infrastructure-backups') {
    return <InfrastructurePanel token={token} showToast={showToast} />;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-[#d4af37]" /> Real-Time System Health & Diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Live diagnostics from Node.js runtime, PostgreSQL connection pool, Email relay queue, and server logs.
          </p>
        </div>
        <button
          onClick={loadHealth}
          disabled={loading}
          className="h-9 px-3.5 rounded-xl bg-[#090a0e] border border-white/[0.08] hover:border-[#d4af37]/40 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Re-check Health
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-2">
          <p className="font-semibold text-[#f0cf65] flex items-center gap-1.5">
            <Activity className="w-4 h-4" /> Node Runtime
          </p>
          <p className="text-slate-200 font-medium">
            {health?.runtime?.nodeVersion || '—'} · {health?.runtime?.environment || '—'}
          </p>
          <p className="tabular-nums text-slate-400">
            Uptime: {health?.runtime?.uptimeSeconds ?? 0}s · RSS: {health?.runtime?.memoryMB?.rss ?? 0} MB
          </p>
          <p className="tabular-nums text-slate-400">
            Heap: {health?.runtime?.memoryMB?.heapUsed ?? 0} / {health?.runtime?.memoryMB?.heapTotal ?? 0} MB
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-2">
          <p className="font-semibold text-[#f0cf65] flex items-center gap-1.5">
            <Database className="w-4 h-4" /> Database & Storage
          </p>
          <p className={`font-semibold ${health?.database?.healthy ? 'text-emerald-300' : 'text-red-300'}`}>
            {health?.database?.mode || 'Checking...'} · {health?.database?.healthy ? 'Connected' : 'Error'}
          </p>
          <p className="tabular-nums text-slate-400">
            Latency: {health?.database?.latencyMs != null ? `${health.database.latencyMs} ms` : 'In-Memory'} · Pool:{' '}
            {health?.database?.pool ? `${health.database.pool.totalCount} total` : 'N/A'}
          </p>
          <p className="text-slate-400">
            Media Storage: {health?.storage?.provider || 'Local'}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-2">
          <p className="font-semibold text-[#f0cf65] flex items-center gap-1.5">
            <Mail className="w-4 h-4" /> Email Relay & Queue
          </p>
          <p className={`font-semibold ${health?.email?.configured && health?.email?.validHttpsUrl ? 'text-emerald-300' : 'text-amber-300'}`}>
            {health?.email?.configured && health?.email?.validHttpsUrl ? 'Ready' : 'Not Configured'}
          </p>
          <p className="tabular-nums text-slate-400">
            Queued: {health?.email?.queue?.queued ?? 0} · Sent: {health?.email?.queue?.sent ?? 0} · Failed:{' '}
            {health?.email?.queue?.failed ?? 0}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={onTestEmailRelay}
              disabled={testingEmail}
              className="h-8 px-3 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] text-xs font-medium"
            >
              {testingEmail ? 'Checking...' : 'Test Email Relay'}
            </button>
            {onPreviewOtpEmail && (
              <button
                type="button"
                onClick={onPreviewOtpEmail}
                className="h-8 px-3 rounded-lg bg-[#090a0e] border border-white/[0.1] hover:border-[#d4af37]/50 text-slate-200 hover:text-[#f0cf65] text-xs font-medium"
              >
                Preview OTP Email
              </button>
            )}
          </div>
          {emailTestResult && (
            <p className={`text-xs ${emailTestResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {emailTestResult.message}
            </p>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-2">
          <p className="font-semibold text-[#f0cf65]">Integrations Readiness</p>
          <ul className="space-y-1 text-xs text-slate-300">
            <li>Razorpay: {health?.integrations?.razorpayConfigured ? 'Configured' : 'Not Set'}</li>
            <li>Webhook Secret: {health?.integrations?.razorpayWebhookConfigured ? 'Configured' : 'Not Set'}</li>
            <li>Gemini AI: {health?.integrations?.geminiConfigured ? `Ready (${health?.integrations?.geminiModel})` : 'Not Set'}</li>
            <li>
              Audio Tools: FFmpeg {health?.integrations?.ffmpeg?.available ? 'OK' : 'Missing'} · fpcalc{' '}
              {health?.integrations?.chromaprint?.available ? 'OK' : 'Missing'}
            </li>
          </ul>
        </div>
      </div>

      {/* Live Server Error & Security Response Logs */}
      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-hidden">
        <div className="p-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-[#d4af37]" /> Server Diagnostic Logs (
            {health?.serverLogs?.length ?? 0})
          </h3>
          <span className="text-xs text-slate-400">
            Captures HTTP 5xx, 401/403/429 & runtime errors
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.06] text-xs">
          {(health?.serverLogs || []).length === 0 ? (
            <p className="p-6 text-center text-slate-500">
              0 runtime server errors or abnormal HTTP status events logged in current process.
            </p>
          ) : (
            (health?.serverLogs || []).map((log: any) => (
              <div key={log.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={log.level === 'error' ? 'text-red-400 font-semibold capitalize' : 'text-amber-300 font-semibold capitalize'}>
                    {String(log.level || 'warn')}
                  </span>
                  {log.statusCode && <span className="text-[#f0cf65] tabular-nums font-medium">{log.statusCode}</span>}
                  <span className="text-slate-200 truncate">{log.message}</span>
                </div>
                <span className="text-slate-500 shrink-0 tabular-nums">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <InfrastructurePanel token={token} showToast={showToast} />
    </div>
  );
};
