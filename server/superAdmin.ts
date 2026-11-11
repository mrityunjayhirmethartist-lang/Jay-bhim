import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { getDbPool, isDatabaseEnabled } from './db';
import { saveUploadedMedia, getStoredMedia } from './storage';

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
  } else if (!passwordHash && process.env.NODE_ENV !== 'production') {
    // Development-only initial bootstrap credential when env var is omitted
    passwordHash = await bcrypt.hash('RudraSuperAdmin@2026', 12);
    console.log(`[SuperAdmin Bootstrap] Initialized development SUPER_ADMIN (${adminEmail}) via one-time bootstrap.`);
  }

  if (!passwordHash) {
    console.warn(
      `[SuperAdmin Bootstrap] SUPER_ADMIN_PASSWORD or SUPER_ADMIN_PASSWORD_HASH is not set for ${adminEmail}. Set env vars or call POST /api/super-admin/bootstrap.`
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

  // One-time bootstrap endpoint (only works if SUPER_ADMIN has no password yet and matches BOOTSTRAP_SECRET if configured)
  app.post('/api/super-admin/bootstrap', deps.authRateLimiter, async (req, res) => {
    const adminEmail = getMainSuperAdminEmail();
    const existing = deps.users.get(adminEmail);
    if (existing && existing.role === 'SUPER_ADMIN' && existing.passwordHash) {
      return res.status(403).json({ error: 'Super Admin account is already bootstrapped.' });
    }

    const { password, bootstrapSecret } = req.body || {};
    const expectedSecret = process.env.SUPER_ADMIN_BOOTSTRAP_SECRET?.trim();
    if (expectedSecret && bootstrapSecret !== expectedSecret) {
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
      return res.status(401).json({ error: 'Invalid Super Admin credentials.' });
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash);
    if (!valid) {
      const curr = deps.failedLoginAttempts.get(attemptKey) || { count: 0, lockedUntil: 0, lastAttempt: Date.now() };
      curr.count += 1;
      curr.lastAttempt = Date.now();
      if (curr.count >= 5) curr.lockedUntil = Date.now() + 15 * 60 * 1000;
      deps.failedLoginAttempts.set(attemptKey, curr);
      return res.status(401).json({ error: 'Invalid Super Admin credentials.' });
    }

    // Optional Two-Factor Security PIN if enabled in Platform Settings
    if (deps.platformSettings.adminTwoFactorEnabled && deps.platformSettings.adminTotpPinHash) {
      if (!twoFactorPin) {
        return res.status(200).json({
          success: false,
          requiresTwoFactor: true,
          message: 'Two-factor security PIN is enabled for Super Admin.'
        });
      }
      const pinValid = await bcrypt.compare(String(twoFactorPin), deps.platformSettings.adminTotpPinHash);
      if (!pinValid) {
        return res.status(401).json({ error: 'Invalid two-factor security PIN.' });
      }
    }

    deps.failedLoginAttempts.delete(attemptKey);

    const sessionToken = 'sa_sess_' + crypto.randomBytes(28).toString('hex');
    const sessionRecord = {
      token: sessionToken,
      userId: user.id,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000 // 12-hour executive session
    };
    deps.sessions.set(sessionToken, sessionRecord);
    await deps.dbSaveSession(sessionRecord);

    await deps.recordAudit(
      user.email,
      'SUPER_ADMIN',
      'SUPER_ADMIN_LOGIN',
      'session',
      user.id,
      `Super Admin authenticated from IP ${req.ip || 'unknown'} (no email OTP required).`
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

  // ======================== 2. OVERVIEW & CHARTS ========================

  app.get('/api/super-admin/overview', requireSuperAdmin, (_req, res) => {
    const allUsers = Array.from(deps.users.values()).filter(u => u.role !== 'SUPER_ADMIN');
    const allReleases: any[] = [];
    let activeSubscriptions = 0;

    for (const u of allUsers) {
      const dash = deps.userDashboards.get(u.id);
      if (dash) {
        for (const r of dash.releases || []) {
          allReleases.push(r);
        }
        if (dash.subscription?.status === 'active') {
          activeSubscriptions++;
        }
      }
    }

    const orders = Array.from(deps.razorpayOrders.values());
    const successfulOrders = orders.filter(o => o.status === 'paid');
    const failedOrders = orders.filter(o => o.status === 'failed' || o.status === 'cancelled');
    const totalRevenue = successfulOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0);

    const kpis = {
      totalRegisteredUsers: allUsers.length,
      activeUsers: allUsers.filter(u => u.isActive && (u.accountStatus || 'active') === 'active').length,
      pendingKycVerification: allUsers.filter(u => u.kyc?.status === 'Pending').length,
      approvedProfiles: allUsers.filter(u => u.kyc?.status === 'Approved').length,
      rejectedProfiles: allUsers.filter(u => u.kyc?.status === 'Rejected' || u.kyc?.status === 'Reupload Required').length,
      suspendedUsers: allUsers.filter(u => u.accountStatus === 'suspended').length,
      terminatedAccounts: allUsers.filter(u => u.accountStatus === 'terminated').length,
      totalReleases: allReleases.length,
      pendingReleaseReviews: allReleases.filter(r => r.status === 'Submitted' || r.status === 'Under Review').length,
      approvedReleases: allReleases.filter(r => r.status === 'Approved' || r.status === 'Delivered' || r.status === 'Live').length,
      rejectedReleases: allReleases.filter(r => r.status === 'Rejected' || r.status === 'Action Required').length,
      activeSubscriptions,
      totalPayments: orders.length,
      successfulPayments: successfulOrders.length,
      failedPayments: failedOrders.length,
      totalRevenue
    };

    // Build chart data (last 6 months)
    const now = new Date();
    const months: Array<{ key: string; label: string }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      months.push({ key, label });
    }

    let cumulativeUsers = allUsers.filter(u => {
      const ym = (u.createdAt || '').slice(0, 7);
      return ym && ym < months[0].key;
    }).length;

    const userGrowth = months.map(m => {
      const newUsers = allUsers.filter(u => (u.createdAt || '').slice(0, 7) === m.key).length;
      cumulativeUsers += newUsers;
      return { month: m.label, newUsers, totalUsers: cumulativeUsers };
    });

    const revenueTrend = months.map(m => {
      const monthOrders = successfulOrders.filter(o => (o.paidAt || o.createdAt || '').slice(0, 7) === m.key);
      const revenue = monthOrders.reduce((s, o) => s + Number(o.amount || 0), 0);
      const releasesCount = allReleases.filter(r => (r.submittedAt || '').slice(0, 7) === m.key).length;
      return { month: m.label, revenue, orders: monthOrders.length, releases: releasesCount };
    });

    const releaseStatusBreakdown = [
      { name: 'Approved / Live', value: kpis.approvedReleases, color: '#d4af37' },
      { name: 'Pending Review', value: kpis.pendingReleaseReviews, color: '#f59e0b' },
      { name: 'Rejected / Action Req', value: kpis.rejectedReleases, color: '#ef4444' },
      { name: 'Draft', value: allReleases.filter(r => r.status === 'Draft').length, color: '#64748b' }
    ];

    // 7-day platform activity
    const platformActivity = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dayKey = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
      const adminActions = deps.auditLogs.filter(l => (l.timestamp || '').slice(0, 10) === dayKey).length;
      const releases = allReleases.filter(r => (r.submittedAt || '').slice(0, 10) === dayKey).length;
      const payments = orders.filter(o => (o.createdAt || '').slice(0, 10) === dayKey).length;
      platformActivity.push({ day: dayLabel, adminActions, releases, payments });
    }

    return res.json({
      kpis,
      charts: {
        userGrowth,
        revenueTrend,
        releaseStatusBreakdown,
        platformActivity
      }
    });
  });

  // ======================== 3 & 5. USER MANAGEMENT & TERMINATION ========================

  app.get('/api/super-admin/users', requireSuperAdmin, (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || 'all').toLowerCase();
    const kycFilter = String(req.query.kyc || 'all').toLowerCase();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();

    const list = Array.from(deps.users.values())
      .filter(u => u.role !== 'SUPER_ADMIN')
      .map(u => {
        const dash = deps.userDashboards.get(u.id);
        const orders = Array.from(deps.razorpayOrders.values()).filter(o => o.userId === u.id);
        return {
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          country: u.country,
          role: u.role,
          isActive: u.isActive,
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

    return res.json({ users: list, total: list.length });
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

  app.get('/api/super-admin/kyc', requireSuperAdmin, (req, res) => {
    const statusFilter = String(req.query.status || 'all').toLowerCase();

    const records = Array.from(deps.users.values())
      .filter(u => u.role !== 'SUPER_ADMIN')
      .map(u => ({
        userId: u.id,
        fullName: u.fullName,
        email: u.email,
        country: u.country,
        accountStatus: u.accountStatus || 'active',
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

    return res.json({ records });
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

  // Private audit-logged KYC document endpoint (ONLY Super Admin or owning user)
  app.get('/api/super-admin/kyc/document/:fileId', async (req, res) => {
    const authReq = req as any;
    // Support Bearer header or ?token= for img/iframe preview
    if (!req.headers.authorization && req.query.token) {
      authReq.headers.authorization = `Bearer ${String(req.query.token)}`;
    }
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

  app.get('/api/super-admin/releases', requireSuperAdmin, (req, res) => {
    const statusFilter = String(req.query.status || 'all').toLowerCase();
    const q = String(req.query.q || '').trim().toLowerCase();

    const releases: any[] = [];
    for (const u of deps.users.values()) {
      if (u.role === 'SUPER_ADMIN') continue;
      const dash = deps.userDashboards.get(u.id);
      for (const r of dash?.releases || []) {
        releases.push({
          ...r,
          ownerName: u.fullName,
          ownerEmail: u.email,
          ownerAccountStatus: u.accountStatus || 'active'
        });
      }
    }

    const filtered = releases
      .filter(r => {
        if (statusFilter !== 'all' && r.status.toLowerCase() !== statusFilter) return false;
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
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    return res.json({ releases: filtered });
  });

  app.post('/api/super-admin/releases/:id/review', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { id } = req.params;
    const { action, reason, notes } = req.body || {};

    if (!['approve', 'reject', 'request_corrections'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve, reject, or request_corrections.' });
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

  app.get('/api/super-admin/payments', requireSuperAdmin, (_req, res) => {
    const orders = Array.from(deps.razorpayOrders.values())
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
        isTestMode: Boolean(o.isTestMode)
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const subscriptions: any[] = [];
    for (const u of deps.users.values()) {
      if (u.role === 'SUPER_ADMIN') continue;
      const dash = deps.userDashboards.get(u.id);
      if (dash?.subscription) {
        subscriptions.push({
          userId: u.id,
          userEmail: u.email,
          userName: u.fullName,
          ...dash.subscription
        });
      }
    }

    const totalRevenue = orders.filter(o => o.status === 'paid').reduce((s, o) => s + Number(o.amount || 0), 0);
    const failedCount = orders.filter(o => o.status === 'failed' || o.status === 'cancelled').length;

    return res.json({
      orders,
      subscriptions,
      summary: {
        totalOrders: orders.length,
        paidOrders: orders.filter(o => o.status === 'paid').length,
        failedOrders: failedCount,
        refundedOrders: orders.filter(o => o.status === 'refunded').length,
        totalRevenue
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
          userId: u.id,
          userName: u.fullName,
          userEmail: u.email
        });
      }
    }

    const contacts = deps.contactSubmissions.map(c => ({
      ...c,
      sourceType: 'contact',
      status: c.status || 'Open'
    }));

    const feedbacks = deps.artistFeedbacks.map(f => ({
      ...f,
      sourceType: 'feedback',
      status: f.status || 'Open'
    }));

    return res.json({ tickets, contacts, feedbacks });
  });

  app.post('/api/super-admin/support/:id/respond', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { id } = req.params;
    const { sourceType, status, response } = req.body || {};

    if (!response || !String(response).trim()) {
      return res.status(400).json({ error: 'Admin response message is required.' });
    }

    if (sourceType === 'ticket') {
      for (const [uid, dash] of deps.userDashboards.entries()) {
        const ticket = (dash.tickets || []).find((t: any) => t.id === id);
        if (ticket) {
          ticket.status = status || 'Resolved';
          ticket.updatedAt = new Date().toISOString();
          ticket.messages = ticket.messages || [];
          ticket.messages.push({
            sender: 'Rudraatma Support (Super Admin)',
            text: String(response).trim(),
            time: new Date().toISOString()
          });
          await deps.dbSaveDashboard(uid, dash);
          await deps.recordAudit(admin.email, 'SUPER_ADMIN', 'SUPPORT_TICKET_RESPONDED', 'ticket', id, `Updated ticket ${id} to ${ticket.status}`);
          return res.json({ success: true, item: ticket });
        }
      }
      return res.status(404).json({ error: 'Support ticket not found.' });
    }

    if (sourceType === 'contact') {
      const contact = deps.contactSubmissions.find(c => c.id === id);
      if (!contact) return res.status(404).json({ error: 'Contact inquiry not found.' });
      contact.status = status || 'Resolved';
      contact.adminResponse = String(response).trim();
      contact.respondedAt = new Date().toISOString();
      await deps.dbSavePlatformSetting('contact_submissions', deps.contactSubmissions);
      await deps.recordAudit(admin.email, 'SUPER_ADMIN', 'CONTACT_RESPONDED', 'contact', id, `Responded to contact inquiry ${id}`);
      return res.json({ success: true, item: contact });
    }

    if (sourceType === 'feedback') {
      const fb = deps.artistFeedbacks.find(f => f.id === id);
      if (!fb) return res.status(404).json({ error: 'Feedback entry not found.' });
      fb.status = status || 'Resolved';
      fb.adminResponse = String(response).trim();
      fb.respondedAt = new Date().toISOString();
      await deps.dbSavePlatformSetting('artist_feedbacks', deps.artistFeedbacks);
      await deps.recordAudit(admin.email, 'SUPER_ADMIN', 'FEEDBACK_RESPONDED', 'feedback', id, `Responded to artist review/feedback ${id}`);
      return res.json({ success: true, item: fb });
    }

    return res.status(400).json({ error: 'Invalid sourceType.' });
  });

  // ======================== 9. ADMIN ACTIVITY & SECURITY AUDIT LOG ========================

  app.get('/api/super-admin/audit-logs', requireSuperAdmin, (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const actionFilter = String(req.query.action || 'all').toLowerCase();

    const logs = [...deps.auditLogs]
      .reverse()
      .filter(l => {
        if (actionFilter !== 'all' && !l.action.toLowerCase().includes(actionFilter)) return false;
        if (
          q &&
          !l.actorEmail.toLowerCase().includes(q) &&
          !l.action.toLowerCase().includes(q) &&
          !l.details.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .slice(0, 300);

    return res.json({ logs });
  });

  // ======================== 10. PLATFORM SETTINGS & BROADCASTS ========================

  app.get('/api/super-admin/settings', requireSuperAdmin, (_req, res) => {
    const safeSettings = {
      ...deps.platformSettings,
      adminTotpPinHash: undefined,
      hasAdminTwoFactorPin: Boolean(deps.platformSettings.adminTotpPinHash)
    };
    return res.json({
      settings: safeSettings,
      plans: Object.values(deps.PLAN_CATALOG)
    });
  });

  app.put('/api/super-admin/settings', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const body = req.body || {};

    if (typeof body.maintenanceMode === 'boolean') deps.platformSettings.maintenanceMode = body.maintenanceMode;
    if (typeof body.maintenanceMessage === 'string') deps.platformSettings.maintenanceMessage = body.maintenanceMessage;
    if (typeof body.websiteAnnouncement === 'string') deps.platformSettings.websiteAnnouncement = body.websiteAnnouncement;

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

    // Optional plan price updates
    if (Array.isArray(body.planUpdates)) {
      for (const upd of body.planUpdates) {
        if (upd.id && deps.PLAN_CATALOG[upd.id] && typeof upd.priceINR === 'number' && upd.priceINR >= 0) {
          deps.PLAN_CATALOG[upd.id].priceINR = upd.priceINR;
          if (typeof upd.name === 'string' && upd.name.trim()) {
            deps.PLAN_CATALOG[upd.id].name = upd.name.trim();
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

  // Public platform status endpoint (for maintenance banner & announcements)
  app.get('/api/public/platform-status', (_req, res) => {
    return res.json({
      maintenanceMode: deps.platformSettings.maintenanceMode,
      maintenanceMessage: deps.platformSettings.maintenanceMessage,
      websiteAnnouncement: deps.platformSettings.websiteAnnouncement,
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
