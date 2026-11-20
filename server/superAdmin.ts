import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { getDbPool, isDatabaseEnabled } from './db';
import { saveUploadedMedia, getStoredMedia } from './storage';
import {
  verifyAppsScriptNetworkReadiness,
  getSafeEmailDiagnostics,
  buildOtpEmailTemplate,
  OTP_EXPIRY_MINUTES,
  OFFICIAL_COMPANY_EMAIL,
  OFFICIAL_WEBSITE_URL
} from './appsScriptEmail';
import {
  loadLivePlatformSnapshot,
  recordAdminSessionMeta,
  touchAdminSessionMeta,
  extractBearerToken,
  isTestOrDemoUser
} from './commandCenter';

export type AccountStatus = 'active' | 'suspended' | 'terminated';
export type KycStatus = 'Not Submitted' | 'Pending' | 'Approved' | 'Rejected' | 'Reupload Required';

export interface UserKycRecord {
  status: KycStatus;
  fullLegalName: string;
  dateOfBirth: string;
  address: string;
  mobileNumber: string;
  aadhaarNumberLast4?: string;
  panNumber?: string;
  aadhaarFrontFileId?: string;
  aadhaarFrontUrl?: string;
  aadhaarBackFileId?: string;
  aadhaarBackUrl?: string;
  panCardFileId?: string;
  panCardUrl?: string;
  profilePhotoFileId?: string;
  profilePhotoUrl?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  servicesUnlocked: boolean;
}

export interface PlatformSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  websiteAnnouncement: string;
  homepageBannerTitle: string;
  homepageBannerSubtitle: string;
  seoTitle: string;
  seoDescription: string;
  adsEnabled: boolean;
  analyticsId: string;
  services: {
    distribution: boolean;
    youtubeContentId: boolean;
    smartLinks: boolean;
    googleDrive: boolean;
    googleSheets: boolean;
    gmail: boolean;
  };
  paymentSettings: {
    currency: string;
    minPayoutThresholdINR: number;
    razorpayEnabled: boolean;
    gstPercentage: number;
  };
  platformPolicies: {
    financialRetentionYears: number;
    kycMandatoryForDistribution: boolean;
    termsUpdatedAt: string;
  };
  adminTwoFactorEnabled: boolean;
  adminTotpPinHash?: string;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  maintenanceMode: false,
  maintenanceMessage: 'Rudraatma Music Distribution is undergoing scheduled maintenance. Please check back shortly.',
  websiteAnnouncement: '',
  homepageBannerTitle: 'Distribution · Devotion · Beyond',
  homepageBannerSubtitle: 'Global music distribution, 100% artist royalties, YouTube Content ID, and studio-grade catalog control.',
  seoTitle: 'RUDRAATMA Music — Global Music Distribution',
  seoDescription: 'Independent Indian and global music distribution platform with 100% royalty transparency.',
  adsEnabled: false,
  analyticsId: '',
  services: {
    distribution: true,
    youtubeContentId: true,
    smartLinks: true,
    googleDrive: true,
    googleSheets: true,
    gmail: true
  },
  paymentSettings: {
    currency: 'INR',
    minPayoutThresholdINR: 1000,
    razorpayEnabled: true,
    gstPercentage: 18
  },
  platformPolicies: {
    financialRetentionYears: 7,
    kycMandatoryForDistribution: true,
    termsUpdatedAt: new Date().toISOString().split('T')[0]
  },
  adminTwoFactorEnabled: false
};

export interface SuperAdminDeps {
  users: Map<string, any>;
  sessions: Map<string, any>;
  failedLoginAttempts: Map<string, { count: number; lockedUntil: number; lastAttempt: number }>;
  userDashboards: Map<string, any>;
  razorpayOrders: Map<string, any>;
  notifications: Map<string, any>;
  auditLogs: any[];
  contactSubmissions: Array<any>;
  artistFeedbacks: Array<any>;
  PLAN_CATALOG: Record<string, any>;
  platformSettings: PlatformSettings;
  authRateLimiter: express.RequestHandler;
  getAuthenticatedUser: (req: express.Request) => any;
  getUserDashboard: (userId: string) => any;
  recordAudit: (actorEmail: string, actorRole: string, action: string, entityType: string, entityId: string, details: string) => Promise<void>;
  dbUpsertUser: (user: any) => Promise<void>;
  dbSaveSession: (session: any) => Promise<void>;
  dbDeleteSession: (token: string) => Promise<void>;
  dbSaveDashboard: (userId: string, data: any) => Promise<void>;
  dbSaveOrder: (order: any) => Promise<void>;
  dbSaveNotification: (notif: any) => Promise<void>;
  dbSavePlatformSetting: (key: string, value: any) => Promise<void>;
  localKycDir: string;
  getRecentServerLogs?: () => Array<any>;
}

export function getMainSuperAdminEmail(): string {
  return (process.env.SUPER_ADMIN_EMAIL || 'rudraatmamusic@gmail.com').trim().toLowerCase();
}

export function computeProfileCompletion(user: any): number {
  let score = 0;
  if (user.fullName) score += 15;
  if (user.email) score += 15;
  if (user.country) score += 10;
  const kyc: UserKycRecord | undefined = user.kyc;
  if (kyc) {
    if (kyc.fullLegalName) score += 10;
    if (kyc.dateOfBirth) score += 10;
    if (kyc.address) score += 10;
    if (kyc.mobileNumber) score += 10;
    if (kyc.aadhaarFrontFileId && kyc.aadhaarBackFileId) score += 10;
    if (kyc.panCardFileId) score += 5;
    if (kyc.profilePhotoFileId) score += 5;
  }
  return Math.min(100, score);
}

export async function bootstrapSuperAdmin(deps: Pick<SuperAdminDeps, 'users' | 'dbUpsertUser'>): Promise<void> {
  const adminEmail = getMainSuperAdminEmail();
  const existing = deps.users.get(adminEmail);

  const envHash = process.env.SUPER_ADMIN_PASSWORD_HASH?.trim();
  const envPlain = process.env.SUPER_ADMIN_PASSWORD?.trim();

  let passwordHash = existing?.passwordHash || '';
  if (envHash) {
    passwordHash = envHash;
  } else if (envPlain) {
    passwordHash = await bcrypt.hash(envPlain, 12);
  }

  if (!passwordHash) {
    console.warn(
      `[SuperAdmin Bootstrap] SUPER_ADMIN_PASSWORD or SUPER_ADMIN_PASSWORD_HASH is not set for ${adminEmail}. Set env vars or call POST /api/super-admin/bootstrap with SUPER_ADMIN_BOOTSTRAP_SECRET.`
    );
    return;
  }

  const adminUser = existing
    ? {
        ...existing,
        role: 'SUPER_ADMIN',
        isActive: true,
        accountStatus: 'active' as AccountStatus,
        passwordHash
      }
    : {
        id: 'super-admin-001',
        fullName: 'Rudraatma Super Admin',
        email: adminEmail,
        country: 'India',
        passwordHash,
        role: 'SUPER_ADMIN',
        isActive: true,
        accountStatus: 'active' as AccountStatus,
        createdAt: new Date().toISOString()
      };

  deps.users.set(adminEmail, adminUser);
  await deps.dbUpsertUser(adminUser);
}

export function registerSuperAdminRoutes(app: express.Express, deps: SuperAdminDeps) {
  const kycUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max per KYC document
  });

  function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = deps.getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized. Super Admin authentication required.' });
    }
    if (user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access forbidden. SUPER_ADMIN role required.' });
    }
    if (user.accountStatus === 'suspended' || user.accountStatus === 'terminated') {
      return res.status(403).json({ error: 'Super Admin account is inactive.' });
    }
    touchAdminSessionMeta(extractBearerToken(req));
    (req as any).superAdmin = user;
    next();
  }

  async function revokeUserSessions(userId: string) {
    for (const [token, sess] of deps.sessions.entries()) {
      if (sess.userId === userId) {
        deps.sessions.delete(token);
        await deps.dbDeleteSession(token);
      }
    }
    if (isDatabaseEnabled()) {
      const pool = getDbPool();
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    }
  }

  // ======================== 1. SUPER ADMIN AUTHENTICATION (NO OTP) ========================

  // One-time bootstrap endpoint (only works if SUPER_ADMIN has no password yet and matches SUPER_ADMIN_BOOTSTRAP_SECRET)
  app.post('/api/super-admin/bootstrap', deps.authRateLimiter, async (req, res) => {
    const adminEmail = getMainSuperAdminEmail();
    const existing = deps.users.get(adminEmail);
    if (existing && existing.role === 'SUPER_ADMIN' && existing.passwordHash) {
      return res.status(403).json({ error: 'Super Admin account is already bootstrapped.' });
    }

    const expectedSecret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET?.trim();
    if (!expectedSecret) {
      return res.status(503).json({
        error: 'SUPER_ADMIN_BOOTSTRAP_SECRET is not configured on the server. Set it in Render environment variables before bootstrapping.'
      });
    }

    const { password, bootstrapSecret } = req.body || {};
    const providedSecret = typeof bootstrapSecret === 'string' ? bootstrapSecret.trim() : '';
    const expectedBuf = Buffer.from(expectedSecret, 'utf8');
    const providedBuf = Buffer.from(providedSecret, 'utf8');
    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return res.status(403).json({ error: 'Invalid bootstrap secret.' });
    }

    if (!password || String(password).length < 10) {
      return res.status(400).json({ error: 'A strong password (minimum 10 characters) is required.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const adminUser = {
      id: existing?.id || 'super-admin-001',
      fullName: 'Rudraatma Super Admin',
      email: adminEmail,
      country: 'India',
      passwordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
      accountStatus: 'active' as AccountStatus,
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    deps.users.set(adminEmail, adminUser);
    await deps.dbUpsertUser(adminUser);
    await deps.recordAudit(adminEmail, 'SUPER_ADMIN', 'SUPER_ADMIN_BOOTSTRAP', 'user', adminUser.id, 'Initial Super Admin account bootstrapped.');

    return res.json({ success: true, message: 'Super Admin bootstrapped successfully.' });
  });

  // Super Admin Login (Email + Password, NO Email OTP)
  app.post('/api/super-admin/login', deps.authRateLimiter, async (req, res) => {
    const { email, password, twoFactorPin } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const attemptKey = `sa:${normalizedEmail}`;
    const attempt = deps.failedLoginAttempts.get(attemptKey);
    if (attempt && attempt.lockedUntil > Date.now()) {
      const minutesLeft = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        error: `Super Admin login temporarily locked due to repeated failed attempts. Try again in ${minutesLeft} minute(s).`
      });
    }

    const user = deps.users.get(normalizedEmail);
    if (!user || user.role !== 'SUPER_ADMIN') {
      const curr = deps.failedLoginAttempts.get(attemptKey) || { count: 0, lockedUntil: 0, lastAttempt: Date.now() };
      curr.count += 1;
      curr.lastAttempt = Date.now();
      if (curr.count >= 5) curr.lockedUntil = Date.now() + 15 * 60 * 1000;
      deps.failedLoginAttempts.set(attemptKey, curr);
      await deps.recordAudit(
        normalizedEmail,
        'UNKNOWN',
        'SUPER_ADMIN_LOGIN_FAILED',
        'security',
        attemptKey,
        `Failed Super Admin login attempt (${curr.count}/5) from IP ${req.ip || 'unknown'}: account not found or insufficient role.`
      );
      return res.status(401).json({ error: 'Invalid Super Admin credentials.' });
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
      const curr = deps.failedLoginAttempts.get(attemptKey) || { count: 0, lockedUntil: 0, lastAttempt: Date.now() };
      curr.count += 1;
      curr.lastAttempt = Date.now();
      if (curr.count >= 5) curr.lockedUntil = Date.now() + 15 * 60 * 1000;
      deps.failedLoginAttempts.set(attemptKey, curr);
      await deps.recordAudit(
        normalizedEmail,
        'SUPER_ADMIN',
        'SUPER_ADMIN_LOGIN_FAILED',
        'security',
        user.id,
        `Failed Super Admin password verification (${curr.count}/5) from IP ${req.ip || 'unknown'}.`
      );
      return res.status(401).json({ error: 'Invalid Super Admin credentials.' });
    }

    const twoFactorConfigured = Boolean(
      deps.platformSettings.adminTwoFactorEnabled && deps.platformSettings.adminTotpPinHash
    );
    if (twoFactorConfigured) {
      if (!twoFactorPin || !String(twoFactorPin).trim()) {
        return res.json({
          success: false,
          requiresTwoFactor: true,
          message: 'Two-Factor Security PIN is required.'
        });
      }
      const pinValid = await bcrypt.compare(
        String(twoFactorPin).trim(),
        String(deps.platformSettings.adminTotpPinHash)
      );
      if (!pinValid) {
        const curr = deps.failedLoginAttempts.get(attemptKey) || { count: 0, lockedUntil: 0, lastAttempt: Date.now() };
        curr.count += 1;
        curr.lastAttempt = Date.now();
        if (curr.count >= 5) curr.lockedUntil = Date.now() + 15 * 60 * 1000;
        deps.failedLoginAttempts.set(attemptKey, curr);
        await deps.recordAudit(
          normalizedEmail,
          'SUPER_ADMIN',
          'SUPER_ADMIN_LOGIN_FAILED',
          'security',
          user.id,
          `Failed Super Admin 2FA PIN check (${curr.count}/5) from IP ${req.ip || 'unknown'}.`
        );
        return res.status(401).json({ error: 'Invalid Two-Factor Security PIN.', requiresTwoFactor: true });
      }
    }

    deps.failedLoginAttempts.delete(attemptKey);

    const now = Date.now();
    const sessionToken = 'sa_sess_' + crypto.randomBytes(28).toString('hex');
    const sessionRecord = {
      token: sessionToken,
      userId: user.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + 30 * 60 * 1000 // 30-minute idle executive session (ephemeral)
    };
    deps.sessions.set(sessionToken, sessionRecord);
    recordAdminSessionMeta(sessionToken, user, req.ip, twoFactorConfigured);

    await deps.recordAudit(
      user.email,
      'SUPER_ADMIN',
      'SUPER_ADMIN_LOGIN',
      'session',
      user.id,
      `Super Admin authenticated from IP ${req.ip || 'unknown'}${twoFactorConfigured ? ' (2FA PIN verified)' : ''}.`
    );

    return res.json({
      success: true,
      token: sessionToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        country: user.country,
        role: user.role
      }
    });
  });

  // Protected email relay diagnostic check for Super Admin (never exposes GOOGLE_SCRIPT_URL or GOOGLE_SCRIPT_SECRET)
  app.post('/api/super-admin/test-smtp', requireSuperAdmin, async (_req, res) => {
    const result = await verifyAppsScriptNetworkReadiness();

    if (result.missingConfig) {
      return res.status(503).json({
        connected: false,
        ...result.diagnostics,
        error: result.error
      });
    }

    if (!result.connected) {
      return res.status(502).json({
        connected: false,
        ...result.diagnostics,
        error: result.error
      });
    }

    return res.json({
      connected: true,
      ...result.diagnostics
    });
  });

  // Read-only OTP email template preview using dummy data (never creates active OTPs or dispatches emails)
  app.post('/api/super-admin/otp-email-preview', requireSuperAdmin, (req, res) => {
    const rawPurpose = String(req.body?.purpose || 'signup').trim().toLowerCase();
    const purpose: 'signup' | 'login' | 'reset' =
      rawPurpose === 'login' || rawPurpose === 'reset' ? rawPurpose : 'signup';

    const rawDummyOtp = String(req.body?.dummyOtp || '').replace(/\D/g, '').slice(0, 6);
    const dummyOtp = /^\d{6}$/.test(rawDummyOtp) ? rawDummyOtp : '482917';

    const rawEmail = String(req.body?.recipientEmail || '').trim().toLowerCase();
    const recipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
      ? rawEmail
      : 'artist.preview@rudraatmamusic.com';

    const rendered = buildOtpEmailTemplate({
      otp: dummyOtp,
      purpose,
      recipientEmail,
      expiryMinutes: OTP_EXPIRY_MINUTES
    });

    return res.json({
      previewOnly: true,
      purpose,
      dummyOtp,
      recipientEmail,
      senderEmail: OFFICIAL_COMPANY_EMAIL,
      websiteUrl: OFFICIAL_WEBSITE_URL,
      expiryMinutes: OTP_EXPIRY_MINUTES,
      subject: rendered.subject,
      htmlBody: rendered.htmlBody,
      textBody: rendered.textBody
    });
  });

  // ======================== 2. OVERVIEW & CHARTS ========================

  app.get('/api/super-admin/overview', requireSuperAdmin, async (req, res) => {
    const includeTest = req.query.includeTest === 'true';
    const rawRange = String(req.query.range || '30d').toLowerCase();
    const range: '7d' | '30d' | '90d' = rawRange === '7d' || rawRange === '90d' ? rawRange : '30d';
    const emptyAiCtx = {
      aiJobs: new Map(),
      aiResults: new Map(),
      releaseAppeals: [],
      aiAuditLogs: []
    };
    const snapshot = await loadLivePlatformSnapshot(deps, emptyAiCtx, { includeTest });
    if (!snapshot.ok) {
      return res.status(503).json({
        dataUnavailable: true,
        error: snapshot.error || 'Database unavailable for analytics.',
        _integrity: {
          dataSource: snapshot.dataSource,
          connectionStatus: snapshot.connectionStatus,
          lastSyncedAt: snapshot.lastSyncedAt,
          latencyMs: snapshot.latencyMs,
          excludedTestCounts: snapshot.excludedTestCounts
        }
      });
    }

    const allUsers = snapshot.users;
    const allReleases = snapshot.releases;
    const activeSubscriptions = snapshot.subscriptions.filter(s => s.status === 'active').length;
    const orders = snapshot.orders;
    const successfulOrders = snapshot.paidOrders;
    const failedOrders = snapshot.failedOrders;
    const refundedOrders = snapshot.refundedOrders;
    const pendingOrders = snapshot.pendingOrders;
    const totalRevenue = successfulOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);

    const openTicketsCount =
      Array.from(snapshot.dashboards.values()).reduce(
        (acc, d: any) => acc + (d.tickets || []).filter((t: any) => (t.status || 'Open') !== 'Resolved').length,
        0
      ) +
      snapshot.contactSubmissions.filter(c => (c.status || 'Open') !== 'Resolved').length +
      snapshot.artistFeedbacks.filter(f => (f.status || 'Open') !== 'Resolved').length;

    const kpis = {
      totalRegisteredUsers: allUsers.length,
      activeUsers: allUsers.filter(u => u.isActive && (u.accountStatus || 'active') === 'active').length,
      pendingKycVerification: allUsers.filter(u => u.kyc?.status === 'Pending').length,
      approvedProfiles: allUsers.filter(u => u.kyc?.status === 'Approved').length,
      rejectedProfiles: allUsers.filter(u => u.kyc?.status === 'Rejected' || u.kyc?.status === 'Reupload Required').length,
      suspendedUsers: allUsers.filter(u => u.accountStatus === 'suspended').length,
      terminatedAccounts: allUsers.filter(u => u.accountStatus === 'terminated').length,
      totalReleases: allReleases.length,
      draftReleases: allReleases.filter(r => r.status === 'Draft').length,
      pendingReleaseReviews: allReleases.filter(r => r.status === 'Submitted' || r.status === 'Under Review').length,
      approvedReleases: allReleases.filter(r => r.status === 'Approved').length,
      publishedReleases: allReleases.filter(r => r.status === 'Live' || r.status === 'Published' || r.status === 'Delivered').length,
      rejectedReleases: allReleases.filter(r => r.status === 'Rejected' || r.status === 'Action Required').length,
      takedownRequests: snapshot.takedownRequests.length,
      activeSubscriptions,
      totalPayments: orders.length,
      successfulPayments: successfulOrders.length,
      pendingPayments: pendingOrders.length,
      failedPayments: failedOrders.length,
      refundedPayments: refundedOrders.length,
      totalRevenue,
      openSupportTickets: openTicketsCount
    };

    // Build honest time-bucketed charts for 7d / 30d / 90d (strictly real DB records, 0 when empty)
    const nowMs = Date.now();
    const daysCount = range === '7d' ? 7 : range === '30d' ? 30 : 90;
    const bucketSizeDays = range === '7d' ? 1 : range === '30d' ? 5 : 15;
    const bucketCount = Math.ceil(daysCount / bucketSizeDays);

    const buckets: Array<{ label: string; startMs: number; endMs: number }> = [];
    for (let i = bucketCount - 1; i >= 0; i--) {
      const endMs = nowMs - i * bucketSizeDays * 86400000;
      const startMs = endMs - bucketSizeDays * 86400000;
      const d = new Date(endMs);
      const label =
        range === '7d'
          ? d.toLocaleDateString('en-US', { weekday: 'short' })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      buckets.push({ label, startMs, endMs });
    }

    const firstStartMs = buckets[0]?.startMs ?? 0;
    let cumulativeUsers = allUsers.filter(u => {
      const ts = new Date(u.createdAt || 0).getTime();
      return ts > 0 && ts < firstStartMs;
    }).length;

    const userGrowth = buckets.map(b => {
      const newUsers = allUsers.filter(u => {
        const ts = new Date(u.createdAt || 0).getTime();
        return ts >= b.startMs && ts <= b.endMs;
      }).length;
      cumulativeUsers += newUsers;
      return { month: b.label, newUsers, totalUsers: cumulativeUsers };
    });

    const revenueTrend = buckets.map(b => {
      const bucketOrders = successfulOrders.filter(o => {
        const ts = new Date(o.paidAt || o.createdAt || 0).getTime();
        return ts >= b.startMs && ts <= b.endMs;
      });
      const revenue = bucketOrders.reduce((s, o) => s + Number(o.amount || 0), 0);
      const releasesCount = allReleases.filter(r => {
        const ts = new Date(r.submittedAt || r.releaseDate || 0).getTime();
        return ts >= b.startMs && ts <= b.endMs;
      }).length;
      return { month: b.label, revenue, orders: bucketOrders.length, releases: releasesCount };
    });

    const releaseStatusBreakdown = [
      { name: 'Published / Live', value: kpis.publishedReleases, color: '#10b981' },
      { name: 'Approved', value: kpis.approvedReleases, color: '#d4af37' },
      { name: 'Pending Review', value: kpis.pendingReleaseReviews, color: '#f59e0b' },
      { name: 'Rejected / Action Req', value: kpis.rejectedReleases, color: '#ef4444' },
      { name: 'Draft', value: kpis.draftReleases, color: '#64748b' }
    ];

    const platformActivity = buckets.map(b => {
      const adminActions = snapshot.auditLogs.filter(l => {
        const ts = new Date(l.timestamp || 0).getTime();
        return ts >= b.startMs && ts <= b.endMs;
      }).length;
      const releases = allReleases.filter(r => {
        const ts = new Date(r.submittedAt || r.releaseDate || 0).getTime();
        return ts >= b.startMs && ts <= b.endMs;
      }).length;
      const payments = successfulOrders.filter(o => {
        const ts = new Date(o.paidAt || o.createdAt || 0).getTime();
        return ts >= b.startMs && ts <= b.endMs;
      }).length;
      return { day: b.label, adminActions, releases, payments };
    });

    // Top-performing content from real catalog & verified tracks
    const topContent = allReleases
      .map(r => {
        const tracksCount = Array.isArray(r.tracks) ? r.tracks.length : 1;
        const verifiedStreams = Number(r.streams || r.totalStreams || 0);
        return {
          id: r.id,
          title: r.title,
          artist: r.artist,
          type: r.type || 'Single',
          status: r.status,
          tracksCount,
          streams: verifiedStreams,
          submittedAt: r.submittedAt || r.releaseDate || ''
        };
      })
      .sort((a, b) => (b.streams - a.streams) || (new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime()))
      .slice(0, 6);

    // Real recent activity stream across users, releases, orders, and audits
    const recentActivity = [
      ...allUsers.map(u => ({
        id: `act_u_${u.id}`,
        kind: 'user' as const,
        title: `Artist registered: ${u.fullName}`,
        subtitle: `${u.email} · ${u.country || 'India'}`,
        timestamp: u.createdAt
      })),
      ...allReleases.map(r => ({
        id: `act_r_${r.id}`,
        kind: 'release' as const,
        title: `Release ${r.status}: ${r.title}`,
        subtitle: `${r.artist} · ${r.ownerEmail || ''}`,
        timestamp: r.lastReviewedAt || r.submittedAt || r.releaseDate || new Date().toISOString()
      })),
      ...orders.map(o => ({
        id: `act_o_${o.orderId}`,
        kind: 'payment' as const,
        title: `Order ${o.status}: ₹${Number(o.amount || 0).toLocaleString('en-IN')}`,
        subtitle: `${o.planName || o.planId} · ${o.userEmail || ''}`,
        timestamp: o.paidAt || o.createdAt
      })),
      ...snapshot.auditLogs.slice(-20).map(l => ({
        id: `act_a_${l.id}`,
        kind: 'audit' as const,
        title: l.action,
        subtitle: `${l.actorEmail} · ${l.details}`,
        timestamp: l.timestamp
      }))
    ]
      .filter(item => item.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    return res.json({
      dataUnavailable: false,
      range,
      kpis,
      charts: {
        userGrowth,
        revenueTrend,
        releaseStatusBreakdown,
        platformActivity
      },
      topContent,
      recentActivity,
      _integrity: {
        dataSource: snapshot.dataSource,
        connectionStatus: snapshot.connectionStatus,
        lastSyncedAt: snapshot.lastSyncedAt,
        latencyMs: snapshot.latencyMs,
        includeTest: snapshot.includeTest,
        excludedTestCounts: snapshot.excludedTestCounts
      }
    });
  });

  // ======================== 3 & 5. USER MANAGEMENT & TERMINATION ========================

  app.get('/api/super-admin/users', requireSuperAdmin, async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || 'all').toLowerCase();
    const kycFilter = String(req.query.kyc || 'all').toLowerCase();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const includeTest = req.query.includeTest === 'true';

    const snapshot = await loadLivePlatformSnapshot(
      deps,
      { aiJobs: new Map(), aiResults: new Map(), releaseAppeals: [], aiAuditLogs: [] },
      { includeTest }
    );
    if (!snapshot.ok) {
      return res.status(503).json({ dataUnavailable: true, error: snapshot.error });
    }

    const list = snapshot.users
      .map(u => {
        const dash = snapshot.dashboards.get(u.id);
        const orders = snapshot.orders.filter(o => o.userId === u.id);
        return {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          country: u.country,
          role: u.role,
          isActive: u.isActive,
          isTestRecord: Boolean(u.isTestRecord || isTestOrDemoUser(u)),
          accountStatus: (u.accountStatus || 'active') as AccountStatus,
          statusReason: u.statusReason || '',
          createdAt: u.createdAt,
          selectedPlanId: u.selectedPlanId,
          profileCompletion: computeProfileCompletion(u),
          kycStatus: (u.kyc?.status || 'Not Submitted') as KycStatus,
          servicesUnlocked: Boolean(u.kyc?.servicesUnlocked),
          releasesCount: dash?.releases?.length || 0,
          subscriptionStatus: dash?.subscription?.status || 'none',
          planName: dash?.subscription?.planName || 'None',
          totalSpent: orders.filter(o => o.status === 'paid').reduce((s, o) => s + Number(o.amount || 0), 0),
          paymentsCount: orders.length
        };
      })
      .filter(u => {
        if (q && !u.fullName.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q) && !u.id.toLowerCase().includes(q)) {
          return false;
        }
        if (statusFilter !== 'all' && u.accountStatus !== statusFilter) return false;
        if (kycFilter !== 'all' && u.kycStatus.toLowerCase() !== kycFilter) return false;
        if (dateFrom && u.createdAt.slice(0, 10) < dateFrom) return false;
        if (dateTo && u.createdAt.slice(0, 10) > dateTo) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({
      users: list,
      total: list.length,
      _integrity: {
        dataSource: snapshot.dataSource,
        connectionStatus: snapshot.connectionStatus,
        lastSyncedAt: snapshot.lastSyncedAt,
        excludedTestCounts: snapshot.excludedTestCounts
      }
    });
  });

  app.get('/api/super-admin/users/:userId', requireSuperAdmin, (req, res) => {
    const target = Array.from(deps.users.values()).find(u => u.id === req.params.userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const dash = deps.getUserDashboard(target.id);
    const orders = Array.from(deps.razorpayOrders.values()).filter(o => o.userId === target.id);
    const activity = deps.auditLogs
      .filter(l => l.actorEmail === target.email || l.entityId === target.id)
      .slice(-40)
      .reverse();

    return res.json({
      user: {
        id: target.id,
        fullName: target.fullName,
        email: target.email,
        country: target.country,
        role: target.role,
        isActive: target.isActive,
        accountStatus: target.accountStatus || 'active',
        statusReason: target.statusReason || '',
        createdAt: target.createdAt,
        selectedPlanId: target.selectedPlanId,
        profileCompletion: computeProfileCompletion(target),
        kyc: target.kyc || null
      },
      subscription: dash.subscription || null,
      releases: dash.releases || [],
      payments: orders,
      transactions: dash.transactions || [],
      tickets: dash.tickets || [],
      activity
    });
  });

  app.post('/api/super-admin/users/:userId/status', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const target = Array.from(deps.users.values()).find(u => u.id === req.params.userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    if (target.email === getMainSuperAdminEmail() || target.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Main Super Admin account is protected and cannot be suspended or terminated.' });
    }

    const { action, reason } = req.body || {};
    if (!['suspend', 'reactivate', 'terminate'].includes(action)) {
      return res.status(400).json({ error: 'Invalid status action. Must be suspend, reactivate, or terminate.' });
    }
    if ((action === 'suspend' || action === 'terminate') && (!reason || !String(reason).trim())) {
      return res.status(400).json({ error: 'A mandatory reason is required to suspend or terminate an account.' });
    }

    const previousStatus = target.accountStatus || 'active';
    if (action === 'suspend') {
      target.accountStatus = 'suspended';
      target.statusReason = String(reason).trim();
      await revokeUserSessions(target.id);
    } else if (action === 'terminate') {
      target.accountStatus = 'terminated';
      target.statusReason = String(reason).trim();
      await revokeUserSessions(target.id);
    } else if (action === 'reactivate') {
      if (previousStatus === 'terminated' && !req.body?.forceReactivate) {
        return res.status(400).json({ error: 'Terminated accounts require explicit confirmation to restore.' });
      }
      target.accountStatus = 'active';
      target.statusReason = String(reason || 'Reactivated by Super Admin').trim();
    }

    await deps.dbUpsertUser(target);
    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      `USER_${action.toUpperCase()}`,
      'user',
      target.id,
      `Changed account ${target.email} from ${previousStatus} to ${target.accountStatus}. Reason: ${target.statusReason}`
    );

    return res.json({
      success: true,
      accountStatus: target.accountStatus,
      statusReason: target.statusReason
    });
  });

  // ======================== 4. KYC APPROVAL MANAGEMENT ========================

  app.get('/api/super-admin/kyc', requireSuperAdmin, async (req, res) => {
    const statusFilter = String(req.query.status || 'all').toLowerCase();
    const includeTest = req.query.includeTest === 'true';

    const snapshot = await loadLivePlatformSnapshot(
      deps,
      { aiJobs: new Map(), aiResults: new Map(), releaseAppeals: [], aiAuditLogs: [] },
      { includeTest }
    );
    if (!snapshot.ok) {
      return res.status(503).json({ dataUnavailable: true, error: snapshot.error });
    }

    const records = snapshot.users
      .map(u => ({
        userId: u.id,
        fullName: u.fullName,
        email: u.email,
        country: u.country,
        accountStatus: u.accountStatus || 'active',
        isTestRecord: Boolean(u.isTestRecord),
        profileCompletion: computeProfileCompletion(u),
        kyc: u.kyc || { status: 'Not Submitted', servicesUnlocked: false }
      }))
      .filter(r => {
        if (statusFilter === 'all') return r.kyc.status !== 'Not Submitted' || req.query.includeUnsubmitted === 'true';
        return r.kyc.status.toLowerCase() === statusFilter;
      })
      .sort((a, b) => {
        const order: Record<string, number> = { Pending: 0, 'Reupload Required': 1, Rejected: 2, Approved: 3, 'Not Submitted': 4 };
        return (order[a.kyc.status] ?? 5) - (order[b.kyc.status] ?? 5);
      });

    return res.json({
      records,
      _integrity: {
        dataSource: snapshot.dataSource,
        connectionStatus: snapshot.connectionStatus,
        lastSyncedAt: snapshot.lastSyncedAt,
        excludedTestCounts: snapshot.excludedTestCounts
      }
    });
  });

  app.post('/api/super-admin/kyc/:userId/review', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const target = Array.from(deps.users.values()).find(u => u.id === req.params.userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (!target.kyc) return res.status(400).json({ error: 'User has not submitted KYC documents.' });

    const { decision, reason } = req.body || {};
    if (!['approve', 'reject', 'request_reupload'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approve, reject, or request_reupload.' });
    }
    if ((decision === 'reject' || decision === 'request_reupload') && (!reason || !String(reason).trim())) {
      return res.status(400).json({ error: 'A clear reason is required when rejecting or requesting re-upload.' });
    }

    target.kyc.reviewedAt = new Date().toISOString();
    target.kyc.reviewedBy = admin.email;

    if (decision === 'approve') {
      target.kyc.status = 'Approved';
      target.kyc.servicesUnlocked = true;
      target.kyc.rejectionReason = undefined;
    } else if (decision === 'reject') {
      target.kyc.status = 'Rejected';
      target.kyc.servicesUnlocked = false;
      target.kyc.rejectionReason = String(reason).trim();
    } else {
      target.kyc.status = 'Reupload Required';
      target.kyc.servicesUnlocked = false;
      target.kyc.rejectionReason = String(reason).trim();
    }

    await deps.dbUpsertUser(target);
    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      `KYC_${decision.toUpperCase()}`,
      'kyc',
      target.id,
      `KYC ${target.kyc.status} for ${target.email}${reason ? ` — Reason: ${reason}` : ''}`
    );

    return res.json({ success: true, kyc: target.kyc });
  });

  // Private audit-logged KYC document endpoint (ONLY Super Admin or owning user via Authorization Bearer header)
  app.get('/api/super-admin/kyc/document/:fileId', async (req, res) => {
    const viewer = deps.getAuthenticatedUser(req);
    if (!viewer) return res.status(401).json({ error: 'Unauthorized.' });

    const { fileId } = req.params;
    let ownerUserId: string | null = null;
    for (const u of deps.users.values()) {
      const k = u.kyc;
      if (
        k &&
        (k.aadhaarFrontFileId === fileId ||
          k.aadhaarBackFileId === fileId ||
          k.panCardFileId === fileId ||
          k.profilePhotoFileId === fileId)
      ) {
        ownerUserId = u.id;
        break;
      }
    }

    if (viewer.role !== 'SUPER_ADMIN' && viewer.id !== ownerUserId) {
      return res.status(403).json({ error: 'Access forbidden to private KYC document.' });
    }

    if (viewer.role === 'SUPER_ADMIN') {
      await deps.recordAudit(
        viewer.email,
        'SUPER_ADMIN',
        'KYC_DOCUMENT_VIEWED',
        'kyc_file',
        fileId,
        `Viewed private KYC document ${fileId} (owner: ${ownerUserId || 'unknown'}).`
      );
    }

    const stored = await getStoredMedia(fileId);
    if (stored) {
      res.setHeader('Content-Type', stored.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${stored.originalName}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(stored.buffer);
    }

    // Local dev fallback
    if (fs.existsSync(deps.localKycDir)) {
      const files = fs.readdirSync(deps.localKycDir);
      const match = files.find(f => f.startsWith(fileId));
      if (match) {
        res.setHeader('Cache-Control', 'no-store');
        return res.sendFile(path.join(deps.localKycDir, match));
      }
    }

    return res.status(404).json({ error: 'KYC document not found.' });
  });

  // ======================== 6. RELEASE MANAGEMENT ========================

  app.get('/api/super-admin/releases', requireSuperAdmin, async (req, res) => {
    const statusFilter = String(req.query.status || 'all').toLowerCase();
    const q = String(req.query.q || '').trim().toLowerCase();
    const includeTest = req.query.includeTest === 'true';

    const snapshot = await loadLivePlatformSnapshot(
      deps,
      { aiJobs: new Map(), aiResults: new Map(), releaseAppeals: [], aiAuditLogs: [] },
      { includeTest }
    );
    if (!snapshot.ok) {
      return res.status(503).json({ dataUnavailable: true, error: snapshot.error });
    }

    const filtered = snapshot.releases
      .filter(r => {
        if (statusFilter === 'pending') {
          if (r.status !== 'Submitted' && r.status !== 'Under Review') return false;
        } else if (statusFilter === 'published') {
          if (r.status !== 'Live' && r.status !== 'Published' && r.status !== 'Delivered') return false;
        } else if (statusFilter !== 'all' && r.status.toLowerCase() !== statusFilter) {
          return false;
        }
        if (
          q &&
          !r.title.toLowerCase().includes(q) &&
          !r.artist.toLowerCase().includes(q) &&
          !(r.upc || '').toLowerCase().includes(q) &&
          !(r.ownerEmail || '').toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());

    return res.json({
      releases: filtered,
      takedownRequests: snapshot.takedownRequests,
      _integrity: {
        dataSource: snapshot.dataSource,
        connectionStatus: snapshot.connectionStatus,
        lastSyncedAt: snapshot.lastSyncedAt,
        excludedTestCounts: snapshot.excludedTestCounts
      }
    });
  });

  app.post('/api/super-admin/releases/:id/review', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { id } = req.params;
    const { action, reason, notes } = req.body || {};

    if (!['approve', 'reject', 'request_corrections', 'publish'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve, publish, reject, or request_corrections.' });
    }
    if ((action === 'reject' || action === 'request_corrections') && (!reason || !String(reason).trim())) {
      return res.status(400).json({ error: 'A clear reason is required when rejecting or requesting corrections.' });
    }

    let foundRelease: any = null;
    let ownerUserId: string | null = null;
    let ownerDash: any = null;

    for (const [uid, dash] of deps.userDashboards.entries()) {
      const match = (dash.releases || []).find((r: any) => r.id === id);
      if (match) {
        foundRelease = match;
        ownerUserId = uid;
        ownerDash = dash;
        break;
      }
    }

    if (!foundRelease || !ownerUserId || !ownerDash) {
      return res.status(404).json({ error: 'Release not found.' });
    }

    foundRelease.lastReviewedAt = new Date().toISOString();
    foundRelease.adminReviewNotes = notes || reason || '';

    let notifType: 'approved' | 'rejected' | 'changes_requested' = 'approved';
    let notifTitle = 'Release Approved!';
    let notifMessage = `Your release "${foundRelease.title}" has been approved by Rudraatma Super Admin.`;

    if (action === 'approve') {
      foundRelease.status = 'Approved';
      foundRelease.adminRejectReason = undefined;
      foundRelease.adminChangesRequired = undefined;
    } else if (action === 'publish') {
      foundRelease.status = 'Live';
      foundRelease.publishedAt = new Date().toISOString();
      foundRelease.adminRejectReason = undefined;
      foundRelease.adminChangesRequired = undefined;
      notifTitle = 'Release Published Live!';
      notifMessage = `Your release "${foundRelease.title}" is now marked Live by Rudraatma Super Admin.`;
    } else if (action === 'reject') {
      foundRelease.status = 'Rejected';
      foundRelease.adminRejectReason = String(reason).trim();
      notifType = 'rejected';
      notifTitle = 'Release Rejected';
      notifMessage = `Your release "${foundRelease.title}" was rejected: ${foundRelease.adminRejectReason}`;
    } else {
      foundRelease.status = 'Action Required';
      foundRelease.adminChangesRequired = String(reason).trim();
      notifType = 'changes_requested';
      notifTitle = 'Corrections Requested';
      notifMessage = `Corrections required for "${foundRelease.title}": ${foundRelease.adminChangesRequired}`;
    }

    const notif = {
      id: 'notif_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      recipient_user_id: ownerUserId,
      release_id: foundRelease.id,
      notification_type: notifType,
      title: notifTitle,
      message: notifMessage,
      admin_reason: reason || notes || '',
      release_title: foundRelease.title,
      artist_name: foundRelease.artist,
      artwork_url: foundRelease.artworkUrl || foundRelease.coverUrl,
      created_at: new Date().toISOString(),
      expires_at: Date.now() + 48 * 3600 * 1000
    };

    deps.notifications.set(notif.id, notif);
    await deps.dbSaveNotification({ ...notif, userId: ownerUserId });
    await deps.dbSaveDashboard(ownerUserId, ownerDash);
    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      `RELEASE_${action.toUpperCase()}`,
      'release',
      foundRelease.id,
      `${foundRelease.title} (${foundRelease.artist}) -> ${foundRelease.status}${reason ? ` | Reason: ${reason}` : ''}`
    );

    return res.json({ success: true, release: foundRelease });
  });

  // ======================== 7. SUBSCRIPTION & PAYMENT MANAGEMENT ========================

  app.get('/api/super-admin/payments', requireSuperAdmin, async (req, res) => {
    const includeTest = req.query.includeTest === 'true';
    const snapshot = await loadLivePlatformSnapshot(
      deps,
      { aiJobs: new Map(), aiResults: new Map(), releaseAppeals: [], aiAuditLogs: [] },
      { includeTest }
    );
    if (!snapshot.ok) {
      return res.status(503).json({ dataUnavailable: true, error: snapshot.error });
    }

    const orders = snapshot.orders
      .map(o => ({
        orderId: o.orderId,
        userId: o.userId,
        userEmail: o.userEmail,
        userName: o.userName,
        planId: o.planId,
        planName: o.planName,
        planType: o.planType,
        amount: o.amount,
        currency: o.currency,
        status: o.status,
        paymentId: o.paymentId || '',
        failureReason: o.failureReason || '',
        createdAt: o.createdAt,
        paidAt: o.paidAt || '',
        refundedAt: o.refundedAt || '',
        refundReason: o.refundReason || '',
        isTestMode: Boolean(o.isTestMode || o.isTestRecord)
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const paidOrders = orders.filter(o => o.status === 'paid');
    const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.amount || 0), 0);
    const failedCount = orders.filter(o => o.status === 'failed' || o.status === 'cancelled').length;

    return res.json({
      orders,
      subscriptions: snapshot.subscriptions,
      summary: {
        totalOrders: orders.length,
        paidOrders: paidOrders.length,
        pendingOrders: orders.filter(o => o.status === 'created' || o.status === 'pending').length,
        failedOrders: failedCount,
        refundedOrders: orders.filter(o => o.status === 'refunded').length,
        totalRevenue
      },
      _integrity: {
        dataSource: snapshot.dataSource,
        connectionStatus: snapshot.connectionStatus,
        lastSyncedAt: snapshot.lastSyncedAt,
        excludedTestCounts: snapshot.excludedTestCounts
      }
    });
  });

  app.post('/api/super-admin/payments/:orderId/refund', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const order = deps.razorpayOrders.get(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Payment order not found.' });
    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'Only paid orders can be marked for refund.' });
    }

    const reason = String(req.body?.reason || 'Refunded by Super Admin').trim();
    order.status = 'refunded';
    order.refundedAt = new Date().toISOString();
    order.refundReason = reason;
    await deps.dbSaveOrder(order);

    const dash = deps.userDashboards.get(order.userId);
    if (dash) {
      dash.transactions = dash.transactions || [];
      dash.transactions.unshift({
        id: 'tx-ref-' + Date.now().toString().slice(-6),
        type: 'Refund',
        amount: order.amount,
        description: `Refund for ${order.planName} (${order.orderId})`,
        status: 'Completed',
        reference: order.paymentId || order.orderId,
        date: new Date().toISOString().split('T')[0]
      });
      if (req.body?.revokeSubscription && dash.subscription?.orderId === order.orderId) {
        dash.subscription.status = 'revoked';
        dash.subscription.autoRenew = false;
      }
      await deps.dbSaveDashboard(order.userId, dash);
    }

    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      'PAYMENT_REFUNDED',
      'payment',
      order.orderId,
      `Marked order ${order.orderId} (₹${order.amount}) for ${order.userEmail} as refunded. Reason: ${reason}`
    );

    return res.json({ success: true, order });
  });

  // ======================== 8. REVIEWS & SUPPORT MANAGEMENT ========================

  app.get('/api/super-admin/support', requireSuperAdmin, (_req, res) => {
    const tickets: any[] = [];
    for (const u of deps.users.values()) {
      if (u.role === 'SUPER_ADMIN') continue;
      const dash = deps.userDashboards.get(u.id);
      for (const t of dash?.tickets || []) {
        tickets.push({
          ...t,
          sourceType: 'ticket',
          priority: t.priority || 'Medium',
          assignedTo: t.assignedTo || 'Unassigned',
          resolutionHistory: t.resolutionHistory || [],
          userId: u.id,
          userName: u.fullName,
          userEmail: u.email
        });
      }
    }

    const contacts = deps.contactSubmissions.map(c => ({
      ...c,
      sourceType: 'contact',
      priority: c.priority || 'Medium',
      assignedTo: c.assignedTo || 'Unassigned',
      resolutionHistory: c.resolutionHistory || [],
      status: c.status || 'Open'
    }));

    const feedbacks = deps.artistFeedbacks.map(f => ({
      ...f,
      sourceType: 'feedback',
      priority: f.priority || 'Low',
      assignedTo: f.assignedTo || 'Unassigned',
      resolutionHistory: f.resolutionHistory || [],
      status: f.status || 'Open'
    }));

    return res.json({ tickets, contacts, feedbacks });
  });

  app.post('/api/super-admin/support/:id/respond', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { id } = req.params;
    const { sourceType, status, response, priority, assignedTo } = req.body || {};

    if (!response || !String(response).trim()) {
      return res.status(400).json({ error: 'Admin response message is required.' });
    }

    const validPriority = ['Low', 'Medium', 'High', 'Urgent'].includes(String(priority))
      ? String(priority)
      : undefined;
    const historyEntry = {
      id: 'hist_' + Date.now(),
      actor: admin.email,
      status: status || 'Resolved',
      priority: validPriority,
      assignedTo: assignedTo ? String(assignedTo).trim() : undefined,
      note: String(response).trim(),
      timestamp: new Date().toISOString()
    };

    if (sourceType === 'ticket') {
      for (const [uid, dash] of deps.userDashboards.entries()) {
        const ticket = (dash.tickets || []).find((t: any) => t.id === id);
        if (ticket) {
          ticket.status = status || 'Resolved';
          if (validPriority) ticket.priority = validPriority;
          if (assignedTo !== undefined) ticket.assignedTo = String(assignedTo).trim() || 'Unassigned';
          ticket.updatedAt = new Date().toISOString();
          ticket.resolutionHistory = ticket.resolutionHistory || [];
          ticket.resolutionHistory.unshift(historyEntry);
          ticket.messages = ticket.messages || [];
          ticket.messages.push({
            sender: 'Rudraatma Support (Super Admin)',
            text: String(response).trim(),
            time: new Date().toISOString()
          });
          await deps.dbSaveDashboard(uid, dash);
          await deps.recordAudit(admin.email, 'SUPER_ADMIN', 'SUPPORT_TICKET_RESPONDED', 'ticket', id, `Updated ticket ${id} to ${ticket.status}${validPriority ? ` (Priority: ${validPriority})` : ''}`);
          return res.json({ success: true, item: ticket });
        }
      }
      return res.status(404).json({ error: 'Support ticket not found.' });
    }

    if (sourceType === 'contact') {
      const contact = deps.contactSubmissions.find(c => c.id === id);
      if (!contact) return res.status(404).json({ error: 'Contact inquiry not found.' });
      contact.status = status || 'Resolved';
      if (validPriority) contact.priority = validPriority;
      if (assignedTo !== undefined) contact.assignedTo = String(assignedTo).trim() || 'Unassigned';
      contact.adminResponse = String(response).trim();
      contact.respondedAt = new Date().toISOString();
      contact.resolutionHistory = contact.resolutionHistory || [];
      contact.resolutionHistory.unshift(historyEntry);
      await deps.dbSavePlatformSetting('contact_submissions', deps.contactSubmissions);
      await deps.recordAudit(admin.email, 'SUPER_ADMIN', 'CONTACT_RESPONDED', 'contact', id, `Responded to contact inquiry ${id}`);
      return res.json({ success: true, item: contact });
    }

    if (sourceType === 'feedback') {
      const fb = deps.artistFeedbacks.find(f => f.id === id);
      if (!fb) return res.status(404).json({ error: 'Feedback entry not found.' });
      fb.status = status || 'Resolved';
      if (validPriority) fb.priority = validPriority;
      if (assignedTo !== undefined) fb.assignedTo = String(assignedTo).trim() || 'Unassigned';
      fb.adminResponse = String(response).trim();
      fb.respondedAt = new Date().toISOString();
      fb.resolutionHistory = fb.resolutionHistory || [];
      fb.resolutionHistory.unshift(historyEntry);
      await deps.dbSavePlatformSetting('artist_feedbacks', deps.artistFeedbacks);
      await deps.recordAudit(admin.email, 'SUPER_ADMIN', 'FEEDBACK_RESPONDED', 'feedback', id, `Responded to artist review/feedback ${id}`);
      return res.json({ success: true, item: fb });
    }

    return res.status(400).json({ error: 'Invalid sourceType.' });
  });

  // ======================== 9. ADMIN ACTIVITY & SECURITY AUDIT LOG ========================

  app.get('/api/super-admin/audit-logs', requireSuperAdmin, async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const actionFilter = String(req.query.action || 'all').toLowerCase();

    const snapshot = await loadLivePlatformSnapshot(
      deps,
      { aiJobs: new Map(), aiResults: new Map(), releaseAppeals: [], aiAuditLogs: [] },
      { includeTest: true }
    );
    if (!snapshot.ok) {
      return res.status(503).json({ dataUnavailable: true, error: snapshot.error });
    }

    const logs = [...snapshot.auditLogs]
      .reverse()
      .filter(l => {
        if (actionFilter !== 'all' && !String(l.action || '').toLowerCase().includes(actionFilter)) return false;
        if (
          q &&
          !String(l.actorEmail || '').toLowerCase().includes(q) &&
          !String(l.action || '').toLowerCase().includes(q) &&
          !String(l.details || '').toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .slice(0, 300);

    return res.json({
      logs,
      _integrity: {
        dataSource: snapshot.dataSource,
        connectionStatus: snapshot.connectionStatus,
        lastSyncedAt: snapshot.lastSyncedAt
      }
    });
  });

  // ======================== 10. PLATFORM SETTINGS & BROADCASTS ========================

  app.get('/api/super-admin/settings', requireSuperAdmin, (_req, res) => {
    const emailConfig = getSafeEmailDiagnostics();
    const safeSettings = {
      ...deps.platformSettings,
      adminTotpPinHash: undefined,
      hasAdminTwoFactorPin: Boolean(deps.platformSettings.adminTotpPinHash)
    };
    return res.json({
      settings: safeSettings,
      plans: Object.values(deps.PLAN_CATALOG),
      emailConfig,
      gatewayConfig: {
        razorpayKeyConfigured: Boolean(process.env.RAZORPAY_KEY_ID?.trim()),
        razorpaySecretConfigured: Boolean(process.env.RAZORPAY_KEY_SECRET?.trim()),
        webhookSecretConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET?.trim())
      }
    });
  });

  app.put('/api/super-admin/settings', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const body = req.body || {};

    if (typeof body.maintenanceMode === 'boolean') deps.platformSettings.maintenanceMode = body.maintenanceMode;
    if (typeof body.maintenanceMessage === 'string') deps.platformSettings.maintenanceMessage = body.maintenanceMessage;
    if (typeof body.websiteAnnouncement === 'string') deps.platformSettings.websiteAnnouncement = body.websiteAnnouncement;
    if (typeof body.homepageBannerTitle === 'string') deps.platformSettings.homepageBannerTitle = body.homepageBannerTitle;
    if (typeof body.homepageBannerSubtitle === 'string') deps.platformSettings.homepageBannerSubtitle = body.homepageBannerSubtitle;
    if (typeof body.seoTitle === 'string') deps.platformSettings.seoTitle = body.seoTitle;
    if (typeof body.seoDescription === 'string') deps.platformSettings.seoDescription = body.seoDescription;
    if (typeof body.adsEnabled === 'boolean') deps.platformSettings.adsEnabled = body.adsEnabled;
    if (typeof body.analyticsId === 'string') deps.platformSettings.analyticsId = body.analyticsId.trim();

    if (body.services && typeof body.services === 'object') {
      deps.platformSettings.services = { ...deps.platformSettings.services, ...body.services };
    }
    if (body.paymentSettings && typeof body.paymentSettings === 'object') {
      deps.platformSettings.paymentSettings = { ...deps.platformSettings.paymentSettings, ...body.paymentSettings };
    }
    if (body.platformPolicies && typeof body.platformPolicies === 'object') {
      deps.platformSettings.platformPolicies = { ...deps.platformSettings.platformPolicies, ...body.platformPolicies };
    }
    if (typeof body.adminTwoFactorEnabled === 'boolean') {
      deps.platformSettings.adminTwoFactorEnabled = body.adminTwoFactorEnabled;
    }
    if (body.newAdminTwoFactorPin && String(body.newAdminTwoFactorPin).trim().length >= 4) {
      deps.platformSettings.adminTotpPinHash = await bcrypt.hash(String(body.newAdminTwoFactorPin).trim(), 10);
    }

    // Optional plan price & catalog configuration updates
    if (Array.isArray(body.planUpdates)) {
      for (const upd of body.planUpdates) {
        if (upd.id && deps.PLAN_CATALOG[upd.id]) {
          if (typeof upd.priceINR === 'number' && upd.priceINR >= 0) {
            deps.PLAN_CATALOG[upd.id].priceINR = upd.priceINR;
            deps.PLAN_CATALOG[upd.id].amountPaise = Math.round(upd.priceINR * 100);
          }
          if (typeof upd.name === 'string' && upd.name.trim()) {
            deps.PLAN_CATALOG[upd.id].name = upd.name.trim();
          }
          if (typeof upd.enabled === 'boolean') {
            deps.PLAN_CATALOG[upd.id].enabled = upd.enabled;
          }
          if (typeof upd.validityDays === 'number' && upd.validityDays > 0) {
            deps.PLAN_CATALOG[upd.id].validityDays = upd.validityDays;
          }
        }
      }
      await deps.dbSavePlatformSetting('plan_catalog_overrides', deps.PLAN_CATALOG);
    }

    await deps.dbSavePlatformSetting('platform_settings', deps.platformSettings);
    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      'PLATFORM_SETTINGS_UPDATED',
      'settings',
      'global',
      `Updated platform settings (maintenanceMode=${deps.platformSettings.maintenanceMode}, 2FA=${deps.platformSettings.adminTwoFactorEnabled}).`
    );

    return res.json({
      success: true,
      settings: {
        ...deps.platformSettings,
        adminTotpPinHash: undefined,
        hasAdminTwoFactorPin: Boolean(deps.platformSettings.adminTotpPinHash)
      },
      plans: Object.values(deps.PLAN_CATALOG)
    });
  });

  app.post('/api/super-admin/notifications/broadcast', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { title, message } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ error: 'Broadcast title and message are required.' });
    }

    let count = 0;
    for (const u of deps.users.values()) {
      if (u.role === 'SUPER_ADMIN' || !u.isActive || u.accountStatus === 'terminated') continue;
      const notif = {
        id: 'bcast_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        recipient_user_id: u.id,
        release_id: 'platform-broadcast',
        notification_type: 'approved',
        title: String(title).trim(),
        message: String(message).trim(),
        release_title: 'Platform Announcement',
        artist_name: 'Rudraatma Music',
        created_at: new Date().toISOString(),
        expires_at: Date.now() + 72 * 3600 * 1000
      };
      deps.notifications.set(notif.id, notif);
      await deps.dbSaveNotification({ ...notif, userId: u.id });
      count++;
    }

    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      'BROADCAST_SENT',
      'notification',
      'all_users',
      `Broadcast "${String(title).trim()}" delivered to ${count} active users.`
    );

    return res.json({ success: true, deliveredCount: count });
  });

  // Public platform status endpoint (for maintenance banner, announcements & safe public website config)
  app.get('/api/public/platform-status', (_req, res) => {
    return res.json({
      maintenanceMode: deps.platformSettings.maintenanceMode,
      maintenanceMessage: deps.platformSettings.maintenanceMessage,
      websiteAnnouncement: deps.platformSettings.websiteAnnouncement,
      homepageBannerTitle: deps.platformSettings.homepageBannerTitle,
      homepageBannerSubtitle: deps.platformSettings.homepageBannerSubtitle,
      seoTitle: deps.platformSettings.seoTitle,
      seoDescription: deps.platformSettings.seoDescription,
      adsEnabled: deps.platformSettings.adsEnabled,
      services: deps.platformSettings.services
    });
  });

  // ======================== ARTIST PROFILE & KYC SUBMISSION ROUTES ========================

  app.get('/api/profile', (req, res) => {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    return res.json({
      profile: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        country: user.country,
        role: user.role,
        accountStatus: user.accountStatus || 'active',
        profileCompletion: computeProfileCompletion(user),
        kyc: user.kyc || { status: 'Not Submitted', servicesUnlocked: false }
      }
    });
  });

  app.put('/api/profile', async (req, res) => {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const { fullName, country, role } = req.body || {};
    if (fullName && String(fullName).trim()) user.fullName = String(fullName).trim();
    if (country && String(country).trim()) user.country = String(country).trim();
    // Strictly prevent privilege escalation via profile update
    if (role && (role === 'artist' || role === 'label_manager') && user.role !== 'SUPER_ADMIN' && user.role !== 'admin') {
      user.role = role;
    }

    await deps.dbUpsertUser(user);
    return res.json({
      success: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        country: user.country,
        role: user.role,
        selectedPlanId: user.selectedPlanId
      },
      profileCompletion: computeProfileCompletion(user)
    });
  });

  app.post('/api/profile/kyc/upload', kycUpload.single('file'), async (req, res) => {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const file = req.file;
    const docType = String(req.body?.docType || 'document');
    if (!file) return res.status(400).json({ error: 'No document file uploaded.' });

    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMime.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Only JPG, PNG, WebP, or PDF documents are accepted for KYC.' });
    }

    const stored = await saveUploadedMedia({
      userId: user.id,
      category: 'kyc',
      originalName: `${docType}-${file.originalname}`,
      mimeType: file.mimetype,
      buffer: file.buffer,
      localUploadDir: deps.localKycDir
    });

    return res.json({
      success: true,
      fileId: stored.id,
      fileUrl: stored.fileUrl,
      fileName: stored.fileName
    });
  });

  app.post('/api/profile/kyc', async (req, res) => {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const {
      fullLegalName,
      dateOfBirth,
      address,
      mobileNumber,
      aadhaarNumberLast4,
      panNumber,
      aadhaarFrontFileId,
      aadhaarFrontUrl,
      aadhaarBackFileId,
      aadhaarBackUrl,
      panCardFileId,
      panCardUrl,
      profilePhotoFileId,
      profilePhotoUrl
    } = req.body || {};

    if (!fullLegalName || !dateOfBirth || !address || !mobileNumber) {
      return res.status(400).json({ error: 'Full Legal Name, Date of Birth, Address, and Mobile Number are required.' });
    }

    const existingKyc: Partial<UserKycRecord> = user.kyc || {};
    const kycRecord: UserKycRecord = {
      status: 'Pending',
      fullLegalName: String(fullLegalName).trim(),
      dateOfBirth: String(dateOfBirth).trim(),
      address: String(address).trim(),
      mobileNumber: String(mobileNumber).trim(),
      aadhaarNumberLast4: aadhaarNumberLast4 ? String(aadhaarNumberLast4).trim().slice(-4) : existingKyc.aadhaarNumberLast4,
      panNumber: panNumber ? String(panNumber).trim().toUpperCase() : existingKyc.panNumber,
      aadhaarFrontFileId: aadhaarFrontFileId || existingKyc.aadhaarFrontFileId,
      aadhaarFrontUrl: aadhaarFrontUrl || existingKyc.aadhaarFrontUrl,
      aadhaarBackFileId: aadhaarBackFileId || existingKyc.aadhaarBackFileId,
      aadhaarBackUrl: aadhaarBackUrl || existingKyc.aadhaarBackUrl,
      panCardFileId: panCardFileId || existingKyc.panCardFileId,
      panCardUrl: panCardUrl || existingKyc.panCardUrl,
      profilePhotoFileId: profilePhotoFileId || existingKyc.profilePhotoFileId,
      profilePhotoUrl: profilePhotoUrl || existingKyc.profilePhotoUrl,
      submittedAt: new Date().toISOString(),
      servicesUnlocked: false
    };

    user.kyc = kycRecord;
    await deps.dbUpsertUser(user);
    await deps.recordAudit(user.email, user.role, 'KYC_SUBMITTED', 'kyc', user.id, `User ${user.email} submitted KYC documents for verification.`);

    return res.json({
      success: true,
      kyc: kycRecord,
      profileCompletion: computeProfileCompletion(user)
    });
  });
}
