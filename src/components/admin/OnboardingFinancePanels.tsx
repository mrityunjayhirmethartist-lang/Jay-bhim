import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  IndianRupee,
  Server,
  Download,
  RefreshCw,
  Search,
  Eye,
  Plus,
  ExternalLink
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import type { OwnerApprovalProposalInput } from './adminTypes';

interface PanelCommonProps {
  token: string | null;
  includeTest: boolean;
  showToast: (type: 'ok' | 'err', text: string) => void;
  onProposeOwnerApproval: (proposal: OwnerApprovalProposalInput) => void;
}

// ==================== 1. ARTIST ONBOARDING & PROFILE REVIEW PANEL ====================
export const ArtistOnboardingPanel: React.FC<
  PanelCommonProps & { activeSubmenu: string }
> = ({ token, includeTest, activeSubmenu, showToast, onProposeOwnerApproval }) => {
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (activeSubmenu === 'incomplete-profiles') return 'incomplete';
    if (activeSubmenu === 'pending-profile-reviews') return 'pending';
    if (activeSubmenu === 'approved-artists') return 'approved';
    if (activeSubmenu === 'rejected-profiles') return 'rejected';
    return 'all';
  });
  const [search, setSearch] = useState('');
  const [inspectedProfile, setInspectedProfile] = useState<any | null>(null);
  const [dataUnavailable, setDataUnavailable] = useState(false);

  useEffect(() => {
    if (activeSubmenu === 'incomplete-profiles') setStatusFilter('incomplete');
    else if (activeSubmenu === 'pending-profile-reviews') setStatusFilter('pending');
    else if (activeSubmenu === 'approved-artists') setStatusFilter('approved');
    else if (activeSubmenu === 'rejected-profiles') setStatusFilter('rejected');
    else setStatusFilter('all');
  }, [activeSubmenu]);

  const loadProfiles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setDataUnavailable(false);
    try {
      const params = new URLSearchParams();
      params.set('includeTest', String(includeTest));
      params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(apiUrl(`/api/super-admin/artist-profiles?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || data.dataUnavailable) {
        setDataUnavailable(true);
        return;
      }
      setItems(data.items || []);
      setCounts(data.counts || null);
    } catch (err: any) {
      showToast('err', err.message || 'Failed to load artist onboarding queue.');
      setDataUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [token, includeTest, statusFilter, search, showToast]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleMarkUnderReview = async (userId: string) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/super-admin/artist-profiles/${userId}/review`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision: 'under_review' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status.');
      showToast('ok', 'Artist profile marked Under Review.');
      loadProfiles();
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Onboarding Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Artists', val: counts?.totalArtists },
          { label: 'New (7d)', val: counts?.newRegistrations },
          { label: 'Incomplete', val: counts?.incomplete },
          { label: 'Pending Review', val: counts?.pendingReview, gold: true },
          { label: 'Approved', val: counts?.approved },
          { label: 'Rejected / Changes', val: counts?.rejectedOrChanges }
        ].map(c => (
          <div key={c.label} className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08]">
            <p className="text-xs text-slate-400">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums mt-1.5 ${c.gold ? 'text-[#f0cf65]' : 'text-white'}`}>
              {dataUnavailable ? '—' : Number(c.val ?? 0)}
            </p>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { id: 'all', label: 'All Artists' },
            { id: 'new', label: 'New' },
            { id: 'incomplete', label: 'Incomplete' },
            { id: 'pending', label: 'Pending Review' },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Rejected / Changes' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`h-8 px-3 rounded-lg border whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-[#d4af37]/15 border-[#d4af37]/50 text-[#f0cf65] font-semibold'
                  : 'bg-[#090a0e] border-white/[0.08] text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-sm">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search display name, legal name, email..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#090a0e] border border-white/[0.08] focus:border-[#d4af37]/60 focus:outline-none text-xs text-white"
            />
          </div>
          <button
            type="button"
            onClick={loadProfiles}
            className="h-9 w-9 flex items-center justify-center rounded-xl bg-[#090a0e] border border-white/[0.08] text-slate-300 hover:text-white transition-colors"
            title="Refresh Queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Onboarding Queue */}
      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-hidden">
        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-white/[0.06]">
          {items.map(item => (
            <div key={item.userId} className="p-4 space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">
                    {item.artistProfile?.displayName || item.fullName}
                  </p>
                  <p className="text-slate-400 truncate">{item.email}</p>
                </div>
                <span className="font-semibold text-[#f0cf65] tabular-nums shrink-0">
                  {item.completionPercent}%
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
                <span>Status: {item.profileStatus}</span>
                <span>Email: {item.emailVerified ? 'Verified' : 'Unverified'}</span>
                <span>
                  {item.promoAllocation
                    ? `Promo Slot #${item.promoAllocation.slotNumber}/10`
                    : item.planName || 'No Plan'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectedProfile(item)}
                className="w-full h-9 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] font-medium inline-flex items-center justify-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> Review Profile
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="py-10 text-center text-xs text-slate-500">
              {dataUnavailable ? 'Data Unavailable.' : '0 artist profiles match your filter.'}
            </p>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
                <th className="py-3.5 px-4 font-medium">Artist / Label</th>
                <th className="py-3.5 px-4 font-medium">Completion</th>
                <th className="py-3.5 px-4 font-medium">Profile Status</th>
                <th className="py-3.5 px-4 font-medium">Email</th>
                <th className="py-3.5 px-4 font-medium">Plan / Promo</th>
                <th className="py-3.5 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {items.map(item => (
                <tr key={item.userId} className="hover:bg-white/[0.02]">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-white">
                      {item.artistProfile?.displayName || item.fullName}
                    </div>
                    <div className="text-xs text-slate-400">
                      {item.email} · {item.artistProfile?.artistType || 'Individual Artist'}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-medium tabular-nums text-[#f0cf65]">
                    {item.completionPercent}%
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`font-medium ${
                        item.profileStatus === 'Approved'
                          ? 'text-emerald-300'
                          : item.profileStatus === 'Rejected'
                            ? 'text-rose-300'
                            : item.profileStatus === 'Submitted' || item.profileStatus === 'Under Review'
                              ? 'text-amber-300'
                              : 'text-slate-400'
                      }`}
                    >
                      {item.profileStatus}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    {item.emailVerified ? (
                      <span className="text-emerald-300 font-medium">Verified</span>
                    ) : (
                      <span className="text-rose-300 font-medium">Unverified</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">
                    {item.promoAllocation
                      ? `Promo Slot #${item.promoAllocation.slotNumber}/10 (${item.promoAllocation.status})`
                      : item.planName || 'None'}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setInspectedProfile(item)}
                      className="h-8 px-3 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/40 text-[#f0cf65] hover:bg-[#d4af37]/25 font-medium inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> Review Profile
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    {dataUnavailable ? 'Data Unavailable.' : '0 artist profiles match your filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profile Inspection Modal */}
      {inspectedProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-[#111319] border border-white/[0.1] p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-3.5">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Artist Profile Review · {inspectedProfile.artistProfile?.displayName || inspectedProfile.fullName}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                  {inspectedProfile.email} · {inspectedProfile.completionPercent}% Complete · {inspectedProfile.profileStatus}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedProfile(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {inspectedProfile.artistProfile?.profileImageUrl && (
              <div className="flex items-center gap-4 p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06]">
                <img
                  src={apiUrl(inspectedProfile.artistProfile.profileImageUrl)}
                  alt="Artist Profile"
                  className="w-16 h-16 rounded-xl object-cover border border-white/[0.1]"
                />
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-white">
                    Legal Name: {inspectedProfile.artistProfile.legalName || '—'}
                  </div>
                  <div className="text-slate-400">
                    {inspectedProfile.artistProfile.city}, {inspectedProfile.artistProfile.stateRegion},{' '}
                    {inspectedProfile.artistProfile.country}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                ['Legal Name', inspectedProfile.artistProfile?.legalName],
                ['Display Name', inspectedProfile.artistProfile?.displayName],
                ['Artist Type', inspectedProfile.artistProfile?.artistType],
                ['Primary Genre', inspectedProfile.artistProfile?.musicGenre],
                ['Country', inspectedProfile.artistProfile?.country],
                ['State / Region', inspectedProfile.artistProfile?.stateRegion],
                ['City', inspectedProfile.artistProfile?.city],
                ['Contact Email', inspectedProfile.artistProfile?.contactEmail],
                ['Phone Number', inspectedProfile.artistProfile?.phoneNumber],
                ['Email OTP Verified', inspectedProfile.emailVerified ? 'Yes' : 'No']
              ].map(([label, val]) => (
                <div key={String(label)} className="p-3 rounded-xl bg-[#090a0e] border border-white/[0.06]">
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="font-medium text-white mt-0.5 break-all">{val || '—'}</div>
                </div>
              ))}
            </div>

            <div className="p-3.5 rounded-xl bg-[#090a0e] border border-white/[0.06] text-xs space-y-1">
              <div className="text-xs text-slate-400">Artist Biography</div>
              <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                {inspectedProfile.artistProfile?.biography || '—'}
              </p>
            </div>

            {(inspectedProfile.artistProfile?.spotifyUrl ||
              inspectedProfile.artistProfile?.youtubeUrl ||
              inspectedProfile.artistProfile?.otherDspUrls) && (
              <div className="flex flex-wrap gap-3 text-xs">
                {inspectedProfile.artistProfile.spotifyUrl && (
                  <a
                    href={inspectedProfile.artistProfile.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-300 hover:underline"
                  >
                    Spotify Link <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {inspectedProfile.artistProfile.youtubeUrl && (
                  <a
                    href={inspectedProfile.artistProfile.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-rose-300 hover:underline"
                  >
                    YouTube Link <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {inspectedProfile.missingFields?.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-950/35 border border-amber-500/35 text-xs text-amber-200">
                Incomplete fields: {inspectedProfile.missingFields.join(', ')}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-white/[0.08]">
              {inspectedProfile.profileStatus === 'Submitted' && (
                <button
                  type="button"
                  onClick={() => {
                    handleMarkUnderReview(inspectedProfile.userId);
                    setInspectedProfile(null);
                  }}
                  className="h-9 px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-slate-200 text-xs font-semibold whitespace-nowrap"
                >
                  Mark Under Review
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const target = inspectedProfile;
                  setInspectedProfile(null);
                  onProposeOwnerApproval({
                    actionType: 'PROFILE_REQUEST_CHANGES',
                    targetType: 'artist_profile',
                    targetId: target.userId,
                    title: `Request Profile Changes · ${target.email}`,
                    explanation: `Requests profile corrections from ${target.email} and notifies them via email & alert.`,
                    consequences: 'Release upload stays locked until artist edits and resubmits.',
                    proposedChanges: { userId: target.userId, status: 'Changes Requested' },
                    payload: {},
                    requiresReason: true
                  });
                }}
                className="h-9 px-3.5 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-300 text-xs font-semibold whitespace-nowrap"
              >
                Request Changes
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = inspectedProfile;
                  setInspectedProfile(null);
                  onProposeOwnerApproval({
                    actionType: 'PROFILE_REJECT',
                    targetType: 'artist_profile',
                    targetId: target.userId,
                    title: `Reject Artist Profile · ${target.email}`,
                    explanation: `Rejects Artist Profile for ${target.email} with a mandatory audit reason.`,
                    consequences: 'Artist cannot claim a promo slot or upload releases until resubmitted & approved.',
                    proposedChanges: { userId: target.userId, status: 'Rejected' },
                    payload: {},
                    requiresReason: true
                  });
                }}
                className="h-9 px-3.5 rounded-xl bg-red-950/70 border border-red-500/40 text-red-300 text-xs font-semibold whitespace-nowrap"
              >
                Reject Profile
              </button>

              <button
                type="button"
                disabled={inspectedProfile.completionPercent < 100}
                onClick={() => {
                  const target = inspectedProfile;
                  setInspectedProfile(null);
                  onProposeOwnerApproval({
                    actionType: 'PROFILE_APPROVE',
                    targetType: 'artist_profile',
                    targetId: target.userId,
                    title: `Approve Artist Profile · ${target.email}`,
                    explanation: `Approves ${target.email} as a verified Rudraatma Music artist and checks eligibility for First-10 Free Plan.`,
                    consequences:
                      'Unlocks Artist Profile approval; if slots remain (<10) and artist is verified & unpaid, grants 1 month free access.',
                    proposedChanges: { userId: target.userId, status: 'Approved' },
                    payload: {}
                  });
                }}
                className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold whitespace-nowrap"
              >
                Approve Artist Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 2. FIRST 10 FREE ARTISTS PROMOTIONAL PROGRAM PANEL ====================
export const PromotionalProgramPanel: React.FC<PanelCommonProps> = ({
  token,
  showToast,
  onProposeOwnerApproval
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadPromo = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/super-admin/promotions'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      if (res.ok) setData(d);
    } catch (err: any) {
      showToast('err', err.message || 'Failed to load promotional slots.');
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    loadPromo();
  }, [loadPromo]);

  const approved: any[] = data?.approvedPromotions || [];
  const eligible: any[] = data?.eligibleApplications || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-[#d4af37]" />
            First 10 Approved Artists — 1 Month Free Plan
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Capped at 10 verified slots · Verified email artists only · Zero auto-charge
          </p>
        </div>
        <button
          type="button"
          onClick={loadPromo}
          className="h-9 px-3.5 rounded-xl bg-[#111319] border border-white/[0.08] hover:border-[#d4af37]/40 text-xs font-medium text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Slots
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Slot Cap', val: data?.totalSlots ?? 10 },
          { label: 'Slots Used', val: data?.slotsUsed ?? 0, gold: true },
          { label: 'Slots Remaining', val: data?.slotsRemaining ?? 10 },
          { label: 'Active Free Plans', val: data?.activeCount ?? 0 },
          { label: 'Expired Plans', val: data?.expiredCount ?? 0 },
          { label: 'Revoked Slots', val: data?.revokedCount ?? 0 }
        ].map(k => (
          <div key={k.label} className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08]">
            <p className="text-xs text-slate-400">{k.label}</p>
            <p className={`text-xl font-bold tabular-nums mt-1.5 ${k.gold ? 'text-[#f0cf65]' : 'text-white'}`}>
              {k.val}
            </p>
          </div>
        ))}
      </div>

      {eligible.length > 0 && (
        <div className="rounded-2xl bg-[#111319] border border-white/[0.08] p-4 space-y-2.5">
          <h4 className="text-xs font-semibold text-[#f0cf65]">
            Eligible Pending Applications ({eligible.length})
          </h4>
          <div className="space-y-1.5 text-xs">
            {eligible.map(app => (
              <div
                key={app.userId}
                className="p-3 rounded-xl bg-[#090a0e] border border-white/[0.06] flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-semibold text-white">{app.displayName}</span>
                  <span className="text-slate-400 ml-2">({app.email})</span>
                </div>
                <span className="text-xs font-medium text-amber-300">{app.profileStatus}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-x-auto">
        <div className="p-4 border-b border-white/[0.07]">
          <h4 className="text-sm font-semibold text-white">Allocated Promotional Slots ({approved.length}/10)</h4>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
              <th className="py-3 px-4 font-medium">Slot</th>
              <th className="py-3 px-4 font-medium">Artist</th>
              <th className="py-3 px-4 font-medium">Activated</th>
              <th className="py-3 px-4 font-medium">Expires</th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {approved.map(p => (
              <tr key={p.id} className="hover:bg-white/[0.02]">
                <td className="py-3 px-4 font-bold text-[#f0cf65] tabular-nums">#{p.slotNumber}</td>
                <td className="py-3 px-4">
                  <div className="font-semibold text-white">{p.artistDisplayName}</div>
                  <div className="text-xs text-slate-400">{p.userEmail}</div>
                </td>
                <td className="py-3 px-4 text-slate-300 tabular-nums whitespace-nowrap">
                  {String(p.activatedAt || '').slice(0, 10)}
                </td>
                <td className="py-3 px-4 text-slate-300 tabular-nums whitespace-nowrap">
                  {String(p.expiresAt || '').slice(0, 10)}
                </td>
                <td className="py-3 px-4 font-medium">
                  <span
                    className={
                      p.status === 'ACTIVE'
                        ? 'text-emerald-300'
                        : p.status === 'EXPIRED'
                          ? 'text-amber-300'
                          : 'text-rose-300'
                    }
                  >
                    {p.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  {p.status === 'ACTIVE' && (
                    <button
                      type="button"
                      onClick={() =>
                        onProposeOwnerApproval({
                          actionType: 'PROMO_REVOKE',
                          targetType: 'promotional_allocation',
                          targetId: p.userId,
                          title: `Revoke Promo Slot #${p.slotNumber} · ${p.userEmail}`,
                          explanation: `Revokes active First-10 complimentary plan from ${p.userEmail}.`,
                          consequences: 'Artist loses complimentary plan entitlement immediately and must purchase a paid plan for new releases.',
                          proposedChanges: { userId: p.userId, slotNumber: p.slotNumber, newStatus: 'REVOKED' },
                          payload: {},
                          requiresReason: true
                        })
                      }
                      className="h-8 px-3 rounded-lg bg-red-950/70 border border-red-500/40 text-red-300 font-medium whitespace-nowrap"
                    >
                      Revoke Access
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {approved.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500">
                  0 of 10 promotional slots have been allocated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== 3. FINANCIAL GOVERNANCE & VERIFIED STATEMENTS PANEL ====================
export const FinancialGovernancePanel: React.FC<PanelCommonProps> = ({
  token,
  showToast,
  onProposeOwnerApproval
}) => {
  const [gov, setGov] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    month: new Date().toISOString().slice(0, 7),
    monthLabel: '',
    status: 'Cleared' as 'Cleared' | 'In Clearance' | 'Processing' | 'Projected',
    grossRoyalty: '',
    netRoyalty: '',
    streams: ''
  });

  const loadGovernance = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/super-admin/financial-governance'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      if (res.ok) setGov(d);
    } catch (err: any) {
      showToast('err', err.message || 'Failed to load financial governance.');
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    loadGovernance();
  }, [loadGovernance]);

  const handleImportStatement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !form.userId) return;
    setImporting(true);
    try {
      const res = await fetch(apiUrl('/api/super-admin/financial-governance/statements'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: form.userId,
          month: form.month,
          monthLabel: form.monthLabel || form.month,
          status: form.status,
          grossRoyalty: Number(form.grossRoyalty || form.netRoyalty || 0),
          netRoyalty: Number(form.netRoyalty || 0),
          streams: Number(form.streams || 0)
        })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to record verified statement.');
      showToast('ok', `Verified DSP statement ${d.statementId} recorded into PostgreSQL ledger.`);
      setForm(f => ({ ...f, grossRoyalty: '', netRoyalty: '', streams: '', monthLabel: '' }));
      loadGovernance();
    } catch (err: any) {
      showToast('err', err.message);
    } finally {
      setImporting(false);
    }
  };

  const balances: any[] = gov?.artistBalances || [];
  const pendingPayouts: any[] = gov?.pendingSettlements || [];
  const successfulPayouts: any[] = gov?.successfulPayouts || [];
  const statements: any[] = gov?.verifiedStatements || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-[#d4af37]" />
            Financial Governance & Royalty Statements
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Verified cleared, in-clearance, and projected royalties separated across artist ledgers
          </p>
        </div>
        <button
          type="button"
          onClick={loadGovernance}
          className="h-9 px-3.5 rounded-xl bg-[#111319] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync Ledger
        </button>
      </div>

      {/* Record Verified DSP Royalty Statement */}
      <form onSubmit={handleImportStatement} className="p-5 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-4">
        <h4 className="text-xs font-semibold text-[#f0cf65] flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Record Verified DSP Royalty Statement
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 text-xs">
          <select
            required
            value={form.userId}
            onChange={e => setForm({ ...form, userId: e.target.value })}
            className="sm:col-span-2 h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
          >
            <option value="">Select Artist...</option>
            {balances.map(b => (
              <option key={b.userId} value={b.userId}>
                {b.displayName} ({b.email})
              </option>
            ))}
          </select>
          <input
            type="month"
            required
            value={form.month}
            onChange={e => setForm({ ...form, month: e.target.value })}
            className="h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white tabular-nums"
          />
          <select
            value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value as any })}
            className="h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white"
          >
            <option value="Cleared">Cleared</option>
            <option value="In Clearance">In Clearance</option>
            <option value="Processing">Processing</option>
            <option value="Projected">Projected</option>
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            placeholder="Net INR"
            value={form.netRoyalty}
            onChange={e => setForm({ ...form, netRoyalty: e.target.value })}
            className="h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white tabular-nums"
          />
          <input
            type="number"
            min="0"
            placeholder="Streams"
            value={form.streams}
            onChange={e => setForm({ ...form, streams: e.target.value })}
            className="h-10 px-3 rounded-xl bg-[#090a0e] border border-white/[0.08] text-white tabular-nums"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={importing}
            className="h-10 px-4 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] text-[#090a0e] text-xs font-semibold whitespace-nowrap"
          >
            {importing ? 'Recording...' : 'Record Verified DSP Statement'}
          </button>
        </div>
      </form>

      {/* Pending Settlements */}
      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-x-auto">
        <div className="p-4 border-b border-white/[0.07]">
          <h4 className="text-sm font-semibold text-white">
            Pending Payout Settlements ({pendingPayouts.length})
          </h4>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
              <th className="py-3 px-4 font-medium">Reference</th>
              <th className="py-3 px-4 font-medium">User ID</th>
              <th className="py-3 px-4 font-medium">Method</th>
              <th className="py-3 px-4 font-medium">Amount</th>
              <th className="py-3 px-4 font-medium">Status</th>
              <th className="py-3 px-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {pendingPayouts.map(p => (
              <tr key={p.id}>
                <td className="py-3 px-4 font-medium text-white tabular-nums">{p.reference}</td>
                <td className="py-3 px-4 text-slate-400 tabular-nums">{p.userId}</td>
                <td className="py-3 px-4 text-slate-300">{p.method} ({p.details})</td>
                <td className="py-3 px-4 font-semibold text-[#f0cf65] tabular-nums">₹{Number(p.amountINR).toFixed(2)}</td>
                <td className="py-3 px-4 font-medium text-amber-300">{p.status}</td>
                <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                  {p.status === 'Pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          onProposeOwnerApproval({
                            actionType: 'PAYOUT_COMPLETE',
                            targetType: 'payout',
                            targetId: p.id,
                            title: `Complete Payout ${p.reference} (₹${Number(p.amountINR).toFixed(2)})`,
                            explanation: `Finalizes pending payout ${p.reference} and updates Artist Last Successful Payout.`,
                            consequences: 'Marks ledger payout as Completed.',
                            proposedChanges: { payoutId: p.id, status: 'Completed' },
                            payload: {}
                          })
                        }
                        className="h-8 px-3 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-medium"
                      >
                        Mark Paid
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onProposeOwnerApproval({
                            actionType: 'PAYOUT_REJECT',
                            targetType: 'payout',
                            targetId: p.id,
                            title: `Reject Payout ${p.reference}`,
                            explanation: `Rejects pending payout ${p.reference} and returns cleared funds to artist balance.`,
                            consequences: 'Marks payout request Rejected with audit reason.',
                            proposedChanges: { payoutId: p.id, status: 'Rejected' },
                            payload: {},
                            requiresReason: true
                          })
                        }
                        className="h-8 px-3 rounded-lg bg-red-950/70 border border-red-500/40 text-red-300 font-medium"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {pendingPayouts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  0 pending payout requests.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Verified Artist Balances */}
      <div className="rounded-2xl bg-[#111319] border border-white/[0.08] overflow-x-auto">
        <div className="p-4 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-white">Verified Artist Balances ({balances.length})</h4>
          <span className="text-xs text-slate-400 tabular-nums">
            Statements: {statements.length} · Successful Payouts: {successfulPayouts.length}
          </span>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/[0.07] bg-[#0d0f14] text-slate-400">
              <th className="py-3 px-4 font-medium">Artist</th>
              <th className="py-3 px-4 font-medium">Cleared Balance</th>
              <th className="py-3 px-4 font-medium">In Clearance</th>
              <th className="py-3 px-4 font-medium">Projected</th>
              <th className="py-3 px-4 font-medium">Paid Out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {balances.map(b => (
              <tr key={b.userId}>
                <td className="py-3 px-4">
                  <div className="text-white font-semibold">{b.displayName}</div>
                  <div className="text-xs text-slate-400">{b.email}</div>
                </td>
                <td className="py-3 px-4 font-medium text-emerald-300 tabular-nums">
                  ₹{Number(b.clearedBalance || 0).toFixed(2)}
                </td>
                <td className="py-3 px-4 font-medium text-amber-300 tabular-nums">
                  ₹{Number(b.pendingRoyalties || 0).toFixed(2)}
                </td>
                <td className="py-3 px-4 text-slate-400 tabular-nums">
                  ₹{Number(b.projectedRoyalties || 0).toFixed(2)}
                </td>
                <td className="py-3 px-4 font-medium text-white tabular-nums">
                  ₹{Number(b.completedPayouts || 0).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== 4. INFRASTRUCTURE, SCALABILITY & BACKUPS PANEL ====================
export const InfrastructurePanel: React.FC<{
  token: string | null;
  showToast: (type: 'ok' | 'err', text: string) => void;
}> = ({ token, showToast }) => {
  const [infra, setInfra] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadInfra = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/super-admin/infrastructure'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      if (res.ok) setInfra(d);
    } catch (err: any) {
      showToast('err', err.message || 'Failed to read infrastructure telemetry.');
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    loadInfra();
  }, [loadInfra]);

  const handleDownloadBackup = async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/super-admin/infrastructure/backup'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Backup export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rudraatma_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('ok', 'JSON backup snapshot downloaded.');
    } catch (err: any) {
      showToast('err', err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-[#d4af37]" />
            Infrastructure & Backup Snapshot
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Live database pool counters, email queue metrics, and JSON data backup export
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadInfra}
            className="h-9 px-3.5 rounded-xl bg-[#111319] border border-white/[0.08] text-xs font-medium text-slate-300 hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="h-9 px-3.5 rounded-xl bg-[#d4af37] hover:bg-[#e5c354] text-[#090a0e] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" /> Download Backup JSON
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-1.5">
          <p className="font-semibold text-[#f0cf65]">Database Engine & Pool</p>
          <p className="text-white font-medium">{infra?.database?.mode || 'Checking...'}</p>
          <p className="text-slate-400 tabular-nums">
            Pool Total: {infra?.database?.pool?.totalCount ?? 0} · Idle: {infra?.database?.pool?.idleCount ?? 0} · Waiting:{' '}
            {infra?.database?.pool?.waitingCount ?? 0}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-1.5">
          <p className="font-semibold text-[#f0cf65]">Email Delivery Queue</p>
          <p className="text-white font-medium tabular-nums">
            Sent: {infra?.emailQueue?.sent ?? 0} · Queued: {infra?.emailQueue?.queued ?? 0} · Failed:{' '}
            {infra?.emailQueue?.failed ?? 0}
          </p>
          <p className="text-slate-400 tabular-nums">
            Promo Slots Used: {infra?.promotionalSlots?.used ?? 0} / {infra?.promotionalSlots?.total ?? 10}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.08] space-y-1.5">
          <p className="font-semibold text-[#f0cf65]">Rate & Upload Guards</p>
          <p className="text-slate-200 tabular-nums">
            Auth Limit: {infra?.limits?.authRateLimitPer15Min ?? 15} req / 15m
          </p>
          <p className="text-slate-400 tabular-nums">
            Max Audio: {infra?.limits?.maxAudioSizeMB ?? 150}MB · Artwork: {infra?.limits?.maxArtworkSizeMB ?? 25}MB · Profile:{' '}
            {infra?.limits?.maxProfileImageSizeMB ?? 10}MB
          </p>
        </div>
      </div>
    </div>
  );
};
