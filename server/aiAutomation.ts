import express from 'express';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  isDatabaseEnabled,
  getDbPool,
  dbGetAllPlatformSettings,
  dbSavePlatformSetting
} from './db';
import {
  buildPromotionalEmailTemplate,
  sendPromotionalEmail,
  sendSupportTicketNotificationEmail,
  getSafeEmailDiagnostics,
  OFFICIAL_COMPANY_EMAIL,
  OFFICIAL_WEBSITE_URL
} from './appsScriptEmail';
import { isTestOrDemoUser } from './commandCenter';

// ======================== TYPES & DEFAULT SETTINGS ========================

export interface AiAutomationSettings {
  general: {
    brandName: string;
    supportEmail: string;
    defaultLanguage: string;
    timezone: string;
  };
  chatHistory: {
    allowChatHistoryAccess: boolean;
    retentionDays: number;
    autoSummarizeSessions: boolean;
    allowExport: boolean;
  };
  userPermissions: {
    allowAiUserDataAccess: boolean;
    allowUserPromoOptOut: boolean;
    allowArtistSupportTickets: boolean;
    requireVerifiedEmailForTickets: boolean;
  };
  privacySecurity: {
    redactPiiInPrompts: boolean;
    allowExternalAiContext: boolean;
    auditRetentionDays: number;
    requireReasonOnRevoke: boolean;
  };
  aiBehaviour: {
    aiMasterPaused: boolean;
    aiEnabled: boolean;
    activeModel: 'gemini-4-hydrogen' | 'gemini-3.8-flash' | 'gemini-2.5-flash';
    temperature: number;
    responseTone: 'professional' | 'concise' | 'warm';
    systemGuidance: string;
    confidenceThreshold: number;
  };
  emailNotifications: {
    allowAutomaticEmailSending: boolean;
    allowAiPromotionalEmailAutomation: boolean;
    promoRequireSuperAdminApproval: boolean;
    dailyPromoSendCap: number;
    enableTicketEmailNotifications: boolean;
  };
  supportManagement: {
    allowAiReadSupportTickets: boolean;
    allowAiGenerateSupportReplies: boolean;
    allowAiAutoReplyTickets: boolean;
    allowAiEscalateTickets: boolean;
    allowAiSendTicketNotifications: boolean;
    escalationKeywords: string[];
  };
  automationApprovals: {
    requireApprovalForBulkPromo: boolean;
    requireApprovalForTicketAutoReply: boolean;
    autoPauseEmailOnHighFailureRate: boolean;
    failureRatePauseThresholdPct: number;
  };
  apiIntegrations: {
    geminiPreferredModel: string;
    appsScriptRelayTimeoutMs: number;
  };
  accountManagement: {
    emergencyContactEmail: string;
    sessionTimeoutMinutes: number;
    pauseNote: string;
    lastPausedAt: string | null;
    lastPausedBy: string | null;
  };
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_AI_AUTOMATION_SETTINGS: AiAutomationSettings = {
  general: {
    brandName: 'Rudraatma Music Distribution',
    supportEmail: OFFICIAL_COMPANY_EMAIL,
    defaultLanguage: 'English',
    timezone: 'Asia/Kolkata'
  },
  chatHistory: {
    allowChatHistoryAccess: true,
    retentionDays: 90,
    autoSummarizeSessions: true,
    allowExport: true
  },
  userPermissions: {
    allowAiUserDataAccess: true,
    allowUserPromoOptOut: true,
    allowArtistSupportTickets: true,
    requireVerifiedEmailForTickets: true
  },
  privacySecurity: {
    redactPiiInPrompts: true,
    allowExternalAiContext: true,
    auditRetentionDays: 365,
    requireReasonOnRevoke: true
  },
  aiBehaviour: {
    aiMasterPaused: false,
    aiEnabled: true,
    activeModel: 'gemini-2.5-flash',
    temperature: 0.3,
    responseTone: 'professional',
    systemGuidance:
      'Assist artists and administrators accurately with music distribution, releases, royalties, and support without fabricating account balances or policy exceptions.',
    confidenceThreshold: 78
  },
  emailNotifications: {
    allowAutomaticEmailSending: true,
    allowAiPromotionalEmailAutomation: false,
    promoRequireSuperAdminApproval: true,
    dailyPromoSendCap: 1000,
    enableTicketEmailNotifications: true
  },
  supportManagement: {
    allowAiReadSupportTickets: true,
    allowAiGenerateSupportReplies: true,
    allowAiAutoReplyTickets: false,
    allowAiEscalateTickets: true,
    allowAiSendTicketNotifications: false,
    escalationKeywords: [
      'refund',
      'legal',
      'dmca',
      'copyright',
      'fraud',
      'chargeback',
      'urgent',
      'payout failed',
      'takedown dispute',
      'suspend'
    ]
  },
  automationApprovals: {
    requireApprovalForBulkPromo: true,
    requireApprovalForTicketAutoReply: true,
    autoPauseEmailOnHighFailureRate: true,
    failureRatePauseThresholdPct: 40
  },
  apiIntegrations: {
    geminiPreferredModel: 'gemini-2.5-flash',
    appsScriptRelayTimeoutMs: 15000
  },
  accountManagement: {
    emergencyContactEmail: OFFICIAL_COMPANY_EMAIL,
    sessionTimeoutMinutes: 60,
    pauseNote: '',
    lastPausedAt: null,
    lastPausedBy: null
  }
};

export type PromoSegment =
  | 'all_eligible'
  | 'active_subscribers'
  | 'free_users'
  | 'approved_artists'
  | 'specific_emails';

export type PromoCampaignStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'SENDING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_FAILURES'
  | 'CANCELLED'
  | 'BLOCKED';

export interface PromoRecipientRecord {
  userId: string;
  email: string;
  name: string;
  status: 'pending' | 'delivered' | 'failed' | 'skipped_opt_out';
  error?: string;
  sentAt?: string;
}

export interface PromoEmailCampaign {
  id: string;
  name: string;
  subject: string;
  headline: string;
  preheader?: string;
  categoryLabel: string;
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
  segment: PromoSegment;
  specificEmails?: string[];
  status: PromoCampaignStatus;
  scheduledFor?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  stats: {
    totalRecipients: number;
    deliveredCount: number;
    failedCount: number;
    pendingCount: number;
    skippedOptOutCount: number;
  };
  recipientResults: PromoRecipientRecord[];
}

export interface AiAutomationLogEntry {
  id: string;
  timestamp: string;
  actorEmail: string;
  actorRole: string;
  permissionKey: string;
  action: string;
  targetType: string;
  targetId: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  details: string;
}

export interface PersistedAiChatTurn {
  id: string;
  sessionId: string;
  actorEmail: string;
  role: 'user' | 'assistant';
  content: string;
  activeTab?: string;
  activeSubmenu?: string;
  model?: string;
  aiStatus?: string;
  timestamp: string;
}

export interface AiAutomationDeps {
  users: Map<string, any>;
  userDashboards: Map<string, any>;
  notifications: Map<string, any>;
  getAuthenticatedUser: (req: express.Request) => any;
  getUserDashboard: (userId: string) => any;
  dbUpsertUser: (user: any) => Promise<void>;
  dbSaveDashboard: (userId: string, data: any) => Promise<void>;
  dbSaveNotification: (notif: any) => Promise<void>;
  recordAudit: (
    actorEmail: string,
    actorRole: string,
    action: string,
    entityType: string,
    entityId: string,
    details: string
  ) => Promise<void>;
}

// ======================== STATE STORES ========================

const automationSettings: AiAutomationSettings = JSON.parse(
  JSON.stringify(DEFAULT_AI_AUTOMATION_SETTINGS)
);
const promoCampaigns: PromoEmailCampaign[] = [];
const automationLogs: AiAutomationLogEntry[] = [];
const aiChatSessions: PersistedAiChatTurn[] = [];
let schedulerHandle: NodeJS.Timeout | null = null;
let initializedDeps: AiAutomationDeps | null = null;

function mergeDeepSettings(target: any, patch: any): any {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return target;
  for (const key of Object.keys(patch)) {
    const val = patch[key];
    if (val === undefined) continue;
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      mergeDeepSettings(target[key], val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

export function getAiAutomationSettings(): AiAutomationSettings {
  return automationSettings;
}

export function getAiAutomationLogs(): AiAutomationLogEntry[] {
  return automationLogs;
}

export function getPromoCampaigns(): PromoEmailCampaign[] {
  return promoCampaigns;
}

export function isAiMasterActive(): { allowed: boolean; reason?: string } {
  if (automationSettings.aiBehaviour.aiMasterPaused) {
    return {
      allowed: false,
      reason: 'AI Automation is paused via Super Admin Emergency Kill Switch.'
    };
  }
  if (!automationSettings.aiBehaviour.aiEnabled) {
    return {
      allowed: false,
      reason: 'Master AI Engine is disabled in Settings -> AI Behaviour.'
    };
  }
  return { allowed: true };
}

export async function appendAutomationLog(entry: {
  actorEmail: string;
  actorRole: string;
  permissionKey: string;
  action: string;
  targetType: string;
  targetId: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  details: string;
}): Promise<AiAutomationLogEntry> {
  const row: AiAutomationLogEntry = {
    id: 'aiaud_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    timestamp: new Date().toISOString(),
    ...entry
  };
  automationLogs.unshift(row);
  if (automationLogs.length > 500) {
    automationLogs.length = 500;
  }
  await dbSavePlatformSetting('ai_automation_logs', automationLogs).catch(() => {});
  return row;
}

export async function recordAiChatTurn(turn: {
  sessionId: string;
  actorEmail: string;
  role: 'user' | 'assistant';
  content: string;
  activeTab?: string;
  activeSubmenu?: string;
  model?: string;
  aiStatus?: string;
}): Promise<void> {
  if (!automationSettings.chatHistory.allowChatHistoryAccess) return;
  const entry: PersistedAiChatTurn = {
    id: 'chat_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    timestamp: new Date().toISOString(),
    ...turn,
    content: String(turn.content || '').slice(0, 4000)
  };
  aiChatSessions.unshift(entry);
  if (aiChatSessions.length > 400) {
    aiChatSessions.length = 400;
  }
  await dbSavePlatformSetting('ai_chat_sessions', aiChatSessions).catch(() => {});
}

export async function hydrateAiAutomationState(): Promise<void> {
  if (!isDatabaseEnabled()) return;
  try {
    const all = await dbGetAllPlatformSettings();
    if (all.ai_automation_settings && typeof all.ai_automation_settings === 'object') {
      mergeDeepSettings(automationSettings, all.ai_automation_settings);
    }
    if (Array.isArray(all.promo_email_campaigns)) {
      promoCampaigns.length = 0;
      promoCampaigns.push(...all.promo_email_campaigns);
    }
    if (Array.isArray(all.ai_automation_logs)) {
      automationLogs.length = 0;
      automationLogs.push(...all.ai_automation_logs);
    }
    if (Array.isArray(all.ai_chat_sessions)) {
      aiChatSessions.length = 0;
      aiChatSessions.push(...all.ai_chat_sessions);
    }
  } catch (err: any) {
    console.warn('[Rudraatma AI Automation] Hydration warning:', err?.message);
  }
}

// ======================== UNSUBSCRIBE TOKEN HELPERS ========================

function getUnsubscribeHmacSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    process.env.GOOGLE_SCRIPT_SECRET ||
    'rudraatma-promo-unsubscribe-hmac-key'
  );
}

export function ensureUserUnsubscribeToken(user: any): string {
  const email = String(user.email || '').trim().toLowerCase();
  const payload = `${user.id}:${email}`;
  const sig = crypto
    .createHmac('sha256', getUnsubscribeHmacSecret())
    .update(payload)
    .digest('hex')
    .slice(0, 24);
  return Buffer.from(`${email}|${sig}`, 'utf8').toString('base64url');
}

export function verifyUnsubscribeToken(token: string, users: Map<string, any>): any | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [email, sig] = decoded.split('|');
    if (!email || !sig) return null;
    const user = users.get(email.trim().toLowerCase());
    if (!user) return null;
    const expected = ensureUserUnsubscribeToken(user);
    const decodedExpected = Buffer.from(expected, 'base64url').toString('utf8').split('|')[1];
    if (!decodedExpected || sig.length !== decodedExpected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(decodedExpected))) return null;
    return user;
  } catch {
    return null;
  }
}

// ======================== PROMOTIONAL CAMPAIGN ELIGIBILITY & DISPATCH ========================

export function getEligiblePromoRecipients(
  deps: AiAutomationDeps,
  segment: PromoSegment,
  specificEmails?: string[],
  includeTestUsers = false
): {
  eligible: any[];
  skippedOptOutCount: number;
  skippedInactiveCount: number;
} {
  const specificSet = new Set(
    (specificEmails || []).map(e => String(e || '').trim().toLowerCase()).filter(Boolean)
  );
  const eligible: any[] = [];
  let skippedOptOutCount = 0;
  let skippedInactiveCount = 0;

  for (const u of deps.users.values()) {
    if (u.role === 'SUPER_ADMIN') continue;
    if (!includeTestUsers && isTestOrDemoUser(u)) continue;

    if (!u.isActive || u.accountStatus === 'suspended' || u.accountStatus === 'terminated') {
      skippedInactiveCount++;
      continue;
    }

    const dash = deps.userDashboards.get(u.id);
    const hasActiveSub =
      dash?.subscription?.status === 'active' || Boolean(u.selectedPlanId && u.selectedPlanId !== 'free');
    const isApprovedArtist = u.artistProfileStatus === 'Approved' || u.artistProfile?.status === 'Approved';

    let inSegment = false;
    if (segment === 'all_eligible') {
      inSegment = true;
    } else if (segment === 'active_subscribers') {
      inSegment = Boolean(hasActiveSub);
    } else if (segment === 'free_users') {
      inSegment = !hasActiveSub;
    } else if (segment === 'approved_artists') {
      inSegment = Boolean(isApprovedArtist);
    } else if (segment === 'specific_emails') {
      inSegment = specificSet.has(String(u.email || '').trim().toLowerCase());
    }

    if (!inSegment) continue;

    if (u.promoOptOut === true) {
      skippedOptOutCount++;
      continue;
    }

    eligible.push(u);
  }

  return { eligible, skippedOptOutCount, skippedInactiveCount };
}

function countPromoEmailsSentLast24Hours(): number {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  let count = 0;
  for (const c of promoCampaigns) {
    for (const r of c.recipientResults || []) {
      if (r.status === 'delivered' && r.sentAt && new Date(r.sentAt).getTime() >= cutoff) {
        count++;
      }
    }
  }
  return count;
}

export async function dispatchPromoCampaign(
  deps: AiAutomationDeps,
  campaign: PromoEmailCampaign,
  actorEmail: string,
  options?: { bypassApprovalCheck?: boolean }
): Promise<{ ok: boolean; status: number; error?: string; campaign: PromoEmailCampaign }> {
  const master = isAiMasterActive();
  if (!master.allowed) {
    await appendAutomationLog({
      actorEmail,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'aiBehaviour.aiMasterPaused',
      action: 'PROMO_CAMPAIGN_DISPATCH_BLOCKED',
      targetType: 'promo_campaign',
      targetId: campaign.id,
      status: 'BLOCKED',
      details: master.reason || 'Master AI Automation paused.'
    });
    return { ok: false, status: 403, error: master.reason, campaign };
  }

  if (!automationSettings.emailNotifications.allowAiPromotionalEmailAutomation) {
    const err =
      'Blocked: "Allow AI Promotional Email Automation" permission is turned OFF in Settings -> Email & Notifications.';
    await appendAutomationLog({
      actorEmail,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.allowAiPromotionalEmailAutomation',
      action: 'PROMO_CAMPAIGN_DISPATCH_BLOCKED',
      targetType: 'promo_campaign',
      targetId: campaign.id,
      status: 'BLOCKED',
      details: err
    });
    return { ok: false, status: 403, error: err, campaign };
  }

  if (!automationSettings.emailNotifications.allowAutomaticEmailSending) {
    const err =
      'Blocked: "Allow Automatic Email Sending" permission is turned OFF in Settings -> Email & Notifications.';
    await appendAutomationLog({
      actorEmail,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.allowAutomaticEmailSending',
      action: 'PROMO_CAMPAIGN_DISPATCH_BLOCKED',
      targetType: 'promo_campaign',
      targetId: campaign.id,
      status: 'BLOCKED',
      details: err
    });
    return { ok: false, status: 403, error: err, campaign };
  }

  if (
    automationSettings.emailNotifications.promoRequireSuperAdminApproval &&
    !options?.bypassApprovalCheck &&
    !campaign.approvedBy
  ) {
    campaign.status = 'PENDING_APPROVAL';
    campaign.updatedAt = new Date().toISOString();
    await dbSavePlatformSetting('promo_email_campaigns', promoCampaigns).catch(() => {});
    const err =
      'Super Admin Approval Required: Approve this promotional campaign before dispatching emails.';
    await appendAutomationLog({
      actorEmail,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.promoRequireSuperAdminApproval',
      action: 'PROMO_CAMPAIGN_APPROVAL_REQUIRED',
      targetType: 'promo_campaign',
      targetId: campaign.id,
      status: 'BLOCKED',
      details: err
    });
    return { ok: false, status: 403, error: err, campaign };
  }

  const { eligible, skippedOptOutCount } = getEligiblePromoRecipients(
    deps,
    campaign.segment,
    campaign.specificEmails,
    true // include active test accounts if created during QA/testing while skipping inactive/suspended
  );

  const dailyCap = Number(automationSettings.emailNotifications.dailyPromoSendCap || 1000);
  const sentToday = countPromoEmailsSentLast24Hours();
  if (sentToday + eligible.length > dailyCap) {
    const err = `Daily promotional email cap (${dailyCap}) would be exceeded (already sent ${sentToday} in last 24h, campaign requires ${eligible.length}).`;
    await appendAutomationLog({
      actorEmail,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.dailyPromoSendCap',
      action: 'PROMO_CAMPAIGN_CAP_BLOCKED',
      targetType: 'promo_campaign',
      targetId: campaign.id,
      status: 'BLOCKED',
      details: err
    });
    return { ok: false, status: 429, error: err, campaign };
  }

  campaign.status = 'SENDING';
  campaign.dispatchedAt = new Date().toISOString();
  campaign.updatedAt = campaign.dispatchedAt;

  const recipientResults: PromoRecipientRecord[] = [];
  let deliveredCount = 0;
  let failedCount = 0;

  for (const u of eligible) {
    const unsubToken = ensureUserUnsubscribeToken(u);
    const unsubscribeUrl = `${OFFICIAL_WEBSITE_URL}/api/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
    const res = await sendPromotionalEmail({
      email: u.email,
      recipientName: u.fullName,
      subject: campaign.subject,
      headline: campaign.headline,
      preheader: campaign.preheader,
      categoryLabel: campaign.categoryLabel,
      bodyText: campaign.bodyText,
      ctaLabel: campaign.ctaLabel,
      ctaUrl: campaign.ctaUrl,
      unsubscribeUrl,
      campaignId: campaign.id
    });

    if (res.delivered) {
      deliveredCount++;
      recipientResults.push({
        userId: u.id,
        email: u.email,
        name: u.fullName,
        status: 'delivered',
        sentAt: new Date().toISOString()
      });
    } else {
      failedCount++;
      recipientResults.push({
        userId: u.id,
        email: u.email,
        name: u.fullName,
        status: 'failed',
        error: res.error || 'Delivery failed',
        sentAt: new Date().toISOString()
      });
    }
  }

  campaign.recipientResults = recipientResults;
  campaign.stats = {
    totalRecipients: eligible.length,
    deliveredCount,
    failedCount,
    pendingCount: 0,
    skippedOptOutCount
  };
  campaign.completedAt = new Date().toISOString();
  campaign.updatedAt = campaign.completedAt;
  campaign.status = failedCount > 0 && deliveredCount === 0
    ? 'COMPLETED_WITH_FAILURES'
    : failedCount > 0
      ? 'COMPLETED_WITH_FAILURES'
      : 'COMPLETED';
  campaign.lastError =
    failedCount > 0
      ? recipientResults.find(r => r.status === 'failed')?.error || `${failedCount} recipient deliveries failed`
      : null;

  // Auto-pause promotional automation if failure rate exceeds configured safety threshold
  if (
    automationSettings.automationApprovals.autoPauseEmailOnHighFailureRate &&
    eligible.length > 0
  ) {
    const failPct = Math.round((failedCount / eligible.length) * 100);
    if (failPct >= automationSettings.automationApprovals.failureRatePauseThresholdPct) {
      automationSettings.emailNotifications.allowAutomaticEmailSending = false;
      await dbSavePlatformSetting('ai_automation_settings', automationSettings).catch(() => {});
      await appendAutomationLog({
        actorEmail: 'SYSTEM_GUARD',
        actorRole: 'SYSTEM',
        permissionKey: 'automationApprovals.autoPauseEmailOnHighFailureRate',
        action: 'AUTO_EMAIL_PAUSED_HIGH_FAILURE',
        targetType: 'settings',
        targetId: 'emailNotifications',
        status: 'FAILED',
        details: `Automatic email sending paused automatically: campaign ${campaign.id} failure rate reached ${failPct}% (${failedCount}/${eligible.length}).`
      });
    }
  }

  await dbSavePlatformSetting('promo_email_campaigns', promoCampaigns).catch(() => {});
  await appendAutomationLog({
    actorEmail,
    actorRole: 'SUPER_ADMIN',
    permissionKey: 'emailNotifications.allowAiPromotionalEmailAutomation',
    action: 'PROMO_CAMPAIGN_DISPATCHED',
    targetType: 'promo_campaign',
    targetId: campaign.id,
    status: failedCount > 0 && deliveredCount === 0 ? 'FAILED' : 'SUCCESS',
    details: `Campaign "${campaign.name}" processed ${eligible.length} eligible recipients (${deliveredCount} delivered, ${failedCount} failed, ${skippedOptOutCount} opted-out skipped).`
  });

  await deps.recordAudit(
    actorEmail,
    'SUPER_ADMIN',
    'PROMO_CAMPAIGN_DISPATCHED',
    'promo_campaign',
    campaign.id,
    `Dispatched "${campaign.subject}" · Delivered: ${deliveredCount}, Failed: ${failedCount}, Skipped Opt-Out: ${skippedOptOutCount}`
  );

  return { ok: true, status: 200, campaign };
}

export async function runDueScheduledCampaigns(deps?: AiAutomationDeps): Promise<number> {
  const activeDeps = deps || initializedDeps;
  if (!activeDeps) return 0;
  const now = Date.now();
  let executed = 0;
  for (const camp of promoCampaigns) {
    if (camp.status === 'SCHEDULED' && camp.scheduledFor) {
      const dueMs = new Date(camp.scheduledFor).getTime();
      if (!Number.isNaN(dueMs) && dueMs <= now) {
        await dispatchPromoCampaign(activeDeps, camp, camp.approvedBy || camp.createdBy, {
          bypassApprovalCheck: Boolean(camp.approvedBy)
        });
        executed++;
      }
    }
  }
  return executed;
}

// ======================== AI SUPPORT TICKET AUTOMATION ========================

function redactSensitiveTextForPrompt(text: string): string {
  if (!automationSettings.privacySecurity.redactPiiInPrompts) return text;
  return String(text || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL_REDACTED]')
    .replace(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, '[PHONE_REDACTED]')
    .replace(/\b\d{12}\b/g, '[ID_REDACTED]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[PAN_REDACTED]');
}

function classifyTicketDeterministically(params: {
  subject: string;
  category: string;
  message: string;
  requestedPriority?: string;
}): {
  urgency: 'Low' | 'Medium' | 'High' | 'Urgent';
  shouldEscalate: boolean;
  escalationReason: string;
  confidence: number;
  draftReply: string;
} {
  const combined = `${params.subject} ${params.category} ${params.message}`.toLowerCase();
  const keywords = automationSettings.supportManagement.escalationKeywords || [];
  const matchedKeywords = keywords.filter(k => k && combined.includes(k.toLowerCase()));

  const urgentMatch =
    matchedKeywords.some(k =>
      ['legal', 'dmca', 'copyright', 'fraud', 'chargeback', 'urgent', 'suspend'].includes(k.toLowerCase())
    ) || params.requestedPriority === 'Urgent';

  const highMatch = matchedKeywords.length > 0 || params.requestedPriority === 'High';

  const urgency: 'Low' | 'Medium' | 'High' | 'Urgent' = urgentMatch
    ? 'Urgent'
    : highMatch
      ? 'High'
      : 'Medium';

  const shouldEscalate = matchedKeywords.length > 0 || urgency === 'Urgent' || urgency === 'High';
  const escalationReason =
    matchedKeywords.length > 0
      ? `Matched sensitive/escalation keyword(s): ${matchedKeywords.join(', ')}`
      : urgency === 'Urgent' || urgency === 'High'
        ? `Ticket marked ${urgency} urgency requiring Super Admin review`
        : '';

  const confidence = shouldEscalate ? 62 : 88;

  const tone = automationSettings.aiBehaviour.responseTone;
  const greeting = tone === 'concise' ? 'Hello,' : tone === 'warm' ? 'Namaste & Warm Greetings,' : 'Namaste,';

  let guidanceBody = `Thank you for contacting Rudraatma Music Distribution regarding "${params.subject}".`;
  if (combined.includes('isrc') || combined.includes('upc') || combined.includes('metadata')) {
    guidanceBody +=
      ' Our catalog operations team generates UPC/ISRC identifiers automatically during release approval, or you can enter your existing valid codes inside the Release Builder metadata editor.';
  } else if (combined.includes('payout') || combined.includes('royalty') || combined.includes('withdraw')) {
    guidanceBody +=
      ' Royalty statements are reconciled monthly and payouts require verified bank/PAN details under Artist Profile -> Optional Payout KYC. Your balance and statement audit records are being reviewed by our finance desk.';
  } else if (combined.includes('spotify') || combined.includes('youtube') || combined.includes('live')) {
    guidanceBody +=
      ' Once approved, standard DSP delivery takes 24–72 business hours for Spotify, Apple Music, and YouTube Music ingestion. You can monitor live release status inside your Releases panel.';
  } else {
    guidanceBody +=
      ' Our distribution desk has received your ticket details and is verifying your request so we can provide an accurate update promptly.';
  }

  const draftReply = `${greeting}\n\n${guidanceBody}\n\nBest Regards,\nRudraatma Music Support Desk`;

  return { urgency, shouldEscalate, escalationReason, confidence, draftReply };
}

export async function processSupportTicketWithAi(
  deps: AiAutomationDeps,
  params: {
    user: any;
    dashboard: any;
    ticket: any;
    actorEmail?: string;
    manualTrigger?: boolean;
  }
): Promise<{
  processed: boolean;
  blockedReason?: string;
  actionTaken: string;
  ticket: any;
}> {
  const { user, dashboard, ticket } = params;
  const actorEmail = params.actorEmail || 'RUDRA_AI_AUTOMATION';
  const sm = automationSettings.supportManagement;
  const master = isAiMasterActive();

  if (!master.allowed) {
    ticket.aiProcessingStatus = 'PAUSED';
    ticket.aiLastNote = master.reason;
    await deps.dbSaveDashboard(user.id, dashboard);
    await appendAutomationLog({
      actorEmail,
      actorRole: params.manualTrigger ? 'SUPER_ADMIN' : 'SYSTEM_AI',
      permissionKey: 'aiBehaviour.aiMasterPaused',
      action: 'AI_TICKET_SKIPPED_PAUSED',
      targetType: 'support_ticket',
      targetId: ticket.id,
      status: 'BLOCKED',
      details: master.reason || 'AI master pause active.'
    });
    return { processed: false, blockedReason: master.reason, actionTaken: 'BLOCKED_MASTER_PAUSE', ticket };
  }

  if (!sm.allowAiReadSupportTickets) {
    const reason = 'Blocked: "Allow AI to Read Support Tickets" is disabled.';
    ticket.aiProcessingStatus = 'BLOCKED_READ_PERMISSION';
    ticket.aiLastNote = reason;
    await deps.dbSaveDashboard(user.id, dashboard);
    await appendAutomationLog({
      actorEmail,
      actorRole: params.manualTrigger ? 'SUPER_ADMIN' : 'SYSTEM_AI',
      permissionKey: 'supportManagement.allowAiReadSupportTickets',
      action: 'AI_TICKET_READ_BLOCKED',
      targetType: 'support_ticket',
      targetId: ticket.id,
      status: 'BLOCKED',
      details: reason
    });
    return { processed: false, blockedReason: reason, actionTaken: 'BLOCKED_READ', ticket };
  }

  const rawBody = String(ticket.messages?.[0]?.text || ticket.message || '').trim();
  const baseClassification = classifyTicketDeterministically({
    subject: ticket.subject || '',
    category: ticket.category || 'General Inquiry',
    message: rawBody,
    requestedPriority: ticket.priority
  });

  let finalUrgency = baseClassification.urgency;
  let shouldEscalate = baseClassification.shouldEscalate;
  let escalationReason = baseClassification.escalationReason;
  let confidence = baseClassification.confidence;
  let draftReply = baseClassification.draftReply;
  let aiCategory = ticket.category || 'General Inquiry';

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey && automationSettings.privacySecurity.allowExternalAiContext) {
    try {
      const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
      const activeModel = automationSettings.aiBehaviour.activeModel || 'gemini-2.5-flash';
      const prompt = `You are Rudra AI Support Triage for Rudraatma Music Distribution.
Analyze the support ticket below and return ONLY valid JSON with keys:
{ "category": string, "urgency": "Low"|"Medium"|"High"|"Urgent", "shouldEscalate": boolean, "escalationReason": string, "confidence": number, "draftReply": string }.
Tone: ${automationSettings.aiBehaviour.responseTone}.
Guidelines: ${automationSettings.aiBehaviour.systemGuidance}
Never promise refunds or unverified approvals.
Subject: ${redactSensitiveTextForPrompt(ticket.subject || '')}
Category: ${ticket.category || 'General Inquiry'}
Message: ${redactSensitiveTextForPrompt(rawBody.slice(0, 1200))}`;

      const resp = await ai.models.generateContent({
        model: activeModel,
        contents: prompt
      });
      const rawText = String(resp.text || '').trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.category) aiCategory = String(parsed.category);
        if (['Low', 'Medium', 'High', 'Urgent'].includes(parsed.urgency)) {
          finalUrgency = parsed.urgency;
        }
        if (typeof parsed.shouldEscalate === 'boolean') {
          shouldEscalate = shouldEscalate || parsed.shouldEscalate;
        }
        if (parsed.escalationReason && !escalationReason) {
          escalationReason = String(parsed.escalationReason);
        }
        if (typeof parsed.confidence === 'number') {
          confidence = Math.max(0, Math.min(100, Math.round(parsed.confidence)));
        }
        if (parsed.draftReply && String(parsed.draftReply).trim().length > 15) {
          draftReply = String(parsed.draftReply).trim();
        }
      }
    } catch {
      // Safe deterministic classification already prepared
    }
  }

  if (confidence < automationSettings.aiBehaviour.confidenceThreshold && !shouldEscalate) {
    shouldEscalate = true;
    escalationReason = `AI confidence (${confidence}%) is below threshold (${automationSettings.aiBehaviour.confidenceThreshold}%).`;
  }

  ticket.aiAnalyzedAt = new Date().toISOString();
  ticket.aiCategory = aiCategory;
  ticket.aiConfidence = confidence;
  ticket.priority = finalUrgency;

  let actionTaken = 'CLASSIFIED_ONLY';

  // Escalation handling
  if (shouldEscalate) {
    if (sm.allowAiEscalateTickets) {
      ticket.escalatedToSuperAdmin = true;
      ticket.escalationReason = escalationReason || 'Flagged for Super Admin escalation';
      ticket.assignedTo = 'Super Admin Escalation Desk';
      actionTaken = 'ESCALATED';

      const escNotif = {
        id: 'tckesc_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
        recipient_user_id: 'SUPER_ADMIN',
        release_id: ticket.id,
        notification_type: 'changes_requested',
        title: `Escalated Support Ticket (${finalUrgency}) · ${ticket.id}`,
        message: `${user.email} opened "${ticket.subject}". Escalation reason: ${ticket.escalationReason}`,
        created_at: new Date().toISOString(),
        expires_at: Date.now() + 7 * 24 * 3600 * 1000
      };
      deps.notifications.set(escNotif.id, escNotif);
      await deps.dbSaveNotification({ ...escNotif, userId: 'SUPER_ADMIN' }).catch(() => {});

      await appendAutomationLog({
        actorEmail,
        actorRole: params.manualTrigger ? 'SUPER_ADMIN' : 'SYSTEM_AI',
        permissionKey: 'supportManagement.allowAiEscalateTickets',
        action: 'AI_TICKET_ESCALATED',
        targetType: 'support_ticket',
        targetId: ticket.id,
        status: 'SUCCESS',
        details: `Ticket ${ticket.id} escalated (${finalUrgency}): ${ticket.escalationReason}`
      });
    } else {
      ticket.escalatedToSuperAdmin = false;
      ticket.escalationReason = `Escalation suggested (${escalationReason}) but "Allow AI to Escalate Tickets" is OFF.`;
      await appendAutomationLog({
        actorEmail,
        actorRole: params.manualTrigger ? 'SUPER_ADMIN' : 'SYSTEM_AI',
        permissionKey: 'supportManagement.allowAiEscalateTickets',
        action: 'AI_TICKET_ESCALATION_BLOCKED',
        targetType: 'support_ticket',
        targetId: ticket.id,
        status: 'BLOCKED',
        details: `Escalation suppressed for ${ticket.id}: permission disabled.`
      });
    }
  }

  // Reply Generation & Auto-Reply vs Draft for Approval
  if (!sm.allowAiGenerateSupportReplies) {
    ticket.aiProcessingStatus = shouldEscalate ? 'ESCALATED_NO_REPLY' : 'CLASSIFIED_ONLY';
    ticket.aiDraftReply = undefined;
    ticket.aiDraftStatus = 'DISABLED';
    await deps.dbSaveDashboard(user.id, dashboard);
    await appendAutomationLog({
      actorEmail,
      actorRole: params.manualTrigger ? 'SUPER_ADMIN' : 'SYSTEM_AI',
      permissionKey: 'supportManagement.allowAiGenerateSupportReplies',
      action: 'AI_TICKET_REPLY_GENERATION_BLOCKED',
      targetType: 'support_ticket',
      targetId: ticket.id,
      status: 'BLOCKED',
      details: `Ticket ${ticket.id} classified without reply draft because "Allow AI to Generate Replies" is OFF.`
    });
    return { processed: true, actionTaken, ticket };
  }

  const effectiveAutoSend = sm.allowAiAutoReplyTickets && !shouldEscalate;

  if (effectiveAutoSend) {
    ticket.messages = ticket.messages || [];
    ticket.messages.push({
      sender: 'Rudra AI Support Assistant',
      text: draftReply,
      time: new Date().toISOString().replace('T', ' ').slice(0, 16)
    });
    ticket.status = 'Pending';
    ticket.updatedAt = new Date().toISOString().split('T')[0];
    ticket.aiDraftReply = draftReply;
    ticket.aiDraftStatus = 'AUTO_SENT';
    ticket.aiProcessingStatus = 'AUTO_REPLIED';
    actionTaken = 'AUTO_REPLIED';

    // Notify user in-app
    const replyNotif = {
      id: 'tckai_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      recipient_user_id: user.id,
      release_id: ticket.id,
      notification_type: 'approved',
      title: `Support Update · ${ticket.id}`,
      message: `Your support ticket "${ticket.subject}" received an automated response.`,
      created_at: new Date().toISOString(),
      expires_at: Date.now() + 72 * 3600 * 1000
    };
    deps.notifications.set(replyNotif.id, replyNotif);
    await deps.dbSaveNotification({ ...replyNotif, userId: user.id }).catch(() => {});

    // Optional email notification if both global & ticket notification toggles allow
    if (
      sm.allowAiSendTicketNotifications &&
      automationSettings.emailNotifications.allowAutomaticEmailSending
    ) {
      await sendSupportTicketNotificationEmail({
        email: user.email,
        ticketId: ticket.id,
        subject: ticket.subject,
        title: `Update on Ticket ${ticket.id}: ${ticket.subject}`,
        body: draftReply,
        purpose: 'ticket_auto_reply'
      });
    } else if (sm.allowAiSendTicketNotifications && !automationSettings.emailNotifications.allowAutomaticEmailSending) {
      await appendAutomationLog({
        actorEmail,
        actorRole: 'SYSTEM_AI',
        permissionKey: 'emailNotifications.allowAutomaticEmailSending',
        action: 'AI_TICKET_EMAIL_BLOCKED',
        targetType: 'support_ticket',
        targetId: ticket.id,
        status: 'BLOCKED',
        details: `Ticket email alert suppressed for ${ticket.id}: Automatic Email Sending is OFF.`
      });
    }

    await appendAutomationLog({
      actorEmail,
      actorRole: params.manualTrigger ? 'SUPER_ADMIN' : 'SYSTEM_AI',
      permissionKey: 'supportManagement.allowAiAutoReplyTickets',
      action: 'AI_SUPPORT_AUTO_REPLIED',
      targetType: 'support_ticket',
      targetId: ticket.id,
      status: 'SUCCESS',
      details: `Auto-replied to ticket ${ticket.id} (${user.email}) with ${confidence}% confidence.`
    });
  } else {
    // Store draft strictly for Super Admin review — do NOT post public/user reply!
    ticket.aiDraftReply = draftReply;
    ticket.aiDraftStatus = 'PENDING_APPROVAL';
    ticket.aiProcessingStatus = shouldEscalate ? 'ESCALATED_WITH_DRAFT' : 'DRAFT_PENDING_APPROVAL';
    actionTaken = shouldEscalate ? 'ESCALATED_WITH_DRAFT' : 'DRAFT_QUEUED_FOR_APPROVAL';

    await appendAutomationLog({
      actorEmail,
      actorRole: params.manualTrigger ? 'SUPER_ADMIN' : 'SYSTEM_AI',
      permissionKey: 'supportManagement.allowAiGenerateSupportReplies',
      action: 'AI_SUPPORT_DRAFT_PREPARED',
      targetType: 'support_ticket',
      targetId: ticket.id,
      status: 'SUCCESS',
      details: `Prepared AI draft reply for ticket ${ticket.id} (${shouldEscalate ? 'escalated for review' : 'awaiting Super Admin approval'}).`
    });
  }

  await deps.dbSaveDashboard(user.id, dashboard);
  return { processed: true, actionTaken, ticket };
}

// ======================== ROUTE REGISTRATION ========================

export function registerAiAutomationRoutes(app: express.Express, deps: AiAutomationDeps): void {
  initializedDeps = deps;

  function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });
    if (user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Access forbidden. SUPER_ADMIN role required.' });
    }
    (req as any).superAdmin = user;
    next();
  }

  // Start background campaign scheduler (every 30s) in runtime mode
  if (process.env.RUDRAATMA_SKIP_AUTO_START !== '1' && !schedulerHandle) {
    schedulerHandle = setInterval(() => {
      runDueScheduledCampaigns(deps).catch(err => {
        console.error('[Rudraatma Scheduler] Campaign check error:', err?.message);
      });
    }, 30_000);
    if (typeof schedulerHandle.unref === 'function') schedulerHandle.unref();
  }

  // -------------------- 1. SETTINGS & PERMISSIONS --------------------

  app.get('/api/super-admin/ai-automation/settings', requireSuperAdmin, async (_req, res) => {
    const emailDiag = getSafeEmailDiagnostics();
    let dbConnected = !isDatabaseEnabled();
    if (isDatabaseEnabled()) {
      try {
        await getDbPool().query('SELECT 1');
        dbConnected = true;
      } catch {
        dbConnected = false;
      }
    }

    return res.json({
      settings: automationSettings,
      integrations: {
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        appsScriptConfigured: Boolean(emailDiag.configured && emailDiag.validHttpsUrl),
        databaseConnected: dbConnected,
        razorpayConfigured: Boolean(
          process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim()
        )
      }
    });
  });

  app.put('/api/super-admin/ai-automation/settings', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const body = req.body || {};
    const changedSections: string[] = [];

    const allowedSections: Array<keyof AiAutomationSettings> = [
      'general',
      'chatHistory',
      'userPermissions',
      'privacySecurity',
      'aiBehaviour',
      'emailNotifications',
      'supportManagement',
      'automationApprovals',
      'apiIntegrations',
      'accountManagement'
    ];

    for (const sec of allowedSections) {
      if (body[sec] && typeof body[sec] === 'object' && !Array.isArray(body[sec])) {
        mergeDeepSettings((automationSettings as any)[sec], body[sec]);
        changedSections.push(sec);
      }
    }

    // Clamp numeric values safely
    automationSettings.aiBehaviour.confidenceThreshold = Math.max(
      40,
      Math.min(100, Number(automationSettings.aiBehaviour.confidenceThreshold || 78))
    );
    automationSettings.aiBehaviour.temperature = Math.max(
      0,
      Math.min(1, Number(automationSettings.aiBehaviour.temperature ?? 0.3))
    );
    automationSettings.emailNotifications.dailyPromoSendCap = Math.max(
      1,
      Math.min(50000, Number(automationSettings.emailNotifications.dailyPromoSendCap || 1000))
    );
    automationSettings.chatHistory.retentionDays = Math.max(
      1,
      Math.min(730, Number(automationSettings.chatHistory.retentionDays || 90))
    );

    automationSettings.updatedAt = new Date().toISOString();
    automationSettings.updatedBy = admin.email;

    await dbSavePlatformSetting('ai_automation_settings', automationSettings);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: changedSections.join(',') || 'settings.global',
      action: 'AI_AUTOMATION_SETTINGS_UPDATED',
      targetType: 'settings',
      targetId: 'ai_automation_settings',
      status: 'SUCCESS',
      details: `Updated Settings section(s): [${changedSections.join(', ')}]. MasterPaused=${automationSettings.aiBehaviour.aiMasterPaused}, PromoAI=${automationSettings.emailNotifications.allowAiPromotionalEmailAutomation}, TicketAutoReply=${automationSettings.supportManagement.allowAiAutoReplyTickets}.`
    });
    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      'AI_AUTOMATION_SETTINGS_UPDATED',
      'settings',
      'ai_automation',
      `Updated AI & Automation Settings sections: ${changedSections.join(', ')}`
    );

    return res.json({ success: true, settings: automationSettings });
  });

  app.post('/api/super-admin/ai-automation/pause', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const reason = String(req.body?.reason || 'Immediate Super Admin pause triggered').trim();

    automationSettings.aiBehaviour.aiMasterPaused = true;
    automationSettings.accountManagement.pauseNote = reason;
    automationSettings.accountManagement.lastPausedAt = new Date().toISOString();
    automationSettings.accountManagement.lastPausedBy = admin.email;

    if (req.body?.revokeAllSubPermissions) {
      automationSettings.emailNotifications.allowAiPromotionalEmailAutomation = false;
      automationSettings.emailNotifications.allowAutomaticEmailSending = false;
      automationSettings.supportManagement.allowAiAutoReplyTickets = false;
      automationSettings.supportManagement.allowAiSendTicketNotifications = false;
    }

    await dbSavePlatformSetting('ai_automation_settings', automationSettings);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'aiBehaviour.aiMasterPaused',
      action: 'AI_AUTOMATION_PAUSED',
      targetType: 'automation_control',
      targetId: 'master_switch',
      status: 'SUCCESS',
      details: `${reason}${req.body?.revokeAllSubPermissions ? ' (Sub-permissions revoked)' : ''}`
    });
    await deps.recordAudit(
      admin.email,
      'SUPER_ADMIN',
      'AI_AUTOMATION_PAUSED',
      'settings',
      'master_switch',
      reason
    );

    return res.json({ success: true, settings: automationSettings });
  });

  app.post('/api/super-admin/ai-automation/resume', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    automationSettings.aiBehaviour.aiMasterPaused = false;
    automationSettings.aiBehaviour.aiEnabled = true;
    automationSettings.accountManagement.pauseNote = '';

    await dbSavePlatformSetting('ai_automation_settings', automationSettings);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'aiBehaviour.aiMasterPaused',
      action: 'AI_AUTOMATION_RESUMED',
      targetType: 'automation_control',
      targetId: 'master_switch',
      status: 'SUCCESS',
      details: 'Super Admin resumed master AI Automation engine.'
    });

    return res.json({ success: true, settings: automationSettings });
  });

  // -------------------- 2. AI AUTOMATION DASHBOARD OVERVIEW --------------------

  app.get('/api/super-admin/ai-automation/overview', requireSuperAdmin, (req, res) => {
    const includeTest = req.query.includeTest === 'true';

    let totalRegisteredUsers = 0;
    let promoOptOutUsers = 0;
    let totalTickets = 0;
    let pendingTickets = 0;
    let resolvedTickets = 0;
    let escalatedTickets = 0;
    let aiGeneratedReplies = 0;
    let aiPendingDraftApprovals = 0;

    for (const u of deps.users.values()) {
      if (u.role === 'SUPER_ADMIN') continue;
      if (!includeTest && isTestOrDemoUser(u)) continue;
      totalRegisteredUsers++;
      if (u.promoOptOut === true) promoOptOutUsers++;

      const dash = deps.userDashboards.get(u.id);
      for (const t of dash?.tickets || []) {
        totalTickets++;
        if (t.status === 'Resolved') resolvedTickets++;
        else pendingTickets++;
        if (t.escalatedToSuperAdmin) escalatedTickets++;
        if (t.aiDraftStatus === 'AUTO_SENT' || t.aiDraftStatus === 'APPROVED_AND_SENT') {
          aiGeneratedReplies++;
        }
        if (t.aiDraftStatus === 'PENDING_APPROVAL') {
          aiPendingDraftApprovals++;
        }
      }
    }

    let promoEmailsSent = 0;
    let promoEmailsFailed = 0;
    let promoEmailsPending = 0;
    for (const c of promoCampaigns) {
      promoEmailsSent += Number(c.stats?.deliveredCount || 0);
      promoEmailsFailed += Number(c.stats?.failedCount || 0);
      if (c.status === 'SCHEDULED' || c.status === 'PENDING_APPROVAL' || c.status === 'APPROVED') {
        const est = getEligiblePromoRecipients(deps, c.segment, c.specificEmails, true).eligible.length;
        promoEmailsPending += est;
      }
    }

    return res.json({
      metrics: {
        totalRegisteredUsers,
        promoEligibleUsers: Math.max(0, totalRegisteredUsers - promoOptOutUsers),
        promoOptOutUsers,
        totalTickets,
        pendingTickets,
        resolvedTickets,
        escalatedTickets,
        aiGeneratedReplies,
        aiPendingDraftApprovals,
        totalCampaigns: promoCampaigns.length,
        promoEmailsSent,
        promoEmailsFailed,
        promoEmailsPending
      },
      statusSummary: {
        aiMasterPaused: automationSettings.aiBehaviour.aiMasterPaused,
        aiEnabled: automationSettings.aiBehaviour.aiEnabled,
        promoAutomationEnabled: automationSettings.emailNotifications.allowAiPromotionalEmailAutomation,
        autoEmailSendingEnabled: automationSettings.emailNotifications.allowAutomaticEmailSending,
        ticketAutoReplyEnabled: automationSettings.supportManagement.allowAiAutoReplyTickets,
        ticketEscalationEnabled: automationSettings.supportManagement.allowAiEscalateTickets
      },
      recentActions: automationLogs.slice(0, 20)
    });
  });

  // -------------------- 3. PROMOTIONAL EMAIL CAMPAIGNS --------------------

  app.get('/api/super-admin/ai-automation/campaigns', requireSuperAdmin, (_req, res) => {
    return res.json({
      campaigns: promoCampaigns,
      dailySentLast24h: countPromoEmailsSentLast24Hours(),
      dailyCap: automationSettings.emailNotifications.dailyPromoSendCap
    });
  });

  app.post('/api/super-admin/ai-automation/campaigns/preview', requireSuperAdmin, (req, res) => {
    const {
      subject,
      headline,
      preheader,
      categoryLabel,
      bodyText,
      ctaLabel,
      ctaUrl,
      recipientName,
      segment,
      specificEmails
    } = req.body || {};

    const rendered = buildPromotionalEmailTemplate({
      subject: String(subject || 'Rudraatma Music Distribution Announcement'),
      headline: String(headline || subject || 'Exciting Platform Update'),
      preheader: preheader ? String(preheader) : undefined,
      categoryLabel: String(categoryLabel || 'ANNOUNCEMENT & OFFERS'),
      bodyText: String(bodyText || 'Stay tuned for new releases, distribution tools, and artist updates.'),
      ctaLabel: ctaLabel ? String(ctaLabel) : undefined,
      ctaUrl: ctaUrl ? String(ctaUrl) : undefined,
      recipientName: String(recipientName || 'Independent Artist'),
      unsubscribeUrl: `${OFFICIAL_WEBSITE_URL}/api/unsubscribe?token=preview-token`
    });

    const audience = segment
      ? getEligiblePromoRecipients(deps, segment as PromoSegment, specificEmails, true)
      : { eligible: [], skippedOptOutCount: 0, skippedInactiveCount: 0 };

    return res.json({
      ...rendered,
      audiencePreview: {
        eligibleCount: audience.eligible.length,
        skippedOptOutCount: audience.skippedOptOutCount,
        skippedInactiveCount: audience.skippedInactiveCount
      }
    });
  });

  app.post('/api/super-admin/ai-automation/campaigns/ai-draft', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const master = isAiMasterActive();
    if (!master.allowed) {
      await appendAutomationLog({
        actorEmail: admin.email,
        actorRole: 'SUPER_ADMIN',
        permissionKey: 'aiBehaviour.aiMasterPaused',
        action: 'PROMO_AI_DRAFT_BLOCKED',
        targetType: 'promo_campaign',
        targetId: 'draft_generator',
        status: 'BLOCKED',
        details: master.reason || 'Master AI paused.'
      });
      return res.status(403).json({ error: master.reason });
    }

    if (!automationSettings.emailNotifications.allowAiPromotionalEmailAutomation) {
      const err =
        'Blocked: "Allow AI Promotional Email Automation" permission must be ON for AI to prepare promotional emails.';
      await appendAutomationLog({
        actorEmail: admin.email,
        actorRole: 'SUPER_ADMIN',
        permissionKey: 'emailNotifications.allowAiPromotionalEmailAutomation',
        action: 'PROMO_AI_DRAFT_BLOCKED',
        targetType: 'promo_campaign',
        targetId: 'draft_generator',
        status: 'BLOCKED',
        details: err
      });
      return res.status(403).json({ error: err });
    }

    const { topic, audienceSegment } = req.body || {};
    const cleanTopic = String(topic || 'New Music Distribution Features & Royalty Tools').trim();

    let draft = {
      subject: `${cleanTopic} — Rudraatma Music Distribution`,
      headline: cleanTopic,
      preheader: 'Important update and opportunities for Rudraatma Music Distribution artists.',
      categoryLabel: 'PLATFORM ANNOUNCEMENT',
      bodyText: `We are excited to share our latest update: ${cleanTopic}.\n\nLog in to your Rudraatma artist dashboard to explore new distribution workflows, analytics, and priority release support tailored for independent artists and labels.`,
      ctaLabel: 'Open Artist Dashboard',
      ctaUrl: `${OFFICIAL_WEBSITE_URL}/dashboard`
    };

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (apiKey && automationSettings.privacySecurity.allowExternalAiContext) {
      try {
        const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
        const resp = await ai.models.generateContent({
          model: automationSettings.aiBehaviour.activeModel || 'gemini-2.5-flash',
          contents: `Create a high-trust promotional email draft for Rudraatma Music Distribution (segment: ${audienceSegment || 'all_eligible'}). Topic: ${cleanTopic}.
Return ONLY valid JSON: { "subject": string, "headline": string, "preheader": string, "categoryLabel": string, "bodyText": string, "ctaLabel": string }. Keep claims honest and relevant to music distribution.`
        });
        const raw = String(resp.text || '');
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          draft = { ...draft, ...parsed };
        }
      } catch {
        // Fallback already populated
      }
    }

    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.allowAiPromotionalEmailAutomation',
      action: 'PROMO_AI_DRAFT_GENERATED',
      targetType: 'promo_campaign',
      targetId: 'draft_generator',
      status: 'SUCCESS',
      details: `Generated promotional email draft for topic "${cleanTopic}".`
    });

    return res.json({ success: true, draft });
  });

  app.post('/api/super-admin/ai-automation/campaigns', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const {
      name,
      subject,
      headline,
      preheader,
      categoryLabel,
      bodyText,
      ctaLabel,
      ctaUrl,
      segment,
      specificEmails,
      scheduledFor
    } = req.body || {};

    if (!subject || !bodyText) {
      return res.status(400).json({ error: 'Subject and email body are required.' });
    }

    const chosenSegment: PromoSegment = [
      'all_eligible',
      'active_subscribers',
      'free_users',
      'approved_artists',
      'specific_emails'
    ].includes(segment)
      ? segment
      : 'all_eligible';

    const audience = getEligiblePromoRecipients(deps, chosenSegment, specificEmails, true);
    const nowIso = new Date().toISOString();

    const needsApproval = automationSettings.emailNotifications.promoRequireSuperAdminApproval;
    const isScheduled = Boolean(scheduledFor);

    const campaign: PromoEmailCampaign = {
      id: 'camp_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
      name: String(name || subject).trim(),
      subject: String(subject).trim(),
      headline: String(headline || subject).trim(),
      preheader: preheader ? String(preheader).trim() : '',
      categoryLabel: String(categoryLabel || 'ANNOUNCEMENT & OFFERS').trim(),
      bodyText: String(bodyText).trim(),
      ctaLabel: ctaLabel ? String(ctaLabel).trim() : '',
      ctaUrl: ctaUrl ? String(ctaUrl).trim() : '',
      segment: chosenSegment,
      specificEmails: Array.isArray(specificEmails) ? specificEmails : [],
      status: isScheduled ? (needsApproval ? 'PENDING_APPROVAL' : 'SCHEDULED') : needsApproval ? 'PENDING_APPROVAL' : 'DRAFT',
      scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      createdBy: admin.email,
      createdAt: nowIso,
      updatedAt: nowIso,
      approvedBy: null,
      approvedAt: null,
      stats: {
        totalRecipients: audience.eligible.length,
        deliveredCount: 0,
        failedCount: 0,
        pendingCount: audience.eligible.length,
        skippedOptOutCount: audience.skippedOptOutCount
      },
      recipientResults: []
    };

    promoCampaigns.unshift(campaign);
    await dbSavePlatformSetting('promo_email_campaigns', promoCampaigns);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.allowAiPromotionalEmailAutomation',
      action: 'PROMO_CAMPAIGN_CREATED',
      targetType: 'promo_campaign',
      targetId: campaign.id,
      status: 'SUCCESS',
      details: `Created campaign "${campaign.name}" (segment=${chosenSegment}, eligible=${audience.eligible.length}, optOutSkipped=${audience.skippedOptOutCount}).`
    });

    return res.json({ success: true, campaign });
  });

  app.put('/api/super-admin/ai-automation/campaigns/:id', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const camp = promoCampaigns.find(c => c.id === req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });
    if (camp.status === 'COMPLETED' || camp.status === 'SENDING') {
      return res.status(400).json({ error: 'Completed or active campaigns cannot be edited.' });
    }

    const body = req.body || {};
    if (body.name !== undefined) camp.name = String(body.name).trim();
    if (body.subject !== undefined) camp.subject = String(body.subject).trim();
    if (body.headline !== undefined) camp.headline = String(body.headline).trim();
    if (body.preheader !== undefined) camp.preheader = String(body.preheader).trim();
    if (body.categoryLabel !== undefined) camp.categoryLabel = String(body.categoryLabel).trim();
    if (body.bodyText !== undefined) camp.bodyText = String(body.bodyText).trim();
    if (body.ctaLabel !== undefined) camp.ctaLabel = String(body.ctaLabel).trim();
    if (body.ctaUrl !== undefined) camp.ctaUrl = String(body.ctaUrl).trim();
    if (body.segment !== undefined) camp.segment = body.segment;
    if (Array.isArray(body.specificEmails)) camp.specificEmails = body.specificEmails;
    if (body.scheduledFor !== undefined) {
      camp.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor).toISOString() : null;
    }

    const audience = getEligiblePromoRecipients(deps, camp.segment, camp.specificEmails, true);
    camp.stats.totalRecipients = audience.eligible.length;
    camp.stats.pendingCount = audience.eligible.length;
    camp.stats.skippedOptOutCount = audience.skippedOptOutCount;
    camp.updatedAt = new Date().toISOString();

    await dbSavePlatformSetting('promo_email_campaigns', promoCampaigns);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.allowAiPromotionalEmailAutomation',
      action: 'PROMO_CAMPAIGN_UPDATED',
      targetType: 'promo_campaign',
      targetId: camp.id,
      status: 'SUCCESS',
      details: `Updated campaign "${camp.name}".`
    });

    return res.json({ success: true, campaign: camp });
  });

  app.delete('/api/super-admin/ai-automation/campaigns/:id', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const idx = promoCampaigns.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Campaign not found.' });
    const [removed] = promoCampaigns.splice(idx, 1);
    await dbSavePlatformSetting('promo_email_campaigns', promoCampaigns);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.allowAiPromotionalEmailAutomation',
      action: 'PROMO_CAMPAIGN_DELETED',
      targetType: 'promo_campaign',
      targetId: removed.id,
      status: 'SUCCESS',
      details: `Deleted campaign "${removed.name}".`
    });
    return res.json({ success: true });
  });

  app.post('/api/super-admin/ai-automation/campaigns/:id/approve', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const camp = promoCampaigns.find(c => c.id === req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });

    camp.approvedBy = admin.email;
    camp.approvedAt = new Date().toISOString();
    camp.status = camp.scheduledFor ? 'SCHEDULED' : 'APPROVED';
    camp.updatedAt = camp.approvedAt;

    await dbSavePlatformSetting('promo_email_campaigns', promoCampaigns);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.promoRequireSuperAdminApproval',
      action: 'PROMO_CAMPAIGN_APPROVED',
      targetType: 'promo_campaign',
      targetId: camp.id,
      status: 'SUCCESS',
      details: `Super Admin approved campaign "${camp.name}" (${camp.status}).`
    });

    return res.json({ success: true, campaign: camp });
  });

  app.post('/api/super-admin/ai-automation/campaigns/:id/send', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const camp = promoCampaigns.find(c => c.id === req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });

    const confirmSend = Boolean(req.body?.confirmSend);
    if (confirmSend && !camp.approvedBy) {
      camp.approvedBy = admin.email;
      camp.approvedAt = new Date().toISOString();
    }

    const result = await dispatchPromoCampaign(deps, camp, admin.email, {
      bypassApprovalCheck: confirmSend && Boolean(camp.approvedBy)
    });

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error, campaign: result.campaign });
    }
    return res.json({ success: true, campaign: result.campaign });
  });

  app.post('/api/super-admin/ai-automation/campaigns/:id/cancel', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const camp = promoCampaigns.find(c => c.id === req.params.id);
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });

    camp.status = 'CANCELLED';
    camp.updatedAt = new Date().toISOString();
    await dbSavePlatformSetting('promo_email_campaigns', promoCampaigns);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'emailNotifications.allowAiPromotionalEmailAutomation',
      action: 'PROMO_CAMPAIGN_CANCELLED',
      targetType: 'promo_campaign',
      targetId: camp.id,
      status: 'SUCCESS',
      details: `Cancelled campaign "${camp.name}".`
    });

    return res.json({ success: true, campaign: camp });
  });

  // -------------------- 4. USER PROMOTIONAL OPT-OUT & UNSUBSCRIBE --------------------

  app.get('/api/dashboard/preferences/email', (req, res) => {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });
    return res.json({
      promoOptOut: Boolean(user.promoOptOut),
      promoOptOutAt: user.promoOptOutAt || null
    });
  });

  app.put('/api/dashboard/preferences/email', async (req, res) => {
    const user = deps.getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });
    if (!automationSettings.userPermissions.allowUserPromoOptOut) {
      return res.status(403).json({ error: 'Email preference self-service is temporarily restricted.' });
    }
    const optOut = Boolean(req.body?.promoOptOut);
    user.promoOptOut = optOut;
    user.promoOptOutAt = optOut ? new Date().toISOString() : undefined;
    user.promoOptOutToken = ensureUserUnsubscribeToken(user);
    await deps.dbUpsertUser(user);

    await appendAutomationLog({
      actorEmail: user.email,
      actorRole: user.role,
      permissionKey: 'userPermissions.allowUserPromoOptOut',
      action: optOut ? 'PROMO_EMAIL_OPTED_OUT' : 'PROMO_EMAIL_OPTED_IN',
      targetType: 'user',
      targetId: user.id,
      status: 'SUCCESS',
      details: `User ${user.email} set promotional opt-out=${optOut}.`
    });

    return res.json({
      success: true,
      promoOptOut: Boolean(user.promoOptOut),
      promoOptOutAt: user.promoOptOutAt || null
    });
  });

  app.get('/api/unsubscribe', async (req, res) => {
    const token = String(req.query.token || '').trim();
    const user = token ? verifyUnsubscribeToken(token, deps.users) : null;
    if (!user) {
      return res
        .status(400)
        .type('text/html')
        .send(
          '<!doctype html><html><body style="background:#07070a;color:#f8fafc;font-family:sans-serif;padding:40px;text-align:center;"><h2>Invalid or expired unsubscribe link</h2><p>You can update email preferences inside your Rudraatma dashboard.</p></body></html>'
        );
    }

    user.promoOptOut = true;
    user.promoOptOutAt = new Date().toISOString();
    await deps.dbUpsertUser(user);
    await appendAutomationLog({
      actorEmail: user.email,
      actorRole: user.role,
      permissionKey: 'user.unsubscribeLink',
      action: 'PROMO_UNSUBSCRIBED_ONE_CLICK',
      targetType: 'user',
      targetId: user.id,
      status: 'SUCCESS',
      details: `User ${user.email} unsubscribed from promotional emails via link.`
    });

    return res
      .status(200)
      .type('text/html')
      .send(
        `<!doctype html><html><body style="background:#07070a;color:#f8fafc;font-family:sans-serif;padding:40px;text-align:center;"><div style="max-width:500px;margin:auto;background:#0d0d12;border:1px solid #d4af37;border-radius:14px;padding:30px;"><h2 style="color:#facc15;margin-top:0;">Unsubscribed Successfully</h2><p>${user.email} has been opted out of Rudraatma Music Distribution promotional emails.</p><p style="color:#94a3b8;font-size:13px;">Essential security & OTP verification emails remain unaffected.</p></div></body></html>`
      );
  });

  app.post('/api/unsubscribe', async (req, res) => {
    const token = String(req.body?.token || req.query?.token || '').trim();
    const user = token ? verifyUnsubscribeToken(token, deps.users) : null;
    if (!user) return res.status(400).json({ error: 'Invalid unsubscribe token.' });

    user.promoOptOut = true;
    user.promoOptOutAt = new Date().toISOString();
    await deps.dbUpsertUser(user);
    await appendAutomationLog({
      actorEmail: user.email,
      actorRole: user.role,
      permissionKey: 'user.unsubscribeLink',
      action: 'PROMO_UNSUBSCRIBED_API',
      targetType: 'user',
      targetId: user.id,
      status: 'SUCCESS',
      details: `User ${user.email} unsubscribed from promotional emails.`
    });
    return res.json({ success: true, email: user.email, promoOptOut: true });
  });

  // -------------------- 5. AI SUPPORT TICKET QUEUE & ACTIONS --------------------

  app.post('/api/super-admin/ai-automation/tickets/:ticketId/analyze', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { ticketId } = req.params;

    for (const u of deps.users.values()) {
      if (u.role === 'SUPER_ADMIN') continue;
      const dash = deps.userDashboards.get(u.id);
      const ticket = (dash?.tickets || []).find((t: any) => t.id === ticketId);
      if (ticket) {
        const result = await processSupportTicketWithAi(deps, {
          user: u,
          dashboard: dash,
          ticket,
          actorEmail: admin.email,
          manualTrigger: true
        });
        if (!result.processed && result.blockedReason) {
          return res.status(403).json({ error: result.blockedReason, ticket: result.ticket });
        }
        return res.json({ success: true, actionTaken: result.actionTaken, ticket: result.ticket });
      }
    }
    return res.status(404).json({ error: 'Support ticket not found.' });
  });

  app.post('/api/super-admin/ai-automation/tickets/:ticketId/approve-draft', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { ticketId } = req.params;
    const { customReply, status, sendEmailNotification } = req.body || {};

    for (const u of deps.users.values()) {
      if (u.role === 'SUPER_ADMIN') continue;
      const dash = deps.userDashboards.get(u.id);
      const ticket = (dash?.tickets || []).find((t: any) => t.id === ticketId);
      if (ticket) {
        const textToSend = String(customReply || ticket.aiDraftReply || '').trim();
        if (!textToSend) {
          return res.status(400).json({ error: 'No draft reply content available to send.' });
        }
        ticket.messages = ticket.messages || [];
        ticket.messages.push({
          sender: 'Rudraatma Support (AI Draft Approved by Super Admin)',
          text: textToSend,
          time: new Date().toISOString().replace('T', ' ').slice(0, 16)
        });
        ticket.aiDraftReply = textToSend;
        ticket.aiDraftStatus = 'APPROVED_AND_SENT';
        ticket.status = status || 'Resolved';
        ticket.updatedAt = new Date().toISOString().split('T')[0];

        await deps.dbSaveDashboard(u.id, dash);

        const notif = {
          id: 'tckappr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
          recipient_user_id: u.id,
          release_id: ticket.id,
          notification_type: 'approved',
          title: `Support Response · ${ticket.id}`,
          message: `Our support team responded to "${ticket.subject}".`,
          created_at: new Date().toISOString(),
          expires_at: Date.now() + 72 * 3600 * 1000
        };
        deps.notifications.set(notif.id, notif);
        await deps.dbSaveNotification({ ...notif, userId: u.id }).catch(() => {});

        if (
          sendEmailNotification &&
          automationSettings.supportManagement.allowAiSendTicketNotifications &&
          automationSettings.emailNotifications.allowAutomaticEmailSending
        ) {
          await sendSupportTicketNotificationEmail({
            email: u.email,
            ticketId: ticket.id,
            subject: ticket.subject,
            title: `Update on Ticket ${ticket.id}`,
            body: textToSend,
            purpose: 'ticket_reply_approved'
          });
        }

        await appendAutomationLog({
          actorEmail: admin.email,
          actorRole: 'SUPER_ADMIN',
          permissionKey: 'supportManagement.allowAiGenerateSupportReplies',
          action: 'AI_SUPPORT_DRAFT_APPROVED',
          targetType: 'support_ticket',
          targetId: ticket.id,
          status: 'SUCCESS',
          details: `Super Admin approved & sent AI reply for ticket ${ticket.id} (${u.email}).`
        });
        return res.json({ success: true, ticket });
      }
    }
    return res.status(404).json({ error: 'Support ticket not found.' });
  });

  app.post('/api/super-admin/ai-automation/tickets/:ticketId/reject-draft', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const { ticketId } = req.params;

    for (const u of deps.users.values()) {
      if (u.role === 'SUPER_ADMIN') continue;
      const dash = deps.userDashboards.get(u.id);
      const ticket = (dash?.tickets || []).find((t: any) => t.id === ticketId);
      if (ticket) {
        ticket.aiDraftStatus = 'REJECTED';
        await deps.dbSaveDashboard(u.id, dash);
        await appendAutomationLog({
          actorEmail: admin.email,
          actorRole: 'SUPER_ADMIN',
          permissionKey: 'supportManagement.allowAiGenerateSupportReplies',
          action: 'AI_SUPPORT_DRAFT_REJECTED',
          targetType: 'support_ticket',
          targetId: ticket.id,
          status: 'SUCCESS',
          details: `Super Admin rejected AI draft reply for ticket ${ticket.id}.`
        });
        return res.json({ success: true, ticket });
      }
    }
    return res.status(404).json({ error: 'Support ticket not found.' });
  });

  // -------------------- 6. ACTIVITY & AUDIT LOGS --------------------

  app.get('/api/super-admin/ai-automation/logs', requireSuperAdmin, (req, res) => {
    const statusFilter = String(req.query.status || 'ALL').toUpperCase();
    const q = String(req.query.q || '').trim().toLowerCase();

    const filtered = automationLogs.filter(l => {
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (
        q &&
        !l.actorEmail.toLowerCase().includes(q) &&
        !l.action.toLowerCase().includes(q) &&
        !l.permissionKey.toLowerCase().includes(q) &&
        !l.details.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    return res.json({ logs: filtered.slice(0, 300), total: filtered.length });
  });

  // -------------------- 7. CHAT HISTORY MANAGEMENT --------------------

  app.get('/api/super-admin/ai-automation/chat-history', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    if (!automationSettings.chatHistory.allowChatHistoryAccess) {
      await appendAutomationLog({
        actorEmail: admin.email,
        actorRole: 'SUPER_ADMIN',
        permissionKey: 'chatHistory.allowChatHistoryAccess',
        action: 'CHAT_HISTORY_ACCESS_BLOCKED',
        targetType: 'chat_history',
        targetId: 'all',
        status: 'BLOCKED',
        details: 'Blocked access to AI chat history because allowChatHistoryAccess is disabled.'
      });
      return res.status(403).json({
        error: 'Chat History access is disabled in Settings -> Chat History Management.'
      });
    }

    const q = String(req.query.q || '').trim().toLowerCase();
    const filtered = aiChatSessions.filter(
      t =>
        !q ||
        t.content.toLowerCase().includes(q) ||
        t.actorEmail.toLowerCase().includes(q) ||
        t.sessionId.toLowerCase().includes(q)
    );
    return res.json({ turns: filtered.slice(0, 200), total: filtered.length });
  });

  app.delete('/api/super-admin/ai-automation/chat-history', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const count = aiChatSessions.length;
    aiChatSessions.length = 0;
    await dbSavePlatformSetting('ai_chat_sessions', aiChatSessions);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'chatHistory.allowChatHistoryAccess',
      action: 'CHAT_HISTORY_CLEARED',
      targetType: 'chat_history',
      targetId: 'all',
      status: 'SUCCESS',
      details: `Cleared ${count} stored Rudra AI chat turn(s).`
    });
    return res.json({ success: true, cleared: count });
  });

  app.delete('/api/super-admin/ai-automation/chat-history/:id', requireSuperAdmin, async (req, res) => {
    const admin = (req as any).superAdmin;
    const idx = aiChatSessions.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Chat entry not found.' });
    aiChatSessions.splice(idx, 1);
    await dbSavePlatformSetting('ai_chat_sessions', aiChatSessions);
    await appendAutomationLog({
      actorEmail: admin.email,
      actorRole: 'SUPER_ADMIN',
      permissionKey: 'chatHistory.allowChatHistoryAccess',
      action: 'CHAT_HISTORY_ENTRY_DELETED',
      targetType: 'chat_history',
      targetId: req.params.id,
      status: 'SUCCESS',
      details: `Deleted Rudra AI chat turn ${req.params.id}.`
    });
    return res.json({ success: true });
  });
}
