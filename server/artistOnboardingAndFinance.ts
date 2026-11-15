import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import {
  isDatabaseEnabled,
  getDbPool,
  dbSyncAndListPromotions,
  dbClaimFirst10PromotionalSlot,
  dbRevokePromotionSlot,
  dbSaveArtistProfileSubmission,
  dbGetArtistProfileHistory,
  dbSaveLedgerEntry,
  dbGetLedgerEntries,
  dbSaveVerifiedRoyaltyStatement,
  dbGetVerifiedRoyaltyStatements,
  dbSavePayoutRequest,
  dbGetPayoutRequests,
  dbGetEmailQueueStats,
  type PromotionalAllocationRecord
} from './db';
import { saveUploadedMedia } from './storage';
import { sendArtistNotificationEmail } from './appsScriptEmail';

export type ArtistProfileStatus =
  | 'Incomplete'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Changes Requested';

export interface ArtistProfilePayload {
  legalName: string;
  displayName: string;
  artistType: 'Individual Artist' | 'Label' | '';
  country: string;
  stateRegion: string;
  city: string;
  contactEmail: string;
  phoneNumber: string;
  musicGenre: string;
  biography: string;
  profileImageUrl: string;
  profileImageFileId?: string;
  spotifyUrl?: string;
  youtubeUrl?: string;
  otherDspUrls?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  updatedAt?: string;
}

export interface ProfileCompletionResult {
  completionPercent: number;
  completedCount: number;
  totalRequired: number;
  missingFields: string[];
  isComplete: boolean;
}

const REQUIRED_PROFILE_FIELDS: Array<{ key: keyof ArtistProfilePayload; label: string }> = [
  { key: 'legalName', label: 'Full Legal Name' },
  { key: 'displayName', label: 'Artist Display / Stage Name' },
  { key: 'artistType', label: 'Individual Artist or Label Selection' },
  { key: 'country', label: 'Country' },
  { key: 'stateRegion', label: 'State / Region' },
  { key: 'city', label: 'City' },
  { key: 'contactEmail', label: 'Contact Email' },
  { key: 'phoneNumber', label: 'Phone Number' },
  { key: 'musicGenre', label: 'Primary Genre / Music Category' },
  { key: 'biography', label: 'Bio / Artist Description' },
  { key: 'profileImageUrl', label: 'Profile Image / Logo' }
];

export function sanitizeArtistProfileInput(raw: any, fallbackUser?: { fullName?: string; email?: string; country?: string }, existing?: Partial<ArtistProfilePayload>): ArtistProfilePayload {
  const src = raw && typeof raw === 'object' ? raw : {};
  const pick = (k: keyof ArtistProfilePayload, def = '') => {
    if (typeof src[k] === 'string') return src[k].trim();
    if (existing && typeof existing[k] === 'string') return String(existing[k]).trim();
    return def;
  };
  const artistTypeRaw = pick('artistType');
  const artistType: 'Individual Artist' | 'Label' | '' =
    artistTypeRaw === 'Individual Artist' || artistTypeRaw === 'Label' ? artistTypeRaw : '';

  const profileImageFileId = pick('profileImageFileId');
  let profileImageUrl = pick('profileImageUrl');
  if (!profileImageUrl && profileImageFileId) {
    profileImageUrl = `/api/media/${profileImageFileId}`;
  }

  return {
    legalName: pick('legalName', fallbackUser?.fullName || ''),
    displayName: pick('displayName', fallbackUser?.fullName || ''),
    artistType,
    country: pick('country', fallbackUser?.country || ''),
    stateRegion: pick('stateRegion'),
    city: pick('city'),
    contactEmail: pick('contactEmail', fallbackUser?.email || ''),
    phoneNumber: pick('phoneNumber'),
    musicGenre: pick('musicGenre'),
    biography: pick('biography'),
    profileImageUrl,
    profileImageFileId: profileImageFileId || undefined,
    spotifyUrl: pick('spotifyUrl') || undefined,
    youtubeUrl: pick('youtubeUrl') || undefined,
    otherDspUrls: pick('otherDspUrls') || undefined,
    submittedAt: existing?.submittedAt,
    reviewedAt: existing?.reviewedAt,
    reviewedBy: existing?.reviewedBy,
    reviewNotes: existing?.reviewNotes,
    updatedAt: new Date().toISOString()
  };
}

export function computeArtistProfileCompletion(profile?: Partial<ArtistProfilePayload> | null): ProfileCompletionResult {
  const p = profile || {};
  const missingFields: string[] = [];
  let completedCount = 0;

  for (const field of REQUIRED_PROFILE_FIELDS) {
    let val = '';
    if (field.key === 'profileImageUrl') {
      val = String(p.profileImageUrl || p.profileImageFileId || '').trim();
    } else {
      val = String(p[field.key] || '').trim();
    }
    const valid =
      field.key === 'artistType'
        ? val === 'Individual Artist' || val === 'Label'
        : field.key === 'biography'
          ? val.length >= 10
          : field.key === 'contactEmail'
            ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
            : field.key === 'phoneNumber'
              ? val.replace(/\D/g, '').length >= 7
              : val.length > 0;
    if (valid) {
      completedCount += 1;
    } else {
      missingFields.push(field.label);
    }
  }

  const totalRequired = REQUIRED_PROFILE_FIELDS.length;
  const completionPercent = Math.round((completedCount / totalRequired) * 100);
  return {
    completionPercent,
    completedCount,
    totalRequired,
    missingFields,
    isComplete: completedCount === totalRequired
  };
}

export function isValidOptionalUrl(raw?: string): boolean {
  if (!raw || !raw.trim()) return true;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getPlanSubmissionQuota(planId: string): { limit: number | null; windowDays: number | null } {
  switch (planId) {
    case 'single-track':
      return { limit: 1, windowDays: null };
    case 'ep-album':
      return { limit: 1, windowDays: null };
    case 'starter-monthly':
    case 'starter-annual':
      return { limit: 1, windowDays: 30 };
    case 'growth-monthly':
    case 'growth-annual':
    case 'promo-first-10-monthly':
      return { limit: 5, windowDays: 30 };
    case 'unlimited-monthly':
    case 'unlimited-annual':
      return { limit: null, windowDays: 30 };
    default:
      return { limit: 0, windowDays: null };
  }
}

export interface UploadEligibilityReport {
  eligible: boolean;
  blockingCode:
    | 'UNAUTHENTICATED'
    | 'EMAIL_UNVERIFIED'
    | 'PROFILE_INCOMPLETE'
    | 'PROFILE_UNDER_REVIEW'
    | 'PROFILE_CHANGES_REQUESTED'
    | 'PROFILE_REJECTED'
    | 'SUBSCRIPTION_REQUIRED'
    | 'SUBSCRIPTION_EXPIRED'
    | 'PLAN_LIMIT_REACHED'
    | null;
  blockingMessage: string | null;
  profileStatus: ArtistProfileStatus;
  profileCompletion: number;
  missingProfileFields: string[];
  reviewNotes?: string;
  subscriptionStatus: string;
  planId: string | null;
  planName: string | null;
  isPromotional: boolean;
  promoSlotNumber?: number;
  daysRemaining: number;
  expiresAt?: string;
  quota: {
    limit: number | null;
    used: number;
    remaining: number | null;
  };
  checks: {
    authenticated: boolean;
    emailVerified: boolean;
    profileCompleted: boolean;
    profileApproved: boolean;
    subscriptionActive: boolean;
    withinPlanQuota: boolean;
  };
}

export function evaluateReleaseUploadEligibility(
  user: any,
  dashboard: any,
  PLAN_CATALOG: Record<string, any>
): UploadEligibilityReport {
  const profileStatus: ArtistProfileStatus = user?.artistProfileStatus || 'Incomplete';
  const completion = computeArtistProfileCompletion(user?.artistProfile);
  const sub = dashboard?.subscription;

  // Check expiration in real time
  let subStatus = sub?.status || 'none';
  let daysRemaining = Number(sub?.daysRemaining ?? 0);
  if (sub && (sub.status === 'active' || sub.status === 'cancelled')) {
    const exp = sub.expiresAt || sub.renewsAt;
    if (exp) {
      const expMs = new Date(exp).getTime();
      if (Number.isFinite(expMs)) {
        if (expMs <= Date.now()) {
          sub.status = 'expired';
          subStatus = 'expired';
          daysRemaining = 0;
          sub.daysRemaining = 0;
        } else {
          daysRemaining = Math.max(1, Math.ceil((expMs - Date.now()) / (1000 * 3600 * 24)));
          sub.daysRemaining = daysRemaining;
        }
      }
    }
  }

  const isPrivileged = user?.role === 'SUPER_ADMIN' || user?.role === 'admin';
  const authenticated = Boolean(user && user.id && user.accountStatus !== 'suspended' && user.accountStatus !== 'terminated');
  const emailVerified = Boolean(user?.isActive);
  const profileCompleted = isPrivileged || completion.isComplete;
  const profileApproved = isPrivileged || profileStatus === 'Approved';
  const subscriptionActive = isPrivileged || subStatus === 'active';

  const activePlanId = sub?.planId || dashboard?.planId || null;
  const planDef = activePlanId ? PLAN_CATALOG[activePlanId] : null;
  const quotaSpec = activePlanId ? getPlanSubmissionQuota(activePlanId) : { limit: 0, windowDays: null };

  const releases = Array.isArray(dashboard?.releases) ? dashboard.releases : [];
  const subStartedMs = sub?.startedAt ? new Date(sub.startedAt).getTime() : 0;
  const windowCutoffMs = quotaSpec.windowDays
    ? Math.max(subStartedMs, Date.now() - quotaSpec.windowDays * 86400000)
    : subStartedMs;

  const submittedInWindow = releases.filter((r: any) => {
    if (r.status === 'Draft') return false;
    const t = r.submittedAt ? new Date(r.submittedAt).getTime() : 0;
    return t >= windowCutoffMs;
  }).length;

  const withinPlanQuota =
    isPrivileged ||
    !subscriptionActive ||
    quotaSpec.limit === null ||
    submittedInWindow < quotaSpec.limit;

  let blockingCode: UploadEligibilityReport['blockingCode'] = null;
  let blockingMessage: string | null = null;

  if (!authenticated) {
    blockingCode = 'UNAUTHENTICATED';
    blockingMessage = 'Authentication is required to upload or submit releases.';
  } else if (!emailVerified) {
    blockingCode = 'EMAIL_UNVERIFIED';
    blockingMessage = 'Your email address must be verified via OTP before submitting releases.';
  } else if (!isPrivileged && profileStatus === 'Rejected') {
    blockingCode = 'PROFILE_REJECTED';
    blockingMessage = `Your Artist Profile was rejected${user?.artistProfile?.reviewNotes ? `: ${user.artistProfile.reviewNotes}` : '.'} Update your profile details and resubmit for approval.`;
  } else if (!isPrivileged && profileStatus === 'Changes Requested') {
    blockingCode = 'PROFILE_CHANGES_REQUESTED';
    blockingMessage = `Super Admin requested updates to your Artist Profile${user?.artistProfile?.reviewNotes ? `: ${user.artistProfile.reviewNotes}` : '.'} Please update and resubmit.`;
  } else if (!isPrivileged && (profileStatus === 'Submitted' || profileStatus === 'Under Review')) {
    blockingCode = 'PROFILE_UNDER_REVIEW';
    blockingMessage = 'Your Artist Profile is currently under review. Release submission will become available after Super Admin approval.';
  } else if (!isPrivileged && (!completion.isComplete || profileStatus === 'Incomplete')) {
    blockingCode = 'PROFILE_INCOMPLETE';
    blockingMessage = 'Complete your Artist Profile (100% required) and submit it for Super Admin approval before uploading releases.';
  } else if (!isPrivileged && profileStatus !== 'Approved') {
    blockingCode = 'PROFILE_UNDER_REVIEW';
    blockingMessage = 'Your Artist Profile is currently under review. Release submission will become available after Super Admin approval.';
  } else if (!subscriptionActive) {
    if (subStatus === 'expired') {
      blockingCode = 'SUBSCRIPTION_EXPIRED';
      blockingMessage = sub?.isPromotional
        ? 'Your 1-month complimentary First-10 Artists access has expired. Choose a distribution plan to continue submitting new releases.'
        : 'Your distribution subscription has expired. Renew or upgrade your plan to submit releases.';
    } else {
      blockingCode = 'SUBSCRIPTION_REQUIRED';
      blockingMessage = 'An active distribution plan or valid First-10 complimentary access is required before uploading releases.';
    }
  } else if (!withinPlanQuota) {
    blockingCode = 'PLAN_LIMIT_REACHED';
    blockingMessage = `You have used ${submittedInWindow}/${quotaSpec.limit} release submissions in your current plan cycle. Upgrade your plan for additional slots.`;
  }

  const eligible =
    authenticated &&
    emailVerified &&
    profileCompleted &&
    profileApproved &&
    subscriptionActive &&
    withinPlanQuota;

  return {
    eligible,
    blockingCode,
    blockingMessage,
    profileStatus,
    profileCompletion: completion.completionPercent,
    missingProfileFields: completion.missingFields,
    reviewNotes: user?.artistProfile?.reviewNotes,
    subscriptionStatus: subStatus,
    planId: activePlanId,
    planName: sub?.planName || planDef?.name || null,
    isPromotional: Boolean(sub?.isPromotional || activePlanId === 'promo-first-10-monthly'),
    promoSlotNumber: sub?.promoSlotNumber,
    daysRemaining,
    expiresAt: sub?.expiresAt || sub?.renewsAt,
    quota: {
      limit: quotaSpec.limit,
      used: submittedInWindow,
      remaining: quotaSpec.limit === null ? null : Math.max(0, quotaSpec.limit - submittedInWindow)
    },
    checks: {
      authenticated,
      emailVerified,
      profileCompleted,
      profileApproved,
      subscriptionActive,
      withinPlanQuota
    }
  };
}

export interface RealFinancialSummary {
  dataUnavailable?: boolean;
  dataSource: 'postgresql-live' | 'in-memory-fallback' | 'postgresql-error';
  clearedBalance: number;
  pendingRoyalties: number;
  projectedRoyalties: number;
  totalNetRoyalties: number;
  lastPayout: number;
  totalSuccessfulPayouts: number;
  totalPendingPayouts: number;
  hasFinancialRecords: boolean;
  monthlyRoyalties: any[];
  dspBreakdown: Array<{ name: string; royalties: number; streams: number; percentage: number; color: string }>;
  topTracks: any[];
  transactions: any[];
  payouts: any[];
}

const DSP_COLOR_MAP: Record<string, string> = {
  Spotify: '#10b981',
  'Apple Music': '#f43f5e',
  'YouTube Music': '#ef4444',
  JioSaavn: '#06b6d4',
  'Amazon Music': '#f59e0b',
  'Other DSPs': '#8b5cf6'
};

export async function computeRealFinancialSummary(userId: string): Promise<RealFinancialSummary> {
  const dbEnabled = isDatabaseEnabled();
  try {
    const [ledgerEntries, statements, payouts] = await Promise.all([
      dbGetLedgerEntries(userId),
      dbGetVerifiedRoyaltyStatements(userId),
      dbGetPayoutRequests(userId)
    ]);

    const clearedLedgerCredits = ledgerEntries
      .filter(e => (e.entryType === 'ROYALTY_CLEARED' || e.entryType === 'ADJUSTMENT') && e.status === 'CLEARED')
      .reduce((acc, e) => acc + Number(e.amountINR || 0), 0);

    const completedPayouts = payouts.filter(p => p.status === 'Completed');
    const pendingPayouts = payouts.filter(p => p.status === 'Pending' || p.status === 'Processing');

    const totalSuccessfulPayouts = completedPayouts.reduce((acc, p) => acc + Number(p.amountINR || 0), 0);
    const totalPendingPayouts = pendingPayouts.reduce((acc, p) => acc + Number(p.amountINR || 0), 0);

    // Real cleared available balance: verified cleared credits minus successful payouts and pending payout holds
    const clearedBalance = Math.max(0, Math.round((clearedLedgerCredits - totalSuccessfulPayouts - totalPendingPayouts) * 100) / 100);

    const pendingRoyalties = statements
      .filter(s => s.status === 'In Clearance' || s.status === 'Processing')
      .reduce((acc, s) => acc + Number(s.netRoyalty || 0), 0);

    const projectedRoyalties = statements
      .filter(s => s.status === 'Projected')
      .reduce((acc, s) => acc + Number(s.netRoyalty || 0), 0);

    // Strictly count ONLY Cleared royalties in totalNetRoyalties (never count In Clearance or Projected as cleared earnings)
    const clearedStatements = statements.filter(s => s.status === 'Cleared');
    const verifiedStatements = statements.filter(s => s.status !== 'Projected');
    const totalNetRoyalties = clearedStatements.reduce((acc, s) => acc + Number(s.netRoyalty || 0), 0);

    const sortedCompletedPayouts = [...completedPayouts].sort(
      (a, b) => new Date(b.processedAt || b.createdAt).getTime() - new Date(a.processedAt || a.createdAt).getTime()
    );
    const lastPayout = sortedCompletedPayouts.length > 0 ? Number(sortedCompletedPayouts[0].amountINR || 0) : 0;

    // Build monthlyRoyalties & dspBreakdown strictly from verified statements
    const dspTotals: Record<string, number> = {
      Spotify: 0,
      'Apple Music': 0,
      'YouTube Music': 0,
      JioSaavn: 0,
      'Amazon Music': 0,
      'Other DSPs': 0
    };
    let totalStreamsAll = 0;

    const monthlyRoyalties = verifiedStatements
      .slice()
      .sort((a, b) => String(a.month).localeCompare(String(b.month)))
      .map(s => {
        const dsp = s.dspBreakdown || {};
        const spotify = Number(dsp.spotify || dsp.Spotify || 0);
        const appleMusic = Number(dsp.appleMusic || dsp['Apple Music'] || 0);
        const youtubeMusic = Number(dsp.youtubeMusic || dsp['YouTube Music'] || 0);
        const jioSaavn = Number(dsp.jioSaavn || dsp.JioSaavn || 0);
        const amazonMusic = Number(dsp.amazonMusic || dsp['Amazon Music'] || 0);
        const sumKnown = spotify + appleMusic + youtubeMusic + jioSaavn + amazonMusic;
        const otherDSPs = Number(dsp.otherDSPs ?? Math.max(0, Number(s.netRoyalty || 0) - sumKnown));

        dspTotals.Spotify += spotify;
        dspTotals['Apple Music'] += appleMusic;
        dspTotals['YouTube Music'] += youtubeMusic;
        dspTotals.JioSaavn += jioSaavn;
        dspTotals['Amazon Music'] += amazonMusic;
        dspTotals['Other DSPs'] += otherDSPs;
        totalStreamsAll += Number(s.streams || 0);

        return {
          month: s.month,
          monthLabel: s.monthLabel,
          grossRoyalty: Number(s.grossRoyalty || 0),
          netRoyalty: Number(s.netRoyalty || 0),
          streams: Number(s.streams || 0),
          spotify,
          appleMusic,
          youtubeMusic,
          jioSaavn,
          amazonMusic,
          otherDSPs,
          status: s.status,
          statementId: s.statementId || s.id,
          payoutDate: s.payoutDate || undefined
        };
      });

    const totalDspRev = Object.values(dspTotals).reduce((a, b) => a + b, 0);
    const dspBreakdown =
      totalDspRev > 0
        ? Object.entries(dspTotals)
            .filter(([, val]) => val > 0)
            .map(([name, royalties]) => ({
              name,
              royalties: Math.round(royalties * 100) / 100,
              streams: Math.round((royalties / totalDspRev) * totalStreamsAll),
              percentage: Math.round((royalties / totalDspRev) * 1000) / 10,
              color: DSP_COLOR_MAP[name] || '#3b82f6'
            }))
        : [];

    const transactions = [
      ...ledgerEntries.map(e => ({
        id: e.id,
        type: e.entryType === 'PAYOUT_SUCCESS' || e.entryType === 'PAYOUT_PENDING' ? 'Payout' : 'Credit',
        amount: Number(e.amountINR || 0),
        description: e.description,
        status: e.status === 'CLEARED' || e.status === 'COMPLETED' ? 'Completed' : 'Processing',
        reference: e.referenceId || e.id,
        date: String(e.createdAt).split('T')[0],
        entryType: e.entryType
      })),
      ...payouts
        .filter(p => !ledgerEntries.some(e => e.referenceId === p.reference))
        .map(p => ({
          id: p.id,
          type: 'Payout' as const,
          amount: Number(p.amountINR || 0),
          description: `Payout (${p.method}) - ${p.details}`,
          status: p.status === 'Completed' ? 'Completed' : 'Processing',
          reference: p.reference,
          date: String(p.createdAt).split('T')[0]
        }))
    ];

    const hasFinancialRecords =
      ledgerEntries.length > 0 || statements.length > 0 || payouts.length > 0;

    return {
      dataSource: dbEnabled ? 'postgresql-live' : 'in-memory-fallback',
      clearedBalance,
      pendingRoyalties: Math.round(pendingRoyalties * 100) / 100,
      projectedRoyalties: Math.round(projectedRoyalties * 100) / 100,
      totalNetRoyalties: Math.round(totalNetRoyalties * 100) / 100,
      lastPayout: Math.round(lastPayout * 100) / 100,
      totalSuccessfulPayouts: Math.round(totalSuccessfulPayouts * 100) / 100,
      totalPendingPayouts: Math.round(totalPendingPayouts * 100) / 100,
      hasFinancialRecords,
      monthlyRoyalties,
      dspBreakdown,
      topTracks: [],
      transactions,
      payouts
    };
  } catch (err) {
    console.error('[Financial Ledger] Database query failed:', err);
    return {
      dataUnavailable: true,
      dataSource: 'postgresql-error',
      clearedBalance: 0,
      pendingRoyalties: 0,
      projectedRoyalties: 0,
      totalNetRoyalties: 0,
      lastPayout: 0,
      totalSuccessfulPayouts: 0,
      totalPendingPayouts: 0,
      hasFinancialRecords: false,
      monthlyRoyalties: [],
      dspBreakdown: [],
      topTracks: [],
      transactions: [],
      payouts: []
    };
  }
}

export async function executeArtistProfileReviewAction(params: {
  targetUser: any;
  decision: 'under_review' | 'approve' | 'reject' | 'request_changes';
  reason?: string;
  adminEmail: string;
  deps: {
    getUserDashboard: (userId: string) => any;
    dbUpsertUser: (u: any) => Promise<void>;
    dbSaveDashboard: (userId: string, d: any) => Promise<void>;
    notifications: Map<string, any>;
    dbSaveNotification: (n: any) => Promise<void>;
    recordAudit: (actorEmail: string, actorRole: string, action: string, entityType: string, entityId: string, details: string) => Promise<void>;
  };
}): Promise<{
  profileStatus: ArtistProfileStatus;
  promoResult?: {
    allocated: boolean;
    reason?: string;
    allocation?: PromotionalAllocationRecord;
    slotsUsed: number;
    slotsRemaining: number;
  };
  skippedPromoReason?: string;
}> {
  const { targetUser, decision, reason, adminEmail, deps } = params;
  const cleanReason = String(reason || '').trim();

  if ((decision === 'reject' || decision === 'request_changes') && !cleanReason) {
    throw new Error('A clear explanation is mandatory when rejecting or requesting changes to an Artist Profile.');
  }

  if (!targetUser.artistProfile) {
    targetUser.artistProfile = sanitizeArtistProfileInput({}, targetUser);
  }
  const completion = computeArtistProfileCompletion(targetUser.artistProfile);

  let nextStatus: ArtistProfileStatus = 'Submitted';
  if (decision === 'under_review') nextStatus = 'Under Review';
  else if (decision === 'approve') {
    if (!completion.isComplete) {
      throw new Error(`Cannot approve incomplete Artist Profile. Missing: ${completion.missingFields.join(', ')}`);
    }
    nextStatus = 'Approved';
  } else if (decision === 'reject') nextStatus = 'Rejected';
  else if (decision === 'request_changes') nextStatus = 'Changes Requested';

  targetUser.artistProfileStatus = nextStatus;
  targetUser.artistProfile.reviewedAt = new Date().toISOString();
  targetUser.artistProfile.reviewedBy = adminEmail;
  targetUser.artistProfile.reviewNotes = cleanReason || (decision === 'approve' ? 'Artist Profile approved by Super Admin.' : undefined);
  await deps.dbUpsertUser(targetUser);

  await dbSaveArtistProfileSubmission({
    id: `prof_rev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    userId: targetUser.id,
    userEmail: targetUser.email,
    status: nextStatus,
    completionPercent: completion.completionPercent,
    profileData: targetUser.artistProfile,
    reviewerEmail: adminEmail,
    reviewNotes: cleanReason || undefined,
    submittedAt: targetUser.artistProfile.submittedAt,
    reviewedAt: targetUser.artistProfile.reviewedAt
  });

  let promoResult: any = undefined;
  let skippedPromoReason: string | undefined = undefined;

  if (decision === 'approve') {
    const dash = deps.getUserDashboard(targetUser.id);
    const hasActivePaidSub =
      dash.subscription &&
      dash.subscription.status === 'active' &&
      !dash.subscription.isPromotional &&
      Number(dash.subscription.amount || 0) > 0;

    if (!targetUser.isActive) {
      skippedPromoReason = 'Artist email is not verified.';
    } else if (targetUser.isTestUser) {
      skippedPromoReason = 'Test accounts are excluded from the First-10 promotional program.';
    } else if (targetUser.role === 'SUPER_ADMIN' || targetUser.role === 'admin') {
      skippedPromoReason = 'Administrative accounts are excluded from promotional slots.';
    } else if (hasActivePaidSub) {
      skippedPromoReason = 'Existing active paid subscription preserved without modification.';
    } else {
      promoResult = await dbClaimFirst10PromotionalSlot({
        userId: targetUser.id,
        userEmail: targetUser.email,
        artistDisplayName: targetUser.artistProfile.displayName || targetUser.fullName,
        approvedBy: adminEmail
      });

      if (promoResult.allocated && promoResult.allocation) {
        const alloc = promoResult.allocation as PromotionalAllocationRecord;
        dash.planId = 'promo-first-10-monthly';
        dash.subscription = {
          status: 'active',
          planId: 'promo-first-10-monthly',
          planName: 'First 10 Artists Complimentary Plan',
          billingFrequency: 'monthly',
          startedAt: alloc.activatedAt,
          renewsAt: alloc.expiresAt.split('T')[0],
          expiresAt: alloc.expiresAt,
          orderId: '',
          paymentId: '',
          amount: 0,
          autoRenew: false,
          isPromotional: true,
          promoSlotNumber: alloc.slotNumber,
          paymentStatus: 'COMPED / PROMOTIONAL',
          daysRemaining: 30
        };
        await deps.dbSaveDashboard(targetUser.id, dash);
      }
    }
  }

  // Send in-app notification + queued artist email notification
  let notifTitle = 'Artist Profile Update';
  let notifMessage = 'Your Artist Profile status has been updated.';
  let notifType: 'approved' | 'changes_requested' | 'rejected' = 'approved';
  let emailPurpose: 'profile_approved' | 'profile_rejected' | 'profile_changes_requested' | 'promo_activated' = 'profile_approved';

  if (nextStatus === 'Approved') {
    notifType = 'approved';
    if (promoResult?.allocated && promoResult?.allocation) {
      emailPurpose = 'promo_activated';
      notifTitle = 'Artist Profile Approved · 1 Month Free Plan Activated';
      notifMessage = `Congratulations! Your Artist Profile is approved and you claimed Slot #${promoResult.allocation.slotNumber} of 10 in our First-10 Artists Complimentary Program. You have 1 month of free release access until ${promoResult.allocation.expiresAt.split('T')[0]} with zero automatic charges.`;
    } else {
      notifTitle = 'Artist Profile Approved';
      notifMessage = skippedPromoReason
        ? `Your Artist Profile has been approved by Super Admin (${skippedPromoReason}).`
        : 'Your Artist Profile has been approved! Choose an active distribution plan to submit releases.';
    }
  } else if (nextStatus === 'Under Review') {
    notifType = 'changes_requested';
    notifTitle = 'Artist Profile Under Review';
    notifMessage = 'Your Artist Profile is currently under Super Admin review.';
  } else if (nextStatus === 'Changes Requested') {
    notifType = 'changes_requested';
    emailPurpose = 'profile_changes_requested';
    notifTitle = 'Changes Requested on Artist Profile';
    notifMessage = `Super Admin requested updates to your Artist Profile: ${cleanReason}`;
  } else if (nextStatus === 'Rejected') {
    notifType = 'rejected';
    emailPurpose = 'profile_rejected';
    notifTitle = 'Artist Profile Rejected';
    notifMessage = `Your Artist Profile was rejected: ${cleanReason}`;
  }

  const notif = {
    id: `notif_prof_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    recipient_user_id: targetUser.id,
    release_id: 'artist-profile',
    notification_type: notifType,
    title: notifTitle,
    message: notifMessage,
    admin_reason: cleanReason || undefined,
    release_title: 'Artist Profile Verification',
    artist_name: targetUser.artistProfile.displayName || targetUser.fullName,
    created_at: new Date().toISOString(),
    expires_at: Date.now() + 72 * 3600 * 1000
  };
  deps.notifications.set(notif.id, notif);
  await deps.dbSaveNotification({ ...notif, userId: targetUser.id });

  await sendArtistNotificationEmail({
    email: targetUser.email,
    subject: `Rudraatma Music — ${notifTitle}`,
    title: notifTitle,
    body: notifMessage,
    purpose: emailPurpose
  }).catch(() => {});

  await deps.recordAudit(
    adminEmail,
    'SUPER_ADMIN',
    `ARTIST_PROFILE_${decision.toUpperCase()}`,
    'ArtistProfile',
    targetUser.id,
    `Profile status -> ${nextStatus} for ${targetUser.email}${promoResult?.allocated ? ` (Claimed First-10 Promo Slot #${promoResult.allocation.slotNumber}/10)` : ''}${cleanReason ? ` · Note: ${cleanReason}` : ''}`
  );

  return { profileStatus: nextStatus, promoResult, skippedPromoReason };
}

function validateImageMagicBytes(buf: Buffer, mime: string): boolean {
  if (!buf || buf.length < 8) return false;
  if (mime === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === 'image/webp') {
    return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export function registerArtistOnboardingAndFinanceRoutes(
  app: express.Express,
  deps: {
    users: Map<string, any>;
    userDashboards: Map<string, any>;
    PLAN_CATALOG: Record<string, any>;
    notifications: Map<string, any>;
    auditLogs: any[];
    getAuthenticatedUser: (req: express.Request) => any;
    getUserDashboard: (userId: string) => any;
    dbUpsertUser: (u: any) => Promise<void>;
    dbSaveDashboard: (userId: string, d: any) => Promise<void>;
    dbSaveNotification: (n: any) => Promise<void>;
    recordAudit: (actorEmail: string, actorRole: string, action: string, entityType: string, entityId: string, details: string) => Promise<void>;
    localProfileDir: string;
  }
) {
  const profileImgUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowed.includes((file.mimetype || '').toLowerCase())) {
        return cb(new Error('Only JPG, PNG, or WEBP profile images are accepted.'));
      }
      cb(null, true);
    }
  });

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized. Authentication required.' });
    (req as any).authUser = user;
    next();
  }

  function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized. Super Admin authentication required.' });
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Forbidden. SUPER_ADMIN role required.' });
    (req as any).superAdmin = user;
    next();
  }

  // ==================== ARTIST PROFILE ENDPOINTS ====================

  app.get('/api/artist-profile', requireAuth, async (req, res) => {
    const user = (req as any).authUser;
    const profile = sanitizeArtistProfileInput(user.artistProfile || {}, user, user.artistProfile);
    const completion = computeArtistProfileCompletion(profile);
    const status: ArtistProfileStatus = user.artistProfileStatus || 'Incomplete';
    const dash = deps.getUserDashboard(user.id);
    const eligibility = evaluateReleaseUploadEligibility(user, dash, deps.PLAN_CATALOG);

    let history: any[] = [];
    let promotions: PromotionalAllocationRecord[] = [];
    try {
      [history, promotions] = await Promise.all([
        dbGetArtistProfileHistory(user.id),
        dbSyncAndListPromotions()
      ]);
    } catch {
      // Non-fatal history read fallback
    }

    const promoSlot = promotions.find(p => p.userId === user.id || p.userEmail === user.email);
    const promoRemaining = Math.max(0, 10 - promotions.length);

    return res.json({
      artistProfile: profile,
      status,
      completion,
      history,
      eligibility,
      promotionalProgram: {
        eligible: promoRemaining > 0 && !promoSlot && !user.isTestUser && user.role === 'artist',
        claimed: Boolean(promoSlot),
        allocation: promoSlot || null,
        totalSlots: 10,
        slotsUsed: promotions.length,
        slotsRemaining: promoRemaining
      }
    });
  });

  app.post('/api/artist-profile/image', requireAuth, (req, res) => {
    const user = (req as any).authUser;
    profileImgUpload.single('image')(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Image upload failed.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
      }
      const mime = (req.file.mimetype || '').toLowerCase();
      if (!validateImageMagicBytes(req.file.buffer, mime)) {
        return res.status(400).json({ error: 'File contents do not match a valid PNG, JPG, or WEBP image.' });
      }
      try {
        const stored = await saveUploadedMedia({
          userId: user.id,
          category: 'artwork',
          originalName: req.file.originalname || `artist_profile_${Date.now()}${path.extname(req.file.originalname || '.jpg')}`,
          mimeType: mime,
          buffer: req.file.buffer,
          localUploadDir: deps.localProfileDir
        });
        return res.json({
          success: true,
          fileId: stored.fileName,
          fileUrl: stored.fileUrl,
          size: stored.size,
          mimeType: stored.mimeType
        });
      } catch (uploadErr: any) {
        return res.status(500).json({ error: uploadErr.message || 'Failed to save profile image.' });
      }
    });
  });

  app.put('/api/artist-profile/draft', requireAuth, async (req, res) => {
    const user = (req as any).authUser;
    const sanitized = sanitizeArtistProfileInput(req.body, user, user.artistProfile);

    if (!isValidOptionalUrl(sanitized.spotifyUrl) || !isValidOptionalUrl(sanitized.youtubeUrl) || !isValidOptionalUrl(sanitized.otherDspUrls)) {
      return res.status(400).json({ error: 'Optional DSP or social links must be valid http:// or https:// URLs.' });
    }

    const completion = computeArtistProfileCompletion(sanitized);
    user.artistProfile = sanitized;
    if (!user.artistProfileStatus) {
      user.artistProfileStatus = 'Incomplete';
    }
    if (sanitized.displayName) {
      user.fullName = sanitized.displayName;
    }
    if (sanitized.country) {
      user.country = sanitized.country;
    }

    await deps.dbUpsertUser(user);
    return res.json({
      success: true,
      artistProfile: user.artistProfile,
      status: user.artistProfileStatus,
      completion,
      message: 'Artist Profile draft saved.'
    });
  });

  app.post('/api/artist-profile/submit', requireAuth, async (req, res) => {
    const user = (req as any).authUser;
    if (!user.isActive) {
      return res.status(403).json({ error: 'Verify your email address via OTP before submitting your Artist Profile.' });
    }

    const sanitized = sanitizeArtistProfileInput(req.body, user, user.artistProfile);

    if (!isValidOptionalUrl(sanitized.spotifyUrl) || !isValidOptionalUrl(sanitized.youtubeUrl) || !isValidOptionalUrl(sanitized.otherDspUrls)) {
      return res.status(400).json({ error: 'Optional Spotify, YouTube, or other DSP URLs must start with http:// or https://.' });
    }

    const completion = computeArtistProfileCompletion(sanitized);
    if (!completion.isComplete) {
      return res.status(400).json({
        error: `Please complete all required Artist Profile fields (${completion.completionPercent}% completed). Missing: ${completion.missingFields.join(', ')}.`,
        completion
      });
    }

    const nowIso = new Date().toISOString();
    sanitized.submittedAt = nowIso;
    sanitized.reviewNotes = undefined;
    user.artistProfile = sanitized;
    user.artistProfileStatus = 'Submitted';
    user.fullName = sanitized.displayName || sanitized.legalName || user.fullName;
    user.country = sanitized.country || user.country;
    await deps.dbUpsertUser(user);

    await dbSaveArtistProfileSubmission({
      id: `prof_sub_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      userId: user.id,
      userEmail: user.email,
      status: 'Submitted',
      completionPercent: 100,
      profileData: sanitized,
      submittedAt: nowIso
    });

    await deps.recordAudit(
      user.email,
      user.role,
      'ARTIST_PROFILE_SUBMITTED',
      'ArtistProfile',
      user.id,
      `Artist Profile (100% completed) submitted for Super Admin approval.`
    );

    const dash = deps.getUserDashboard(user.id);
    const eligibility = evaluateReleaseUploadEligibility(user, dash, deps.PLAN_CATALOG);

    return res.json({
      success: true,
      artistProfile: user.artistProfile,
      status: user.artistProfileStatus,
      completion,
      eligibility,
      message: 'Artist Profile submitted for Super Admin review. Release submission unlocks immediately after approval.'
    });
  });

  // ==================== UPLOAD ELIGIBILITY & REAL FINANCIAL LEDGER ====================

  app.get('/api/dashboard/upload-eligibility', requireAuth, async (req, res) => {
    const user = (req as any).authUser;
    const dash = deps.getUserDashboard(user.id);
    await dbSyncAndListPromotions().catch(() => []);
    const eligibility = evaluateReleaseUploadEligibility(user, dash, deps.PLAN_CATALOG);
    return res.json({ eligibility });
  });

  app.get('/api/dashboard/financial', requireAuth, async (req, res) => {
    const user = (req as any).authUser;
    const summary = await computeRealFinancialSummary(user.id);
    if (summary.dataUnavailable) {
      return res.status(503).json({
        error: 'Data Unavailable: Unable to query verified financial ledger from PostgreSQL.',
        dataUnavailable: true,
        ...summary
      });
    }
    return res.json(summary);
  });

  // ==================== SUPER ADMIN ARTIST ONBOARDING, PROMOTIONS & FINANCIAL GOVERNANCE ====================

  app.get('/api/super-admin/artist-profiles', requireSuperAdmin, async (req, res) => {
    try {
      const statusFilter = String(req.query.status || 'all').toLowerCase();
      const q = String(req.query.q || '').trim().toLowerCase();
      const includeTest = req.query.includeTest === 'true';
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(5, Number(req.query.limit || 25)));

      const promotions = await dbSyncAndListPromotions().catch(() => [] as PromotionalAllocationRecord[]);

      const list = Array.from(deps.users.values())
        .filter(u => u.role !== 'SUPER_ADMIN' && (includeTest || !u.isTestUser))
        .map(u => {
          const prof = sanitizeArtistProfileInput(u.artistProfile || {}, u, u.artistProfile);
          const completion = computeArtistProfileCompletion(u.artistProfile || {});
          const profileStatus: ArtistProfileStatus = u.artistProfileStatus || 'Incomplete';
          const dash = deps.userDashboards.get(u.id);
          const promo = promotions.find(p => p.userId === u.id);
          return {
            userId: u.id,
            email: u.email,
            fullName: u.fullName,
            country: u.country,
            emailVerified: Boolean(u.isActive),
            accountStatus: u.accountStatus || 'active',
            profileStatus,
            completionPercent: completion.completionPercent,
            missingFields: completion.missingFields,
            artistProfile: prof,
            planName: dash?.subscription?.planName || null,
            subscriptionStatus: dash?.subscription?.status || 'none',
            isPromotional: Boolean(dash?.subscription?.isPromotional),
            promoAllocation: promo || null,
            createdAt: u.createdAt
          };
        })
        .filter(item => {
          if (statusFilter === 'incomplete') return item.profileStatus === 'Incomplete';
          if (statusFilter === 'pending') return item.profileStatus === 'Submitted' || item.profileStatus === 'Under Review';
          if (statusFilter === 'under_review') return item.profileStatus === 'Under Review';
          if (statusFilter === 'approved') return item.profileStatus === 'Approved';
          if (statusFilter === 'rejected') return item.profileStatus === 'Rejected' || item.profileStatus === 'Changes Requested';
          if (statusFilter === 'new') {
            return Date.now() - new Date(item.createdAt).getTime() <= 7 * 86400000;
          }
          return true;
        })
        .filter(item => {
          if (!q) return true;
          return (
            item.email.toLowerCase().includes(q) ||
            item.fullName.toLowerCase().includes(q) ||
            (item.artistProfile.displayName || '').toLowerCase().includes(q) ||
            (item.artistProfile.legalName || '').toLowerCase().includes(q)
          );
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const total = list.length;
      const items = list.slice((page - 1) * limit, page * limit);

      const allNonAdmin = Array.from(deps.users.values()).filter(u => u.role !== 'SUPER_ADMIN' && (includeTest || !u.isTestUser));
      const counts = {
        totalArtists: allNonAdmin.length,
        newRegistrations: allNonAdmin.filter(u => Date.now() - new Date(u.createdAt).getTime() <= 7 * 86400000).length,
        incomplete: allNonAdmin.filter(u => (u.artistProfileStatus || 'Incomplete') === 'Incomplete').length,
        pendingReview: allNonAdmin.filter(u => u.artistProfileStatus === 'Submitted' || u.artistProfileStatus === 'Under Review').length,
        approved: allNonAdmin.filter(u => u.artistProfileStatus === 'Approved').length,
        rejectedOrChanges: allNonAdmin.filter(u => u.artistProfileStatus === 'Rejected' || u.artistProfileStatus === 'Changes Requested').length
      };

      return res.json({ items, total, page, limit, counts });
    } catch (err: any) {
      return res.status(503).json({
        error: err?.message || 'Data Unavailable',
        dataUnavailable: true,
        items: []
      });
    }
  });

  app.post('/api/super-admin/artist-profiles/:userId/review', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { userId } = req.params;
    const { decision, reason } = req.body || {};

    if (!['under_review', 'approve', 'reject', 'request_changes'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid review decision. Allowed: under_review, approve, reject, request_changes.' });
    }

    const targetUser = Array.from(deps.users.values()).find(u => u.id === userId || u.email === userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Artist account not found.' });
    }
    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot modify Super Admin profile.' });
    }

    try {
      const result = await executeArtistProfileReviewAction({
        targetUser,
        decision,
        reason,
        adminEmail: admin.email,
        deps
      });
      return res.json({
        success: true,
        ...result
      });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Profile review failed.' });
    }
  });

  app.get('/api/super-admin/promotions', requireSuperAdmin, async (_req, res) => {
    try {
      const promotions = await dbSyncAndListPromotions();
      const activePromotions = promotions.filter(p => p.status === 'ACTIVE');
      const expiredPromotions = promotions.filter(p => p.status === 'EXPIRED');
      const revokedPromotions = promotions.filter(p => p.status === 'REVOKED');

      const eligibleApplications = Array.from(deps.users.values())
        .filter(u => {
          if (u.role === 'SUPER_ADMIN' || u.role === 'admin' || u.isTestUser || !u.isActive) return false;
          if (promotions.some(p => p.userId === u.id)) return false;
          const st = u.artistProfileStatus || 'Incomplete';
          return st === 'Submitted' || st === 'Under Review';
        })
        .map(u => ({
          userId: u.id,
          email: u.email,
          displayName: u.artistProfile?.displayName || u.fullName,
          profileStatus: u.artistProfileStatus,
          submittedAt: u.artistProfile?.submittedAt || u.createdAt
        }));

      return res.json({
        totalSlots: 10,
        slotsUsed: promotions.length,
        slotsRemaining: Math.max(0, 10 - promotions.length),
        activeCount: activePromotions.length,
        expiredCount: expiredPromotions.length,
        revokedCount: revokedPromotions.length,
        eligibleApplications,
        approvedPromotions: promotions,
        expiredPromotions,
        revokedPromotions
      });
    } catch (err: any) {
      return res.status(503).json({ error: 'Data Unavailable', dataUnavailable: true });
    }
  });

  app.post('/api/super-admin/promotions/:userId/revoke', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { userId } = req.params;
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'A clear reason is mandatory to revoke promotional access.' });
    }

    const revoked = await dbRevokePromotionSlot(userId, reason);
    if (!revoked) {
      return res.status(404).json({ error: 'Promotional allocation not found for this user.' });
    }

    const dash = deps.userDashboards.get(userId);
    if (dash?.subscription?.isPromotional) {
      dash.subscription.status = 'revoked';
      dash.subscription.revokedAt = new Date().toISOString();
      dash.subscription.revocationReason = reason;
      dash.subscription.daysRemaining = 0;
      await deps.dbSaveDashboard(userId, dash);
    }

    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      'PROMO_SLOT_REVOKED',
      'PromotionalAllocation',
      revoked.id,
      `Revoked First-10 promo slot #${revoked.slotNumber} (${revoked.userEmail}): ${reason}`
    );

    return res.json({ success: true, allocation: revoked });
  });

  app.get('/api/super-admin/financial-governance', requireSuperAdmin, async (_req, res) => {
    try {
      const [ledgerEntries, statements, payouts] = await Promise.all([
        dbGetLedgerEntries(),
        dbGetVerifiedRoyaltyStatements(),
        dbGetPayoutRequests()
      ]);

      const artistBalances = Array.from(deps.users.values())
        .filter(u => u.role !== 'SUPER_ADMIN' && !u.isTestUser)
        .map(u => {
          const userLedger = ledgerEntries.filter(e => e.userId === u.id);
          const userStmts = statements.filter(s => s.userId === u.id);
          const userPayouts = payouts.filter(p => p.userId === u.id);
          const clearedCredits = userLedger
            .filter(e => (e.entryType === 'ROYALTY_CLEARED' || e.entryType === 'ADJUSTMENT') && e.status === 'CLEARED')
            .reduce((acc, e) => acc + Number(e.amountINR || 0), 0);
          const completedPayouts = userPayouts
            .filter(p => p.status === 'Completed')
            .reduce((acc, p) => acc + Number(p.amountINR || 0), 0);
          const pendingPayouts = userPayouts
            .filter(p => p.status === 'Pending' || p.status === 'Processing')
            .reduce((acc, p) => acc + Number(p.amountINR || 0), 0);
          const clearedBalance = Math.max(0, Math.round((clearedCredits - completedPayouts - pendingPayouts) * 100) / 100);
          const pendingRoyalties = userStmts
            .filter(s => s.status === 'In Clearance' || s.status === 'Processing')
            .reduce((acc, s) => acc + Number(s.netRoyalty || 0), 0);
          const projectedRoyalties = userStmts
            .filter(s => s.status === 'Projected')
            .reduce((acc, s) => acc + Number(s.netRoyalty || 0), 0);
          return {
            userId: u.id,
            email: u.email,
            displayName: u.artistProfile?.displayName || u.fullName,
            clearedBalance,
            pendingRoyalties,
            projectedRoyalties,
            completedPayouts,
            pendingPayouts
          };
        });

      return res.json({
        dataSource: isDatabaseEnabled() ? 'postgresql-live' : 'in-memory-fallback',
        ledgerEntries,
        verifiedStatements: statements,
        successfulPayouts: payouts.filter(p => p.status === 'Completed'),
        pendingSettlements: payouts.filter(p => p.status !== 'Completed'),
        artistBalances
      });
    } catch (err: any) {
      return res.status(503).json({
        error: 'Data Unavailable: Could not read financial governance ledger from PostgreSQL.',
        dataUnavailable: true
      });
    }
  });

  app.post('/api/super-admin/financial-governance/statements', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const {
      userId,
      month,
      monthLabel,
      status,
      grossRoyalty,
      netRoyalty,
      streams,
      dspBreakdown,
      payoutDate
    } = req.body || {};

    const targetUser = Array.from(deps.users.values()).find(u => u.id === userId || u.email === userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target artist account not found.' });
    }
    if (!month || !/^\d{4}-\d{2}$/.test(String(month))) {
      return res.status(400).json({ error: 'Valid reporting month (YYYY-MM) is required.' });
    }
    const allowedStatuses = ['Cleared', 'In Clearance', 'Processing', 'Projected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid statement status.' });
    }

    const netAmt = Number(netRoyalty || 0);
    const grossAmt = Number(grossRoyalty || netAmt);
    const streamCount = Number(streams || 0);
    if (!Number.isFinite(netAmt) || netAmt < 0 || !Number.isFinite(grossAmt) || grossAmt < 0) {
      return res.status(400).json({ error: 'Royalty amounts must be non-negative numbers.' });
    }

    const stmtId = `STMT-${month}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    await dbSaveVerifiedRoyaltyStatement({
      id: stmtId,
      userId: targetUser.id,
      month: String(month),
      monthLabel: String(monthLabel || month),
      status,
      grossRoyalty: grossAmt,
      netRoyalty: netAmt,
      streams: streamCount,
      dspBreakdown: dspBreakdown || { spotify: netAmt },
      statementRef: stmtId,
      payoutDate: payoutDate || (status === 'Cleared' ? `${month}-20` : undefined),
      verifiedBy: admin.email
    });

    const entryType =
      status === 'Cleared'
        ? 'ROYALTY_CLEARED'
        : status === 'Projected'
          ? 'ROYALTY_PROJECTED'
          : 'ROYALTY_PENDING';
    const ledgerStatus =
      status === 'Cleared'
        ? 'CLEARED'
        : status === 'Projected'
          ? 'PROJECTED'
          : 'PENDING';

    await dbSaveLedgerEntry({
      id: `led_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      userId: targetUser.id,
      entryType,
      amountINR: netAmt,
      status: ledgerStatus,
      referenceId: stmtId,
      statementMonth: String(month),
      description: `Verified DSP Statement ${stmtId} (${monthLabel || month} · ${status})`,
      source: 'super_admin_verified_statement',
      createdBy: admin.email
    });

    const summary = await computeRealFinancialSummary(targetUser.id);
    const dash = deps.getUserDashboard(targetUser.id);
    dash.balance = summary.clearedBalance;
    dash.lastPayout = summary.lastPayout;
    dash.monthlyRoyalties = summary.monthlyRoyalties;
    dash.dspBreakdown = summary.dspBreakdown;
    dash.transactions = summary.transactions;
    await deps.dbSaveDashboard(targetUser.id, dash);

    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      'VERIFIED_ROYALTY_STATEMENT_IMPORTED',
      'RoyaltyStatement',
      stmtId,
      `Recorded ${status} statement ${stmtId} for ${targetUser.email} (₹${netAmt.toFixed(2)}, ${streamCount} streams)`
    );

    return res.json({ success: true, statementId: stmtId, financialSummary: summary });
  });

  app.post('/api/super-admin/financial-governance/payouts/:payoutId/process', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { payoutId } = req.params;
    const { action, notes } = req.body || {};
    if (action !== 'complete' && action !== 'reject') {
      return res.status(400).json({ error: 'Action must be "complete" or "reject".' });
    }

    const allPayouts = await dbGetPayoutRequests();
    const target = allPayouts.find(p => p.id === payoutId);
    if (!target) {
      return res.status(404).json({ error: 'Payout request not found.' });
    }
    if (target.status !== 'Pending') {
      return res.status(400).json({ error: `Payout already finalized as ${target.status}.` });
    }

    const nextStatus = action === 'complete' ? 'Completed' : 'Rejected';
    await dbSavePayoutRequest({
      ...target,
      status: nextStatus,
      processedBy: admin.email,
      notes: String(notes || '').trim() || undefined,
      processedAt: new Date().toISOString()
    });

    const ledgerEntries = await dbGetLedgerEntries(target.userId);
    const matchingLedger = ledgerEntries.find(e => e.referenceId === target.reference);
    if (matchingLedger) {
      await dbSaveLedgerEntry({
        ...matchingLedger,
        entryType: nextStatus === 'Completed' ? 'PAYOUT_SUCCESS' : 'PAYOUT_PENDING',
        status: nextStatus === 'Completed' ? 'COMPLETED' : 'FAILED',
        description: `${matchingLedger.description} (${nextStatus}${notes ? ': ' + notes : ''})`
      });
    }

    const summary = await computeRealFinancialSummary(target.userId);
    const dash = deps.getUserDashboard(target.userId);
    dash.balance = summary.clearedBalance;
    dash.lastPayout = summary.lastPayout;
    dash.transactions = summary.transactions;
    await deps.dbSaveDashboard(target.userId, dash);

    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      nextStatus === 'Completed' ? 'PAYOUT_COMPLETED' : 'PAYOUT_REJECTED',
      'Payout',
      target.id,
      `${nextStatus} payout ${target.reference} of ₹${target.amountINR.toFixed(2)} for user ${target.userId}`
    );

    return res.json({ success: true, status: nextStatus, summary });
  });

  app.get('/api/super-admin/infrastructure', requireSuperAdmin, async (_req, res) => {
    const dbConnected = isDatabaseEnabled();
    let poolMetrics: any = { totalCount: 0, idleCount: 0, waitingCount: 0 };
    if (dbConnected) {
      const p = getDbPool();
      poolMetrics = {
        totalCount: p.totalCount,
        idleCount: p.idleCount,
        waitingCount: p.waitingCount
      };
    }
    const emailQueue = await dbGetEmailQueueStats().catch(() => ({ queued: 0, sent: 0, failed: 0, recent: [] }));
    const promotions = await dbSyncAndListPromotions().catch(() => []);

    return res.json({
      database: {
        connected: dbConnected,
        mode: dbConnected ? 'PostgreSQL Live Pool' : 'Development In-Memory Fallback',
        pool: poolMetrics
      },
      emailQueue,
      promotionalSlots: {
        total: 10,
        used: promotions.length,
        remaining: Math.max(0, 10 - promotions.length)
      },
      limits: {
        authRateLimitPer15Min: 15,
        maxAudioSizeMB: 150,
        maxArtworkSizeMB: 25,
        maxProfileImageSizeMB: 10
      },
      records: {
        users: deps.users.size,
        dashboards: deps.userDashboards.size,
        auditLogs: deps.auditLogs.length
      }
    });
  });

  app.get('/api/super-admin/infrastructure/backup', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const promotions = await dbSyncAndListPromotions().catch(() => []);
    const statements = await dbGetVerifiedRoyaltyStatements().catch(() => []);
    const payouts = await dbGetPayoutRequests().catch(() => []);
    const snapshot = {
      exportedAt: new Date().toISOString(),
      exportedBy: admin.email,
      usersCount: deps.users.size,
      users: Array.from(deps.users.values()).map(u => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        isActive: u.isActive,
        artistProfileStatus: u.artistProfileStatus || 'Incomplete',
        createdAt: u.createdAt
      })),
      promotions,
      verifiedStatementsCount: statements.length,
      payoutRequestsCount: payouts.length
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="rudraatma_backup_snapshot_${new Date().toISOString().split('T')[0]}.json"`);
    return res.send(JSON.stringify(snapshot, null, 2));
  });
}
