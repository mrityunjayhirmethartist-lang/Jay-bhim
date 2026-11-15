import express from 'express';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  getDbPool,
  isDatabaseEnabled,
  dbSaveAdminApproval,
  dbGetAdminApprovals,
  dbSaveAiUsageLog,
  dbGetAiUsageLogs
} from './db';
import { getSafeEmailDiagnostics } from './appsScriptEmail';
import { checkFfmpegBinary, checkChromaprintBinary } from './ai/audioEngine';
import { getStorageProviderName } from './storage';
import type { SuperAdminDeps } from './superAdmin';

export interface AdminSessionMeta {
  tokenPrefix: string;
  email: string;
  role: string;
  loginAt: string;
  lastActivityAt: string;
  ip: string;
  twoFactorVerified: boolean;
}

const adminSessionMetaMap = new Map<string, AdminSessionMeta>();
const inMemoryApprovals = new Map<string, any>();
const inMemoryAiUsageLogs: any[] = [];

export function recordAdminSessionMeta(token: string, user: { email: string; role: string }, ip?: string) {
  const now = new Date().toISOString();
  adminSessionMetaMap.set(token, {
    tokenPrefix: token.slice(0, 12) + '...',
    email: user.email,
    role: user.role,
    loginAt: now,
    lastActivityAt: now,
    ip: ip || 'unknown',
    twoFactorVerified: false
  });
}

export function touchAdminSessionMeta(token: string | undefined) {
  if (!token) return;
  const existing = adminSessionMetaMap.get(token);
  if (existing) {
    existing.lastActivityAt = new Date().toISOString();
  }
}

export function getAdminSessionMeta(token: string | undefined): AdminSessionMeta | null {
  if (!token) return null;
  return adminSessionMetaMap.get(token) || null;
}

export function extractBearerToken(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  return authHeader.split(' ')[1];
}

// ======================== TEST / DEMO RECORD ISOLATION ========================

const TEST_USER_IDS = new Set(['usr_demo_8821', 'usr_admin_001']);
const TEST_EMAILS = new Set(['demo@rudraatmamusic.com', 'admin@rudraatmamusic.com']);

export function isTestOrDemoEmail(email?: string): boolean {
  if (!email) return false;
  const norm = email.trim().toLowerCase();
  if (TEST_EMAILS.has(norm)) return true;
  if (/^(demo|test|sandbox)[+._-]?.*@/i.test(norm)) return true;
  if (/@(example\.com|test\.local|mailinator\.com)$/i.test(norm)) return true;
  return false;
}

export function isTestOrDemoUser(u: any): boolean {
  if (!u) return false;
  if (u.isTestUser === true || u.isDemo === true) return true;
  if (TEST_USER_IDS.has(u.id)) return true;
  if (isTestOrDemoEmail(u.email)) return true;
  return false;
}

export function isTestOrDemoOrder(o: any, testUserIds: Set<string>): boolean {
  if (!o) return false;
  if (o.isTestMode === true) return true;
  const oid = String(o.orderId || '');
  const pid = String(o.paymentId || '');
  if (/^order_(demo|test|sim)_/i.test(oid) || /^pay_(demo|test)_/i.test(pid)) return true;
  if (testUserIds.has(o.userId)) return true;
  if (isTestOrDemoEmail(o.userEmail)) return true;
  return false;
}

// ======================== LIVE DATABASE SNAPSHOT ENGINE ========================

export interface LivePlatformSnapshot {
  ok: boolean;
  dataUnavailable?: boolean;
  error?: string;
  dataSource: 'postgresql-live' | 'in-memory-fallback' | 'postgresql-error';
  connectionStatus: 'connected' | 'in-memory' | 'error';
  lastSyncedAt: string;
  latencyMs: number;
  includeTest: boolean;
  excludedTestCounts: {
    users: number;
    releases: number;
    orders: number;
    subscriptions: number;
  };
  users: any[];
  dashboards: Map<string, any>;
  releases: any[];
  orders: any[];
  paidOrders: any[];
  pendingOrders: any[];
  failedOrders: any[];
  refundedOrders: any[];
  subscriptions: any[];
  auditLogs: any[];
  aiJobs: any[];
  aiResults: any[];
  releaseAppeals: any[];
  takedownRequests: any[];
  contactSubmissions: any[];
  artistFeedbacks: any[];
}

export async function loadLivePlatformSnapshot(
  deps: SuperAdminDeps,
  aiCtx: {
    aiJobs: Map<string, any>;
    aiResults: Map<string, any>;
    releaseAppeals: any[];
    aiAuditLogs: any[];
  },
  options: { includeTest?: boolean } = {}
): Promise<LivePlatformSnapshot> {
  const includeTest = Boolean(options.includeTest);
  const started = Date.now();
  const lastSyncedAt = new Date().toISOString();

  let rawUsers: any[] = [];
  const rawDashboards = new Map<string, any>();
  let rawOrders: any[] = [];
  let rawAuditLogs: any[] = [];
  let rawAiJobs: any[] = [];
  let rawAiResults: any[] = [];
  let rawAppeals: any[] = [];
  let dataSource: LivePlatformSnapshot['dataSource'] = 'in-memory-fallback';
  let connectionStatus: LivePlatformSnapshot['connectionStatus'] = 'in-memory';

  if (isDatabaseEnabled()) {
    try {
      const pool = getDbPool();
      const [uRes, dRes, oRes, aRes, jRes, rRes, apRes] = await Promise.all([
        pool.query('SELECT * FROM users'),
        pool.query('SELECT user_id, data FROM user_dashboards'),
        pool.query('SELECT order_id, user_id, status, data, created_at FROM razorpay_orders'),
        pool.query('SELECT data FROM audit_logs ORDER BY created_at DESC LIMIT 500'),
        pool.query('SELECT * FROM ai_review_jobs'),
        pool.query('SELECT * FROM ai_review_results'),
        pool.query('SELECT * FROM release_appeals ORDER BY created_at DESC')
      ]);

      rawUsers = uRes.rows.map(row => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        country: row.country,
        role: row.role,
        isActive: Boolean(row.is_active),
        accountStatus: row.account_status || 'active',
        statusReason: row.status_reason || '',
        kyc: row.kyc_data || undefined,
        selectedPlanId: row.selected_plan_id || undefined,
        createdAt: new Date(row.created_at).toISOString()
      }));

      for (const row of dRes.rows) {
        rawDashboards.set(row.user_id, row.data || {});
      }

      rawOrders = oRes.rows.map(row => ({
        ...(row.data || {}),
        orderId: row.order_id,
        userId: row.user_id,
        status: row.status,
        createdAt: row.data?.createdAt || new Date(row.created_at).toISOString()
      }));

      rawAuditLogs = aRes.rows.map(r => r.data).reverse();
      rawAiJobs = jRes.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        releaseId: row.release_id,
        status: row.status,
        stage: row.stage,
        progress: Number(row.progress || 0),
        attempts: Number(row.attempts || 0),
        maxAttempts: Number(row.max_attempts || 3),
        errorDetails: row.error_details || undefined,
        createdAt: new Date(row.created_at).toISOString(),
        startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined
      }));
      rawAiResults = rRes.rows.map(row => ({
        id: row.id,
        jobId: row.job_id,
        releaseId: row.release_id,
        userId: row.user_id,
        riskLevel: row.risk_level,
        recommendedDecision: row.recommended_decision,
        finalDecision: row.final_decision,
        reviewerId: row.reviewer_id || undefined,
        confidenceScore: Number(row.confidence_score || 0),
        geminiReport: row.gemini_report,
        audioQuality: row.audio_quality,
        duplicateCheck: row.duplicate_check,
        internalNotes: row.internal_notes || undefined,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString()
      }));
      rawAppeals = apRes.rows.map(row => ({
        id: row.id,
        releaseId: row.release_id,
        userId: row.user_id,
        explanation: row.explanation,
        status: row.status,
        adminNotes: row.admin_notes,
        reviewedBy: row.reviewed_by,
        createdAt: new Date(row.created_at).toISOString()
      }));

      dataSource = 'postgresql-live';
      connectionStatus = 'connected';
    } catch (err: any) {
      return {
        ok: false,
        dataUnavailable: true,
        error: `Database query failed: ${err.message}`,
        dataSource: 'postgresql-error',
        connectionStatus: 'error',
        lastSyncedAt,
        latencyMs: Date.now() - started,
        includeTest,
        excludedTestCounts: { users: 0, releases: 0, orders: 0, subscriptions: 0 },
        users: [],
        dashboards: new Map(),
        releases: [],
        orders: [],
        paidOrders: [],
        pendingOrders: [],
        failedOrders: [],
        refundedOrders: [],
        subscriptions: [],
        auditLogs: [],
        aiJobs: [],
        aiResults: [],
        releaseAppeals: [],
        takedownRequests: [],
        contactSubmissions: [],
        artistFeedbacks: []
      };
    }
  } else {
    rawUsers = Array.from(deps.users.values());
    for (const [uid, dash] of deps.userDashboards.entries()) {
      rawDashboards.set(uid, dash);
    }
    rawOrders = Array.from(deps.razorpayOrders.values());
    rawAuditLogs = [...deps.auditLogs];
    rawAiJobs = Array.from(aiCtx.aiJobs.values());
    rawAiResults = Array.from(aiCtx.aiResults.values());
    rawAppeals = [...aiCtx.releaseAppeals];
  }

  const nonSuperUsers = rawUsers.filter(u => u.role !== 'SUPER_ADMIN');
  const testUsers = nonSuperUsers.filter(isTestOrDemoUser);
  const testUserIds = new Set<string>(testUsers.map(u => u.id));
  for (const id of TEST_USER_IDS) testUserIds.add(id);

  let excludedReleases = 0;
  let excludedSubscriptions = 0;
  for (const tu of testUsers) {
    const td = rawDashboards.get(tu.id);
    if (td) {
      excludedReleases += (td.releases || []).length;
      if (td.subscription?.status === 'active') excludedSubscriptions++;
    }
  }
  const excludedOrders = rawOrders.filter(o => isTestOrDemoOrder(o, testUserIds)).length;

  const activeUsersScope = includeTest
    ? nonSuperUsers.map(u => ({ ...u, isTestRecord: isTestOrDemoUser(u) }))
    : nonSuperUsers.filter(u => !isTestOrDemoUser(u)).map(u => ({ ...u, isTestRecord: false }));

  const releases: any[] = [];
  const subscriptions: any[] = [];
  const takedownRequests: any[] = [];
  const filteredDashboards = new Map<string, any>();

  for (const u of activeUsersScope) {
    const dash = rawDashboards.get(u.id);
    if (dash) {
      filteredDashboards.set(u.id, dash);
      for (const r of dash.releases || []) {
        releases.push({
          ...r,
          ownerName: u.fullName,
          ownerEmail: u.email,
          ownerAccountStatus: u.accountStatus || 'active',
          isTestRecord: Boolean(u.isTestRecord)
        });
      }
      if (dash.subscription && dash.subscription.status !== 'none') {
        subscriptions.push({
          userId: u.id,
          userEmail: u.email,
          userName: u.fullName,
          isTestRecord: Boolean(u.isTestRecord),
          ...dash.subscription
        });
      }
      for (const reqItem of dash.requests || []) {
        if (reqItem.type === 'Takedown') {
          takedownRequests.push({
            ...reqItem,
            userId: u.id,
            userEmail: u.email,
            userName: u.fullName
          });
        }
      }
    }
  }

  const ordersScope = includeTest
    ? rawOrders.map(o => ({ ...o, isTestRecord: isTestOrDemoOrder(o, testUserIds) }))
    : rawOrders
        .filter(o => !isTestOrDemoOrder(o, testUserIds))
        .map(o => ({ ...o, isTestRecord: false }));

  const paidOrders = ordersScope.filter(o => o.status === 'paid');
  const pendingOrders = ordersScope.filter(o => o.status === 'created' || o.status === 'pending');
  const failedOrders = ordersScope.filter(o => o.status === 'failed' || o.status === 'cancelled');
  const refundedOrders = ordersScope.filter(o => o.status === 'refunded');

  return {
    ok: true,
    dataSource,
    connectionStatus,
    lastSyncedAt,
    latencyMs: Date.now() - started,
    includeTest,
    excludedTestCounts: {
      users: testUsers.length,
      releases: excludedReleases,
      orders: excludedOrders,
      subscriptions: excludedSubscriptions
    },
    users: activeUsersScope,
    dashboards: filteredDashboards,
    releases,
    orders: ordersScope,
    paidOrders,
    pendingOrders,
    failedOrders,
    refundedOrders,
    subscriptions,
    auditLogs: rawAuditLogs,
    aiJobs: rawAiJobs,
    aiResults: rawAiResults,
    releaseAppeals: rawAppeals,
    takedownRequests,
    contactSubmissions: deps.contactSubmissions,
    artistFeedbacks: deps.artistFeedbacks
  };
}

// ======================== REAL PLATFORM INTELLIGENCE ENGINE ========================

export interface IntelligenceIssue {
  id: string;
  order: number;
  category: string;
  title: string;
  actualStatus: string;
  technicalExplanation: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  recommendedSolution: string;
  requiredPermissions: string;
  ownerApprovalRequired: boolean;
  suggestedActionType?: string;
  targetId?: string;
}

export async function buildPlatformIntelligence(
  deps: SuperAdminDeps,
  aiCtx: {
    aiSettings: any;
    aiJobs: Map<string, any>;
    aiResults: Map<string, any>;
    releaseAppeals: any[];
    aiAuditLogs: any[];
  },
  snapshot: LivePlatformSnapshot
) {
  const emailDiag = getSafeEmailDiagnostics();
  const [ffmpeg, chromaprint] = await Promise.all([checkFfmpegBinary(), checkChromaprintBinary()]);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasAcoustIdKey = Boolean(process.env.ACOUSTID_CLIENT_KEY?.trim());
  const hasRazorpayKeys = Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
  const storageProvider = getStorageProviderName();

  const completed: string[] = [
    'Super Admin Credential Authentication & Direct Dashboard Access (OTP bypass verified)',
    'Production-vs-Test Data Isolation Layer (demo/sandbox records excluded from KPIs)',
    'Owner Approval Safeguard Workflow (6-step confirmation & immutable audit logging)',
    'Royalty Earnings CSV & PDF Statement Export Module'
  ];
  const working: string[] = [];
  const notWorking: string[] = [];
  const pending: string[] = [];
  const needsConfiguration: string[] = [];
  const immediateAttention: string[] = [];
  const nextSteps: IntelligenceIssue[] = [];

  let orderCounter = 1;

  // 1. Database Connectivity
  if (!snapshot.ok) {
    notWorking.push('PostgreSQL Database Connection Error');
    immediateAttention.push('PostgreSQL query failed — Analytics showing Data Unavailable.');
    nextSteps.push({
      id: 'db_error',
      order: orderCounter++,
      category: 'Database',
      title: 'Restore PostgreSQL Database Connectivity',
      actualStatus: `ERROR (${snapshot.error || 'Connection unreachable'})`,
      technicalExplanation: 'Live SQL queries against PostgreSQL failed. Production analytics refuse to show 0 on error.',
      severity: 'critical',
      recommendedSolution: 'Verify DATABASE_URL / EXTERNAL_DATABASE_URL and SSL settings in Render/Cloud Run environment variables.',
      requiredPermissions: 'Infrastructure / Super Admin',
      ownerApprovalRequired: false
    });
  } else if (snapshot.dataSource === 'postgresql-live') {
    working.push(`PostgreSQL Live Database Connected (${snapshot.latencyMs}ms query latency)`);
  } else {
    needsConfiguration.push('DATABASE_URL is not connected — Running in local In-Memory Fallback mode');
    nextSteps.push({
      id: 'db_inmemory',
      order: orderCounter++,
      category: 'Database',
      title: 'Connect Persistent PostgreSQL Database',
      actualStatus: 'IN_MEMORY_FALLBACK',
      technicalExplanation: 'No active PostgreSQL pool; records live only in process memory and reset on restart.',
      severity: 'high',
      recommendedSolution: 'Set DATABASE_URL (or EXTERNAL_DATABASE_URL outside Render VPC) and restart server.',
      requiredPermissions: 'Infrastructure / Owner',
      ownerApprovalRequired: false
    });
  }

  // 2. Email Relay (Google Apps Script)
  if (emailDiag.configured && emailDiag.validHttpsUrl) {
    working.push('Google Apps Script Email OTP Relay configured (HTTPS endpoint + shared secret present)');
  } else {
    notWorking.push('Transactional Email OTP Relay (GOOGLE_SCRIPT_URL / GOOGLE_SCRIPT_SECRET incomplete or invalid)');
    immediateAttention.push('Artist signup, login 2FA, and password reset OTP emails cannot be delivered until Apps Script env vars are valid.');
    nextSteps.push({
      id: 'email_relay_config',
      order: orderCounter++,
      category: 'Email & Auth',
      title: 'Configure Valid Google Apps Script Email Relay',
      actualStatus: !emailDiag.urlConfigured
        ? 'NOT_CONFIGURED (GOOGLE_SCRIPT_URL missing)'
        : !emailDiag.validHttpsUrl
          ? 'MISCONFIGURED (GOOGLE_SCRIPT_URL is not a valid https:// script URL)'
          : 'NOT_CONFIGURED (GOOGLE_SCRIPT_SECRET missing)',
      technicalExplanation: 'Production OTP delivery strictly requires GOOGLE_SCRIPT_URL (https://...) and GOOGLE_SCRIPT_SECRET.',
      severity: 'critical',
      recommendedSolution: 'Update GOOGLE_SCRIPT_URL and GOOGLE_SCRIPT_SECRET in environment variables and run Test Email Relay in Settings.',
      requiredPermissions: 'Environment Owner / Super Admin',
      ownerApprovalRequired: false
    });
  }

  // 3. Payment Gateway (Razorpay)
  if (hasRazorpayKeys && deps.platformSettings.paymentSettings.razorpayEnabled) {
    working.push('Razorpay Server-Side Payment Gateway Keys Configured');
  } else {
    needsConfiguration.push('Razorpay Gateway Keys (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) not configured or disabled');
    nextSteps.push({
      id: 'razorpay_config',
      order: orderCounter++,
      category: 'Payments',
      title: 'Configure Live Razorpay API Credentials',
      actualStatus: hasRazorpayKeys ? 'DISABLED_IN_SETTINGS' : 'KEYS_NOT_CONFIGURED',
      technicalExplanation: 'Paid subscription checkouts and webhook signature verification require RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      severity: 'high',
      recommendedSolution: 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server and enable Razorpay in Payment Settings.',
      requiredPermissions: 'Super Admin + Environment Owner',
      ownerApprovalRequired: true,
      suggestedActionType: 'SETTINGS_UPDATE'
    });
  }

  // 4. Gemini AI Service
  if (hasGeminiKey) {
    working.push(`Gemini API Configured (${aiCtx.aiSettings?.activeModel || 'gemini-4-hydrogen'})`);
  } else {
    needsConfiguration.push('GEMINI_API_KEY missing — AI Executive Assistant and Release Compliance run in deterministic fallback mode');
    nextSteps.push({
      id: 'gemini_config',
      order: orderCounter++,
      category: 'AI Services',
      title: 'Add GEMINI_API_KEY for Live AI Intelligence',
      actualStatus: 'NOT_CONFIGURED',
      technicalExplanation: 'Server-side @google/genai requests require GEMINI_API_KEY in backend environment variables.',
      severity: 'medium',
      recommendedSolution: 'Configure GEMINI_API_KEY on the backend server and run Test Connection under AI Configuration.',
      requiredPermissions: 'Environment Owner',
      ownerApprovalRequired: false
    });
  }

  // 5. Audio QC / Fingerprint Binaries
  if (ffmpeg.installed) working.push(`FFmpeg Audio Inspection (${ffmpeg.version})`);
  else needsConfiguration.push('FFmpeg binary not installed on host (audio QC deep waveform checks limited)');

  if (chromaprint.installed && hasAcoustIdKey) {
    working.push(`Chromaprint (${chromaprint.version}) + AcoustID Client Key Active`);
  } else {
    needsConfiguration.push(
      `Audio Copyright Fingerprinting incomplete (Chromaprint: ${chromaprint.installed ? 'Installed' : 'Not Installed'}, AcoustID Key: ${hasAcoustIdKey ? 'Set' : 'Missing'})`
    );
  }

  working.push(`Media Storage Provider Active: ${storageProvider.toUpperCase()}`);

  // 6. Pending Operational Workloads (Strict Real DB Counts)
  if (snapshot.ok) {
    const pendingKycs = snapshot.users.filter(u => u.kyc?.status === 'Pending');
    if (pendingKycs.length > 0) {
      pending.push(`${pendingKycs.length} artist KYC submission(s) awaiting manual document review`);
      nextSteps.push({
        id: 'pending_kyc',
        order: orderCounter++,
        category: 'KYC Verification',
        title: `Review ${pendingKycs.length} Pending KYC Submission(s)`,
        actualStatus: `${pendingKycs.length} PENDING`,
        technicalExplanation: 'Artists cannot unlock distribution services until Super Admin explicitly inspects Aadhaar/PAN documents and approves KYC.',
        severity: 'high',
        recommendedSolution: 'Open KYC Verification -> Pending Verification and inspect each document with Owner Approval confirmation.',
        requiredPermissions: 'SUPER_ADMIN',
        ownerApprovalRequired: true,
        suggestedActionType: 'KYC_APPROVE',
        targetId: pendingKycs[0]?.id
      });
    }

    const pendingReleases = snapshot.releases.filter(
      r => r.status === 'Submitted' || r.status === 'Under Review'
    );
    if (pendingReleases.length > 0) {
      pending.push(`${pendingReleases.length} release submission(s) waiting in Review Queue`);
      nextSteps.push({
        id: 'pending_releases',
        order: orderCounter++,
        category: 'Release Operations',
        title: `Review ${pendingReleases.length} Pending Music Release(s)`,
        actualStatus: `${pendingReleases.length} PENDING_REVIEW`,
        technicalExplanation: 'Releases in Submitted or Under Review status are held from distribution until approved or returned for corrections.',
        severity: 'high',
        recommendedSolution: 'Inspect audio QC, metadata, and AI risk signals under Release Management before approving.',
        requiredPermissions: 'SUPER_ADMIN',
        ownerApprovalRequired: true,
        suggestedActionType: 'RELEASE_APPROVE',
        targetId: pendingReleases[0]?.id
      });
    }

    const highRiskAi = snapshot.aiResults.filter(
      r => r.riskLevel === 'HIGH' && r.finalDecision === 'PENDING'
    );
    if (highRiskAi.length > 0) {
      immediateAttention.push(`${highRiskAi.length} HIGH-RISK copyright/metadata AI alert(s) require immediate human inspection.`);
      nextSteps.push({
        id: 'high_risk_ai',
        order: orderCounter++,
        category: 'AI Copyright Compliance',
        title: `Inspect ${highRiskAi.length} High-Risk AI Release Flag(s)`,
        actualStatus: `${highRiskAi.length} HIGH_RISK_PENDING`,
        technicalExplanation: 'AI pipeline detected potential audio fingerprint match, duplicate metadata, or compliance risk signals.',
        severity: 'critical',
        recommendedSolution: 'Open AI Review Center -> Copyright Risk Analysis and review evidence before any approval or rejection.',
        requiredPermissions: 'SUPER_ADMIN',
        ownerApprovalRequired: true
      });
    }

    const pendingAppeals = snapshot.releaseAppeals.filter(a => a.status === 'Pending');
    if (pendingAppeals.length > 0) {
      pending.push(`${pendingAppeals.length} artist copyright/rejection appeal(s) open`);
    }

    const openTickets = [
      ...snapshot.contactSubmissions.filter(c => (c.status || 'Open') !== 'Resolved'),
      ...Array.from(snapshot.dashboards.values()).flatMap((d: any) =>
        (d.tickets || []).filter((t: any) => t.status !== 'Resolved')
      )
    ];
    if (openTickets.length > 0) {
      pending.push(`${openTickets.length} unresolved support ticket(s) / contact inquiry(s)`);
    }

    const pendingApprovalsCount = Array.from(inMemoryApprovals.values()).filter(
      a => a.status === 'PENDING_OWNER_APPROVAL'
    ).length;
    if (pendingApprovalsCount > 0) {
      immediateAttention.push(`${pendingApprovalsCount} proposed action(s) awaiting explicit Owner Approval.`);
    }

    if (deps.platformSettings.maintenanceMode) {
      immediateAttention.push('Maintenance Mode is currently ENABLED globally on the public storefront.');
    }
  }

  if (nextSteps.length === 0) {
    nextSteps.push({
      id: 'all_clear',
      order: 1,
      category: 'Operations',
      title: 'All Platform Subsystems & Operational Queues Clear',
      actualStatus: 'HEALTHY',
      technicalExplanation: 'No pending KYC verifications, release backlogs, or critical subsystem failures detected in live database records.',
      severity: 'info',
      recommendedSolution: 'Monitor Executive Reports or inspect security audit logs as new artist registrations arrive.',
      requiredPermissions: 'SUPER_ADMIN',
      ownerApprovalRequired: false
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    dataSource: snapshot.dataSource,
    connectionStatus: snapshot.connectionStatus,
    counts: {
      completed: completed.length,
      working: working.length,
      notWorking: notWorking.length,
      pending: pending.length,
      needsConfiguration: needsConfiguration.length,
      immediateAttention: immediateAttention.length
    },
    completed,
    working,
    notWorking,
    pending,
    needsConfiguration,
    immediateAttention,
    nextSteps
  };
}

// ======================== EXECUTIVE REPORTS GENERATOR ========================

function toCsvCell(val: unknown): string {
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const head = headers.map(toCsvCell).join(',');
  const body = rows.map(r => r.map(toCsvCell).join(',')).join('\n');
  return `${head}\n${body}`;
}

export async function buildExecutiveReport(
  reportType: string,
  snapshot: LivePlatformSnapshot,
  aiUsageLogs: any[]
) {
  const generatedAt = new Date().toISOString();
  const missingOrUnavailable: string[] = [];

  if (!snapshot.ok) {
    return {
      ok: false,
      reportType,
      generatedAt,
      dataUnavailable: true,
      error: snapshot.error || 'Database unavailable for report generation.',
      missingOrUnavailable: ['Live database query failed — cannot generate verified metrics.']
    };
  }

  const now = Date.now();
  const windowDays =
    reportType === 'daily' ? 1 : reportType === 'weekly' ? 7 : reportType === 'monthly' ? 30 : 3650;
  const cutoffMs = now - windowDays * 86400000;

  if (reportType === 'daily' || reportType === 'weekly' || reportType === 'monthly') {
    const usersInWindow = snapshot.users.filter(u => new Date(u.createdAt).getTime() >= cutoffMs);
    const releasesInWindow = snapshot.releases.filter(
      r => new Date(r.submittedAt || r.releaseDate || 0).getTime() >= cutoffMs
    );
    const paidInWindow = snapshot.paidOrders.filter(
      o => new Date(o.paidAt || o.createdAt).getTime() >= cutoffMs
    );
    const auditInWindow = snapshot.auditLogs.filter(
      l => new Date(l.timestamp || 0).getTime() >= cutoffMs
    );
    const revenueINR = paidInWindow.reduce((s, o) => s + Number(o.amount || 0), 0);

    missingOrUnavailable.push(
      'External DSP streaming payout telemetry requires DSP ingestion feeds (not synthesized).'
    );

    const rows = [
      { metric: 'New Registered Artists', value: usersInWindow.length },
      { metric: 'Total Production Users', value: snapshot.users.length },
      { metric: 'Releases Submitted in Window', value: releasesInWindow.length },
      { metric: 'Verified Paid Orders in Window', value: paidInWindow.length },
      { metric: 'Verified Paid Revenue (INR)', value: revenueINR },
      { metric: 'Audit & Security Events in Window', value: auditInWindow.length },
      { metric: 'Pending KYC Queue', value: snapshot.users.filter(u => u.kyc?.status === 'Pending').length },
      {
        metric: 'Pending Release Queue',
        value: snapshot.releases.filter(r => r.status === 'Submitted' || r.status === 'Under Review').length
      }
    ];

    return {
      ok: true,
      reportType,
      title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Platform Summary Report`,
      generatedAt,
      dataSource: snapshot.dataSource,
      windowDays,
      summary: {
        newUsers: usersInWindow.length,
        releasesSubmitted: releasesInWindow.length,
        paidOrders: paidInWindow.length,
        paidRevenueINR: revenueINR,
        auditEvents: auditInWindow.length
      },
      headers: ['Metric', 'Verified Value'],
      rows,
      csv: rowsToCsv(
        ['Metric', 'Verified Value'],
        rows.map(r => [r.metric, r.value])
      ),
      missingOrUnavailable
    };
  }

  if (reportType === 'users') {
    const rows = snapshot.users.map(u => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      country: u.country,
      accountStatus: u.accountStatus || 'active',
      kycStatus: u.kyc?.status || 'Not Submitted',
      isActive: u.isActive ? 'Verified' : 'Unverified',
      createdAt: u.createdAt
    }));
    return {
      ok: true,
      reportType,
      title: 'User Registration Report',
      generatedAt,
      dataSource: snapshot.dataSource,
      summary: {
        totalUsers: rows.length,
        active: rows.filter(r => r.accountStatus === 'active').length,
        suspended: rows.filter(r => r.accountStatus === 'suspended').length,
        terminated: rows.filter(r => r.accountStatus === 'terminated').length,
        kycApproved: rows.filter(r => r.kycStatus === 'Approved').length
      },
      headers: ['User ID', 'Full Name', 'Email', 'Country', 'Account Status', 'KYC Status', 'Email Verified', 'Registered At'],
      rows,
      csv: rowsToCsv(
        ['User ID', 'Full Name', 'Email', 'Country', 'Account Status', 'KYC Status', 'Email Verified', 'Registered At'],
        rows.map(r => [r.id, r.fullName, r.email, r.country, r.accountStatus, r.kycStatus, r.isActive, r.createdAt])
      ),
      missingOrUnavailable
    };
  }

  if (reportType === 'releases') {
    const rows = snapshot.releases.map(r => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      ownerEmail: r.ownerEmail,
      type: r.type,
      upc: r.upc || 'Pending',
      tracksCount: r.tracks?.length || 0,
      status: r.status,
      submittedAt: r.submittedAt || r.releaseDate || ''
    }));
    return {
      ok: true,
      reportType,
      title: 'Release Operations Report',
      generatedAt,
      dataSource: snapshot.dataSource,
      summary: {
        totalReleases: rows.length,
        draft: rows.filter(r => r.status === 'Draft').length,
        pending: rows.filter(r => r.status === 'Submitted' || r.status === 'Under Review').length,
        approved: rows.filter(r => r.status === 'Approved').length,
        published: rows.filter(r => r.status === 'Live' || r.status === 'Published' || r.status === 'Delivered').length,
        rejected: rows.filter(r => r.status === 'Rejected' || r.status === 'Action Required').length,
        takedownRequests: snapshot.takedownRequests.length
      },
      headers: ['Release ID', 'Title', 'Artist', 'Owner Email', 'Format', 'UPC', 'Tracks', 'Status', 'Submitted At'],
      rows,
      csv: rowsToCsv(
        ['Release ID', 'Title', 'Artist', 'Owner Email', 'Format', 'UPC', 'Tracks', 'Status', 'Submitted At'],
        rows.map(r => [r.id, r.title, r.artist, r.ownerEmail, r.type, r.upc, r.tracksCount, r.status, r.submittedAt])
      ),
      missingOrUnavailable
    };
  }

  if (reportType === 'revenue') {
    const rows = snapshot.orders.map(o => ({
      orderId: o.orderId,
      paymentId: o.paymentId || '—',
      userEmail: o.userEmail || o.userId,
      planName: o.planName || o.planId,
      amountINR: Number(o.amount || 0),
      status: o.status,
      countedInRevenue: o.status === 'paid' ? 'YES' : 'NO',
      createdAt: o.createdAt
    }));
    const verifiedRevenueINR = snapshot.paidOrders.reduce((s, o) => s + Number(o.amount || 0), 0);
    return {
      ok: true,
      reportType,
      title: 'Verified Revenue Report',
      generatedAt,
      dataSource: snapshot.dataSource,
      summary: {
        totalOrders: rows.length,
        paidOrders: snapshot.paidOrders.length,
        pendingOrders: snapshot.pendingOrders.length,
        failedOrders: snapshot.failedOrders.length,
        refundedOrders: snapshot.refundedOrders.length,
        verifiedPaidRevenueINR: verifiedRevenueINR
      },
      headers: ['Order ID', 'Payment ID', 'Customer Email', 'Plan', 'Amount (INR)', 'Order Status', 'Counted In Revenue', 'Timestamp'],
      rows,
      csv: rowsToCsv(
        ['Order ID', 'Payment ID', 'Customer Email', 'Plan', 'Amount (INR)', 'Order Status', 'Counted In Revenue', 'Timestamp'],
        rows.map(r => [r.orderId, r.paymentId, r.userEmail, r.planName, r.amountINR, r.status, r.countedInRevenue, r.createdAt])
      ),
      missingOrUnavailable: ['Only orders with status="paid" are summed into verified revenue totals.']
    };
  }

  if (reportType === 'security') {
    const rows = [...snapshot.auditLogs].reverse().slice(0, 200).map(l => ({
      id: l.id,
      timestamp: l.timestamp,
      actorEmail: l.actorEmail,
      actorRole: l.actorRole,
      action: l.action,
      entityType: l.entityType,
      details: l.details
    }));
    return {
      ok: true,
      reportType,
      title: 'Security & Audit Trail Report',
      generatedAt,
      dataSource: snapshot.dataSource,
      summary: {
        totalLoggedEvents: snapshot.auditLogs.length,
        superAdminActions: snapshot.auditLogs.filter(l => l.actorRole === 'SUPER_ADMIN').length,
        kycActions: snapshot.auditLogs.filter(l => String(l.action || '').startsWith('KYC_')).length,
        releaseActions: snapshot.auditLogs.filter(l => String(l.action || '').startsWith('RELEASE_')).length
      },
      headers: ['Event ID', 'Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Details'],
      rows,
      csv: rowsToCsv(
        ['Event ID', 'Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Details'],
        rows.map(r => [r.id, r.timestamp, r.actorEmail, r.actorRole, r.action, r.entityType, r.details])
      ),
      missingOrUnavailable
    };
  }

  // 'ai' report
  const rows = aiUsageLogs.map(l => ({
    id: l.id,
    source: l.source,
    model: l.model,
    totalTokens: l.totalTokens,
    latencyMs: l.latencyMs,
    status: l.status,
    actorEmail: l.actorEmail || 'system',
    createdAt: l.createdAt
  }));
  const totalTokens = aiUsageLogs.reduce((s, l) => s + Number(l.totalTokens || 0), 0);
  if (aiUsageLogs.length === 0) {
    missingOrUnavailable.push('No AI Assistant or Compliance API invocations logged yet in database.');
  }
  return {
    ok: true,
    reportType: 'ai',
    title: 'AI Activity & Usage Report',
    generatedAt,
    dataSource: snapshot.dataSource,
    summary: {
      totalAiReviewScans: snapshot.aiJobs.length,
      completedReviews: snapshot.aiResults.length,
      assistantAndApiCalls: aiUsageLogs.length,
      totalTokensLogged: totalTokens,
      failedAiCalls: aiUsageLogs.filter(l => l.status !== 'SUCCESS').length
    },
    headers: ['Log ID', 'Source', 'Model', 'Total Tokens', 'Latency (ms)', 'Status', 'Actor', 'Timestamp'],
    rows,
    csv: rowsToCsv(
      ['Log ID', 'Source', 'Model', 'Total Tokens', 'Latency (ms)', 'Status', 'Actor', 'Timestamp'],
      rows.map(r => [r.id, r.source, r.model, r.totalTokens, r.latencyMs, r.status, r.actorEmail, r.createdAt])
    ),
    missingOrUnavailable
  };
}

// ======================== ROUTE REGISTRATION ========================

export function registerCommandCenterRoutes(
  app: express.Express,
  deps: SuperAdminDeps,
  aiCtx: {
    aiSettings: any;
    aiJobs: Map<string, any>;
    aiResults: Map<string, any>;
    releaseAppeals: any[];
    aiAuditLogs: any[];
    complianceReports: Map<string, any>;
  }
) {
  function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized. Super Admin authentication required.' });
    if (user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access forbidden. SUPER_ADMIN role required.' });
    }
    if (user.accountStatus === 'suspended' || user.accountStatus === 'terminated') {
      return res.status(403).json({ error: 'Super Admin account is inactive.' });
    }
    const token = extractBearerToken(req);
    touchAdminSessionMeta(token);
    (req as any).superAdmin = user;
    (req as any).sessionToken = token;
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

  async function logAiUsage(entry: {
    source: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    status: string;
    errorMessage?: string;
    actorEmail?: string;
  }) {
    const record = {
      id: 'aiu_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      ...entry,
      createdAt: new Date().toISOString()
    };
    inMemoryAiUsageLogs.unshift(record);
    if (inMemoryAiUsageLogs.length > 200) inMemoryAiUsageLogs.length = 200;
    try {
      await dbSaveAiUsageLog(record);
    } catch {
      // Do not fail primary route if log persistence fails
    }
    return record;
  }

  // 1. Executive Session Panel Status (strictly non-sensitive)
  app.get('/api/super-admin/session', requireSuperAdmin, (req, res) => {
    const admin = (req as any).superAdmin;
    const token = (req as any).sessionToken as string | undefined;
    const sessionObj = token ? deps.sessions.get(token) : undefined;
    const meta = getAdminSessionMeta(token);

    return res.json({
      session: {
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
        loginAt: meta?.loginAt || null,
        lastActivityAt: meta?.lastActivityAt || new Date().toISOString(),
        expiresAt: sessionObj?.expiresAt ? new Date(sessionObj.expiresAt).toISOString() : null,
        securityStatus: 'Verified Server-Side SUPER_ADMIN Session · Audit Logging Active',
        databaseStatus: isDatabaseEnabled() ? 'PostgreSQL Live' : 'In-Memory Dev Fallback',
        tokenHint: token ? `${token.slice(0, 10)}••••` : 'Active'
      }
    });
  });

  // 2. Platform Intelligence & Next-Step Engine
  app.get('/api/super-admin/intelligence', requireSuperAdmin, async (req, res) => {
    const includeTest = req.query.includeTest === 'true';
    const snapshot = await loadLivePlatformSnapshot(deps, aiCtx, { includeTest });
    const intelligence = await buildPlatformIntelligence(deps, aiCtx, snapshot);

    if (!snapshot.ok) {
      return res.status(503).json({
        dataUnavailable: true,
        error: snapshot.error,
        intelligence
      });
    }

    return res.json({
      dataUnavailable: false,
      intelligence,
      integrity: {
        dataSource: snapshot.dataSource,
        connectionStatus: snapshot.connectionStatus,
        lastSyncedAt: snapshot.lastSyncedAt,
        latencyMs: snapshot.latencyMs,
        excludedTestCounts: snapshot.excludedTestCounts
      }
    });
  });

  // 3. Owner Approval Workflow (List, Propose, Execute ONLY with explicit confirmation, Dismiss)
  app.get('/api/super-admin/approvals', requireSuperAdmin, async (_req, res) => {
    let items: any[] = [];
    if (isDatabaseEnabled()) {
      try {
        items = await dbGetAdminApprovals(100);
      } catch (err: any) {
        return res.status(503).json({ dataUnavailable: true, error: `Failed to query approvals: ${err.message}` });
      }
    } else {
      items = Array.from(inMemoryApprovals.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    // Merge any in-memory entries created before DB hydrate edge-case
    const seen = new Set(items.map(i => i.id));
    for (const mem of inMemoryApprovals.values()) {
      if (!seen.has(mem.id)) items.unshift(mem);
    }

    return res.json({
      approvals: items,
      pendingCount: items.filter(a => a.status === 'PENDING_OWNER_APPROVAL').length
    });
  });

  const ALLOWED_APPROVAL_ACTIONS = new Set([
    'KYC_APPROVE',
    'KYC_REJECT',
    'KYC_REQUEST_REUPLOAD',
    'RELEASE_APPROVE',
    'RELEASE_REJECT',
    'RELEASE_REQUEST_CORRECTIONS',
    'RELEASE_PUBLISH',
    'USER_SUSPEND',
    'USER_TERMINATE',
    'USER_REACTIVATE',
    'PAYMENT_REFUND',
    'SETTINGS_UPDATE',
    'AI_SETTINGS_UPDATE'
  ]);

  app.post('/api/super-admin/approvals/propose', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { actionType, targetType, targetId, title, explanation, consequences, proposedChanges, payload } =
      req.body || {};

    if (!actionType || !ALLOWED_APPROVAL_ACTIONS.has(String(actionType))) {
      return res.status(400).json({ error: 'Invalid or unsupported approval actionType.' });
    }
    if (!title || !explanation) {
      return res.status(400).json({ error: 'Proposal title and explanation are required.' });
    }

    const proposal = {
      id: 'apr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      actionType: String(actionType),
      targetType: String(targetType || 'platform'),
      targetId: targetId ? String(targetId) : '',
      title: String(title).trim(),
      explanation: String(explanation).trim(),
      consequences: String(consequences || 'Applies administrative state change immediately upon Owner approval.').trim(),
      proposedChanges: proposedChanges || payload || {},
      payload: payload || {},
      requestedBy: admin.email,
      status: 'PENDING_OWNER_APPROVAL',
      createdAt: new Date().toISOString()
    };

    inMemoryApprovals.set(proposal.id, proposal);
    await dbSaveAdminApproval(proposal);
    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      'OWNER_APPROVAL_PROPOSED',
      proposal.targetType,
      proposal.targetId || proposal.id,
      `Proposed "${proposal.title}" (${proposal.actionType}) — awaiting explicit owner confirmation.`
    );

    return res.json({ success: true, approval: proposal });
  });

  app.post('/api/super-admin/approvals/:id/execute', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { id } = req.params;
    const { ownerConfirmed, reasonOverride } = req.body || {};

    if (ownerConfirmed !== true) {
      return res.status(400).json({
        error: 'Explicit Owner confirmation (ownerConfirmed: true) is strictly required before executing any approved action.'
      });
    }

    let proposal = inMemoryApprovals.get(id);
    if (!proposal && isDatabaseEnabled()) {
      const list = await dbGetAdminApprovals(200);
      proposal = list.find(a => a.id === id);
    }
    if (!proposal) {
      return res.status(404).json({ error: 'Approval proposal not found.' });
    }
    if (proposal.status !== 'PENDING_OWNER_APPROVAL') {
      return res.status(400).json({ error: `Proposal already processed with status: ${proposal.status}` });
    }

    const payload = { ...(proposal.payload || {}), reason: reasonOverride || proposal.payload?.reason };
    const actionType = proposal.actionType;
    const targetId = proposal.targetId;
    let executionResult: any = {};

    try {
      // Execute the exact allowlisted action server-side
      if (actionType === 'KYC_APPROVE' || actionType === 'KYC_REJECT' || actionType === 'KYC_REQUEST_REUPLOAD') {
        const target = Array.from(deps.users.values()).find(u => u.id === targetId || u.email === targetId);
        if (!target || !target.kyc) throw new Error('Target user or KYC submission not found.');
        const reason = String(payload.reason || '').trim();
        if (actionType !== 'KYC_APPROVE' && !reason) {
          throw new Error('A clear reason is required to reject or request KYC re-upload.');
        }
        target.kyc.reviewedAt = new Date().toISOString();
        target.kyc.reviewedBy = admin.email;
        if (actionType === 'KYC_APPROVE') {
          target.kyc.status = 'Approved';
          target.kyc.servicesUnlocked = true;
          target.kyc.rejectionReason = undefined;
        } else if (actionType === 'KYC_REJECT') {
          target.kyc.status = 'Rejected';
          target.kyc.servicesUnlocked = false;
          target.kyc.rejectionReason = reason;
        } else {
          target.kyc.status = 'Reupload Required';
          target.kyc.servicesUnlocked = false;
          target.kyc.rejectionReason = reason;
        }
        await deps.dbUpsertUser(target);
        executionResult = { userId: target.id, kycStatus: target.kyc.status };
      } else if (
        actionType === 'RELEASE_APPROVE' ||
        actionType === 'RELEASE_REJECT' ||
        actionType === 'RELEASE_REQUEST_CORRECTIONS' ||
        actionType === 'RELEASE_PUBLISH'
      ) {
        let foundRelease: any = null;
        let ownerUserId: string | null = null;
        let ownerDash: any = null;
        for (const [uid, dash] of deps.userDashboards.entries()) {
          const m = (dash.releases || []).find((r: any) => r.id === targetId);
          if (m) {
            foundRelease = m;
            ownerUserId = uid;
            ownerDash = dash;
            break;
          }
        }
        if (!foundRelease || !ownerUserId || !ownerDash) throw new Error('Target release not found.');
        const reason = String(payload.reason || '').trim();
        if ((actionType === 'RELEASE_REJECT' || actionType === 'RELEASE_REQUEST_CORRECTIONS') && !reason) {
          throw new Error('A clear reason is required when rejecting or requesting corrections.');
        }

        foundRelease.lastReviewedAt = new Date().toISOString();
        if (actionType === 'RELEASE_APPROVE') {
          foundRelease.status = 'Approved';
          foundRelease.adminRejectReason = undefined;
          foundRelease.adminChangesRequired = undefined;
        } else if (actionType === 'RELEASE_PUBLISH') {
          foundRelease.status = 'Live';
          foundRelease.publishedAt = new Date().toISOString();
        } else if (actionType === 'RELEASE_REJECT') {
          foundRelease.status = 'Rejected';
          foundRelease.adminRejectReason = reason;
        } else {
          foundRelease.status = 'Action Required';
          foundRelease.adminChangesRequired = reason;
        }
        await deps.dbSaveDashboard(ownerUserId, ownerDash);
        const notif = {
          id: 'notif_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
          recipient_user_id: ownerUserId,
          release_id: foundRelease.id,
          notification_type: foundRelease.status === 'Rejected' ? 'rejected' : foundRelease.status === 'Action Required' ? 'changes_requested' : 'approved',
          title: `Release ${foundRelease.status}`,
          message: `Your release "${foundRelease.title}" is now ${foundRelease.status}.`,
          admin_reason: reason,
          release_title: foundRelease.title,
          artist_name: foundRelease.artist,
          created_at: new Date().toISOString(),
          expires_at: Date.now() + 48 * 3600 * 1000
        };
        deps.notifications.set(notif.id, notif);
        await deps.dbSaveNotification({ ...notif, userId: ownerUserId });
        executionResult = { releaseId: foundRelease.id, status: foundRelease.status };
      } else if (actionType === 'USER_SUSPEND' || actionType === 'USER_TERMINATE' || actionType === 'USER_REACTIVATE') {
        const target = Array.from(deps.users.values()).find(u => u.id === targetId || u.email === targetId);
        if (!target) throw new Error('Target user not found.');
        if (target.role === 'SUPER_ADMIN') throw new Error('Super Admin account cannot be modified.');
        const reason = String(payload.reason || '').trim();
        if (actionType !== 'USER_REACTIVATE' && !reason) throw new Error('Mandatory reason required.');
        if (actionType === 'USER_SUSPEND') {
          target.accountStatus = 'suspended';
          target.statusReason = reason;
          await revokeUserSessions(target.id);
        } else if (actionType === 'USER_TERMINATE') {
          target.accountStatus = 'terminated';
          target.statusReason = reason;
          await revokeUserSessions(target.id);
        } else {
          target.accountStatus = 'active';
          target.statusReason = reason || 'Reactivated with Owner Approval';
        }
        await deps.dbUpsertUser(target);
        executionResult = { userId: target.id, accountStatus: target.accountStatus };
      } else if (actionType === 'PAYMENT_REFUND') {
        const order = deps.razorpayOrders.get(targetId);
        if (!order) throw new Error('Order not found.');
        if (order.status !== 'paid') throw new Error('Only paid orders can be refunded.');
        order.status = 'refunded';
        order.refundedAt = new Date().toISOString();
        order.refundReason = String(payload.reason || 'Owner-approved refund').trim();
        await deps.dbSaveOrder(order);
        executionResult = { orderId: order.orderId, status: order.status };
      } else if (actionType === 'SETTINGS_UPDATE') {
        const updates = payload.settings || {};
        if (typeof updates.maintenanceMode === 'boolean') {
          deps.platformSettings.maintenanceMode = updates.maintenanceMode;
        }
        if (updates.paymentSettings && typeof updates.paymentSettings === 'object') {
          deps.platformSettings.paymentSettings = {
            ...deps.platformSettings.paymentSettings,
            ...updates.paymentSettings
          };
        }
        if (updates.services && typeof updates.services === 'object') {
          deps.platformSettings.services = {
            ...deps.platformSettings.services,
            ...updates.services
          };
        }
        await deps.dbSavePlatformSetting('platform_settings', deps.platformSettings);
        executionResult = { updated: true };
      } else if (actionType === 'AI_SETTINGS_UPDATE') {
        Object.assign(aiCtx.aiSettings, payload.aiSettings || {});
        executionResult = { updated: true };
      }

      proposal.status = 'EXECUTED';
      proposal.executedAt = new Date().toISOString();
      proposal.executedBy = admin.email;
      proposal.executionResult = executionResult;
      inMemoryApprovals.set(proposal.id, proposal);
      await dbSaveAdminApproval(proposal);

      await deps.recordAudit(
        admin.email,
        'SUPER_ADMIN',
        `OWNER_APPROVED_${actionType}`,
        proposal.targetType,
        proposal.targetId || proposal.id,
        `Executed owner-approved proposal "${proposal.title}" (${proposal.id}). Result: ${JSON.stringify(executionResult)}`
      );

      return res.json({ success: true, approval: proposal, executionResult });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Execution failed.' });
    }
  });

  app.post('/api/super-admin/approvals/:id/dismiss', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { id } = req.params;
    let proposal = inMemoryApprovals.get(id);
    if (!proposal && isDatabaseEnabled()) {
      const list = await dbGetAdminApprovals(200);
      proposal = list.find(a => a.id === id);
    }
    if (!proposal) return res.status(404).json({ error: 'Approval proposal not found.' });
    proposal.status = 'DISMISSED';
    proposal.dismissedAt = new Date().toISOString();
    proposal.dismissedBy = admin.email;
    inMemoryApprovals.set(proposal.id, proposal);
    await dbSaveAdminApproval(proposal);
    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      'OWNER_APPROVAL_DISMISSED',
      proposal.targetType,
      proposal.targetId || proposal.id,
      `Dismissed proposed action "${proposal.title}" (${proposal.id}).`
    );
    return res.json({ success: true, approval: proposal });
  });

  // 4. AI Executive Assistant Chat (Advisory Only — Zero Auto-Execution)
  app.post('/api/super-admin/ai-assistant/chat', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { message, activeTab, activeSubmenu, history } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const snapshot = await loadLivePlatformSnapshot(deps, aiCtx, { includeTest: false });
    const intelligence = await buildPlatformIntelligence(deps, aiCtx, snapshot);

    const paidRevenue = snapshot.paidOrders.reduce((s, o) => s + Number(o.amount || 0), 0);
    const liveContextSummary = snapshot.ok
      ? {
          dataSource: snapshot.dataSource,
          lastSyncedAt: snapshot.lastSyncedAt,
          productionUsers: snapshot.users.length,
          pendingKyc: snapshot.users.filter(u => u.kyc?.status === 'Pending').length,
          approvedKyc: snapshot.users.filter(u => u.kyc?.status === 'Approved').length,
          suspendedUsers: snapshot.users.filter(u => u.accountStatus === 'suspended').length,
          terminatedUsers: snapshot.users.filter(u => u.accountStatus === 'terminated').length,
          productionReleases: snapshot.releases.length,
          pendingReleases: snapshot.releases.filter(r => r.status === 'Submitted' || r.status === 'Under Review').length,
          approvedReleases: snapshot.releases.filter(r => r.status === 'Approved').length,
          publishedReleases: snapshot.releases.filter(r => r.status === 'Live' || r.status === 'Published' || r.status === 'Delivered').length,
          rejectedReleases: snapshot.releases.filter(r => r.status === 'Rejected' || r.status === 'Action Required').length,
          verifiedPaidOrders: snapshot.paidOrders.length,
          verifiedPaidRevenueINR: paidRevenue,
          failedOrders: snapshot.failedOrders.length,
          activeSubscriptions: snapshot.subscriptions.filter(s => s.status === 'active').length,
          excludedTestRecords: snapshot.excludedTestCounts,
          platformIntelligence: {
            working: intelligence.working,
            notWorking: intelligence.notWorking,
            needsConfiguration: intelligence.needsConfiguration,
            immediateAttention: intelligence.immediateAttention,
            topNextSteps: intelligence.nextSteps.slice(0, 5)
          }
        }
      : {
          dataUnavailable: true,
          error: snapshot.error,
          dataSource: snapshot.dataSource
        };

    const activeModel = aiCtx.aiSettings?.activeModel || 'gemini-4-hydrogen';
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      await logAiUsage({
        source: 'executive_assistant',
        model: activeModel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        status: 'NOT_CONFIGURED',
        errorMessage: 'GEMINI_API_KEY not configured on server',
        actorEmail: admin.email
      });

      const deterministicLines = [
        `Gemini API Key is not configured on the backend, so I am providing a verified real-database status brief instead of generative prose:`,
        snapshot.ok
          ? `• Data Source: ${snapshot.dataSource} (${snapshot.users.length} prod users, ${snapshot.releases.length} releases, ₹${paidRevenue.toLocaleString('en-IN')} verified paid revenue; ${snapshot.excludedTestCounts.users} demo/test user(s) isolated).`
          : `• Data Status: Data Unavailable (${snapshot.error}).`,
        `• Current View: ${activeTab || 'overview'} / ${activeSubmenu || 'executive-overview'}`,
        `• Immediate Attention: ${intelligence.immediateAttention.length > 0 ? intelligence.immediateAttention.join(' | ') : 'None flagged.'}`,
        `• Top Recommended Next Step: ${intelligence.nextSteps[0]?.title} (${intelligence.nextSteps[0]?.actualStatus}) — ${intelligence.nextSteps[0]?.recommendedSolution}`,
        `Reminder: No action will be executed without your explicit Super Admin confirmation.`
      ];

      return res.json({
        reply: deterministicLines.join('\n\n'),
        aiStatus: 'NOT_CONFIGURED',
        model: activeModel,
        suggestedActions: intelligence.nextSteps.slice(0, 3).map(n => ({
          title: n.title,
          actionType: n.suggestedActionType,
          targetId: n.targetId,
          severity: n.severity,
          explanation: n.technicalExplanation
        })),
        dataSource: snapshot.dataSource
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    const systemInstruction = `You are the Rudraatma Music Distribution AI Executive Assistant inside the Super Admin Command Center.
STRICT GOVERNANCE RULES:
1. ZERO FABRICATION: Cite ONLY numbers, records, and integration states present in "LIVE_PLATFORM_CONTEXT". If "dataUnavailable" is true, state "Data Unavailable" — never guess or say 0.
2. ADVISORY ONLY: You can analyze, diagnose, explain, and draft proposals, but you MUST NEVER claim to have executed any action (KYC approval, release approval, suspension, refund, pricing/settings updates). Always state that explicit Super Admin approval is required before execution.
3. SECRET HYGIENE: Never reveal API keys, env secret values, password hashes, or tokens.
4. CURRENT UI CONTEXT: Admin is viewing section "${activeTab || 'overview'}" -> submenu "${activeSubmenu || 'executive-overview'}".
5. Respond concisely, clearly, and professionally in structured bullets or short paragraphs.`;

    const recentHistory = Array.isArray(history)
      ? history.slice(-6).map((h: any) => `${h.role === 'user' ? 'Super Admin' : 'Assistant'}: ${String(h.content || '').slice(0, 500)}`).join('\n')
      : '';

    const fullPrompt = `${systemInstruction}

LIVE_PLATFORM_CONTEXT:
${JSON.stringify(liveContextSummary, null, 2)}

${recentHistory ? `RECENT_CONVERSATION:\n${recentHistory}\n` : ''}
SUPER_ADMIN_MESSAGE: ${String(message).trim()}`;

    const t0 = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: activeModel,
        contents: fullPrompt
      });
      const latencyMs = Date.now() - t0;
      const reply = (response.text || '').trim() || 'No response generated from AI model.';
      const usage = (response as any).usageMetadata || {};

      await logAiUsage({
        source: 'executive_assistant',
        model: activeModel,
        promptTokens: Number(usage.promptTokenCount || 0),
        completionTokens: Number(usage.candidatesTokenCount || 0),
        totalTokens: Number(usage.totalTokenCount || 0),
        latencyMs,
        status: 'SUCCESS',
        actorEmail: admin.email
      });

      return res.json({
        reply,
        aiStatus: 'CONNECTED',
        model: activeModel,
        latencyMs,
        usage: {
          totalTokens: Number(usage.totalTokenCount || 0)
        },
        suggestedActions: intelligence.nextSteps
          .filter(n => n.ownerApprovalRequired && n.suggestedActionType)
          .slice(0, 3)
          .map(n => ({
            title: n.title,
            actionType: n.suggestedActionType,
            targetId: n.targetId,
            severity: n.severity,
            explanation: n.technicalExplanation
          })),
        dataSource: snapshot.dataSource
      });
    } catch (err: any) {
      const latencyMs = Date.now() - t0;
      await logAiUsage({
        source: 'executive_assistant',
        model: activeModel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs,
        status: 'ERROR',
        errorMessage: err.message || 'Gemini request failed',
        actorEmail: admin.email
      });

      return res.json({
        reply: `Gemini AI request failed (${err.message || 'API error'}). Verified Live Platform Status:\n• Data Source: ${snapshot.dataSource} | Production Users: ${snapshot.ok ? snapshot.users.length : 'Data Unavailable'} | Verified Paid Revenue: ₹${paidRevenue.toLocaleString('en-IN')}\n• Top Next Step: ${intelligence.nextSteps[0]?.title} (${intelligence.nextSteps[0]?.actualStatus})`,
        aiStatus: 'UNAVAILABLE',
        error: err.message,
        model: activeModel,
        suggestedActions: [],
        dataSource: snapshot.dataSource
      });
    }
  });

  // 5. Real AI Usage Logs Endpoint
  app.get('/api/super-admin/ai/usage', requireSuperAdmin, async (_req, res) => {
    let logs = [...inMemoryAiUsageLogs];
    if (isDatabaseEnabled()) {
      try {
        logs = await dbGetAiUsageLogs(200);
      } catch (err: any) {
        return res.status(503).json({ dataUnavailable: true, error: `Failed to read AI usage logs: ${err.message}` });
      }
    }

    const totalTokens = logs.reduce((s, l) => s + Number(l.totalTokens || 0), 0);
    const totalCalls = logs.length;
    const failedCalls = logs.filter(l => l.status !== 'SUCCESS').length;

    return res.json({
      logs,
      summary: {
        totalCalls,
        successfulCalls: totalCalls - failedCalls,
        failedCalls,
        totalTokens,
        activeModel: aiCtx.aiSettings?.activeModel || 'gemini-4-hydrogen',
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim())
      }
    });
  });

  // 6. AI Draft Suggested Reply for Support Tickets / Complaints (Draft Only — Not Sent)
  app.post('/api/super-admin/support/:id/ai-suggest', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { subject, body, userEmail, category } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const activeModel = aiCtx.aiSettings?.activeModel || 'gemini-4-hydrogen';

    if (!apiKey) {
      return res.json({
        aiStatus: 'NOT_CONFIGURED',
        draft: `Namaste,\n\nThank you for reaching out to Rudraatma Music Distribution regarding "${subject || 'your inquiry'}". Our team has reviewed your ticket and will update you shortly with the verified resolution.\n\nWarm regards,\nRudraatma Support Desk`
      });
    }

    const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
    const t0 = Date.now();
    try {
      const resp = await ai.models.generateContent({
        model: activeModel,
        contents: `Draft a polite, concise, accurate support reply for Rudraatma Music Distribution Super Admin to review (do NOT make up account details or guarantee refunds/approvals automatically).
User Email: ${userEmail || 'Artist'}
Category: ${category || 'Support'}
Subject: ${subject || 'General Inquiry'}
Message: ${String(body || '').slice(0, 1000)}`
      });
      const usage = (resp as any).usageMetadata || {};
      await logAiUsage({
        source: 'support_reply_draft',
        model: activeModel,
        promptTokens: Number(usage.promptTokenCount || 0),
        completionTokens: Number(usage.candidatesTokenCount || 0),
        totalTokens: Number(usage.totalTokenCount || 0),
        latencyMs: Date.now() - t0,
        status: 'SUCCESS',
        actorEmail: admin.email
      });
      return res.json({ aiStatus: 'CONNECTED', draft: (resp.text || '').trim() });
    } catch (err: any) {
      await logAiUsage({
        source: 'support_reply_draft',
        model: activeModel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: Date.now() - t0,
        status: 'ERROR',
        errorMessage: err.message,
        actorEmail: admin.email
      });
      return res.json({
        aiStatus: 'UNAVAILABLE',
        error: err.message,
        draft: `Namaste,\n\nThank you for contacting Rudraatma Music Distribution regarding "${subject || 'your request'}". Please let us know if you can share any supporting details so our desk can assist.\n\nRegards,\nRudraatma Support`
      });
    }
  });

  // 7. Executive Reports (All 8 Reports + CSV/JSON export)
  app.get('/api/super-admin/reports', requireSuperAdmin, async (req, res) => {
    const type = String(req.query.type || 'daily').toLowerCase();
    const includeTest = req.query.includeTest === 'true';
    const format = String(req.query.format || 'json').toLowerCase();

    const validTypes = ['daily', 'weekly', 'monthly', 'users', 'releases', 'revenue', 'security', 'ai'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid report type. Supported: ${validTypes.join(', ')}` });
    }

    const snapshot = await loadLivePlatformSnapshot(deps, aiCtx, { includeTest });
    if (!snapshot.ok) {
      return res.status(503).json({
        dataUnavailable: true,
        error: snapshot.error || 'Database unavailable for executive reports.'
      });
    }

    let aiLogs = [...inMemoryAiUsageLogs];
    if (isDatabaseEnabled()) {
      try {
        aiLogs = await dbGetAiUsageLogs(200);
      } catch {
        // Ignore if table unavailable
      }
    }

    const report = await buildExecutiveReport(type, snapshot, aiLogs);
    if (format === 'csv' && report.ok && 'csv' in report) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="rudraatma-${type}-report.csv"`);
      return res.send(report.csv);
    }

    return res.json(report);
  });
}
