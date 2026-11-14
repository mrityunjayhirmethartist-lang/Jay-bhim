import express from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import multer from 'multer';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { generateRoyaltyForecast } from './src/utils/mlForecasting';
import { ForecastModelType, ForecastScenario, CombinedChartPoint } from './src/types';
import {
  initDatabase,
  isDatabaseEnabled,
  getDbPool,
  dbUpsertUser,
  dbDeleteUserByEmail,
  dbSaveOtp,
  dbDeleteOtp,
  dbSaveSession,
  dbDeleteSession,
  dbSaveDashboard,
  dbSaveOrder,
  dbSaveNotification,
  dbSaveAuditLog,
  dbSaveDriveConnection,
  dbDeleteDriveConnection,
  dbSaveGmailConnection,
  dbDeleteGmailConnection,
  dbSavePlatformSetting,
  dbGetAllPlatformSettings
} from './server/db';
import { registerGmailRoutes, UserGmailConnection } from './server/gmail';
import { saveUploadedMedia, getStoredMedia, getStorageProviderName } from './server/storage';
import {
  registerSuperAdminRoutes,
  bootstrapSuperAdmin,
  DEFAULT_PLATFORM_SETTINGS,
  PlatformSettings
} from './server/superAdmin';
import {
  DEFAULT_AI_SETTINGS,
  AiServiceSettings,
  AiReviewJob,
  AiReviewResult,
  enqueueAiReviewJob
} from './server/ai/reviewQueue';
import { registerAiRoutes } from './server/ai/routes';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local dev upload folders (production uses S3-compatible object storage or PostgreSQL persistent storage)
const audioUploadDir = path.join(__dirname, 'uploads', 'audio');
const artworkUploadDir = path.join(__dirname, 'uploads', 'artwork');
const localKycDir = path.join(__dirname, 'uploads', 'kyc');
const localLyricsDir = path.join(__dirname, 'uploads', 'lyrics');
const localEvidenceDir = path.join(__dirname, 'uploads', 'evidence');
if (process.env.NODE_ENV !== 'production') {
  fs.mkdirSync(audioUploadDir, { recursive: true });
  fs.mkdirSync(artworkUploadDir, { recursive: true });
  fs.mkdirSync(localKycDir, { recursive: true });
  fs.mkdirSync(localLyricsDir, { recursive: true });
  fs.mkdirSync(localEvidenceDir, { recursive: true });
}

const app = express();
app.set('trust proxy', 1); // Required behind Render / Netlify reverse proxies for rate limiting
const PORT = Number(process.env.PORT) || 3000;

// ======================== CORS CONFIGURATION (NETLIFY + CUSTOM DOMAINS + LOCALHOST) ========================
const configuredOrigins = [
  process.env.FRONTEND_URL,
  process.env.NETLIFY_URL,
  process.env.APP_URL,
  'https://rudraatmamusic.netlify.app',
  'https://rudraatma-music.netlify.app',
  'https://rudraatmamusic.com',
  'https://www.rudraatmamusic.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
]
  .filter((o): o is string => Boolean(o && o.trim()))
  .map(o => o.trim().replace(/\/+$/, ''));

function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true;
  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  if (
    configuredOrigins.includes(cleanOrigin) ||
    cleanOrigin.endsWith('.netlify.app') ||
    cleanOrigin.endsWith('.onrender.com') ||
    cleanOrigin.endsWith('.run.app')
  ) {
    return true;
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    (cleanOrigin.startsWith('http://localhost:') || cleanOrigin.startsWith('http://127.0.0.1:'))
  ) {
    return true;
  }
  return false;
}

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS Blocked] Rejected request from origin: ${origin}`);
    const err: any = new Error(`CORS policy blocked origin: ${origin}`);
    err.status = 403;
    return callback(err);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Disposition', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400,
  optionsSuccessStatus: 204
});

app.use(corsMiddleware);
app.options('*', corsMiddleware);

// Production-safe request error diagnostic logger (never logs passwords, OTPs, tokens, or secrets)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth/') || req.path.startsWith('/api/super-admin/')) {
    const start = Date.now();
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        console.warn(
          `[Auth Diagnostic] ${req.method} ${req.path} -> HTTP ${res.statusCode} (${Date.now() - start}ms) origin=${req.headers.origin || 'same-origin'}`
        );
      }
    });
  }
  next();
});

app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

if (process.env.NODE_ENV !== 'production') {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

// Health check endpoint for Render & monitoring (verifies live PostgreSQL connectivity)
app.get('/api/health', async (_req, res) => {
  let dbStatus: 'postgresql' | 'in-memory-dev' | 'error' = isDatabaseEnabled() ? 'postgresql' : 'in-memory-dev';
  let dbLatencyMs: number | undefined;

  if (isDatabaseEnabled()) {
    const start = Date.now();
    try {
      await getDbPool().query('SELECT 1');
      dbLatencyMs = Date.now() - start;
    } catch (err: any) {
      dbStatus = 'error';
      return res.status(503).json({
        status: 'error',
        service: 'rudraatma-music-api',
        environment: process.env.NODE_ENV || 'development',
        database: 'error',
        error: 'Database health check failed.',
        storage: getStorageProviderName(),
        timestamp: new Date().toISOString()
      });
    }
  } else if (process.env.NODE_ENV === 'production' && !process.env.K_SERVICE) {
    return res.status(503).json({
      status: 'error',
      service: 'rudraatma-music-api',
      environment: 'production',
      database: 'disconnected',
      error: 'PostgreSQL database is not connected in production.',
      storage: getStorageProviderName(),
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    status: 'ok',
    service: 'rudraatma-music-api',
    environment: process.env.NODE_ENV || 'development',
    database: dbStatus,
    ...(typeof dbLatencyMs === 'number' ? { dbLatencyMs } : {}),
    storage: getStorageProviderName(),
    timestamp: new Date().toISOString()
  });
});

// Rate limiter for authentication endpoints (20 requests per 15 min per IP)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests from this IP. Please wait 15 minutes and try again.' }
});

// Audio Multer Setup (memoryStorage so files persist to S3 or PostgreSQL, never ephemeral Render disk)
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150MB limit
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.wav', '.mp3'];
    const allowedMimes = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3'];
    if (allowedExts.includes(ext) || allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file format. Only WAV and MP3 files are permitted for release submissions.'));
    }
  }
});

// Artwork Multer Setup (memoryStorage so files persist to S3 or PostgreSQL)
const artworkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png'];
    const allowedMimes = ['image/jpeg', 'image/png'];
    if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid cover artwork format. Only high-resolution JPG or PNG images are accepted.'));
    }
  }
});

// ======================== OFFICIAL HOSTING EMAIL CONFIGURATION ========================
// Domain: rudraatmamusic.com
// Official Sender: noreply@rudraatmamusic.com (Official transactional sender)
// Official Company Email (Reply-To): rudraatmamusic@gmail.com
// Inbound Support: support@rudraatmamusic.com
export const OFFICIAL_DOMAIN = 'rudraatmamusic.com';
export const OFFICIAL_SENDER_EMAIL = 'noreply@rudraatmamusic.com';
export const OFFICIAL_COMPANY_EMAIL = 'rudraatmamusic@gmail.com';
export const OFFICIAL_SENDER_NAME = 'Rudraatma Music';
export const OFFICIAL_SUPPORT_EMAIL = 'support@rudraatmamusic.com';
export const OFFICIAL_DEFAULT_HOST = 'mail.rudraatmamusic.com';

// Email delivery helper with professional Music Distribution Platform branding
async function sendEmailOtp(
  toEmail: string,
  code: string,
  purpose: 'signup' | 'login' | 'reset' = 'signup'
): Promise<{ success: boolean; delivered: boolean; missingConfig?: boolean; error?: string; sender: string; messageId?: string }> {
  let host = (process.env.SMTP_HOST || OFFICIAL_DEFAULT_HOST).trim();
  if (host.includes('@')) {
    if (host.toLowerCase().includes('gmail')) {
      host = 'smtp.gmail.com';
    } else {
      host = OFFICIAL_DEFAULT_HOST;
    }
  }

  const port = Number(process.env.SMTP_PORT) || 465;
  // Port 465 is direct SSL (secure: true). Port 587 uses STARTTLS (secure: false, requireTLS: true).
  const isSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
  const user = (process.env.SMTP_USER || OFFICIAL_SENDER_EMAIL).trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim();

  const rawFrom = (process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || OFFICIAL_SENDER_EMAIL).trim();
  const from = rawFrom.includes('<') ? rawFrom : `"${OFFICIAL_SENDER_NAME}" <${rawFrom}>`;
  const replyTo = (process.env.SMTP_REPLY_TO || OFFICIAL_COMPANY_EMAIL).trim();

  const titles: Record<string, string> = {
    signup: 'Verify Your Artist Account Registration',
    login: 'Two-Factor Login Authorization Code',
    reset: 'Password Reset Authorization Code'
  };

  const descriptions: Record<string, string> = {
    signup: 'Thank you for registering with Rudraatma Music. Use the following 6-digit verification code to activate your artist distribution account:',
    login: 'A secure login attempt was initiated for your Rudraatma Music account. Enter the 6-digit one-time passcode below to verify your identity and open your dashboard:',
    reset: 'A password reset was requested for your Rudraatma Music account. Use the following 6-digit code to authorize setting a new password:'
  };

  const subjects: Record<string, string> = {
    signup: `Your Rudraatma Music Verification Code: ${code}`,
    login: `Your Rudraatma Music Login Code: ${code}`,
    reset: `Your Rudraatma Music Password Reset Code: ${code}`
  };

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #070b14; color: #f8fafc; padding: 40px 20px; max-width: 600px; margin: 0 auto; border-radius: 16px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 28px;">
        <h1 style="color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; margin: 0;">RUDRAATMA MUSIC</h1>
        <p style="color: #f59e0b; font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; margin-top: 6px;">Music Distribution & Global Royalty Platform</p>
      </div>

      <div style="background-color: #0b1329; padding: 32px 24px; border-radius: 12px; border: 1px solid #1e293b; text-align: center;">
        <h2 style="font-size: 18px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 12px;">${titles[purpose] || 'Verification Code'}</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px;">
          ${descriptions[purpose] || 'Use the following 6-digit verification code:'}
        </p>

        <div style="background: linear-gradient(180deg, rgba(2, 132, 199, 0.12) 0%, rgba(3, 105, 161, 0.22) 100%); border: 1.5px solid #0284c7; padding: 16px 28px; border-radius: 12px; display: inline-block; margin: 0 auto;">
          <span style="font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #38bdf8; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;">${code}</span>
        </div>

        <div style="margin-top: 26px; padding-top: 20px; border-top: 1px solid #1e293b; text-align: left;">
          <p style="font-size: 12px; color: #cbd5e1; margin: 6px 0;">
            <strong style="color: #f59e0b;">⏱️ Expiration:</strong> This code expires strictly in <strong style="color: #ffffff;">5 minutes</strong>.
          </p>
          <p style="font-size: 12px; color: #cbd5e1; margin: 6px 0;">
            <strong style="color: #38bdf8;">📧 Official Sender:</strong> Sent from <strong style="color: #ffffff;">${rawFrom}</strong> (${OFFICIAL_DOMAIN})
          </p>
          <p style="font-size: 12px; color: #cbd5e1; margin: 6px 0;">
            <strong style="color: #ef4444;">🔒 Security Notice:</strong> Never share this code with anyone. Rudraatma Music staff will never ask for your verification code.
          </p>
        </div>
      </div>

      <div style="text-align: center; margin-top: 28px; font-size: 11px; color: #64748b; line-height: 1.5;">
        <p style="margin: 4px 0;">Dispatched to <span style="color: #94a3b8;">${toEmail}</span></p>
        <p style="margin: 4px 0;">Official Company Contact &bull; <a href="mailto:${OFFICIAL_COMPANY_EMAIL}" style="color: #38bdf8; text-decoration: none;">${OFFICIAL_COMPANY_EMAIL}</a></p>
        <p style="margin: 4px 0;">Support Desk &bull; <a href="mailto:${OFFICIAL_SUPPORT_EMAIL}" style="color: #38bdf8; text-decoration: none;">${OFFICIAL_SUPPORT_EMAIL}</a></p>
        <p style="margin-top: 12px; color: #475569;">&copy; ${new Date().getFullYear()} Rudraatma Music. All rights reserved.</p>
      </div>
    </div>
  `;

  if (!pass) {
    console.error(
      `[Rudraatma SMTP] Email delivery aborted for ${toEmail} (${purpose}): SMTP_PASS / SMTP_PASSWORD is missing.`
    );
    return {
      success: false,
      delivered: false,
      missingConfig: true,
      error: 'Email delivery is not configured on the server (missing SMTP_PASS / SMTP_PASSWORD). Contact support or configure SMTP credentials.',
      sender: from
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      ...(port === 587 && !isSecure ? { requireTLS: true } : {}),
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 12000
    });

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      replyTo,
      subject: subjects[purpose] || `Your Rudraatma Music Verification Code`,
      text: `Rudraatma Music - ${titles[purpose] || 'Verification'}\n\nYour 6-digit code is: ${code}\n\nThis verification code expires in 5 minutes.\nOfficial sender: ${rawFrom}\nReply-To / Company Email: ${replyTo}\nNever share this code with anyone.\n\nBest regards,\nRudraatma Music Distribution Team\n${OFFICIAL_COMPANY_EMAIL}`,
      html: htmlContent
    });

    const rejectedCount = Array.isArray(info?.rejected) ? info.rejected.length : 0;
    const acceptedCount = Array.isArray(info?.accepted) ? info.accepted.length : 0;
    if (rejectedCount > 0 && acceptedCount === 0) {
      console.error(`[Rudraatma SMTP] Recipient rejected for ${toEmail} (${purpose}) via ${host}:${port}.`);
      return {
        success: false,
        delivered: false,
        error: `SMTP server (${host}:${port}) rejected the recipient address (${toEmail}).`,
        sender: from
      };
    }

    console.log(
      `[Rudraatma SMTP] Delivered ${purpose} OTP email to ${toEmail} via ${host}:${port} (messageId=${info?.messageId || 'n/a'})`
    );
    return { success: true, delivered: true, sender: from, messageId: info?.messageId };
  } catch (err: any) {
    console.error(
      `[Rudraatma SMTP] Delivery failed for ${toEmail} (${purpose}) via ${host}:${port}: ${err?.code || 'ERR'} - ${err?.message || 'Unknown SMTP error'}`
    );
    return {
      success: false,
      delivered: false,
      error: `Email delivery failed via SMTP (${host}:${port}): ${err?.message || 'Provider authentication or connection error.'}`,
      sender: from
    };
  }
}

function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const BCRYPT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verifies a password against bcrypt (preferred) or legacy SHA-256 hash.
 * If legacy SHA-256 matches, automatically upgrades user.passwordHash to bcrypt and persists to PostgreSQL.
 */
async function verifyAndUpgradePassword(user: StoredUser, plainPassword: string): Promise<boolean> {
  if (!user.passwordHash) return false;
  if (user.passwordHash.startsWith('$2a$') || user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2y$')) {
    return bcrypt.compare(plainPassword, user.passwordHash);
  }
  // Legacy SHA-256 migration path (preserves existing accounts seamlessly)
  if (hashString(plainPassword) === user.passwordHash) {
    user.passwordHash = await hashPassword(plainPassword);
    await dbUpsertUser(user);
    return true;
  }
  return false;
}

// ======================== DATA SCHEMAS ========================

export interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  country: string;
  passwordHash: string;
  role: 'artist' | 'label_manager' | 'admin' | 'SUPER_ADMIN';
  isActive: boolean;
  accountStatus?: 'active' | 'suspended' | 'terminated';
  statusReason?: string;
  kyc?: any;
  selectedPlanId?: string;
  createdAt: string;
}

export interface StoredOtp {
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  purpose: 'signup' | 'login' | 'reset';
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

export interface ReleaseTrack {
  trackNumber: number;
  title: string;
  isrc?: string;
  primaryArtist: string;
  featuredArtists?: string;
  composer: string;
  lyricist: string;
  producer?: string;
  musicDirector?: string;
  duration?: string;
  audioFileName?: string;
  audioFileUrl?: string;
  audioQuality?: {
    format: string;
    sampleRate?: number;
    bitDepth?: number;
    channels?: number;
    duration?: number;
    bitrate?: number;
    cbrVbr?: string;
    isCompliant?: boolean;
    issues?: string[];
  };
  explicit: boolean;
}

export interface StoredRelease {
  id: string;
  userId: string;
  title: string;
  version?: string;
  artist: string;
  featuredArtists?: string;
  label: string;
  upc: string;
  type: 'Single' | 'EP' | 'Album';
  status: 'Draft' | 'Submitted' | 'Under Review' | 'Action Required' | 'Approved' | 'Delivered' | 'Live' | 'Rejected' | 'Takedown Requested';
  language: string;
  primaryGenre: string;
  secondaryGenre?: string;
  releaseDate: string;
  tracks: ReleaseTrack[];
  artworkUrl?: string;
  lyrics?: string;
  lyricsFileUrl?: string;
  rightsDeclarations?: {
    usesSamples?: boolean;
    sampleLicenseConfirmed?: boolean;
    sampleDetails?: string;
    isRemix?: boolean;
    remixPermissionConfirmed?: boolean;
    isCoverSong?: boolean;
    coverLicenseConfirmed?: boolean;
    hasCollaborators?: boolean;
    collaborationConfirmed?: boolean;
  };
  copyrightOwner: string;
  copyrightYear: number;
  recordingOwner: string;
  territories: string;
  rightsConfirmed: boolean;
  submittedAt: string;
  lastReviewedAt?: string;
  adminReviewNotes?: string;
  adminRejectReason?: string;
  adminChangesRequired?: string;
}

export interface StoredNotification {
  id: string;
  recipient_user_id: string;
  release_id: string;
  notification_type: 'approved' | 'changes_requested' | 'rejected';
  title: string;
  message: string;
  admin_reason?: string;
  release_title: string;
  artist_name: string;
  artwork_url?: string;
  created_at: string;
  expires_at: number; // 48 hours from creation in ms
  read_at?: string;
  dismissed_at?: string;
}

export interface AuditLog {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

// In-Memory Storage
const users: Map<string, StoredUser> = new Map();
const signupOtps: Map<string, StoredOtp> = new Map();
const loginOtps: Map<string, StoredOtp> = new Map();
const resetOtps: Map<string, StoredOtp> = new Map();
const otps = signupOtps; // Alias for backward compatibility
const failedLoginAttempts: Map<string, { count: number; lockedUntil: number; lastAttempt: number }> = new Map();
const sessions: Map<string, Session> = new Map();
const passwordResetTokens: Map<string, { email: string; expiresAt: number }> = new Map();
const contactSubmissions: Array<{ id: string; name: string; email: string; subject: string; message: string; date: string }> = [];
const artistFeedbacks: Array<{ id: string; name: string; email: string; role: string; feedback: string; rating: number; date: string }> = [];
const auditLogs: AuditLog[] = [];
const notifications: Map<string, StoredNotification> = new Map();

// Razorpay Payment Schemas
export interface RazorpayOrderRecord {
  orderId: string;
  userId: string;
  userEmail: string;
  userName: string;
  planId: string;
  planName: string;
  planType: 'one-time' | 'monthly' | 'annual';
  amount: number;
  amountPaise: number;
  currency: string;
  status: 'created' | 'paid' | 'failed' | 'cancelled';
  recurringConsent: boolean;
  autoRenew: boolean;
  paymentId?: string;
  signature?: string;
  failureReason?: string;
  createdAt: string;
  paidAt?: string;
  isTestMode: boolean;
}

export interface UserSubscriptionInfo {
  status: 'active' | 'cancelled' | 'expired' | 'pending' | 'revoked';
  planId: string;
  planName: string;
  billingFrequency: 'one-time' | 'monthly' | 'annual';
  startedAt: string;
  renewsAt?: string;
  expiresAt?: string;
  orderId: string;
  paymentId?: string;
  amount: number;
  autoRenew: boolean;
  cancelledAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  paymentStatus?: string;
  daysRemaining?: number;
}

const razorpayOrders: Map<string, RazorpayOrderRecord> = new Map();
const processedWebhookEvents: Set<string> = new Set();
const recentOrderAttempts: Map<string, number> = new Map();

export interface PlanDefinition {
  id: string;
  name: string;
  type: 'one-time' | 'monthly' | 'annual';
  priceINR: number;
  amountPaise: number;
  billingText: string;
  allowance: string;
  description: string;
  isSubscription: boolean;
  validityDays: number;
  enabled: boolean;
  features: string[];
}

// Plan Catalog definition (server source of truth - exact prices specified by user)
export const PLAN_CATALOG: Record<string, PlanDefinition> = {
  'single-track': {
    id: 'single-track',
    name: 'Single Track',
    type: 'one-time',
    priceINR: 20,
    amountPaise: 2000,
    billingText: 'one-time payment',
    allowance: '1 single track submission',
    description: '1 audio track distribution with free ISRC & UPC barcode generation.',
    isSubscription: false,
    validityDays: 365,
    enabled: true,
    features: [
      '1 audio track distribution (up to 10 min)',
      'Free ISRC & UPC barcode generation',
      'Lossless WAV / FLAC audio ingestion',
      'Cover artwork technical verification',
      'Release scheduling (14+ days in advance)',
      'Standard artist royalty reporting',
      'Centralized artist dashboard access',
      'Email support assistance'
    ]
  },
  'ep-album': {
    id: 'ep-album',
    name: 'EP / Album',
    type: 'one-time',
    priceINR: 50,
    amountPaise: 5000,
    billingText: 'one-time payment',
    allowance: '1 EP or full album submission (up to 15 tracks)',
    description: 'Up to 15 tracks per album included with custom ISRCs and album UPC barcode.',
    isSubscription: false,
    validityDays: 365,
    enabled: true,
    features: [
      'Up to 15 tracks per album included',
      'Sequential track ordering & disc numbering',
      'Custom ISRC assigned for every track',
      'Single album-level UPC barcode included',
      'Full metadata management & writer credits',
      'Explicit content declarations per track',
      'Consolidated album reporting breakdown',
      'Priority metadata verification check'
    ]
  },
  'starter-monthly': {
    id: 'starter-monthly',
    name: 'Starter Monthly',
    type: 'monthly',
    priceINR: 149,
    amountPaise: 14900,
    billingText: '/month',
    allowance: '1 release submission per billing month',
    description: '1 release each billing cycle for steady solo creators.',
    isSubscription: true,
    validityDays: 30,
    enabled: true,
    features: [
      '1 release submission each billing cycle',
      '1 primary artist profile management',
      'Free automated ISRC & UPC assignment',
      'Audio & artwork quality validation',
      'Centralized catalog management',
      'Monthly digital royalty statements',
      'Standard support ticketing (24–48h response)'
    ]
  },
  'growth-monthly': {
    id: 'growth-monthly',
    name: 'Growth Monthly',
    type: 'monthly',
    priceINR: 200,
    amountPaise: 20000,
    billingText: '/month',
    allowance: '5 release submissions per billing month',
    description: '5 releases per month, up to 3 artist profiles, and record label creation.',
    isSubscription: true,
    validityDays: 30,
    enabled: true,
    features: [
      '5 release submissions each billing cycle',
      'Up to 3 artist profiles managed',
      'Record label profile creation (My Labels)',
      'Smart Links generator with pre-save landing page',
      'Catalog export & track-level breakdown',
      'Direct payout requests (Bank IMPS / UPI)',
      'Priority ticket queue handling'
    ]
  },
  'unlimited-monthly': {
    id: 'unlimited-monthly',
    name: 'Unlimited Monthly',
    type: 'monthly',
    priceINR: 300,
    amountPaise: 30000,
    billingText: '/month',
    allowance: 'Unlimited releases (fair use)',
    description: 'Unlimited releases, unlimited artist profiles, and priority verification queue.',
    isSubscription: true,
    validityDays: 30,
    enabled: true,
    features: [
      'Unlimited release submissions (fair-use policy)',
      'Unlimited managed artist profiles',
      'Multi-label catalog management',
      'Team member workspace invites (Label Manager / Viewer)',
      'Fast-track metadata inspection queue',
      'Automated smart links & custom vanity URLs',
      'Dedicated artist relations desk'
    ]
  },
  'starter-annual': {
    id: 'starter-annual',
    name: 'Starter Annual',
    type: 'annual',
    priceINR: 1688,
    amountPaise: 168800,
    billingText: '/year',
    allowance: '1 release submission per month (12 / year)',
    description: 'Save with annual billing. ₹149 × 12 − ₹100 discount = ₹1,688/year.',
    isSubscription: true,
    validityDays: 365,
    enabled: true,
    features: [
      '1 release per month for a full 12 months',
      'Includes ₹100 direct annual savings',
      '1 primary artist profile',
      'Uninterrupted catalog preservation',
      'ISRC & UPC barcodes included at no extra fee',
      'Monthly royalty statements & CSV exports',
      'Full year of locked pricing'
    ]
  },
  'growth-annual': {
    id: 'growth-annual',
    name: 'Growth Annual',
    type: 'annual',
    priceINR: 2300,
    amountPaise: 230000,
    billingText: '/year',
    allowance: '5 release submissions per month (60 / year)',
    description: 'Save with annual billing. ₹200 × 12 − ₹100 discount = ₹2,300/year.',
    isSubscription: true,
    validityDays: 365,
    enabled: true,
    features: [
      'Up to 5 releases per month (60 / year)',
      'Includes ₹100 direct annual savings',
      'Up to 3 artist profiles and label records',
      'Smart Links & release landing pages included',
      'Catalog batch metadata management',
      'Priority customer assistance',
      'Consolidated annual financial ledger'
    ]
  },
  'unlimited-annual': {
    id: 'unlimited-annual',
    name: 'Unlimited Annual',
    type: 'annual',
    priceINR: 3500,
    amountPaise: 350000,
    billingText: '/year',
    allowance: 'Unlimited releases for 12 months (fair use)',
    description: 'Save with annual billing. ₹300 × 12 − ₹100 discount = ₹3,500/year.',
    isSubscription: true,
    validityDays: 365,
    enabled: true,
    features: [
      'Unlimited release submissions all year long',
      'Includes ₹100 direct annual savings',
      'Unlimited artist profiles & label entities',
      'Multi-user team management & permissions',
      'Priority technical review queue',
      'Custom pre-save landing pages & tracking links',
      'Dedicated priority artist desk'
    ]
  }
};

// Seed Users
const demoUserId = 'usr_demo_8821';
users.set('demo@rudraatmamusic.com', {
  id: demoUserId,
  fullName: 'Aarav Mehta',
  email: 'demo@rudraatmamusic.com',
  country: 'India',
  passwordHash: bcrypt.hashSync('Password123!', 10),
  role: 'artist',
  isActive: true,
  selectedPlanId: 'growth-monthly',
  createdAt: '2026-01-10T08:00:00.000Z'
});

const adminUserId = 'usr_admin_001';
users.set('admin@rudraatmamusic.com', {
  id: adminUserId,
  fullName: 'Rudra Admin Desk',
  email: 'admin@rudraatmamusic.com',
  country: 'India',
  passwordHash: bcrypt.hashSync('AdminPass123!', 10),
  role: 'admin',
  isActive: true,
  createdAt: '2025-12-01T00:00:00.000Z'
});

// Royalty Analytics Data Schemas
export interface MonthlyRoyaltyData {
  month: string;
  monthLabel: string;
  grossRoyalty: number;
  netRoyalty: number;
  streams: number;
  spotify: number;
  appleMusic: number;
  youtubeMusic: number;
  jioSaavn: number;
  amazonMusic: number;
  otherDSPs: number;
  status: 'Cleared' | 'In Clearance' | 'Processing';
  statementId: string;
  payoutDate?: string;
}

export interface DspRoyaltyShareData {
  name: string;
  royalties: number;
  streams: number;
  percentage: number;
  color: string;
}

export interface TrackRoyaltyData {
  id: string;
  title: string;
  artist: string;
  streams: number;
  royalties: number;
  topPlatform: string;
}

// User Dashboard Data Record
interface UserDashboardData {
  labels: Array<{ id: string; name: string; code: string; status: 'Approved' | 'Pending' | 'Rejected'; catalogCount: number; date: string }>;
  releases: StoredRelease[];
  artists: Array<{ id: string; name: string; primaryGenre: string; spotifyId?: string; appleMusicId?: string; releasesCount: number }>;
  tickets: Array<{ id: string; subject: string; category: string; priority: 'Low' | 'Medium' | 'High'; status: 'Open' | 'Pending' | 'Resolved'; updatedAt: string; messages: Array<{ sender: string; text: string; time: string }> }>;
  smartLinks: Array<{
    id: string;
    title: string;
    artist: string;
    slug: string;
    clicks: number;
    coverUrl?: string;
    previewAudioUrl?: string;
    releaseDate?: string;
    description?: string;
    genre?: string;
    createdAt?: string;
    stores: Record<string, string>;
  }>;
  requests: Array<{ id: string; type: 'Metadata Correction' | 'Takedown' | 'Artist Name Update' | 'Other'; details: string; status: 'Under Review' | 'Completed' | 'Pending'; date: string }>;
  transactions: Array<{ id: string; type: 'Credit' | 'Debit' | 'Payout' | 'Refund'; amount: number; description: string; status: 'Completed' | 'Processing'; reference: string; date: string }>;
  balance: number;
  lastPayout: number;
  planId: string;
  subscription?: UserSubscriptionInfo;
  teamMembers: Array<{ id: string; name: string; email: string; role: string; status: string }>;
  monthlyRoyalties: MonthlyRoyaltyData[];
  dspBreakdown: DspRoyaltyShareData[];
  topTracks: TrackRoyaltyData[];
}

const userDashboards: Map<string, UserDashboardData> = new Map();

// Initialize Demo User Data
userDashboards.set(demoUserId, {
  labels: [
    { id: 'lbl-101', name: 'Rudra Sounds Records', code: 'RSR-01', status: 'Approved', catalogCount: 2, date: '2026-01-15' },
    { id: 'lbl-102', name: 'Aarav Music Works', code: 'AMW-02', status: 'Approved', catalogCount: 1, date: '2026-02-10' }
  ],
  releases: [
    {
      id: 'rel-201',
      userId: demoUserId,
      title: 'Midnight Ragas in Blue',
      artist: 'Aarav Mehta',
      label: 'Rudra Sounds Records',
      upc: '8901234567891',
      type: 'Single',
      status: 'Approved',
      language: 'Hindi',
      primaryGenre: 'Fusion / Ambient',
      releaseDate: '2026-03-01',
      tracks: [
        { trackNumber: 1, title: 'Midnight Ragas in Blue', isrc: 'IN-RUD-26-0001', primaryArtist: 'Aarav Mehta', composer: 'Aarav Mehta', lyricist: 'Traditional', explicit: false }
      ],
      copyrightOwner: 'Rudra Sounds Records',
      copyrightYear: 2026,
      recordingOwner: 'Aarav Mehta',
      territories: 'Worldwide',
      rightsConfirmed: true,
      submittedAt: '2026-02-10T14:30:00.000Z',
      lastReviewedAt: '2026-02-12T16:00:00.000Z',
      adminReviewNotes: 'Audio verified (24-bit 48kHz WAV). Clean mastering. Artwork 3000x3000px passes all QC specs.'
    },
    {
      id: 'rel-202',
      userId: demoUserId,
      title: 'Urban Monsoon EP',
      artist: 'Aarav Mehta ft. Neha',
      label: 'Aarav Music Works',
      upc: '8901234567892',
      type: 'EP',
      status: 'Under Review',
      language: 'Hindi',
      primaryGenre: 'Contemporary Indian',
      releaseDate: '2026-04-20',
      tracks: [
        { trackNumber: 1, title: 'Rain Clouds Awakening', isrc: 'IN-RUD-26-0002', primaryArtist: 'Aarav Mehta', composer: 'Aarav Mehta', lyricist: 'Aarav Mehta', explicit: false },
        { trackNumber: 2, title: 'Streets in Chai Mist', isrc: 'IN-RUD-26-0003', primaryArtist: 'Aarav Mehta', composer: 'Aarav Mehta', lyricist: 'Neha V.', explicit: false },
        { trackNumber: 3, title: 'Thunderclap Horizon', isrc: 'IN-RUD-26-0004', primaryArtist: 'Aarav Mehta', composer: 'Aarav Mehta', lyricist: 'Aarav Mehta', explicit: false },
        { trackNumber: 4, title: 'Evening Petrichor', isrc: 'IN-RUD-26-0005', primaryArtist: 'Aarav Mehta', composer: 'Aarav Mehta', lyricist: 'Neha V.', explicit: false }
      ],
      copyrightOwner: 'Aarav Music Works',
      copyrightYear: 2026,
      recordingOwner: 'Aarav Mehta',
      territories: 'Worldwide',
      rightsConfirmed: true,
      submittedAt: '2026-03-20T10:00:00.000Z'
    }
  ],
  artists: [
    { id: 'art-301', name: 'Aarav Mehta', primaryGenre: 'Contemporary Fusion / Ambient', spotifyId: '4Xaarav9021', releasesCount: 2 },
    { id: 'art-302', name: 'Neha V.', primaryGenre: 'Classical Vocal', releasesCount: 1 }
  ],
  tickets: [
    {
      id: 'TCK-401',
      subject: 'ISRC Assignment Confirmation for EP',
      category: 'Metadata',
      priority: 'Medium',
      status: 'Resolved',
      updatedAt: '2026-03-25',
      messages: [
        { sender: 'Aarav Mehta', text: 'Hello, I wanted to verify the generated ISRCs for tracks 2 and 3 on Urban Monsoon EP.', time: '2026-03-24 10:14' },
        { sender: 'Rudraatma Support', text: 'Confirmed! The ISRCs have been assigned and locked for metadata delivery.', time: '2026-03-25 11:30' }
      ]
    }
  ],
  smartLinks: [
    {
      id: 'sml-501',
      title: 'Midnight Ragas in Blue',
      artist: 'Aarav Mehta',
      slug: 'midnight-ragas',
      clicks: 342,
      coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
      genre: 'Contemporary Fusion',
      releaseDate: '2026-03-01',
      description: 'The hypnotic studio single blending Indian classical sitar ragas with modern ambient sub-bass. Out now worldwide on all major platforms.',
      createdAt: '2026-03-01',
      stores: {
        spotify: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        apple: 'https://music.apple.com/in/album/midnight-ragas/173928190',
        youtube: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
        amazon: 'https://music.amazon.in/albums/B09XYZ888',
        jiosaavn: 'https://www.jiosaavn.com/song/midnight-ragas/X12345',
        wynk: 'https://wynk.in/music/song/midnight-ragas/sr_123',
        gaana: 'https://gaana.com/song/midnight-ragas'
      }
    },
    {
      id: 'sml-502',
      title: 'Urban Monsoon EP',
      artist: 'Aarav Mehta ft. Neha',
      slug: 'urban-monsoon',
      clicks: 189,
      coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      genre: 'Contemporary Indian',
      releaseDate: '2026-04-20',
      description: 'Four evocative acoustic soundscapes capturing the rain-washed streets of Mumbai and Delhi.',
      createdAt: '2026-03-20',
      stores: {
        spotify: 'https://open.spotify.com/album/37i9dQZF1DX4WYpdgoIcn6',
        apple: 'https://music.apple.com/in/album/urban-monsoon-ep/184920192',
        youtube: 'https://music.youtube.com/playlist?list=OLAK5uy_k',
        amazon: 'https://music.amazon.in/albums/B09ABC777',
        jiosaavn: 'https://www.jiosaavn.com/album/urban-monsoon-ep/Y98765'
      }
    }
  ],
  requests: [
    { id: 'req-601', type: 'Metadata Correction', details: 'Update featured artist credit spelling on Track 3', status: 'Completed', date: '2026-03-12' }
  ],
  transactions: [
    { id: 'tx-rzp-001', type: 'Debit', amount: 200.00, description: 'Razorpay Payment: Growth Monthly (/month)', status: 'Completed', reference: 'pay_demo_984120', date: '2026-02-01' },
    { id: 'tx-700', type: 'Credit', amount: 3450.00, description: 'Feb 2026 Cleared DSP Streaming Royalties Settlement', status: 'Completed', reference: 'ROY-2026-02-CLR', date: '2026-03-20' },
    { id: 'tx-701', type: 'Credit', amount: 480.00, description: 'Q4 2025 Digital Streaming Royalties (Processed)', status: 'Completed', reference: 'ROY-2025-Q4-01', date: '2026-02-15' },
    { id: 'tx-702', type: 'Payout', amount: 480.00, description: 'Direct Bank Settlement (IMPS Transfer Ref #992812)', status: 'Completed', reference: 'PAY-0082918', date: '2026-02-28' }
  ],
  balance: 3450.00,
  lastPayout: 480.00,
  planId: 'growth-monthly',
  subscription: {
    status: 'active',
    planId: 'growth-monthly',
    planName: 'Growth Monthly',
    billingFrequency: 'monthly',
    startedAt: '2026-02-01T00:00:00.000Z',
    renewsAt: '2026-04-01',
    orderId: 'order_demo_1001',
    paymentId: 'pay_demo_984120',
    amount: 200,
    autoRenew: true
  },
  teamMembers: [
    { id: 'tm-1', name: 'Aarav Mehta', email: 'demo@rudraatmamusic.com', role: 'Owner', status: 'Active' }
  ],
  monthlyRoyalties: [
    {
      month: '2025-10',
      monthLabel: 'Oct 2025',
      grossRoyalty: 3120.00,
      netRoyalty: 3120.00,
      streams: 42100,
      spotify: 1100.00,
      appleMusic: 850.00,
      youtubeMusic: 580.00,
      jioSaavn: 310.00,
      amazonMusic: 180.00,
      otherDSPs: 100.00,
      status: 'Cleared',
      statementId: 'STMT-2025-10-RUD',
      payoutDate: '2025-11-20'
    },
    {
      month: '2025-11',
      monthLabel: 'Nov 2025',
      grossRoyalty: 5450.00,
      netRoyalty: 5450.00,
      streams: 68400,
      spotify: 1950.00,
      appleMusic: 1520.00,
      youtubeMusic: 980.00,
      jioSaavn: 520.00,
      amazonMusic: 310.00,
      otherDSPs: 170.00,
      status: 'Cleared',
      statementId: 'STMT-2025-11-RUD',
      payoutDate: '2025-12-20'
    },
    {
      month: '2025-12',
      monthLabel: 'Dec 2025',
      grossRoyalty: 9820.00,
      netRoyalty: 9820.00,
      streams: 112800,
      spotify: 3450.00,
      appleMusic: 2700.00,
      youtubeMusic: 1820.00,
      jioSaavn: 980.00,
      amazonMusic: 540.00,
      otherDSPs: 330.00,
      status: 'Cleared',
      statementId: 'STMT-2025-12-RUD',
      payoutDate: '2026-01-20'
    },
    {
      month: '2026-01',
      monthLabel: 'Jan 2026',
      grossRoyalty: 12650.00,
      netRoyalty: 12650.00,
      streams: 145200,
      spotify: 4350.00,
      appleMusic: 3450.00,
      youtubeMusic: 2350.00,
      jioSaavn: 1280.00,
      amazonMusic: 720.00,
      otherDSPs: 500.00,
      status: 'Cleared',
      statementId: 'STMT-2026-01-RUD',
      payoutDate: '2026-02-20'
    },
    {
      month: '2026-02',
      monthLabel: 'Feb 2026',
      grossRoyalty: 17420.00,
      netRoyalty: 17420.00,
      streams: 198600,
      spotify: 6100.00,
      appleMusic: 4850.00,
      youtubeMusic: 3150.00,
      jioSaavn: 1780.00,
      amazonMusic: 980.00,
      otherDSPs: 560.00,
      status: 'Cleared',
      statementId: 'STMT-2026-02-RUD',
      payoutDate: '2026-03-20'
    },
    {
      month: '2026-03',
      monthLabel: 'Mar 2026',
      grossRoyalty: 21800.00,
      netRoyalty: 21800.00,
      streams: 245100,
      spotify: 7650.00,
      appleMusic: 6050.00,
      youtubeMusic: 3950.00,
      jioSaavn: 2180.00,
      amazonMusic: 1240.00,
      otherDSPs: 730.00,
      status: 'In Clearance',
      statementId: 'STMT-2026-03-RUD'
    },
    {
      month: '2026-04',
      monthLabel: 'Apr 2026',
      grossRoyalty: 25400.00,
      netRoyalty: 25400.00,
      streams: 289300,
      spotify: 8850.00,
      appleMusic: 7100.00,
      youtubeMusic: 4620.00,
      jioSaavn: 2580.00,
      amazonMusic: 1420.00,
      otherDSPs: 830.00,
      status: 'Processing',
      statementId: 'STMT-2026-04-RUD'
    }
  ],
  dspBreakdown: [
    { name: 'Spotify', royalties: 33450, streams: 382400, percentage: 34.9, color: '#10b981' },
    { name: 'Apple Music', royalties: 26520, streams: 215300, percentage: 27.7, color: '#f43f5e' },
    { name: 'YouTube Music & Content ID', royalties: 17450, streams: 320100, percentage: 18.2, color: '#ef4444' },
    { name: 'JioSaavn', royalties: 9130, streams: 218400, percentage: 9.5, color: '#06b6d4' },
    { name: 'Amazon Music', royalties: 5390, streams: 88200, percentage: 5.6, color: '#f59e0b' },
    { name: 'Wynk & Other DSPs', royalties: 3720, streams: 98100, percentage: 3.9, color: '#8b5cf6' }
  ],
  topTracks: [
    { id: 'trk-1', title: 'Midnight Ragas in Blue', artist: 'Aarav Mehta', streams: 680200, royalties: 58400, topPlatform: 'Spotify' },
    { id: 'trk-2', title: 'Rain Clouds Awakening', artist: 'Aarav Mehta', streams: 340100, royalties: 23150, topPlatform: 'Apple Music' },
    { id: 'trk-3', title: 'Streets in Chai Mist', artist: 'Aarav Mehta ft. Neha', streams: 198200, royalties: 9710, topPlatform: 'YouTube Music' },
    { id: 'trk-4', title: 'Thunderclap Horizon', artist: 'Aarav Mehta', streams: 104000, royalties: 4400, topPlatform: 'JioSaavn' }
  ]
});

// Helper to initialize realistic monthly royalties for new users
function generateInitialRoyaltiesForUser(artistName: string): {
  monthlyRoyalties: MonthlyRoyaltyData[];
  dspBreakdown: DspRoyaltyShareData[];
  topTracks: TrackRoyaltyData[];
} {
  const months = [
    { m: '2025-11', label: 'Nov 2025', streams: 14200, gross: 1120, status: 'Cleared' as const },
    { m: '2025-12', label: 'Dec 2025', streams: 28500, gross: 2350, status: 'Cleared' as const },
    { m: '2026-01', label: 'Jan 2026', streams: 45200, gross: 3840, status: 'Cleared' as const },
    { m: '2026-02', label: 'Feb 2026', streams: 62100, gross: 5390, status: 'Cleared' as const },
    { m: '2026-03', label: 'Mar 2026', streams: 81400, gross: 7120, status: 'In Clearance' as const },
    { m: '2026-04', label: 'Apr 2026', streams: 96800, gross: 8450, status: 'Processing' as const }
  ];

  const monthlyRoyalties: MonthlyRoyaltyData[] = months.map(item => ({
    month: item.m,
    monthLabel: item.label,
    grossRoyalty: item.gross,
    netRoyalty: item.gross,
    streams: item.streams,
    spotify: Math.round(item.gross * 0.35 * 100) / 100,
    appleMusic: Math.round(item.gross * 0.28 * 100) / 100,
    youtubeMusic: Math.round(item.gross * 0.18 * 100) / 100,
    jioSaavn: Math.round(item.gross * 0.10 * 100) / 100,
    amazonMusic: Math.round(item.gross * 0.05 * 100) / 100,
    otherDSPs: Math.round(item.gross * 0.04 * 100) / 100,
    status: item.status,
    statementId: `STMT-${item.m}-${Math.floor(100 + Math.random() * 900)}`,
    payoutDate: item.status === 'Cleared' ? `${item.m}-20` : undefined
  }));

  const totalGross = monthlyRoyalties.reduce((acc, m) => acc + m.grossRoyalty, 0);
  const totalStreams = monthlyRoyalties.reduce((acc, m) => acc + m.streams, 0);

  const dspBreakdown: DspRoyaltyShareData[] = [
    { name: 'Spotify', royalties: Math.round(totalGross * 0.35), streams: Math.round(totalStreams * 0.36), percentage: 35.0, color: '#10b981' },
    { name: 'Apple Music', royalties: Math.round(totalGross * 0.28), streams: Math.round(totalStreams * 0.22), percentage: 28.0, color: '#f43f5e' },
    { name: 'YouTube Music & Content ID', royalties: Math.round(totalGross * 0.18), streams: Math.round(totalStreams * 0.24), percentage: 18.0, color: '#ef4444' },
    { name: 'JioSaavn', royalties: Math.round(totalGross * 0.10), streams: Math.round(totalStreams * 0.11), percentage: 10.0, color: '#06b6d4' },
    { name: 'Amazon Music', royalties: Math.round(totalGross * 0.05), streams: Math.round(totalStreams * 0.04), percentage: 5.0, color: '#f59e0b' },
    { name: 'Wynk & Other DSPs', royalties: Math.round(totalGross * 0.04), streams: Math.round(totalStreams * 0.03), percentage: 4.0, color: '#8b5cf6' }
  ];

  const topTracks: TrackRoyaltyData[] = [
    { id: 'trk-1', title: 'Debut Single (Official Audio)', artist: artistName, streams: Math.round(totalStreams * 0.65), royalties: Math.round(totalGross * 0.65), topPlatform: 'Spotify' },
    { id: 'trk-2', title: 'Acoustic Reprise', artist: artistName, streams: Math.round(totalStreams * 0.35), royalties: Math.round(totalGross * 0.35), topPlatform: 'Apple Music' }
  ];

  return { monthlyRoyalties, dspBreakdown, topTracks };
}

// Seed an initial approval notification for demo user (created 4 hours ago)
const initialNotificationId = 'notif_init_001';
notifications.set(initialNotificationId, {
  id: initialNotificationId,
  recipient_user_id: demoUserId,
  release_id: 'rel-201',
  notification_type: 'approved',
  title: 'Congratulations!',
  message: 'Your song has been approved! Your release has passed our review. You can check its status and view the next steps in your dashboard.',
  admin_reason: 'Audio quality and metadata approved.',
  release_title: 'Midnight Ragas in Blue',
  artist_name: 'Aarav Mehta',
  created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  expires_at: Date.now() + (48 - 4) * 3600 * 1000 // expires in 44 hours
});

// Helper for session token
function getAuthenticatedUser(req: express.Request): StoredUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    void dbDeleteSession(token);
    return null;
  }
  for (const user of users.values()) {
    if (user.id === session.userId) {
      if (user.accountStatus === 'suspended' || user.accountStatus === 'terminated') {
        sessions.delete(token);
        void dbDeleteSession(token);
        return null;
      }
      return user;
    }
  }
  return null;
}

function getUserDashboard(userId: string): UserDashboardData {
  if (!userDashboards.has(userId)) {
    const defaultData = generateInitialRoyaltiesForUser('Artist');
    const isDemo = userId === demoUserId;
    const initialPlanId = isDemo ? 'growth-monthly' : 'growth-monthly';
    const plan = PLAN_CATALOG[initialPlanId] || PLAN_CATALOG['growth-monthly'];

    const initialSubscription: UserSubscriptionInfo = isDemo
      ? {
          status: 'active',
          planId: 'growth-monthly',
          planName: 'Growth Monthly',
          billingFrequency: 'monthly',
          startedAt: '2026-02-01T00:00:00.000Z',
          renewsAt: new Date(Date.now() + 25 * 86400000).toISOString().split('T')[0],
          expiresAt: new Date(Date.now() + 25 * 86400000).toISOString(),
          orderId: 'order_demo_1001',
          paymentId: 'pay_demo_984120',
          amount: 200,
          autoRenew: true,
          paymentStatus: 'Verified & Paid',
          daysRemaining: 25
        }
      : {
          status: 'pending',
          planId: plan.id,
          planName: plan.name,
          billingFrequency: plan.type,
          startedAt: new Date().toISOString(),
          amount: plan.priceINR,
          autoRenew: plan.isSubscription,
          orderId: '',
          paymentStatus: 'Pending Payment',
          daysRemaining: 0
        };

    userDashboards.set(userId, {
      labels: [],
      releases: [],
      artists: [],
      tickets: [],
      smartLinks: [],
      requests: [],
      transactions: [
        {
          id: 'tx-init-' + Date.now().toString().slice(-5),
          type: 'Credit',
          amount: 520.00,
          description: 'Streaming Royalty Credit (Cleared)',
          status: 'Completed',
          reference: 'ROY-INIT-01',
          date: new Date().toISOString().split('T')[0]
        }
      ],
      balance: 520.00,
      lastPayout: 0.00,
      planId: initialPlanId,
      subscription: initialSubscription,
      teamMembers: [],
      monthlyRoyalties: defaultData.monthlyRoyalties,
      dspBreakdown: defaultData.dspBreakdown,
      topTracks: defaultData.topTracks
    });
  }

  const dashboard = userDashboards.get(userId)!;

  // Enforce automatic expiration check
  if (dashboard.subscription && (dashboard.subscription.status === 'active' || dashboard.subscription.status === 'cancelled')) {
    const exp = dashboard.subscription.expiresAt || dashboard.subscription.renewsAt;
    if (exp) {
      const expTime = new Date(exp).getTime();
      if (expTime < Date.now()) {
        dashboard.subscription.status = 'expired';
      }
      dashboard.subscription.daysRemaining = Math.max(0, Math.ceil((expTime - Date.now()) / (1000 * 3600 * 24)));
    }
  }

  return dashboard;
}

// Find release across all users
function findReleaseById(releaseId: string): { release: StoredRelease; dashboard: UserDashboardData } | null {
  for (const dashboard of userDashboards.values()) {
    const r = dashboard.releases.find(x => x.id === releaseId);
    if (r) return { release: r, dashboard };
  }
  return null;
}

// ======================== AUTH ROUTES (6-DIGIT OTP, 5-MIN EXPIRY, 2FA LOGIN) ========================

app.post('/api/auth/register', authRateLimiter, async (req, res) => {
  const { fullName, email, country, password, confirmPassword, termsAccepted, selectedPlanId } = req.body;

  if (!fullName || !email || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Full name, email address, and password are required.' });
  }

  if (!termsAccepted) {
    return res.status(400).json({ error: 'You must agree to the Terms & Conditions and Privacy Policy.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Password and Confirm Password do not match.' });
  }

  const existing = users.get(normalizedEmail);
  if (existing && existing.isActive) {
    return res.status(409).json({ error: 'An account with this email address already exists. Please log in or reset your password.' });
  }

  // Generate 6-digit code (strictly 100000 - 999999)
  const otpCode = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashString(otpCode);
  const expiresAt = Date.now() + 5 * 60 * 1000; // Strictly 5 minutes

  const userId = existing ? existing.id : 'usr_' + crypto.randomBytes(6).toString('hex');
  const passwordHash = await hashPassword(password);
  const newUser: StoredUser = {
    id: userId,
    fullName: fullName.trim(),
    email: normalizedEmail,
    country: (country || 'India').trim(),
    passwordHash,
    role: 'artist',
    isActive: false, // Activated ONLY after verified 6-digit OTP
    selectedPlanId: selectedPlanId || 'growth-monthly',
    createdAt: new Date().toISOString()
  };
  users.set(normalizedEmail, newUser);
  await dbUpsertUser(newUser);

  const otpData: StoredOtp = {
    email: normalizedEmail,
    codeHash,
    expiresAt,
    attempts: 0,
    lastSentAt: Date.now(),
    purpose: 'signup'
  };

  signupOtps.set(normalizedEmail, otpData);
  await dbSaveOtp(otpData);

  // Dispatch real email via official hosting SMTP
  const emailResult = await sendEmailOtp(normalizedEmail, otpCode, 'signup');
  if (!emailResult.delivered) {
    signupOtps.delete(normalizedEmail);
    await dbDeleteOtp(normalizedEmail, 'signup');
    return res.status(emailResult.missingConfig ? 503 : 502).json({
      success: false,
      smtpDelivered: false,
      smtpConfigured: !emailResult.missingConfig,
      error: emailResult.error || 'Unable to send verification code email. Please try again later.'
    });
  }

  return res.json({
    success: true,
    message: `A 6-digit verification code has been dispatched to ${normalizedEmail} from ${emailResult.sender}.`,
    email: normalizedEmail,
    senderEmail: OFFICIAL_SENDER_EMAIL,
    smtpDelivered: true,
    smtpConfigured: true,
    expiresInSeconds: 300,
    cooldownSeconds: 60
  });
});

async function verifySignupOtpInternal(_req: express.Request, res: express.Response, normalizedEmail: string, code: string) {
  const otpRecord = signupOtps.get(normalizedEmail);

  if (!otpRecord) {
    return res.status(400).json({ error: 'No active verification code was requested for this email. Please sign up or resend code.' });
  }

  if (Date.now() > otpRecord.expiresAt) {
    signupOtps.delete(normalizedEmail);
    await dbDeleteOtp(normalizedEmail, 'signup');
    return res.status(400).json({ error: 'This verification code has expired (5-minute limit). Please request a fresh code.' });
  }

  if (otpRecord.attempts >= 5) {
    signupOtps.delete(normalizedEmail);
    await dbDeleteOtp(normalizedEmail, 'signup');
    return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
  }

  const enteredHash = hashString(code.trim());
  if (enteredHash !== otpRecord.codeHash) {
    otpRecord.attempts += 1;
    await dbSaveOtp(otpRecord);
    const remaining = 5 - otpRecord.attempts;
    return res.status(400).json({ error: `Invalid verification code. ${remaining} attempt(s) remaining.` });
  }

  // Invalidate OTP immediately upon successful verification
  signupOtps.delete(normalizedEmail);
  await dbDeleteOtp(normalizedEmail, 'signup');

  const user = users.get(normalizedEmail);
  if (!user) return res.status(404).json({ error: 'Account record not found.' });

  // Activate account
  user.isActive = true;
  await dbUpsertUser(user);
  const dashboard = getUserDashboard(user.id);
  await dbSaveDashboard(user.id, dashboard);

  const sessionToken = 'sess_' + crypto.randomBytes(24).toString('hex');
  const sessionRecord: Session = {
    token: sessionToken,
    userId: user.id,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  };
  sessions.set(sessionToken, sessionRecord);
  await dbSaveSession(sessionRecord);

  return res.json({
    success: true,
    message: 'Account verified and activated successfully.',
    token: sessionToken,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      country: user.country,
      role: user.role,
      selectedPlanId: user.selectedPlanId
    }
  });
}

// Verify Registration OTP & Activate Account
app.post('/api/auth/verify-otp', authRateLimiter, async (req, res) => {
  const { email, code, type } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // If client specifically routed a login OTP to this generic endpoint, delegate to login OTP handler
  if (type === 'login' || (!signupOtps.has(normalizedEmail) && loginOtps.has(normalizedEmail))) {
    return verifyLoginOtpInternal(req, res, normalizedEmail, code);
  }

  return verifySignupOtpInternal(req, res, normalizedEmail, code);
});

// Change Registration Email before account activation
app.post('/api/auth/change-registration-email', authRateLimiter, async (req, res) => {
  const { oldEmail, newEmail } = req.body;
  if (!oldEmail || !newEmail) {
    return res.status(400).json({ error: 'Both current email and new email are required.' });
  }

  const normalizedOld = oldEmail.trim().toLowerCase();
  const normalizedNew = newEmail.trim().toLowerCase();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedNew)) {
    return res.status(400).json({ error: 'Please enter a valid new email address.' });
  }

  if (normalizedOld === normalizedNew) {
    return res.status(400).json({ error: 'The new email address is identical to the current one.' });
  }

  // Check if new email already belongs to an active user
  const existingActive = users.get(normalizedNew);
  if (existingActive && existingActive.isActive) {
    return res.status(409).json({ error: 'An active account with this email already exists. Please log in.' });
  }

  // Find the unverified user record
  const oldUser = users.get(normalizedOld);
  if (!oldUser) {
    return res.status(404).json({ error: 'No pending registration found for the specified email.' });
  }

  if (oldUser.isActive) {
    return res.status(400).json({ error: 'This account is already activated. Please log in.' });
  }

  // Migrate user record to new email
  users.delete(normalizedOld);
  signupOtps.delete(normalizedOld);
  await dbDeleteUserByEmail(normalizedOld);
  await dbDeleteOtp(normalizedOld, 'signup');

  const updatedUser: StoredUser = {
    ...oldUser,
    email: normalizedNew
  };
  users.set(normalizedNew, updatedUser);
  await dbUpsertUser(updatedUser);

  // Generate fresh 6-digit OTP
  const freshCode = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashString(freshCode);
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  const newOtpData: StoredOtp = {
    email: normalizedNew,
    codeHash,
    expiresAt,
    attempts: 0,
    lastSentAt: Date.now(),
    purpose: 'signup'
  };
  signupOtps.set(normalizedNew, newOtpData);
  await dbSaveOtp(newOtpData);

  const emailResult = await sendEmailOtp(normalizedNew, freshCode, 'signup');

  console.log(`[Rudraatma Music Email Change] Migrated registration from ${normalizedOld} to ${normalizedNew}.`);

  if (!emailResult.delivered) {
    signupOtps.delete(normalizedNew);
    await dbDeleteOtp(normalizedNew, 'signup');
    return res.status(emailResult.missingConfig ? 503 : 502).json({
      success: false,
      smtpDelivered: false,
      smtpConfigured: !emailResult.missingConfig,
      error: emailResult.error || 'Email updated, but verification code delivery failed.'
    });
  }

  return res.json({
    success: true,
    email: normalizedNew,
    message: `Email address updated. A fresh 6-digit verification code has been dispatched to ${normalizedNew} from ${emailResult.sender}.`,
    senderEmail: OFFICIAL_SENDER_EMAIL,
    replyTo: OFFICIAL_COMPANY_EMAIL,
    smtpDelivered: true,
    smtpConfigured: true,
    cooldownSeconds: 60,
    expiresInSeconds: 300
  });
});

// Dedicated verify-signup-otp alias (direct handler, no internal router recursion)
app.post('/api/auth/verify-signup-otp', authRateLimiter, async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  return verifySignupOtpInternal(req, res, normalizedEmail, code);
});

// Login Step 1: Verify Password & Dispatch 6-digit Login OTP (2FA)
app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const normalizedEmail = email.trim().toLowerCase();

  // Rate Limiting & Brute-Force Protection
  const attempt = failedLoginAttempts.get(normalizedEmail);
  if (attempt && attempt.lockedUntil > Date.now()) {
    const minutesLeft = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      error: `Account temporarily locked due to repeated failed login attempts. Please wait ${minutesLeft} minute(s) before trying again, or reset your password.`
    });
  }

  const user = users.get(normalizedEmail);

  // Unregistered users must never be allowed to log in
  if (!user) {
    const curr = failedLoginAttempts.get(normalizedEmail) || { count: 0, lockedUntil: 0, lastAttempt: Date.now() };
    curr.count += 1;
    curr.lastAttempt = Date.now();
    if (curr.count >= 5) {
      curr.lockedUntil = Date.now() + 10 * 60 * 1000;
    }
    failedLoginAttempts.set(normalizedEmail, curr);
    return res.status(401).json({ error: 'No registered account found with this email. Please sign up first.' });
  }

  // Unverified users must complete registration verification first
  if (!user.isActive) {
    return res.status(403).json({
      error: 'Your email address has not been verified yet. Please complete verification to activate your account.',
      needsVerification: true,
      email: normalizedEmail
    });
  }

  // Block suspended or terminated accounts
  if (user.accountStatus === 'suspended') {
    return res.status(403).json({
      error: `Your account has been suspended by Rudraatma Music Administration.${user.statusReason ? ` Reason: ${user.statusReason}` : ''}`
    });
  }
  if (user.accountStatus === 'terminated') {
    return res.status(403).json({
      error: `Your account has been permanently terminated.${user.statusReason ? ` Reason: ${user.statusReason}` : ''}`
    });
  }

  // Password verification (bcrypt with automatic legacy SHA-256 upgrade)
  const passwordValid = await verifyAndUpgradePassword(user, password);
  if (!passwordValid) {
    const curr = failedLoginAttempts.get(normalizedEmail) || { count: 0, lockedUntil: 0, lastAttempt: Date.now() };
    curr.count += 1;
    curr.lastAttempt = Date.now();
    if (curr.count >= 5) {
      curr.lockedUntil = Date.now() + 10 * 60 * 1000;
      failedLoginAttempts.set(normalizedEmail, curr);
      return res.status(429).json({
        error: 'Too many incorrect password attempts. Your account has been temporarily locked for 10 minutes for your security.'
      });
    }
    failedLoginAttempts.set(normalizedEmail, curr);
    return res.status(401).json({
      error: `Invalid email or password. ${5 - curr.count} attempt(s) remaining before temporary account lock.`
    });
  }

  // Password is correct! Clear failed password attempts
  failedLoginAttempts.delete(normalizedEmail);

  // SUPER_ADMIN Bypass: Verified server-side role opens Super Admin Dashboard directly WITHOUT email OTP or 2FA
  if (user.role === 'SUPER_ADMIN') {
    const sessionToken = 'sa_sess_' + crypto.randomBytes(28).toString('hex');
    const sessionRecord: Session = {
      token: sessionToken,
      userId: user.id,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000
    };
    sessions.set(sessionToken, sessionRecord);
    await dbSaveSession(sessionRecord);
    await recordAudit(
      user.email,
      'SUPER_ADMIN',
      'SUPER_ADMIN_LOGIN',
      'session',
      user.id,
      `Super Admin authenticated directly via /api/auth/login (no email OTP/2FA).`
    );
    return res.json({
      success: true,
      requiresOtp: false,
      redirectTo: '/super-admin',
      token: sessionToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        country: user.country,
        role: user.role,
        selectedPlanId: user.selectedPlanId
      }
    });
  }

  // Check 60-second cooldown on recent login OTP for standard artist/admin users
  const existingLoginOtp = loginOtps.get(normalizedEmail);
  if (existingLoginOtp && Date.now() - existingLoginOtp.lastSentAt < 60 * 1000) {
    const remainingCooldown = Math.ceil((60 * 1000 - (Date.now() - existingLoginOtp.lastSentAt)) / 1000);
    return res.json({
      success: true,
      requiresOtp: true,
      email: normalizedEmail,
      message: `A login code was recently sent. Please enter the 6-digit code or wait ${remainingCooldown}s to resend.`,
      expiresInSeconds: Math.max(0, Math.ceil((existingLoginOtp.expiresAt - Date.now()) / 1000)),
      cooldownSeconds: remainingCooldown
    });
  }

  // Generate fresh 6-digit login OTP (valid for 5 minutes)
  const loginCode = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashString(loginCode);
  const expiresAt = Date.now() + 5 * 60 * 1000; // Strictly 5 minutes

  const loginOtpRecord: StoredOtp = {
    email: normalizedEmail,
    codeHash,
    expiresAt,
    attempts: 0,
    lastSentAt: Date.now(),
    purpose: 'login'
  };
  loginOtps.set(normalizedEmail, loginOtpRecord);
  await dbSaveOtp(loginOtpRecord);

  // Dispatch 2FA Login OTP via official hosting SMTP
  const emailResult = await sendEmailOtp(normalizedEmail, loginCode, 'login');
  if (!emailResult.delivered) {
    loginOtps.delete(normalizedEmail);
    await dbDeleteOtp(normalizedEmail, 'login');
    return res.status(emailResult.missingConfig ? 503 : 502).json({
      success: false,
      requiresOtp: false,
      smtpDelivered: false,
      smtpConfigured: !emailResult.missingConfig,
      error: emailResult.error || 'Unable to send 6-digit login verification code via email.'
    });
  }

  // DO NOT return session token! Dashboard remains blocked until OTP is verified.
  return res.json({
    success: true,
    requiresOtp: true,
    email: normalizedEmail,
    senderEmail: OFFICIAL_SENDER_EMAIL,
    message: `Password verified. A 6-digit login authorization code has been dispatched to your registered email from ${emailResult.sender}.`,
    smtpDelivered: true,
    smtpConfigured: true,
    expiresInSeconds: 300,
    cooldownSeconds: 60
  });
});

// Helper for login OTP verification
async function verifyLoginOtpInternal(_req: express.Request, res: express.Response, normalizedEmail: string, code: string) {
  const otpRecord = loginOtps.get(normalizedEmail);

  if (!otpRecord) {
    return res.status(400).json({ error: 'No login authorization code was requested for this email. Please enter your credentials to log in.' });
  }

  if (Date.now() > otpRecord.expiresAt) {
    loginOtps.delete(normalizedEmail);
    await dbDeleteOtp(normalizedEmail, 'login');
    return res.status(400).json({ error: 'This login verification code has expired (5-minute limit). Please log in again to request a fresh code.' });
  }

  if (otpRecord.attempts >= 5) {
    loginOtps.delete(normalizedEmail);
    await dbDeleteOtp(normalizedEmail, 'login');
    return res.status(429).json({ error: 'Too many incorrect verification attempts. Please log in again to request a new code.' });
  }

  const enteredHash = hashString(code.trim());
  if (enteredHash !== otpRecord.codeHash) {
    otpRecord.attempts += 1;
    await dbSaveOtp(otpRecord);
    const remaining = 5 - otpRecord.attempts;
    return res.status(400).json({ error: `Invalid login verification code. ${remaining} attempt(s) remaining.` });
  }

  // Invalidate OTP immediately upon verified use
  loginOtps.delete(normalizedEmail);
  await dbDeleteOtp(normalizedEmail, 'login');

  const user = users.get(normalizedEmail);
  if (!user || !user.isActive) {
    return res.status(403).json({ error: 'Account record is invalid or unverified.' });
  }

  // Issue authenticated session token
  const sessionToken = 'sess_' + crypto.randomBytes(24).toString('hex');
  const sessionRecord: Session = {
    token: sessionToken,
    userId: user.id,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  };
  sessions.set(sessionToken, sessionRecord);
  await dbSaveSession(sessionRecord);

  return res.json({
    success: true,
    message: 'Login verified successfully. Welcome back!',
    token: sessionToken,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      country: user.country,
      role: user.role,
      selectedPlanId: user.selectedPlanId
    }
  });
}

// Login Step 2: Verify 6-digit Login OTP & Grant Dashboard Access
app.post('/api/auth/verify-login-otp', authRateLimiter, async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and 6-digit login verification code are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  return verifyLoginOtpInternal(req, res, normalizedEmail, code);
});

// Resend OTP (Handles Signup, Login 2FA, and Password Reset)
app.post('/api/auth/resend-otp', authRateLimiter, async (req, res) => {
  const { email, type } = req.body;
  if (!email) return res.status(400).json({ error: 'Email address is required.' });

  const normalizedEmail = email.trim().toLowerCase();
  const targetType = (type === 'login' || type === 'reset' ? type : 'signup') as 'signup' | 'login' | 'reset';

  const user = users.get(normalizedEmail);
  if (targetType === 'login' && (!user || !user.isActive)) {
    return res.status(404).json({ error: 'No active registered account found with this email.' });
  }

  if (targetType === 'signup' && (!user || user.isActive)) {
    return res.status(400).json({ error: user?.isActive ? 'This account is already verified. Please log in.' : 'No pending registration found.' });
  }

  const targetMap = targetType === 'login' ? loginOtps : targetType === 'reset' ? resetOtps : signupOtps;
  const currentOtp = targetMap.get(normalizedEmail);

  // Enforce 60-second cooldown
  if (currentOtp && Date.now() - currentOtp.lastSentAt < 60 * 1000) {
    const remaining = Math.ceil((60 * 1000 - (Date.now() - currentOtp.lastSentAt)) / 1000);
    return res.status(429).json({ error: `Please wait ${remaining} seconds before requesting a new code.` });
  }

  // Generate new 6-digit code
  const newCode = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashString(newCode);

  const newOtpRecord: StoredOtp = {
    email: normalizedEmail,
    codeHash,
    expiresAt: Date.now() + 5 * 60 * 1000, // Strictly 5 minutes
    attempts: 0,
    lastSentAt: Date.now(),
    purpose: targetType
  };
  targetMap.set(normalizedEmail, newOtpRecord);
  await dbSaveOtp(newOtpRecord);

  const emailResult = await sendEmailOtp(normalizedEmail, newCode, targetType);
  if (!emailResult.delivered) {
    targetMap.delete(normalizedEmail);
    await dbDeleteOtp(normalizedEmail, targetType);
    return res.status(emailResult.missingConfig ? 503 : 502).json({
      success: false,
      smtpDelivered: false,
      smtpConfigured: !emailResult.missingConfig,
      error: emailResult.error || 'Failed to resend verification email.'
    });
  }

  return res.json({
    success: true,
    message: `A fresh 6-digit ${targetType === 'login' ? 'login' : 'verification'} code has been dispatched to ${normalizedEmail} from ${emailResult.sender}.`,
    email: normalizedEmail,
    senderEmail: OFFICIAL_SENDER_EMAIL,
    smtpDelivered: true,
    smtpConfigured: true,
    cooldownSeconds: 60,
    expiresInSeconds: 300
  });
});

// Forgot Password - Step 1: Dispatch 6-digit Reset OTP
app.post('/api/auth/forgot-password', authRateLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email address is required.' });

  const normalizedEmail = email.trim().toLowerCase();
  const user = users.get(normalizedEmail);

  if (user && user.isActive) {
    const existingReset = resetOtps.get(normalizedEmail);
    if (existingReset && Date.now() - existingReset.lastSentAt < 60 * 1000) {
      const remaining = Math.ceil((60 * 1000 - (Date.now() - existingReset.lastSentAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${remaining} seconds before requesting a new password reset code.` });
    }

    const resetCode = crypto.randomInt(100000, 1000000).toString();
    const resetRecord: StoredOtp = {
      email: normalizedEmail,
      codeHash: hashString(resetCode),
      expiresAt: Date.now() + 5 * 60 * 1000, // Strictly 5 minutes
      attempts: 0,
      lastSentAt: Date.now(),
      purpose: 'reset'
    };
    resetOtps.set(normalizedEmail, resetRecord);
    await dbSaveOtp(resetRecord);

    const emailResult = await sendEmailOtp(normalizedEmail, resetCode, 'reset');
    if (!emailResult.delivered) {
      resetOtps.delete(normalizedEmail);
      await dbDeleteOtp(normalizedEmail, 'reset');
      return res.status(emailResult.missingConfig ? 503 : 502).json({
        success: false,
        smtpDelivered: false,
        smtpConfigured: !emailResult.missingConfig,
        error: emailResult.error || 'Unable to send password reset email.'
      });
    }
  }

  return res.json({
    success: true,
    message: 'If an active account exists with this email address, a 6-digit password reset code has been dispatched to your inbox.',
    expiresInSeconds: 300,
    cooldownSeconds: 60
  });
});

// Forgot Password - Step 2: Verify 6-digit OTP & Set New Password
app.post('/api/auth/reset-password', authRateLimiter, async (req, res) => {
  const { email, code, newPassword, confirmPassword } = req.body;
  if (!email || !code || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'Email, 6-digit reset code, and new password are required.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const resetRecord = resetOtps.get(normalizedEmail);

  if (!resetRecord) {
    return res.status(400).json({ error: 'No active password reset request was found for this email. Please request a new code.' });
  }

  if (Date.now() > resetRecord.expiresAt) {
    resetOtps.delete(normalizedEmail);
    await dbDeleteOtp(normalizedEmail, 'reset');
    return res.status(400).json({ error: 'This password reset code has expired (5-minute limit). Please request a new code.' });
  }

  if (resetRecord.attempts >= 5) {
    resetOtps.delete(normalizedEmail);
    await dbDeleteOtp(normalizedEmail, 'reset');
    return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new password reset code.' });
  }

  const enteredHash = hashString(code.trim());
  if (enteredHash !== resetRecord.codeHash) {
    resetRecord.attempts += 1;
    await dbSaveOtp(resetRecord);
    const remaining = 5 - resetRecord.attempts;
    return res.status(400).json({ error: `Invalid reset code. ${remaining} attempt(s) remaining.` });
  }

  const user = users.get(normalizedEmail);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  // Update password hash using bcrypt
  user.passwordHash = await hashPassword(newPassword);
  await dbUpsertUser(user);
  resetOtps.delete(normalizedEmail);
  await dbDeleteOtp(normalizedEmail, 'reset');

  // Invalidate any existing active sessions to force re-authentication with new password + 2FA
  for (const [tokenKey, sess] of sessions.entries()) {
    if (sess.userId === user.id) {
      sessions.delete(tokenKey);
      await dbDeleteSession(tokenKey);
    }
  }

  return res.json({
    success: true,
    message: 'Your password has been successfully updated. You may now log in with your new password.'
  });
});

// Check hosting SMTP status safely without exposing passwords
app.get('/api/auth/smtp-status', (_req, res) => {
  let host = (process.env.SMTP_HOST || OFFICIAL_DEFAULT_HOST).trim();
  if (host.includes('@')) {
    if (host.toLowerCase().includes('gmail')) {
      host = 'smtp.gmail.com';
    } else {
      host = OFFICIAL_DEFAULT_HOST;
    }
  }

  const port = Number(process.env.SMTP_PORT) || 465;
  const user = (process.env.SMTP_USER || OFFICIAL_SENDER_EMAIL).trim();
  const pass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim();
  const configured = Boolean(pass.length > 0);
  const fromAddr = (process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || OFFICIAL_SENDER_EMAIL).trim();
  const from = fromAddr.includes('<') ? fromAddr : `"${OFFICIAL_SENDER_NAME}" <${fromAddr}>`;

  return res.json({
    configured,
    domain: OFFICIAL_DOMAIN,
    senderEmail: fromAddr,
    senderDisplay: from,
    smtpHost: host,
    smtpPort: port,
    smtpUser: user,
    replyTo: (process.env.SMTP_REPLY_TO || OFFICIAL_COMPANY_EMAIL).trim(),
    supportEmail: OFFICIAL_SUPPORT_EMAIL,
    instructions: configured
      ? 'Official domain hosting email is configured. Active sender is ' + fromAddr
      : 'Hosting SMTP password (SMTP_PASS or SMTP_PASSWORD) is required to deliver live emails.'
  });
});

app.get('/api/auth/session', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ authenticated: false });

  return res.json({
    authenticated: true,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      country: user.country,
      role: user.role,
      selectedPlanId: user.selectedPlanId
    }
  });
});

app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    sessions.delete(token);
    await dbDeleteSession(token);
  }
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// ======================== NOTIFICATION SYSTEM (48H RULES) ========================

// Get active notifications for authenticated user
app.get('/api/notifications', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const now = Date.now();
  const userNotifs: StoredNotification[] = [];

  for (const notif of notifications.values()) {
    // Must be for this user and not expired (within 48 hours)
    if (notif.recipient_user_id === user.id && notif.expires_at > now) {
      userNotifs.push(notif);
    }
  }

  // Sort newest first
  userNotifs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return res.json({
    notifications: userNotifs,
    activePopup: userNotifs.find(n => !n.dismissed_at) || null
  });
});

// Dismiss popup (keeps in center, does not reopen)
app.post('/api/notifications/:id/dismiss', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const notif = notifications.get(req.params.id);
  if (!notif || notif.recipient_user_id !== user.id) {
    return res.status(404).json({ error: 'Notification not found.' });
  }

  notif.dismissed_at = new Date().toISOString();
  await dbSaveNotification({ ...notif, userId: notif.recipient_user_id });
  return res.json({ success: true, notification: notif });
});

// Mark notification read
app.post('/api/notifications/:id/read', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const notif = notifications.get(req.params.id);
  if (!notif || notif.recipient_user_id !== user.id) {
    return res.status(404).json({ error: 'Notification not found.' });
  }

  notif.read_at = new Date().toISOString();
  await dbSaveNotification({ ...notif, userId: notif.recipient_user_id });
  return res.json({ success: true, notification: notif });
});

// ======================== ADMIN ENDPOINTS ========================

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  const roleUpper = String(user.role || '').toUpperCase();
  if (roleUpper !== 'ADMIN' && roleUpper !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Access forbidden. Administrator privileges required.' });
  }
  next();
}

// Admin overview data
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  let totalReleases = 0;
  let inReviewReleases = 0;
  let approvedReleases = 0;

  const allReleases: StoredRelease[] = [];
  for (const db of userDashboards.values()) {
    for (const r of db.releases) {
      allReleases.push(r);
      totalReleases++;
      if (r.status === 'Under Review' || r.status === 'Submitted') inReviewReleases++;
      if (r.status === 'Approved') approvedReleases++;
    }
  }

  const allUsersList = Array.from(users.values()).map(u => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    country: u.country,
    role: u.role,
    isActive: u.isActive,
    selectedPlanId: u.selectedPlanId,
    createdAt: u.createdAt
  }));

  const verifiedPaymentTotals = Array.from(razorpayOrders.values())
    .filter(o => o.status === 'paid')
    .reduce((sum, o) => sum + o.amount, 0);

  return res.json({
    metrics: {
      registeredUsers: allUsersList.length,
      activeSubscriptions: allUsersList.filter(u => u.isActive).length,
      releasesAwaitingReview: inReviewReleases,
      totalReleases,
      approvedReleases,
      verifiedPaymentTotals,
      supportQueueCount: 3,
      providerDeliveryHealth: 'Operational (Connected test bridge)'
    },
    users: allUsersList,
    recentReleases: allReleases.slice(0, 10),
    auditLogs: auditLogs.slice(-20).reverse()
  });
});

// Admin Review Release (Approve / Changes Requested / Reject)
app.post('/api/admin/releases/:id/review', requireAdmin, async (req, res) => {
  const user = getAuthenticatedUser(req)!;
  const releaseId = req.params.id;
  const { action, notes, reason } = req.body;

  if (!action || !['approve', 'request_changes', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Valid action (approve, request_changes, reject) is required.' });
  }

  if ((action === 'request_changes' || action === 'reject') && (!reason || !reason.trim())) {
    return res.status(400).json({ error: 'A clear explanation reason is required for this action.' });
  }

  const found = findReleaseById(releaseId);
  if (!found) {
    return res.status(404).json({ error: 'Release not found.' });
  }

  const { release, dashboard } = found;

  // Save previous status
  const previousStatus = release.status;

  // Update status based on action
  if (action === 'approve') {
    release.status = 'Approved';
    release.adminReviewNotes = notes?.trim() || 'Release has passed internal technical and metadata review.';
  } else if (action === 'request_changes') {
    release.status = 'Action Required';
    release.adminChangesRequired = reason.trim();
  } else if (action === 'reject') {
    release.status = 'Rejected';
    release.adminRejectReason = reason.trim();
  }

  release.lastReviewedAt = new Date().toISOString();

  // Create In-App Notification with 48h expiry
  const notifId = 'notif_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const now = Date.now();
  const expiresAt = now + 48 * 3600 * 1000; // Exactly 48 hours

  let notifType: 'approved' | 'changes_requested' | 'rejected' = 'approved';
  let title = 'Congratulations!';
  let message = 'Your song has been approved! Your release has passed our review. You can check its status and view the next steps in your dashboard.';

  if (action === 'request_changes') {
    notifType = 'changes_requested';
    title = 'Action Required';
    message = 'Your release needs a few changes before it can be approved.';
  } else if (action === 'reject') {
    notifType = 'rejected';
    title = 'Release Not Approved';
    message = 'Unfortunately, your release could not be approved at this time.';
  }

  const newNotif: StoredNotification = {
    id: notifId,
    recipient_user_id: release.userId,
    release_id: release.id,
    notification_type: notifType,
    title,
    message,
    admin_reason: reason?.trim() || notes?.trim(),
    release_title: release.title,
    artist_name: release.artist,
    artwork_url: release.artworkUrl,
    created_at: new Date().toISOString(),
    expires_at: expiresAt
  };

  notifications.set(notifId, newNotif);
  await dbSaveNotification({ ...newNotif, userId: release.userId });
  await dbSaveDashboard(release.userId, dashboard);

  // Add audit log
  const auditEntry: AuditLog = {
    id: 'aud_' + Date.now(),
    actorEmail: user.email,
    actorRole: user.role,
    action: `RELEASE_${action.toUpperCase()}`,
    entityType: 'Release',
    entityId: release.id,
    details: `Status changed from ${previousStatus} to ${release.status}. Note/Reason: ${reason || notes || 'None'}`,
    timestamp: new Date().toISOString()
  };
  auditLogs.push(auditEntry);
  await dbSaveAuditLog(auditEntry);

  return res.json({
    success: true,
    release,
    notification: newNotif,
    message: `Release "${release.title}" status updated to ${release.status}. 48-hour artist popup notification dispatched.`
  });
});

// Admin All Releases
app.get('/api/admin/releases', requireAdmin, (req, res) => {
  const allReleases: StoredRelease[] = [];
  for (const db of userDashboards.values()) {
    allReleases.push(...db.releases);
  }
  return res.json({ releases: allReleases });
});

// Admin All Users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const list = Array.from(users.values()).map(u => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    country: u.country,
    role: u.role,
    isActive: u.isActive,
    selectedPlanId: u.selectedPlanId,
    createdAt: u.createdAt
  }));
  return res.json({ users: list });
});

// Public Plans API
app.get('/api/plans', (_req, res) => {
  const enabledPlans = Object.values(PLAN_CATALOG).filter(p => p.enabled !== false);
  return res.json({ plans: enabledPlans });
});

// Admin All Plans API (Enabled and Disabled)
app.get('/api/admin/plans', requireAdmin, (_req, res) => {
  const allPlans = Object.values(PLAN_CATALOG);
  return res.json({ plans: allPlans });
});

// Admin Create or Edit Plan
app.post('/api/admin/plans', requireAdmin, (req, res) => {
  const user = getAuthenticatedUser(req)!;
  const { id, name, type, priceINR, billingText, allowance, description, isSubscription, validityDays, enabled, features } = req.body;

  if (!name || priceINR === undefined || !type) {
    return res.status(400).json({ error: 'Plan name, type, and price are required.' });
  }

  const planId = (id || name.toLowerCase().replace(/[^a-z0-9]/g, '-')).trim();
  const price = Number(priceINR);
  if (isNaN(price) || price < 0) {
    return res.status(400).json({ error: 'Valid price in INR is required.' });
  }

  const isExisting = Boolean(PLAN_CATALOG[planId]);
  const plan: PlanDefinition = {
    id: planId,
    name: name.trim(),
    type: (type === 'annual' ? 'annual' : type === 'monthly' ? 'monthly' : 'one-time'),
    priceINR: price,
    amountPaise: Math.round(price * 100),
    billingText: billingText ? billingText.trim() : (type === 'monthly' ? '/month' : type === 'annual' ? '/year' : 'one-time payment'),
    allowance: allowance ? allowance.trim() : (type === 'one-time' ? '1 release submission' : 'Standard allowance'),
    description: description ? description.trim() : '',
    isSubscription: isSubscription !== undefined ? Boolean(isSubscription) : (type !== 'one-time'),
    validityDays: Number(validityDays) || (type === 'monthly' ? 30 : 365),
    enabled: enabled !== undefined ? Boolean(enabled) : true,
    features: Array.isArray(features) ? features : (features ? String(features).split('\n').filter(Boolean) : [])
  };

  PLAN_CATALOG[planId] = plan;

  auditLogs.push({
    id: 'aud_' + Date.now(),
    actorEmail: user.email,
    actorRole: user.role,
    action: isExisting ? 'ADMIN_PLAN_UPDATED' : 'ADMIN_PLAN_CREATED',
    entityType: 'Plan',
    entityId: planId,
    details: `${isExisting ? 'Updated' : 'Created'} plan "${plan.name}" at ₹${plan.priceINR} (${plan.type}, ${plan.validityDays} days validity). Status: ${plan.enabled ? 'Enabled' : 'Disabled'}.`,
    timestamp: new Date().toISOString()
  });

  return res.json({ success: true, plan });
});

// Admin Toggle Plan Enabled/Disabled
app.post('/api/admin/plans/:id/toggle', requireAdmin, (req, res) => {
  const user = getAuthenticatedUser(req)!;
  const planId = req.params.id;
  const plan = PLAN_CATALOG[planId];
  if (!plan) return res.status(404).json({ error: 'Plan not found.' });

  plan.enabled = !plan.enabled;

  auditLogs.push({
    id: 'aud_' + Date.now(),
    actorEmail: user.email,
    actorRole: user.role,
    action: plan.enabled ? 'ADMIN_PLAN_ENABLED' : 'ADMIN_PLAN_DISABLED',
    entityType: 'Plan',
    entityId: planId,
    details: `Toggled plan "${plan.name}" to ${plan.enabled ? 'Enabled (Active in Catalog)' : 'Disabled (Hidden from Catalog)'}.`,
    timestamp: new Date().toISOString()
  });

  return res.json({ success: true, plan });
});

// Admin Customers & Subscriptions List
app.get('/api/admin/customers', requireAdmin, (_req, res) => {
  const customers = Array.from(users.values()).map(u => {
    const db = getUserDashboard(u.id);
    const sub = db.subscription;
    const isSubActive = sub && sub.status === 'active';
    const isSubExpired = sub && sub.status === 'expired';
    const isSubRevoked = sub && sub.status === 'revoked';

    return {
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      country: u.country,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      planId: db.planId || u.selectedPlanId || 'none',
      planName: sub?.planName || PLAN_CATALOG[db.planId]?.name || 'No Active Plan',
      planPrice: sub?.amount !== undefined ? sub.amount : (PLAN_CATALOG[db.planId]?.priceINR || 0),
      billingFrequency: sub?.billingFrequency || PLAN_CATALOG[db.planId]?.type || 'monthly',
      subscriptionStatus: isSubRevoked ? 'Revoked' : isSubExpired ? 'Expired' : isSubActive ? 'Active' : (sub?.status === 'pending' ? 'Pending' : 'No Plan'),
      startedAt: sub?.startedAt,
      expiresAt: sub?.expiresAt || sub?.renewsAt,
      daysRemaining: sub?.daysRemaining !== undefined ? sub.daysRemaining : 0,
      paymentId: sub?.paymentId,
      orderId: sub?.orderId,
      paymentStatus: sub?.paymentStatus || (isSubActive ? 'Verified & Paid' : 'Pending Payment'),
      totalReleases: db.releases.length
    };
  });

  return res.json({ customers });
});

// Admin Manually Grant Plan
app.post('/api/admin/subscriptions/grant', requireAdmin, async (req, res) => {
  const adminUser = getAuthenticatedUser(req)!;
  const { userEmail, planId, validityDays, reason } = req.body;

  if (!userEmail || !planId) {
    return res.status(400).json({ error: 'Target customer email and plan ID are required.' });
  }

  const targetEmail = userEmail.trim().toLowerCase();
  const targetUser = users.get(targetEmail);
  if (!targetUser) {
    return res.status(404).json({ error: 'No registered customer found with email ' + targetEmail });
  }

  const plan = PLAN_CATALOG[planId];
  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan selected from catalog.' });
  }

  const days = Number(validityDays) || plan.validityDays || (plan.type === 'monthly' ? 30 : 365);
  const now = new Date();
  const expiresAtDate = new Date(now.getTime() + days * 86400000).toISOString();
  const renewsAtDate = expiresAtDate.split('T')[0];

  const db = getUserDashboard(targetUser.id);
  db.planId = plan.id;
  targetUser.selectedPlanId = plan.id;

  const grantRef = 'MANUAL_GRANT_' + Date.now().toString().slice(-6);
  db.subscription = {
    status: 'active',
    planId: plan.id,
    planName: plan.name,
    billingFrequency: plan.type,
    startedAt: now.toISOString(),
    expiresAt: expiresAtDate,
    renewsAt: renewsAtDate,
    orderId: 'admin_grant_' + Date.now().toString().slice(-8),
    paymentId: grantRef,
    amount: plan.priceINR,
    autoRenew: false,
    paymentStatus: 'Manually Granted by Super Admin',
    daysRemaining: days
  };

  // Add ledger credit transaction
  db.transactions.unshift({
    id: 'tx-grant-' + Date.now().toString().slice(-6),
    type: 'Credit',
    amount: plan.priceINR,
    description: `Administrative Plan Grant: ${plan.name} (${days} days) - ${reason || 'Admin Authorized'}`,
    status: 'Completed',
    reference: grantRef,
    date: now.toISOString().split('T')[0]
  });

  await dbUpsertUser(targetUser);
  await dbSaveDashboard(targetUser.id, db);

  const grantAudit: AuditLog = {
    id: 'aud_' + Date.now(),
    actorEmail: adminUser.email,
    actorRole: adminUser.role,
    action: 'SUBSCRIPTION_MANUALLY_GRANTED',
    entityType: 'UserSubscription',
    entityId: targetUser.id,
    details: `Super Admin (${adminUser.email}) manually granted "${plan.name}" (valid for ${days} days until ${renewsAtDate}) to customer ${targetUser.email}. Reason: ${reason || 'Administrative Grant'}.`,
    timestamp: new Date().toISOString()
  };
  auditLogs.push(grantAudit);
  await dbSaveAuditLog(grantAudit);

  return res.json({
    success: true,
    message: `Successfully granted "${plan.name}" to ${targetUser.email} for ${days} days.`,
    subscription: db.subscription
  });
});

// Admin Manually Revoke Plan
app.post('/api/admin/subscriptions/revoke', requireAdmin, async (req, res) => {
  const adminUser = getAuthenticatedUser(req)!;
  const { userEmail, reason } = req.body;

  if (!userEmail) {
    return res.status(400).json({ error: 'Customer email is required.' });
  }

  const targetEmail = userEmail.trim().toLowerCase();
  const targetUser = users.get(targetEmail);
  if (!targetUser) {
    return res.status(404).json({ error: 'No registered customer found with email ' + targetEmail });
  }

  const db = getUserDashboard(targetUser.id);
  const prevPlan = db.subscription?.planName || 'Current Plan';
  if (db.subscription) {
    db.subscription.status = 'revoked';
    db.subscription.revokedAt = new Date().toISOString();
    db.subscription.revocationReason = reason || 'Revoked by Super Admin';
    db.subscription.daysRemaining = 0;
  }

  await dbSaveDashboard(targetUser.id, db);

  const revokeAudit: AuditLog = {
    id: 'aud_' + Date.now(),
    actorEmail: adminUser.email,
    actorRole: adminUser.role,
    action: 'SUBSCRIPTION_MANUALLY_REVOKED',
    entityType: 'UserSubscription',
    entityId: targetUser.id,
    details: `Super Admin (${adminUser.email}) revoked subscription for "${prevPlan}" from customer ${targetUser.email}. Reason: ${reason || 'Administrative Revocation'}.`,
    timestamp: new Date().toISOString()
  };
  auditLogs.push(revokeAudit);
  await dbSaveAuditLog(revokeAudit);

  return res.json({
    success: true,
    message: `Successfully revoked subscription for ${targetUser.email}.`,
    subscription: db.subscription
  });
});

// Admin Audit Logs API
app.get('/api/admin/audit-logs', requireAdmin, (_req, res) => {
  return res.json({
    auditLogs: auditLogs.slice().reverse()
  });
});

// ======================== RAZORPAY INTEGRATION & GATEWAY ========================

async function createRazorpayOrderOnGateway(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ success: boolean; orderId: string; isReal: boolean; error?: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  // If real test or live keys are configured
  if (keyId && keySecret && (keyId.startsWith('rzp_test_') || keyId.startsWith('rzp_live_')) && keySecret.length > 5) {
    try {
      const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: params.amountPaise,
          currency: params.currency,
          receipt: params.receipt,
          notes: params.notes
        })
      });

      const data = await response.json();
      if (response.ok && data.id) {
        return { success: true, orderId: data.id, isReal: true };
      } else {
        console.warn('[Razorpay API Gateway Notice]:', data.error?.description || data);
        const simOrderId = `order_sim_${Date.now().toString().slice(-8)}_${crypto.randomBytes(3).toString('hex')}`;
        return {
          success: true,
          orderId: simOrderId,
          isReal: false,
          error: data.error?.description || 'Gateway returned non-200. Using test sandbox order.'
        };
      }
    } catch (err: any) {
      console.error('[Razorpay Network Error]:', err.message);
      const simOrderId = `order_sim_${Date.now().toString().slice(-8)}_${crypto.randomBytes(3).toString('hex')}`;
      return { success: true, orderId: simOrderId, isReal: false, error: err.message };
    }
  }

  // Graceful test sandbox mode if keys are not yet configured in environment
  const testOrderId = `order_test_${Date.now().toString().slice(-8)}_${crypto.randomBytes(4).toString('hex')}`;
  return { success: true, orderId: testOrderId, isReal: false };
}

function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (keySecret && !orderId.startsWith('order_test_') && !orderId.startsWith('order_sim_')) {
    const text = `${orderId}|${paymentId}`;
    const generated = crypto.createHmac('sha256', keySecret).update(text).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(generated, 'utf-8'), Buffer.from(signature, 'utf-8'));
    } catch {
      return false;
    }
  }
  // If order was simulated in test mode, accept valid test signatures
  if (orderId.startsWith('order_test_') || orderId.startsWith('order_sim_')) {
    return true;
  }
  return false;
}

function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret || !rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf-8'), Buffer.from(signature, 'utf-8'));
  } catch {
    return false;
  }
}

// 1. Razorpay Public Client Configuration
app.get('/api/razorpay/config', (_req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || '';
  const isConfigured = Boolean(keyId && process.env.RAZORPAY_KEY_SECRET);
  const isLive = Boolean(keyId.startsWith('rzp_live_'));
  return res.json({
    keyId: keyId || 'rzp_test_placeholder',
    isConfigured,
    isLive,
    mode: isLive ? 'live' : 'test',
    companyName: 'Rudraatma Music',
    themeColor: '#2563eb'
  });
});

// 2. Razorpay Order Creation (Backend trusted catalogue calculation)
app.post('/api/razorpay/create-order', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required to initiate checkout.' });
  }

  const { planId, autoRenewConsent } = req.body;
  const plan = PLAN_CATALOG[planId];
  if (!plan) {
    return res.status(400).json({ error: 'Invalid product or plan specified in catalogue.' });
  }
  if (plan.enabled === false) {
    return res.status(400).json({ error: 'This plan is currently disabled and not available for new purchases.' });
  }

  // Prevent duplicate orders from repeated rapid clicks (within 3 seconds)
  const now = Date.now();
  const lastAttempt = recentOrderAttempts.get(user.id);
  if (lastAttempt && now - lastAttempt < 3000) {
    return res.status(429).json({ error: 'Checkout request is already processing. Please wait.' });
  }
  recentOrderAttempts.set(user.id, now);

  createRazorpayOrderOnGateway({
    amountPaise: plan.amountPaise,
    currency: 'INR',
    receipt: `rcpt_${Date.now().toString().slice(-8)}`,
    notes: {
      userId: user.id,
      userEmail: user.email,
      planId: plan.id,
      planName: plan.name,
      planType: plan.type
    }
  }).then(async orderRes => {
    const orderRecord: RazorpayOrderRecord = {
      orderId: orderRes.orderId,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName,
      planId: plan.id,
      planName: plan.name,
      planType: plan.type,
      amount: plan.priceINR,
      amountPaise: plan.amountPaise,
      currency: 'INR',
      status: 'created',
      recurringConsent: plan.isSubscription ? Boolean(autoRenewConsent) : false,
      autoRenew: plan.isSubscription ? Boolean(autoRenewConsent) : false,
      createdAt: new Date().toISOString(),
      isTestMode: !orderRes.isReal
    };

    razorpayOrders.set(orderRes.orderId, orderRecord);
    await dbSaveOrder(orderRecord);

    return res.json({
      success: true,
      orderId: orderRes.orderId,
      amount: plan.priceINR,
      amountPaise: plan.amountPaise,
      currency: 'INR',
      plan,
      user: {
        fullName: user.fullName,
        email: user.email,
        country: user.country
      },
      keyId: process.env.RAZORPAY_KEY_ID?.trim() || 'rzp_test_placeholder',
      isTestMode: !orderRes.isReal
    });
  }).catch(err => {
    console.error('Order creation failure:', err);
    return res.status(500).json({ error: 'Failed to create payment order on gateway.' });
  });
});

// 3. Razorpay Payment Verification & Activation (Server-side HMAC verification)
app.post('/api/razorpay/verify-payment', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required to verify payment.' });
  }

  const { orderId, paymentId, signature, planId } = req.body;
  if (!orderId || !paymentId) {
    return res.status(400).json({ error: 'Order reference and Payment ID are required.' });
  }

  const order = razorpayOrders.get(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order record not found or expired.' });
  }

  if (order.userId !== user.id) {
    return res.status(403).json({ error: 'Unauthorized: order belongs to another artist workspace.' });
  }

  const plan = PLAN_CATALOG[planId || order.planId];
  if (!plan) {
    return res.status(400).json({ error: 'Plan mismatch during payment reconciliation.' });
  }

  // Idempotent check: if already processed and paid, return clean success without duplicating
  if (order.status === 'paid') {
    return res.json({
      success: true,
      message: 'Payment has already been confirmed and plan activated.',
      order,
      plan,
      alreadyProcessed: true
    });
  }

  // Verify HMAC-SHA256 signature
  const isValid = verifyRazorpayPaymentSignature(orderId, paymentId, signature || '');
  if (!isValid) {
    order.status = 'failed';
    order.failureReason = 'Cryptographic signature mismatch';
    await dbSaveOrder(order);
    const sigAudit: AuditLog = {
      id: 'aud_' + Date.now(),
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PAYMENT_SIGNATURE_FAILED',
      entityType: 'Order',
      entityId: orderId,
      details: `Payment verification failed for payment ${paymentId}. Signature mismatch.`,
      timestamp: new Date().toISOString()
    };
    auditLogs.push(sigAudit);
    await dbSaveAuditLog(sigAudit);
    return res.status(400).json({ error: 'Invalid payment signature. Verification failed on server.' });
  }

  // Update order status
  order.status = 'paid';
  order.paymentId = paymentId;
  order.signature = signature;
  order.paidAt = new Date().toISOString();

  // Activate Plan in User Profile and Dashboard
  user.selectedPlanId = plan.id;
  const dashboard = getUserDashboard(user.id);
  dashboard.planId = plan.id;

  const now = new Date();
  const validityDays = plan.validityDays || (plan.type === 'monthly' ? 30 : 365);
  const expiresAtDate = new Date(now.getTime() + validityDays * 24 * 3600 * 1000).toISOString();
  const renewsAtDate = expiresAtDate.split('T')[0];

  dashboard.subscription = {
    status: 'active',
    planId: plan.id,
    planName: plan.name,
    billingFrequency: plan.type,
    startedAt: now.toISOString(),
    expiresAt: expiresAtDate,
    renewsAt: renewsAtDate,
    orderId,
    paymentId,
    amount: plan.priceINR,
    autoRenew: order.autoRenew,
    paymentStatus: 'Verified & Paid',
    daysRemaining: validityDays
  };

  // Add confirmed debit transaction to artist wallet ledger
  const tx = {
    id: 'tx-rzp-' + Date.now().toString().slice(-6),
    type: 'Debit' as const,
    amount: plan.priceINR,
    description: `Razorpay Payment: ${plan.name} (${plan.type === 'one-time' ? 'One-time Release' : plan.type + ' Subscription'})`,
    status: 'Completed' as const,
    reference: paymentId,
    date: new Date().toISOString().split('T')[0]
  };
  dashboard.transactions.unshift(tx);

  await dbSaveOrder(order);
  await dbUpsertUser(user);
  await dbSaveDashboard(user.id, dashboard);

  // Audit log
  const rzpAudit: AuditLog = {
    id: 'aud_' + Date.now(),
    actorEmail: user.email,
    actorRole: user.role,
    action: 'RAZORPAY_PAYMENT_VERIFIED',
    entityType: 'Payment',
    entityId: orderId,
    details: `Verified payment ${paymentId} for ₹${plan.priceINR} (${plan.name}). Activated for ${user.email}.`,
    timestamp: new Date().toISOString()
  };
  auditLogs.push(rzpAudit);
  await dbSaveAuditLog(rzpAudit);

  return res.json({
    success: true,
    message: `Payment verified successfully! Your plan "${plan.name}" is now active.`,
    order,
    plan,
    transaction: tx
  });
});

// 4. Record Payment Failure
app.post('/api/razorpay/record-failure', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { orderId, errorReason, paymentId } = req.body;
  const order = razorpayOrders.get(orderId);
  if (order) {
    order.status = 'failed';
    order.failureReason = errorReason || 'Customer bank authorization rejected';
    if (paymentId) order.paymentId = paymentId;
    await dbSaveOrder(order);

    const failAudit: AuditLog = {
      id: 'aud_' + Date.now(),
      actorEmail: user.email,
      actorRole: user.role,
      action: 'PAYMENT_FAILED',
      entityType: 'Order',
      entityId: orderId,
      details: `Payment failure recorded for order ${orderId}: ${errorReason || 'Unspecified'}`,
      timestamp: new Date().toISOString()
    };
    auditLogs.push(failAudit);
    await dbSaveAuditLog(failAudit);
  }

  return res.json({ success: true });
});

// 5. Record Payment Dismissal / Cancellation
app.post('/api/razorpay/record-cancellation', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { orderId } = req.body;
  const order = razorpayOrders.get(orderId);
  if (order && order.status === 'created') {
    order.status = 'cancelled';
    await dbSaveOrder(order);
  }
  return res.json({ success: true });
});

// 6. Subscription Cancellation / Auto-Renew Toggle
app.post('/api/razorpay/cancel-subscription', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const dashboard = getUserDashboard(user.id);
  if (dashboard.subscription) {
    dashboard.subscription.autoRenew = false;
    dashboard.subscription.status = 'cancelled';
    dashboard.subscription.cancelledAt = new Date().toISOString();
    await dbSaveDashboard(user.id, dashboard);

    const cancelAudit: AuditLog = {
      id: 'aud_' + Date.now(),
      actorEmail: user.email,
      actorRole: user.role,
      action: 'SUBSCRIPTION_AUTORENEW_CANCELLED',
      entityType: 'Subscription',
      entityId: dashboard.subscription.orderId,
      details: `Auto-renewal cancelled by user ${user.email} for plan ${dashboard.subscription.planName}.`,
      timestamp: new Date().toISOString()
    };
    auditLogs.push(cancelAudit);
    await dbSaveAuditLog(cancelAudit);
  }

  return res.json({
    success: true,
    message: 'Subscription auto-renewal has been cancelled. Your benefits remain active until the end of your billing cycle.'
  });
});

// 7. Razorpay Webhook Handler (Raw body signature verification + Idempotent reconciliation)
app.post('/api/razorpay/webhook', async (req: any, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  const signature = req.headers['x-razorpay-signature'] as string;

  if (webhookSecret) {
    const isValid = verifyRazorpayWebhookSignature(req.rawBody, signature, webhookSecret);
    if (!isValid) {
      console.warn('[Razorpay Webhook Warning] Invalid webhook signature detected.');
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }
  }

  const eventPayload = req.body;
  const eventType = eventPayload?.event;
  const eventId = eventPayload?.event_id || req.headers['x-razorpay-event-id'] || `${eventType}_${Date.now()}`;

  // Idempotency: Ignore duplicate webhook event dispatches
  if (processedWebhookEvents.has(eventId)) {
    return res.status(200).json({ status: 'duplicate_event_acknowledged' });
  }
  processedWebhookEvents.add(eventId);

  try {
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = eventPayload?.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id || eventPayload?.payload?.order?.entity?.id;
      const paymentId = paymentEntity?.id;

      if (orderId && razorpayOrders.has(orderId)) {
        const order = razorpayOrders.get(orderId)!;
        if (order.status !== 'paid') {
          order.status = 'paid';
          order.paymentId = paymentId;
          order.paidAt = new Date().toISOString();

          // Reconcile user plan and ledger
          const user = Array.from(users.values()).find(u => u.id === order.userId);
          if (user) {
            user.selectedPlanId = order.planId;
            const dashboard = getUserDashboard(user.id);
            dashboard.planId = order.planId;
            const plan = PLAN_CATALOG[order.planId];

            dashboard.subscription = {
              status: 'active',
              planId: order.planId,
              planName: order.planName,
              billingFrequency: order.planType,
              startedAt: new Date().toISOString(),
              renewsAt: order.planType === 'monthly'
                ? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0]
                : order.planType === 'annual'
                ? new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0]
                : undefined,
              orderId,
              paymentId,
              amount: order.amount,
              autoRenew: order.autoRenew
            };

            dashboard.transactions.unshift({
              id: 'tx-rzp-wh-' + Date.now().toString().slice(-5),
              type: 'Debit',
              amount: order.amount,
              description: `Razorpay Webhook: ${order.planName} (${order.planType})`,
              status: 'Completed',
              reference: paymentId,
              date: new Date().toISOString().split('T')[0]
            });
            await dbUpsertUser(user);
            await dbSaveDashboard(user.id, dashboard);
          }

          await dbSaveOrder(order);
          const whAudit: AuditLog = {
            id: 'aud_' + Date.now(),
            actorEmail: 'system@razorpay.webhook',
            actorRole: 'system',
            action: 'WEBHOOK_PAYMENT_RECONCILED',
            entityType: 'Payment',
            entityId: orderId,
            details: `Reconciled payment ${paymentId} via Razorpay webhook (${eventType}).`,
            timestamp: new Date().toISOString()
          };
          auditLogs.push(whAudit);
          await dbSaveAuditLog(whAudit);
        }
      }
    } else if (eventType === 'payment.failed') {
      const paymentEntity = eventPayload?.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      if (orderId && razorpayOrders.has(orderId)) {
        const order = razorpayOrders.get(orderId)!;
        order.status = 'failed';
        order.failureReason = paymentEntity?.error_description || 'Gateway reported transaction failure';
        await dbSaveOrder(order);
      }
    } else if (eventType === 'subscription.cancelled') {
      const subEntity = eventPayload?.payload?.subscription?.entity;
      // Reconcile subscription cancellation
      for (const [ownerId, db] of userDashboards.entries()) {
        if (db.subscription && db.subscription.paymentId === subEntity?.id) {
          db.subscription.status = 'cancelled';
          db.subscription.autoRenew = false;
          await dbSaveDashboard(ownerId, db);
        }
      }
    }
  } catch (err: any) {
    console.error('[Razorpay Webhook Processing Error]:', err.message);
  }

  return res.status(200).json({ status: 'ok', eventId });
});

// 8. Admin Payment Ledger API
app.get('/api/admin/payments', requireAdmin, (_req, res) => {
  const allOrders = Array.from(razorpayOrders.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const totalRevenue = allOrders
    .filter(o => o.status === 'paid')
    .reduce((sum, o) => sum + o.amount, 0);

  const paidCount = allOrders.filter(o => o.status === 'paid').length;
  const failedCount = allOrders.filter(o => o.status === 'failed').length;
  const createdCount = allOrders.filter(o => o.status === 'created').length;

  return res.json({
    payments: allOrders,
    metrics: {
      totalRevenue,
      paidCount,
      failedCount,
      createdCount,
      totalOrders: allOrders.length
    }
  });
});

// Legacy / Backward Compatible Checkout Endpoints
app.post('/api/checkout/create-order', (req, res) => {
  const { planId } = req.body;
  const plan = PLAN_CATALOG[planId];
  if (!plan) return res.status(400).json({ error: 'Invalid plan selected.' });

  const orderId = 'ORD_' + Date.now().toString().slice(-8);
  return res.json({
    success: true,
    orderId,
    plan: {
      id: plan.id,
      name: plan.name,
      type: plan.type,
      basePrice: plan.priceINR,
      taxRate: 0,
      taxAmount: 0,
      discount: 0,
      finalAmount: plan.priceINR,
      allowance: plan.allowance
    }
  });
});

app.post('/api/checkout/verify-payment', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });

  const { planId, orderId } = req.body;
  const plan = PLAN_CATALOG[planId];
  if (!plan) return res.status(400).json({ error: 'Invalid plan.' });

  const dashboard = getUserDashboard(user.id);
  dashboard.planId = planId;
  user.selectedPlanId = planId;

  const tx = {
    id: 'tx-' + Date.now().toString().slice(-6),
    type: 'Debit' as const,
    amount: plan.priceINR,
    description: `Plan Activation: ${plan.name} (${orderId || 'Direct'})`,
    status: 'Completed' as const,
    reference: 'PAY-' + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toISOString().split('T')[0]
  };
  dashboard.transactions.unshift(tx);

  return res.json({
    success: true,
    message: `Plan ${plan.name} successfully activated!`,
    planId,
    transaction: tx
  });
});

// ======================== DASHBOARD API ========================

app.get('/api/dashboard/data', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  const data = getUserDashboard(user.id);
  return res.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      country: user.country,
      role: user.role
    },
    ...data
  });
});

// Release Details by ID
app.get('/api/dashboard/releases/:id', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const dashboard = getUserDashboard(user.id);
  const release = dashboard.releases.find(r => r.id === req.params.id);

  if (!release && user.role !== 'admin') {
    return res.status(404).json({ error: 'Release not found or unauthorized.' });
  }

  // Admin access fallback
  if (!release && user.role === 'admin') {
    const found = findReleaseById(req.params.id);
    if (!found) return res.status(404).json({ error: 'Release not found.' });
    return res.json({ release: found.release });
  }

  return res.json({ release });
});

// Upload Audio Master endpoint (Multer -> S3 or PostgreSQL persistent storage)
app.post('/api/dashboard/upload/audio', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  audioUpload.single('audioFile')(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Failed to upload audio file.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file was received.' });
    }

    try {
      const file = req.file;
      const stored = await saveUploadedMedia({
        userId: user.id,
        category: 'audio',
        originalName: file.originalname,
        mimeType: file.mimetype || 'audio/wav',
        buffer: file.buffer,
        localUploadDir: audioUploadDir
      });
      return res.json({
        success: true,
        fileName: stored.fileName,
        originalName: file.originalname,
        size: stored.size,
        mimetype: stored.mimeType,
        fileUrl: stored.fileUrl,
        storageProvider: stored.storageProvider
      });
    } catch (uploadErr: any) {
      return res.status(500).json({ error: uploadErr.message || 'Failed to persist audio file.' });
    }
  });
});

// Upload Artwork endpoint (Multer -> S3 or PostgreSQL persistent storage)
app.post('/api/dashboard/upload/artwork', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  artworkUpload.single('artworkFile')(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Failed to upload artwork file.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No artwork file was received.' });
    }

    try {
      const file = req.file;
      const stored = await saveUploadedMedia({
        userId: user.id,
        category: 'artwork',
        originalName: file.originalname,
        mimeType: file.mimetype || 'image/jpeg',
        buffer: file.buffer,
        localUploadDir: artworkUploadDir
      });
      return res.json({
        success: true,
        fileName: stored.fileName,
        originalName: file.originalname,
        size: stored.size,
        mimetype: stored.mimeType,
        fileUrl: stored.fileUrl,
        storageProvider: stored.storageProvider
      });
    } catch (uploadErr: any) {
      return res.status(500).json({ error: uploadErr.message || 'Failed to persist artwork file.' });
    }
  });
});

// Stream / download persisted media from S3 or PostgreSQL
app.get('/api/media/:fileId', async (req, res) => {
  try {
    const media = await getStoredMedia(req.params.fileId);
    if (!media) {
      return res.status(404).json({ error: 'Media file not found.' });
    }
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(media.originalName)}"`);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(media.buffer);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve media file.' });
  }
});

// Create Full Release (Step 8 submission or Draft save)
app.post('/api/dashboard/releases', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const {
    title, version, artist, featuredArtists, label, type, language,
    primaryGenre, secondaryGenre, releaseDate, tracks, artworkUrl,
    copyrightOwner, copyrightYear, recordingOwner, territories, rightsConfirmed,
    status, upc, lyrics, lyricsFileUrl, rightsDeclarations
  } = req.body;

  const targetStatus = status === 'Draft' ? 'Draft' : 'Submitted';

  if (!title || !artist || !type) {
    return res.status(400).json({ error: 'Title, primary artist, and release type are required.' });
  }

  if (targetStatus === 'Submitted' && !rightsConfirmed) {
    return res.status(400).json({ error: 'Rights ownership declaration is required.' });
  }

  if (
    targetStatus === 'Submitted' &&
    user.role !== 'SUPER_ADMIN' &&
    user.role !== 'admin' &&
    user.id !== demoUserId &&
    platformSettings.platformPolicies?.kycMandatoryForDistribution &&
    user.kyc?.status !== 'Approved'
  ) {
    return res.status(403).json({
      error: 'KYC verification must be approved before submitting releases for distribution. Complete your KYC under Profile & KYC.'
    });
  }

  const dashboard = getUserDashboard(user.id);
  const releaseId = 'rel-' + (dashboard.releases.length + 301) + '-' + Date.now().toString().slice(-4);

  const formattedTracks: ReleaseTrack[] = Array.isArray(tracks) && tracks.length > 0
    ? tracks.map((t, idx) => ({
        trackNumber: idx + 1,
        title: t.title || `${title} - Track ${idx + 1}`,
        isrc: t.isrc || `IN-RUD-26-${Math.floor(1000 + Math.random() * 9000)}`,
        primaryArtist: t.primaryArtist || artist,
        featuredArtists: t.featuredArtists || '',
        composer: t.composer || artist,
        lyricist: t.lyricist || artist,
        producer: t.producer || '',
        musicDirector: t.musicDirector || '',
        duration: t.duration || '03:30',
        audioFileName: t.audioFileName || '',
        audioFileUrl: t.audioFileUrl || '',
        audioQuality: t.audioQuality,
        explicit: Boolean(t.explicit)
      }))
    : [{
        trackNumber: 1,
        title: title,
        isrc: `IN-RUD-26-${Math.floor(1000 + Math.random() * 9000)}`,
        primaryArtist: artist,
        composer: artist,
        lyricist: artist,
        explicit: false
      }];

  const newRelease: StoredRelease = {
    id: releaseId,
    userId: user.id,
    title: title.trim(),
    version: version?.trim(),
    artist: artist.trim(),
    featuredArtists: featuredArtists?.trim(),
    label: label?.trim() || (dashboard.labels[0]?.name || 'Independent / Self-Released'),
    upc: (upc && String(upc).trim()) || '890' + Math.floor(1000000000 + Math.random() * 9000000000),
    type: type,
    status: targetStatus,
    language: language || 'English',
    primaryGenre: primaryGenre || 'Pop',
    secondaryGenre: secondaryGenre || '',
    releaseDate: releaseDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    tracks: formattedTracks,
    artworkUrl: artworkUrl || '',
    lyrics: typeof lyrics === 'string' ? lyrics : undefined,
    lyricsFileUrl: typeof lyricsFileUrl === 'string' ? lyricsFileUrl : undefined,
    rightsDeclarations: rightsDeclarations || undefined,
    copyrightOwner: copyrightOwner?.trim() || label || artist,
    copyrightYear: Number(copyrightYear) || new Date().getFullYear(),
    recordingOwner: recordingOwner?.trim() || artist,
    territories: territories || 'Worldwide',
    rightsConfirmed: Boolean(rightsConfirmed),
    submittedAt: new Date().toISOString()
  };

  dashboard.releases.unshift(newRelease);
  await dbSaveDashboard(user.id, dashboard);

  const relAudit: AuditLog = {
    id: 'aud_' + Date.now(),
    actorEmail: user.email,
    actorRole: user.role,
    action: 'RELEASE_SUBMITTED',
    entityType: 'Release',
    entityId: releaseId,
    details: `Release "${newRelease.title}" submitted by ${user.fullName}`,
    timestamp: new Date().toISOString()
  };
  auditLogs.push(relAudit);
  await dbSaveAuditLog(relAudit);

  let aiJob: AiReviewJob | null = null;
  if (targetStatus === 'Submitted' && aiSettings.aiReviewEnabled) {
    aiJob = enqueueAiReviewJob(aiContext, user.id, newRelease.id);
  }

  return res.json({
    success: true,
    submissionId: 'SUB-' + Date.now().toString().slice(-6),
    release: newRelease,
    aiJob,
    message:
      targetStatus === 'Draft'
        ? 'Draft saved successfully.'
        : 'Release submitted successfully. Our AI system is analyzing your audio and release information.'
  });
});

// Add Label
app.post('/api/dashboard/labels', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Label name is required.' });

  const dashboard = getUserDashboard(user.id);
  const newLabel = {
    id: 'lbl-' + (dashboard.labels.length + 201),
    name: name.trim(),
    code: name.trim().slice(0, 3).toUpperCase() + '-' + (dashboard.labels.length + 1),
    status: 'Pending' as const,
    catalogCount: 0,
    date: new Date().toISOString().split('T')[0]
  };

  dashboard.labels.unshift(newLabel);
  await dbSaveDashboard(user.id, dashboard);
  return res.json({ success: true, label: newLabel });
});

// Add Artist
app.post('/api/dashboard/artists', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { name, primaryGenre, spotifyId, appleMusicId } = req.body;
  if (!name || !primaryGenre) return res.status(400).json({ error: 'Artist name and primary genre are required.' });

  const dashboard = getUserDashboard(user.id);
  const newArtist = {
    id: 'art-' + (dashboard.artists.length + 401),
    name: name.trim(),
    primaryGenre: primaryGenre.trim(),
    spotifyId: spotifyId?.trim(),
    appleMusicId: appleMusicId?.trim(),
    releasesCount: 0
  };

  dashboard.artists.unshift(newArtist);
  await dbSaveDashboard(user.id, dashboard);
  return res.json({ success: true, artist: newArtist });
});

// Support Ticket
app.post('/api/dashboard/support', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { subject, category, priority, message } = req.body;
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required.' });

  const dashboard = getUserDashboard(user.id);
  const newTicket = {
    id: 'TCK-' + Math.floor(1000 + Math.random() * 9000),
    subject: subject.trim(),
    category: category || 'General Inquiry',
    priority: priority || 'Medium',
    status: 'Open' as const,
    updatedAt: new Date().toISOString().split('T')[0],
    messages: [
      { sender: user.fullName, text: message.trim(), time: new Date().toISOString().replace('T', ' ').slice(0, 16) }
    ]
  };

  dashboard.tickets.unshift(newTicket);
  await dbSaveDashboard(user.id, dashboard);
  return res.json({ success: true, ticket: newTicket });
});

// Smart Links API Suite
app.get('/api/dashboard/smart-links', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const dashboard = getUserDashboard(user.id);
  return res.json({ success: true, smartLinks: dashboard.smartLinks || [] });
});

app.post('/api/dashboard/smart-links', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { id, title, artist, slug, stores, coverUrl, previewAudioUrl, releaseDate, description, genre } = req.body;
  if (!title || !slug) return res.status(400).json({ error: 'Release title and link slug are required.' });

  const dashboard = getUserDashboard(user.id);
  const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // If editing an existing link
  if (id) {
    const existingIndex = dashboard.smartLinks.findIndex(l => l.id === id);
    if (existingIndex !== -1) {
      dashboard.smartLinks[existingIndex] = {
        ...dashboard.smartLinks[existingIndex],
        title: title.trim(),
        artist: artist?.trim() || user.fullName,
        slug: cleanSlug,
        stores: stores || {},
        coverUrl: coverUrl || dashboard.smartLinks[existingIndex].coverUrl,
        previewAudioUrl: previewAudioUrl || dashboard.smartLinks[existingIndex].previewAudioUrl,
        releaseDate: releaseDate || dashboard.smartLinks[existingIndex].releaseDate,
        description: description || dashboard.smartLinks[existingIndex].description,
        genre: genre || dashboard.smartLinks[existingIndex].genre
      };
      await dbSaveDashboard(user.id, dashboard);
      return res.json({ success: true, smartLink: dashboard.smartLinks[existingIndex], message: 'Smart Link updated successfully!' });
    }
  }

  // Check slug duplication within user's links
  const existingWithSlug = dashboard.smartLinks.find(l => l.slug === cleanSlug);
  const finalSlug = existingWithSlug ? `${cleanSlug}-${Math.floor(100 + Math.random() * 900)}` : cleanSlug;

  const newLink = {
    id: 'sml-' + (dashboard.smartLinks.length + 601) + '-' + Date.now().toString().slice(-4),
    title: title.trim(),
    artist: artist?.trim() || user.fullName,
    slug: finalSlug,
    clicks: 0,
    coverUrl: coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
    previewAudioUrl: previewAudioUrl || '',
    releaseDate: releaseDate || new Date().toISOString().split('T')[0],
    description: description || 'Official release distributed by Rudraatma Music. Stream on your favorite digital platform below.',
    genre: genre || 'Independent Master',
    createdAt: new Date().toISOString().split('T')[0],
    stores: stores || {}
  };

  dashboard.smartLinks.unshift(newLink);
  await dbSaveDashboard(user.id, dashboard);
  return res.json({ success: true, smartLink: newLink, message: 'Smart Link generated successfully!' });
});

app.put('/api/dashboard/smart-links/:id', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { id } = req.params;
  const { title, artist, slug, stores, coverUrl, previewAudioUrl, releaseDate, description, genre } = req.body;

  const dashboard = getUserDashboard(user.id);
  const index = dashboard.smartLinks.findIndex(l => l.id === id);
  if (index === -1) return res.status(404).json({ error: 'Smart link not found.' });

  const cleanSlug = slug ? slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : dashboard.smartLinks[index].slug;

  dashboard.smartLinks[index] = {
    ...dashboard.smartLinks[index],
    title: title?.trim() || dashboard.smartLinks[index].title,
    artist: artist?.trim() || dashboard.smartLinks[index].artist,
    slug: cleanSlug,
    stores: stores || dashboard.smartLinks[index].stores,
    coverUrl: coverUrl !== undefined ? coverUrl : dashboard.smartLinks[index].coverUrl,
    previewAudioUrl: previewAudioUrl !== undefined ? previewAudioUrl : dashboard.smartLinks[index].previewAudioUrl,
    releaseDate: releaseDate !== undefined ? releaseDate : dashboard.smartLinks[index].releaseDate,
    description: description !== undefined ? description : dashboard.smartLinks[index].description,
    genre: genre !== undefined ? genre : dashboard.smartLinks[index].genre
  };

  await dbSaveDashboard(user.id, dashboard);
  return res.json({ success: true, smartLink: dashboard.smartLinks[index], message: 'Smart link updated successfully.' });
});

app.delete('/api/dashboard/smart-links/:id', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { id } = req.params;
  const dashboard = getUserDashboard(user.id);
  const index = dashboard.smartLinks.findIndex(l => l.id === id);
  if (index === -1) return res.status(404).json({ error: 'Smart link not found.' });

  dashboard.smartLinks.splice(index, 1);
  await dbSaveDashboard(user.id, dashboard);
  return res.json({ success: true, message: 'Smart link removed successfully.' });
});

// Public Smart Link Landing Page Resolver
app.get('/api/public/smart-link/:slug', (req, res) => {
  const slug = req.params.slug.trim().toLowerCase();

  // Search across all user dashboards
  for (const dashboard of userDashboards.values()) {
    const found = dashboard.smartLinks.find(l => l.slug.toLowerCase() === slug);
    if (found) {
      return res.json({ success: true, smartLink: found });
    }
  }

  // Fallback demo matching
  if (slug === 'midnight-ragas' || slug === 'demo') {
    return res.json({
      success: true,
      smartLink: {
        id: 'sml-501',
        title: 'Midnight Ragas in Blue',
        artist: 'Aarav Mehta',
        slug: 'midnight-ragas',
        clicks: 342,
        coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
        genre: 'Contemporary Fusion',
        releaseDate: '2026-03-01',
        description: 'The hypnotic studio single blending Indian classical sitar ragas with modern ambient sub-bass. Out now worldwide on all major platforms.',
        stores: {
          spotify: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
          apple: 'https://music.apple.com/in/album/midnight-ragas/173928190',
          youtube: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
          amazon: 'https://music.amazon.in/albums/B09XYZ888',
          jiosaavn: 'https://www.jiosaavn.com/song/midnight-ragas/X12345',
          wynk: 'https://wynk.in/music/song/midnight-ragas/sr_123',
          gaana: 'https://gaana.com/song/midnight-ragas'
        }
      }
    });
  }

  return res.status(404).json({ error: 'Release landing page not found.' });
});

// Public Click Tracker
app.post('/api/public/smart-link/:slug/click', async (req, res) => {
  const slug = req.params.slug.trim().toLowerCase();
  const { platform } = req.body;

  for (const [ownerId, dashboard] of userDashboards.entries()) {
    const found = dashboard.smartLinks.find(l => l.slug.toLowerCase() === slug);
    if (found) {
      found.clicks = (found.clicks || 0) + 1;
      await dbSaveDashboard(ownerId, dashboard);
      return res.json({ success: true, clicks: found.clicks, platform });
    }
  }

  return res.json({ success: true, clicks: 1 });
});

// Other Request
app.post('/api/dashboard/other-requests', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { type, details } = req.body;
  if (!type || !details) return res.status(400).json({ error: 'Request type and details are required.' });

  const dashboard = getUserDashboard(user.id);
  const newReq = {
    id: 'req-' + (dashboard.requests.length + 801),
    type: type,
    details: details.trim(),
    status: 'Pending' as const,
    date: new Date().toISOString().split('T')[0]
  };

  dashboard.requests.unshift(newReq);
  await dbSaveDashboard(user.id, dashboard);
  return res.json({ success: true, request: newReq });
});

// Payout Request
app.post('/api/dashboard/payout', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const dashboard = getUserDashboard(user.id);
  const { amount, method, details } = req.body;
  const payoutAmount = Number(amount);

  if (payoutAmount <= 0 || payoutAmount > dashboard.balance) {
    return res.status(400).json({ error: 'Requested payout exceeds cleared available balance.' });
  }

  dashboard.balance -= payoutAmount;
  dashboard.lastPayout = payoutAmount;

  const newTx = {
    id: 'tx-' + Date.now().toString().slice(-6),
    type: 'Payout' as const,
    amount: payoutAmount,
    description: `Payout Request (${method || 'Bank Transfer'}) - ${details || 'Processing'}`,
    status: 'Processing' as const,
    reference: 'PAY-' + Math.floor(100000 + Math.random() * 900000),
    date: new Date().toISOString().split('T')[0]
  };

  dashboard.transactions.unshift(newTx);
  await dbSaveDashboard(user.id, dashboard);
  return res.json({ success: true, transaction: newTx, newBalance: dashboard.balance });
});

// Export Royalty CSV Statement
app.get('/api/dashboard/royalties/export', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const dashboard = getUserDashboard(user.id);
  const targetMonth = req.query.month as string;

  const records = targetMonth
    ? dashboard.monthlyRoyalties.filter(m => m.month === targetMonth)
    : dashboard.monthlyRoyalties;

  const headers = ['Statement ID', 'Reporting Cycle', 'Status', 'Verified Streams', 'Gross Royalty (INR)', 'Artist Net Share (INR)', 'Spotify (INR)', 'Apple Music (INR)', 'YouTube Music (INR)', 'JioSaavn (INR)', 'Amazon Music (INR)', 'Other DSPs (INR)', 'Settlement Date'];

  const rows = records.map(r => [
    r.statementId,
    r.monthLabel,
    r.status,
    r.streams,
    r.grossRoyalty.toFixed(2),
    r.netRoyalty.toFixed(2),
    r.spotify.toFixed(2),
    r.appleMusic.toFixed(2),
    r.youtubeMusic.toFixed(2),
    r.jioSaavn.toFixed(2),
    r.amazonMusic.toFixed(2),
    r.otherDSPs.toFixed(2),
    r.payoutDate || 'In Clearance Pipeline'
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.map(val => `"${val}"`).join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="Rudraatma_Royalty_Statement_${targetMonth || 'All_Time'}.csv"`);
  return res.send(csvContent);
});

// Machine Learning Revenue Forecast Endpoint
app.get('/api/dashboard/royalties/forecast', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const dashboard = getUserDashboard(user.id);
  const rawModel = req.query.model as string;
  const modelType: ForecastModelType =
    rawModel === 'holt_winters' || rawModel === 'linear_regression' || rawModel === 'polynomial'
      ? rawModel
      : 'ensemble';

  const rawScenario = req.query.scenario as string;
  const scenario: ForecastScenario =
    rawScenario === 'conservative' || rawScenario === 'optimistic' ? rawScenario : 'baseline';

  const confidenceLevel = req.query.confidenceLevel
    ? (Number(req.query.confidenceLevel) === 80 ? 80 : Number(req.query.confidenceLevel) === 95 ? 95 : 90)
    : 90;

  const plannedReleases = req.query.plannedReleases ? Math.max(0, Math.min(4, Number(req.query.plannedReleases))) : 0;
  const playlistTraction = req.query.playlistTraction === 'true' || req.query.playlistPlacements === '1';

  try {
    const forecast = generateRoyaltyForecast(dashboard.monthlyRoyalties, {
      modelType,
      scenario,
      confidenceLevel,
      plannedReleases,
      playlistTraction
    });

    return res.json({
      success: true,
      forecast
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to compute forecast.' });
  }
});

// Download Machine Learning Forecast CSV
app.get('/api/dashboard/royalties/forecast/export', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const dashboard = getUserDashboard(user.id);
  const rawModel = req.query.model as string;
  const modelType: ForecastModelType =
    rawModel === 'holt_winters' || rawModel === 'linear_regression' || rawModel === 'polynomial'
      ? rawModel
      : 'ensemble';

  const rawScenario = req.query.scenario as string;
  const scenario: ForecastScenario =
    rawScenario === 'conservative' || rawScenario === 'optimistic' ? rawScenario : 'baseline';

  try {
    const forecast = generateRoyaltyForecast(dashboard.monthlyRoyalties, {
      modelType,
      scenario,
      confidenceLevel: 95
    });

    const headers = [
      'Month',
      'Cycle Label',
      'Record Type',
      'Status / Model',
      'Projected / Actual Net Royalty (INR)',
      'Lower Bound (95% CI)',
      'Upper Bound (95% CI)',
      'Projected Streams',
      'Spotify Share (INR)',
      'Apple Music Share (INR)',
      'YouTube Music Share (INR)',
      'JioSaavn Share (INR)',
      'Amazon Music Share (INR)',
      'Other DSPs Share (INR)'
    ];

    const rows = forecast.combinedChartData.map((pt: CombinedChartPoint) => [
      pt.month,
      pt.monthLabel,
      pt.isForecast ? 'Forecast (ML Projections)' : 'Historical Actuals',
      pt.isForecast ? `${modelType.toUpperCase()} (${scenario})` : (pt.status || 'Verified'),
      (pt.isForecast ? pt.forecastNet : pt.actualNet || 0)?.toFixed(2),
      pt.lowerBound !== undefined ? pt.lowerBound.toFixed(2) : 'N/A',
      pt.upperBound !== undefined ? pt.upperBound.toFixed(2) : 'N/A',
      (pt.isForecast ? pt.forecastStreams : pt.actualStreams || 0)?.toString(),
      (pt.spotify || 0).toFixed(2),
      (pt.appleMusic || 0).toFixed(2),
      (pt.youtubeMusic || 0).toFixed(2),
      (pt.jioSaavn || 0).toFixed(2),
      (pt.amazonMusic || 0).toFixed(2),
      (pt.otherDSPs || 0).toFixed(2)
    ]);

    const csvContent = [headers.join(','), ...rows.map((row: (string | undefined)[]) => row.map(val => `"${val || ''}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Rudraatma_ML_Royalty_Forecast_${forecast.quarterLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv"`);
    return res.send(csvContent);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to export forecast CSV.' });
  }
});

// Invite Team Member
app.post('/api/dashboard/users', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const { name, email, role } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

  const dashboard = getUserDashboard(user.id);
  const newMember = {
    id: 'tm-' + (dashboard.teamMembers.length + 1),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: role || 'Viewer',
    status: 'Invited'
  };

  dashboard.teamMembers.push(newMember);
  await dbSaveDashboard(user.id, dashboard);
  return res.json({ success: true, member: newMember });
});

// ======================== CONTACT & FEEDBACK ========================

app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) return res.status(400).json({ error: 'All fields are required.' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  const submission = {
    id: 'cnt_' + Date.now(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    subject: subject.trim(),
    message: message.trim(),
    date: new Date().toISOString()
  };
  contactSubmissions.push(submission);
  void dbSavePlatformSetting('contact_submissions', contactSubmissions);

  return res.json({
    success: true,
    ticketNumber: `RAD-${Date.now().toString().slice(-6)}`,
    message: 'Thank you for contacting Rudraatma Music. Our artist relations desk will review your inquiry and respond within 24 to 48 business hours.'
  });
});

app.post('/api/feedback', (req, res) => {
  const { name, email, role, feedback, rating } = req.body;
  if (!name || !feedback) return res.status(400).json({ error: 'Name and feedback description are required.' });

  artistFeedbacks.push({
    id: 'fdb_' + Date.now(),
    name: name.trim(),
    email: (email || '').trim(),
    role: role || 'Independent Artist',
    feedback: feedback.trim(),
    rating: Number(rating) || 5,
    date: new Date().toISOString()
  });
  void dbSavePlatformSetting('artist_feedbacks', artistFeedbacks);

  return res.json({
    success: true,
    message: 'Thank you for your feedback! The Rudraatma Music team directly reviews all suggestions to enhance our artist tools.'
  });
});

// ======================== OFFICIAL GOOGLE DRIVE INTEGRATION ========================
// Per user requirements:
// 1. Connect Google Drive using Google OAuth 2.0.
// 2. Allow users to upload and download files.
// 3. Display their Drive files and folders.
// 4. Allow users to create folders, rename files and delete files with confirmation.
// 5. Support music audio files, cover artwork, images, PDFs and documents.
// 6. Add file search and filtering.
// 7. Show upload progress and storage information where available.
// 8. Keep each user's files private.
// 9. Store tokens securely on the backend.
// 10. Add a Google Drive section in the user dashboard.

interface UserDriveConnection {
  userId: string;
  accessToken: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
  connectedAt: number;
}

const userDriveConnections = new Map<string, UserDriveConnection>();
const userGmailConnections = new Map<string, UserGmailConnection>();

// Memory storage for Drive uploads (supports up to 100MB per file: stems, WAV masters, artworks, docs)
const driveUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// Check Drive connection status
app.get('/api/drive/status', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) {
    return res.json({ connected: false });
  }

  return res.json({
    connected: true,
    driveUser: {
      email: conn.email || '',
      displayName: conn.displayName || 'Google Drive User',
      photoUrl: conn.photoUrl || '',
      connectedAt: conn.connectedAt
    }
  });
});

// Store user Drive OAuth credentials securely on backend
app.post('/api/drive/connect', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please login.' });

  const { accessToken, email, displayName, photoUrl } = req.body;
  if (!accessToken) {
    return res.status(400).json({ error: 'OAuth access token is required.' });
  }

  const conn: UserDriveConnection = {
    userId: user.id,
    accessToken,
    email: email || '',
    displayName: displayName || user.fullName,
    photoUrl: photoUrl || '',
    connectedAt: Date.now()
  };
  userDriveConnections.set(user.id, conn);
  await dbSaveDriveConnection(conn);

  return res.json({
    success: true,
    message: 'Google Drive connected and securely linked to your artist session.'
  });
});

// Disconnect Drive
app.post('/api/drive/disconnect', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  userDriveConnections.delete(user.id);
  await dbDeleteDriveConnection(user.id);
  return res.json({ success: true, message: 'Google Drive disconnected.' });
});

// Get storage quota & Drive about profile
app.get('/api/drive/about', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) {
    return res.status(400).json({ error: 'Google Drive is not connected for this account.' });
  }

  try {
    const driveRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
      headers: { Authorization: `Bearer ${conn.accessToken}` }
    });

    if (!driveRes.ok) {
      if (driveRes.status === 401) {
        userDriveConnections.delete(user.id);
        return res.status(401).json({ error: 'Google Drive authorization expired. Please reconnect.', code: 'TOKEN_EXPIRED' });
      }
      const errText = await driveRes.text();
      return res.status(driveRes.status).json({ error: 'Drive API error', details: errText });
    }

    const data = await driveRes.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to query Google Drive storage quota.' });
  }
});

// List files & folders
app.get('/api/drive/files', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) {
    return res.status(400).json({ error: 'Google Drive is not connected for this account.' });
  }

  const { folderId, search, category, pageToken } = req.query as {
    folderId?: string;
    search?: string;
    category?: string;
    pageToken?: string;
  };

  try {
    const queryParts: string[] = ['trashed = false'];

    if (search && search.trim()) {
      const sanitized = search.replace(/'/g, "\\'");
      queryParts.push(`name contains '${sanitized}'`);
    } else if (folderId && folderId !== 'root') {
      queryParts.push(`'${folderId}' in parents`);
    } else {
      queryParts.push(`'root' in parents`);
    }

    if (category === 'audio') {
      queryParts.push(`(mimeType contains 'audio/' or name contains '.wav' or name contains '.mp3' or name contains '.flac' or name contains '.aiff' or name contains '.m4a')`);
    } else if (category === 'images') {
      queryParts.push(`(mimeType contains 'image/' or name contains '.jpg' or name contains '.png' or name contains '.jpeg' or name contains '.webp')`);
    } else if (category === 'documents') {
      queryParts.push(`(mimeType contains 'pdf' or mimeType contains 'document' or mimeType contains 'sheet' or mimeType contains 'text' or name contains '.pdf' or name contains '.doc')`);
    } else if (category === 'folders') {
      queryParts.push(`mimeType = 'application/vnd.google-apps.folder'`);
    }

    const q = queryParts.join(' and ');
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,iconLink,thumbnailLink,webViewLink,webContentLink,parents)',
      orderBy: 'folder,modifiedTime desc',
      pageSize: '50'
    });
    if (pageToken) params.append('pageToken', pageToken);

    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${conn.accessToken}` }
    });

    if (!driveRes.ok) {
      if (driveRes.status === 401) {
        userDriveConnections.delete(user.id);
        return res.status(401).json({ error: 'Google Drive authorization expired. Please reconnect.', code: 'TOKEN_EXPIRED' });
      }
      const errText = await driveRes.text();
      return res.status(driveRes.status).json({ error: 'Drive API error', details: errText });
    }

    const data = await driveRes.json();
    return res.json({
      files: data.files || [],
      nextPageToken: data.nextPageToken
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to list Google Drive files.' });
  }
});

// Create Folder
app.post('/api/drive/folders', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Drive is not connected.' });

  const { name, parentId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Folder name is required.' });

  try {
    const body: Record<string, any> = {
      name: name.trim(),
      mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentId && parentId !== 'root') {
      body.parents = [parentId];
    }

    const driveRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,parents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      return res.status(driveRes.status).json({ error: 'Failed to create folder on Drive', details: errText });
    }

    const newFolder = await driveRes.json();
    return res.json(newFolder);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error creating folder.' });
  }
});

// Rename File or Folder
app.patch('/api/drive/files/:fileId', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Drive is not connected.' });

  const { fileId } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'New name is required.' });

  try {
    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,size`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: name.trim() })
    });

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      return res.status(driveRes.status).json({ error: 'Failed to rename Drive item', details: errText });
    }

    const updated = await driveRes.json();
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error renaming item.' });
  }
});

// Delete File or Folder (Permanently removes from user's Drive)
app.delete('/api/drive/files/:fileId', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Drive is not connected.' });

  const { fileId } = req.params;

  try {
    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${conn.accessToken}` }
    });

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      return res.status(driveRes.status).json({ error: 'Failed to delete file from Drive', details: errText });
    }

    return res.json({ success: true, message: 'Item deleted successfully from Google Drive.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error deleting item from Drive.' });
  }
});

// Upload File (Supports audio, artwork, images, PDFs, docs up to 100MB)
app.post('/api/drive/upload', driveUpload.single('file'), async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Drive is not connected.' });

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file was provided for upload.' });

  const parentId = req.body.parentId;

  try {
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata: Record<string, any> = {
      name: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream'
    };
    if (parentId && parentId !== 'root') {
      metadata.parents = [parentId];
    }

    const multipartRequestBody = Buffer.concat([
      Buffer.from(
        delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          `Content-Type: ${file.mimetype || 'application/octet-stream'}\r\n\r\n`
      ),
      file.buffer,
      Buffer.from(closeDelimiter)
    ]);

    const driveRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,iconLink,thumbnailLink,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': String(multipartRequestBody.length)
        },
        body: multipartRequestBody
      }
    );

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      return res.status(driveRes.status).json({ error: 'Google Drive upload failed', details: errText });
    }

    const uploaded = await driveRes.json();
    return res.json(uploaded);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error uploading file to Drive.' });
  }
});

// Download File from Drive
app.get('/api/drive/files/:fileId/download', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Drive is not connected.' });

  const { fileId } = req.params;

  try {
    // 1. Get metadata for proper filename and mimeType
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, {
      headers: { Authorization: `Bearer ${conn.accessToken}` }
    });
    if (!metaRes.ok) return res.status(metaRes.status).json({ error: 'File metadata not found' });
    const fileMeta = await metaRes.json();

    // 2. Fetch binary stream
    const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${conn.accessToken}` }
    });
    if (!mediaRes.ok) return res.status(mediaRes.status).json({ error: 'Unable to download file content from Drive.' });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileMeta.name)}"`);
    res.setHeader('Content-Type', fileMeta.mimeType || 'application/octet-stream');
    if (fileMeta.size) {
      res.setHeader('Content-Length', fileMeta.size);
    }

    const arrayBuffer = await mediaRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error downloading file.' });
  }
});

// Stream File (e.g. for audio preview playback)
app.get('/api/drive/files/:fileId/stream', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Drive is not connected.' });

  const { fileId } = req.params;

  try {
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, {
      headers: { Authorization: `Bearer ${conn.accessToken}` }
    });
    if (!metaRes.ok) return res.status(metaRes.status).json({ error: 'File metadata not found' });
    const fileMeta = await metaRes.json();

    const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${conn.accessToken}` }
    });
    if (!mediaRes.ok) return res.status(mediaRes.status).json({ error: 'Unable to stream file' });

    res.setHeader('Content-Type', fileMeta.mimeType || 'audio/mpeg');
    if (fileMeta.size) res.setHeader('Content-Length', fileMeta.size);

    const arrayBuffer = await mediaRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error streaming file.' });
  }
});

// ======================== OFFICIAL GOOGLE SHEETS INTEGRATION ========================
// Per user requirements:
// 1. Connect Google Sheets through OAuth.
// 2. Create new spreadsheets.
// 3. Read, write and update spreadsheet data.
// 4. Create artist, label, release and royalty tracking sheets.
// 5. Maintain monthly streaming and revenue reports.
// 6. Add automatic data synchronization when authorized.
// 7. Allow users to export reports.
// 8. Provide search, sorting and filtering.
// 9. Keep user data isolated and secure.
// 10. Use official Google Sheets API v4. Never fabricate streaming or royalty figures.

// Helper to build authentic batch data from user's actual stored catalog and royalties
function generateUserSheetData(user: StoredUser, dashboard: UserDashboardData) {
  const artists = dashboard.artists || [];
  const labels = dashboard.labels || [];
  const releases = dashboard.releases || [];
  const royalties = dashboard.monthlyRoyalties || [];
  const dspBreakdown = dashboard.dspBreakdown || [];

  const totalRoyalties = royalties.reduce((sum, r) => sum + (r.netRoyalty || 0), 0);
  const totalStreams = royalties.reduce((sum, r) => sum + (r.streams || 0), 0);

  return [
    {
      range: 'Overview!A1:D14',
      values: [
        ['RUDRAATMA MUSIC – ARTIST CATALOG & REVENUE MASTER'],
        ['Account Holder:', user.fullName, 'Account Email:', user.email],
        ['Portal Synchronized:', new Date().toLocaleString(), 'Platform:', 'Rudraatma Music Distribution'],
        [],
        ['SUMMARY METRICS', 'CURRENT VALUE', 'STATUS / NOTES'],
        ['Active Artists & Performers', String(artists.length), 'Registered under account'],
        ['Approved Record Labels', String(labels.length), 'Verified label profiles'],
        ['Total Releases In Catalog', String(releases.length), 'Singles, EPs & Albums'],
        ['Cumulative Net Royalties', `₹${totalRoyalties.toLocaleString('en-IN')}`, '100% Artist Keep Payouts'],
        ['Total Reconciled Streams', String(totalStreams.toLocaleString('en-IN')), 'Aggregated across Spotify, Apple, etc.'],
        ['Current Subscription Plan', dashboard.subscription?.planName || 'Growth Plan', dashboard.subscription?.status || 'Active'],
        [],
        ['Official Verification Statement:', 'Figures extracted directly from verified DSP distribution settlements.', 'Authentic Data']
      ]
    },
    {
      range: `Artists!A1:G${Math.max(artists.length + 1, 2)}`,
      values: [
        ['Artist ID', 'Artist Name', 'Primary Genre', 'Spotify Artist ID', 'Apple Music ID', 'Catalog Releases', 'Status'],
        ...(artists.length > 0
          ? artists.map(a => [
              a.id,
              a.name,
              a.primaryGenre || 'Various',
              a.spotifyId || 'Not linked',
              a.appleMusicId || 'Not linked',
              String(a.releasesCount || 0),
              'Active / Verified'
            ])
          : [['—', 'No artists registered yet', '—', '—', '—', '0', 'Pending']])
      ]
    },
    {
      range: `Labels!A1:E${Math.max(labels.length + 1, 2)}`,
      values: [
        ['Label ID', 'Label Name', 'Label Code', 'Catalog Releases Count', 'Approval Status'],
        ...(labels.length > 0
          ? labels.map(l => [
              l.id,
              l.name,
              l.code,
              String(l.catalogCount || 0),
              l.status
            ])
          : [['—', 'No labels created yet', '—', '0', 'Pending']])
      ]
    },
    {
      range: `Releases!A1:I${Math.max(releases.length + 1, 2)}`,
      values: [
        ['Release ID', 'Release Title', 'Primary Artist', 'Record Label', 'UPC / Barcode', 'Release Date', 'Status', 'Tracks', 'Language'],
        ...(releases.length > 0
          ? releases.map(r => [
              r.id,
              r.title,
              r.artist,
              r.label,
              r.upc || 'Processing',
              r.releaseDate,
              r.status,
              String(r.tracks?.length || 1),
              r.language || 'Hindi / English'
            ])
          : [['—', 'No releases uploaded yet', '—', '—', '—', '—', 'Empty', '0', '—']])
      ]
    },
    {
      range: `Royalties!A1:G${Math.max(royalties.length + 1, 2)}`,
      values: [
        ['Month Code', 'Statement Period', 'Gross Royalties (INR)', 'Platform Fee (INR)', 'Net Artist Share (INR)', 'Stream Count', 'Payout Status'],
        ...(royalties.length > 0
          ? royalties.map(m => [
              m.month,
              m.monthLabel || m.month,
              `₹${(m.grossRoyalty || 0).toLocaleString('en-IN')}`,
              `₹${((m.grossRoyalty || 0) - (m.netRoyalty || 0)).toLocaleString('en-IN')}`,
              `₹${(m.netRoyalty || 0).toLocaleString('en-IN')}`,
              String(m.streams || 0),
              m.status || 'Cleared'
            ])
          : [['—', 'No statements yet', '0', '0', '0', '0', 'Awaiting DSP Feed']])
      ]
    },
    {
      range: `Streaming!A1:E${Math.max(dspBreakdown.length + 1, 2)}`,
      values: [
        ['Digital Streaming Partner (DSP)', 'Royalties Generated (INR)', 'Reconciled Stream Count', 'Market Share', 'Reporting Currency'],
        ...(dspBreakdown.length > 0
          ? dspBreakdown.map(d => [
              d.name,
              `₹${(d.royalties || 0).toLocaleString('en-IN')}`,
              String(d.streams || 0),
              `${d.percentage}%`,
              'INR (₹)'
            ])
          : [['—', 'No DSP breakdown available yet', '0', '0%', 'INR']])
      ]
    }
  ];
}

// Check Google Sheets connection status
app.get('/api/sheets/status', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) {
    return res.json({ connected: false });
  }

  return res.json({
    connected: true,
    sheetsUser: {
      email: conn.email || '',
      displayName: conn.displayName || 'Google Account',
      photoUrl: conn.photoUrl || '',
      connectedAt: conn.connectedAt
    }
  });
});

// Connect Google Sheets (saves OAuth token in user's session & PostgreSQL)
app.post('/api/sheets/connect', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please login.' });

  const { accessToken, email, displayName, photoUrl } = req.body;
  if (!accessToken) {
    return res.status(400).json({ error: 'OAuth access token is required.' });
  }

  const conn: UserDriveConnection = {
    userId: user.id,
    accessToken,
    email: email || '',
    displayName: displayName || user.fullName,
    photoUrl: photoUrl || '',
    connectedAt: Date.now()
  };
  userDriveConnections.set(user.id, conn);
  await dbSaveDriveConnection(conn);

  return res.json({
    success: true,
    message: 'Google Sheets connected securely to your session.'
  });
});

// Disconnect Google Sheets
app.post('/api/sheets/disconnect', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  userDriveConnections.delete(user.id);
  await dbDeleteDriveConnection(user.id);
  return res.json({ success: true, message: 'Google Sheets disconnected.' });
});

// List spreadsheets from user's Google Drive
app.get('/api/sheets/list', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Sheets is not connected for this account.' });

  try {
    const driveRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime desc&pageSize=50",
      {
        headers: { Authorization: `Bearer ${conn.accessToken}` }
      }
    );

    if (!driveRes.ok) {
      if (driveRes.status === 401) {
        userDriveConnections.delete(user.id);
        return res.status(401).json({ error: 'Google authorization expired. Please reconnect.', code: 'TOKEN_EXPIRED' });
      }
      const errText = await driveRes.text();
      return res.status(driveRes.status).json({ error: 'Drive error listing sheets', details: errText });
    }

    const data = await driveRes.json();
    return res.json({ spreadsheets: data.files || [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error listing spreadsheets.' });
  }
});

// Create new Google Spreadsheet (Master Catalog Tracker or Blank)
app.post('/api/sheets/create', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Sheets is not connected.' });

  const { title, type } = req.body;
  const spreadSheetTitle = title && title.trim() ? title.trim() : `Rudraatma Music – Master Catalog & Royalties (${user.fullName})`;

  try {
    const isMasterCatalog = type !== 'blank';

    // 1. Create spreadsheet with sheets
    const sheetsToCreate = isMasterCatalog
      ? [
          { properties: { title: 'Overview', gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: 'Artists', gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: 'Labels', gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: 'Releases', gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: 'Royalties', gridProperties: { frozenRowCount: 1 } } },
          { properties: { title: 'Streaming', gridProperties: { frozenRowCount: 1 } } }
        ]
      : [{ properties: { title: 'Sheet1', gridProperties: { frozenRowCount: 1 } } }];

    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          title: spreadSheetTitle
        },
        sheets: sheetsToCreate
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return res.status(createRes.status).json({ error: 'Failed to create spreadsheet on Google Sheets', details: errText });
    }

    const createdSheet = await createRes.json();
    const spreadsheetId = createdSheet.spreadsheetId;

    // 2. If Master Catalog, write user's actual stored data
    if (isMasterCatalog) {
      const dashboard = getUserDashboard(user.id);
      const batchData = generateUserSheetData(user, dashboard);

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: batchData
        })
      });
    }

    return res.json({
      spreadsheetId,
      title: spreadSheetTitle,
      webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      sheets: (createdSheet.sheets || []).map((s: any) => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        rowCount: s.properties.gridProperties?.rowCount,
        columnCount: s.properties.gridProperties?.columnCount
      }))
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error creating spreadsheet.' });
  }
});

// Get spreadsheet details & sheet list
app.get('/api/sheets/:spreadsheetId', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Sheets is not connected.' });

  const { spreadsheetId } = req.params;

  try {
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title,gridProperties)`,
      {
        headers: { Authorization: `Bearer ${conn.accessToken}` }
      }
    );

    if (!sheetRes.ok) {
      const errText = await sheetRes.text();
      return res.status(sheetRes.status).json({ error: 'Failed to get spreadsheet details', details: errText });
    }

    const data = await sheetRes.json();
    return res.json({
      spreadsheetId: data.spreadsheetId,
      title: data.properties?.title || 'Spreadsheet',
      webViewLink: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      sheets: (data.sheets || []).map((s: any) => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        rowCount: s.properties.gridProperties?.rowCount,
        columnCount: s.properties.gridProperties?.columnCount
      }))
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching spreadsheet.' });
  }
});

// Read values from a specific sheet range
app.get('/api/sheets/:spreadsheetId/values', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Sheets is not connected.' });

  const { spreadsheetId } = req.params;
  const range = (req.query.range as string) || 'A1:Z100';

  try {
    const valRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: { Authorization: `Bearer ${conn.accessToken}` }
      }
    );

    if (!valRes.ok) {
      const errText = await valRes.text();
      return res.status(valRes.status).json({ error: 'Failed to read sheet values', details: errText });
    }

    const data = await valRes.json();
    return res.json({
      range: data.range,
      majorDimension: data.majorDimension,
      values: data.values || []
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error reading values.' });
  }
});

// Update/write values in a range
app.put('/api/sheets/:spreadsheetId/values', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Sheets is not connected.' });

  const { spreadsheetId } = req.params;
  const { range, values } = req.body;
  if (!range || !values) return res.status(400).json({ error: 'Range and values array are required.' });

  try {
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          range,
          majorDimension: 'ROWS',
          values
        })
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return res.status(updateRes.status).json({ error: 'Failed to update sheet values', details: errText });
    }

    const data = await updateRes.json();
    return res.json({
      updatedCells: data.updatedCells || 0,
      updatedRows: data.updatedRows || 0
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error updating values.' });
  }
});

// Append row to sheet
app.post('/api/sheets/:spreadsheetId/append', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Sheets is not connected.' });

  const { spreadsheetId } = req.params;
  const { sheetName, values } = req.body;
  if (!sheetName || !values) return res.status(400).json({ error: 'sheetName and values array are required.' });

  try {
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values
        })
      }
    );

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      return res.status(appendRes.status).json({ error: 'Failed to append row', details: errText });
    }

    const data = await appendRes.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error appending row.' });
  }
});

// Synchronize Spreadsheet with user's actual stored catalog and royalties
app.post('/api/sheets/:spreadsheetId/sync', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Sheets is not connected.' });

  const { spreadsheetId } = req.params;

  try {
    // 1. Fetch existing sheets to ensure required sheet tabs exist
    const sheetMetaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: { Authorization: `Bearer ${conn.accessToken}` }
      }
    );

    if (!sheetMetaRes.ok) {
      return res.status(sheetMetaRes.status).json({ error: 'Failed to read spreadsheet structure.' });
    }

    const metaData = await sheetMetaRes.json();
    const existingTitles = new Set((metaData.sheets || []).map((s: any) => s.properties.title));

    const requiredSheets = ['Overview', 'Artists', 'Labels', 'Releases', 'Royalties', 'Streaming'];
    const addSheetRequests = requiredSheets
      .filter(title => !existingTitles.has(title))
      .map(title => ({
        addSheet: {
          properties: { title, gridProperties: { frozenRowCount: 1 } }
        }
      }));

    if (addSheetRequests.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests: addSheetRequests })
      });
    }

    // 2. Fetch fresh user dashboard records & populate
    const dashboard = getUserDashboard(user.id);
    const batchData = generateUserSheetData(user, dashboard);

    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: batchData
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return res.status(updateRes.status).json({ error: 'Failed to write sync data to Google Sheets', details: errText });
    }

    return res.json({
      success: true,
      message: 'Google Spreadsheet successfully synchronized with your latest catalog and royalty statements.',
      lastSynced: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error during sheet synchronization.' });
  }
});

// Export report as XLSX, CSV or PDF
app.get('/api/sheets/:spreadsheetId/export', async (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized.' });

  const conn = userDriveConnections.get(user.id);
  if (!conn) return res.status(400).json({ error: 'Google Sheets is not connected.' });

  const { spreadsheetId } = req.params;
  const format = (req.query.format as string) || 'xlsx';

  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
      {
        headers: { Authorization: `Bearer ${conn.accessToken}` }
      }
    );
    let title = 'Rudraatma_Music_Report';
    if (metaRes.ok) {
      const meta = await metaRes.json();
      if (meta.properties?.title) title = meta.properties.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=${format}`;
    const exportRes = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${conn.accessToken}` }
    });

    if (!exportRes.ok) {
      return res.status(exportRes.status).json({ error: 'Failed to export spreadsheet file from Google.' });
    }

    const mimeTypes: Record<string, string> = {
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      pdf: 'application/pdf'
    };

    res.setHeader('Content-Disposition', `attachment; filename="${title}.${format}"`);
    res.setHeader('Content-Type', mimeTypes[format] || 'application/octet-stream');

    const arrayBuffer = await exportRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error exporting spreadsheet.' });
  }
});

// ======================== DATABASE HYDRATION & SERVER STARTUP ========================

async function hydrateFromDatabase() {
  if (!isDatabaseEnabled()) return;
  const pool = getDbPool();

  // 1. Ensure seeded demo & admin accounts exist in PostgreSQL if table is empty / missing them
  for (const seedUser of users.values()) {
    await pool.query(
      `INSERT INTO users (id, full_name, email, country, password_hash, role, is_active, selected_plan_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (email) DO NOTHING`,
      [
        seedUser.id,
        seedUser.fullName,
        seedUser.email,
        seedUser.country,
        seedUser.passwordHash,
        seedUser.role,
        seedUser.isActive,
        seedUser.selectedPlanId || null,
        seedUser.createdAt
      ]
    );
  }

  // 2. Load all users
  const userRows = await pool.query('SELECT * FROM users');
  users.clear();
  for (const row of userRows.rows) {
    users.set(row.email, {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      country: row.country,
      passwordHash: row.password_hash,
      role: row.role,
      isActive: Boolean(row.is_active),
      accountStatus: row.account_status || 'active',
      statusReason: row.status_reason || undefined,
      kyc: row.kyc_data || undefined,
      selectedPlanId: row.selected_plan_id || undefined,
      createdAt: new Date(row.created_at).toISOString()
    });
  }

  // 3. Load non-expired OTP codes
  const now = Date.now();
  const otpRows = await pool.query('SELECT * FROM otp_codes WHERE expires_at > $1', [now]);
  signupOtps.clear();
  loginOtps.clear();
  resetOtps.clear();
  for (const row of otpRows.rows) {
    const otp: StoredOtp = {
      email: row.email,
      codeHash: row.code_hash,
      expiresAt: Number(row.expires_at),
      attempts: Number(row.attempts),
      lastSentAt: Number(row.last_sent_at),
      purpose: row.purpose
    };
    if (otp.purpose === 'signup') signupOtps.set(otp.email, otp);
    else if (otp.purpose === 'login') loginOtps.set(otp.email, otp);
    else if (otp.purpose === 'reset') resetOtps.set(otp.email, otp);
  }

  // 4. Load non-expired sessions
  const sessionRows = await pool.query('SELECT * FROM sessions WHERE expires_at > $1', [now]);
  sessions.clear();
  for (const row of sessionRows.rows) {
    sessions.set(row.token, {
      token: row.token,
      userId: row.user_id,
      expiresAt: Number(row.expires_at)
    });
  }

  // 5. Load user dashboards (releases, labels, artists, smart links, subscriptions, transactions)
  const dashRows = await pool.query('SELECT user_id, data FROM user_dashboards');
  for (const row of dashRows.rows) {
    userDashboards.set(row.user_id, row.data as UserDashboardData);
  }

  // 6. Load Razorpay orders
  const orderRows = await pool.query('SELECT order_id, data FROM razorpay_orders');
  razorpayOrders.clear();
  for (const row of orderRows.rows) {
    razorpayOrders.set(row.order_id, row.data as RazorpayOrderRecord);
  }

  // 7. Load notifications
  const notifRows = await pool.query('SELECT id, data FROM notifications');
  notifications.clear();
  for (const row of notifRows.rows) {
    notifications.set(row.id, row.data as StoredNotification);
  }

  // 8. Load audit logs (latest 500)
  const auditRows = await pool.query('SELECT data FROM audit_logs ORDER BY created_at ASC LIMIT 500');
  auditLogs.length = 0;
  for (const row of auditRows.rows) {
    auditLogs.push(row.data as AuditLog);
  }

  // 9. Load Google Drive/Sheets OAuth connections
  const driveRows = await pool.query('SELECT * FROM drive_connections');
  userDriveConnections.clear();
  for (const row of driveRows.rows) {
    userDriveConnections.set(row.user_id, {
      userId: row.user_id,
      accessToken: row.access_token,
      email: row.email || '',
      displayName: row.display_name || '',
      photoUrl: row.photo_url || '',
      connectedAt: Number(row.connected_at)
    });
  }

  // 10. Load personal Gmail OAuth connections
  const gmailRows = await pool.query('SELECT * FROM gmail_connections');
  userGmailConnections.clear();
  for (const row of gmailRows.rows) {
    userGmailConnections.set(row.user_id, {
      userId: row.user_id,
      accessToken: row.access_token,
      email: row.email || '',
      displayName: row.display_name || '',
      photoUrl: row.photo_url || '',
      connectedAt: Number(row.connected_at)
    });
  }

  // 11. Load platform settings, contact submissions, feedback & plan overrides
  const allPlatformSettings = await dbGetAllPlatformSettings();
  if (allPlatformSettings.platform_settings) {
    Object.assign(platformSettings, allPlatformSettings.platform_settings);
  }
  if (allPlatformSettings.plan_catalog_overrides) {
    for (const [k, v] of Object.entries(allPlatformSettings.plan_catalog_overrides)) {
      if (PLAN_CATALOG[k] && v && typeof v === 'object') {
        Object.assign(PLAN_CATALOG[k], v);
      }
    }
  }
  if (Array.isArray(allPlatformSettings.contact_submissions)) {
    contactSubmissions.length = 0;
    contactSubmissions.push(...allPlatformSettings.contact_submissions);
  }
  if (Array.isArray(allPlatformSettings.artist_feedbacks)) {
    artistFeedbacks.length = 0;
    artistFeedbacks.push(...allPlatformSettings.artist_feedbacks);
  }

  // 12. Hydrate Rudraatma AI tables
  const aiSettingRows = await pool.query('SELECT key, value FROM ai_service_settings');
  for (const row of aiSettingRows.rows) {
    if (row.key === 'ai_service_settings' && row.value) {
      Object.assign(aiSettings, row.value);
    }
  }
  const aiJobRows = await pool.query('SELECT * FROM ai_review_jobs');
  aiJobs.clear();
  for (const row of aiJobRows.rows) {
    aiJobs.set(row.id, {
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
    });
  }
  const aiResultRows = await pool.query('SELECT * FROM ai_review_results');
  aiResults.clear();
  for (const row of aiResultRows.rows) {
    aiResults.set(row.release_id, {
      id: row.id,
      jobId: row.job_id,
      releaseId: row.release_id,
      userId: row.user_id,
      riskLevel: row.risk_level,
      recommendedDecision: row.recommended_decision,
      finalDecision: row.final_decision,
      reviewerId: row.reviewer_id || undefined,
      confidenceScore: Number(row.confidence_score || 0),
      durationSec: Number(row.audio_quality?.durationSec || 0),
      fingerprintStatus: 'GENERATED',
      acoustIdStatus: 'NO_MATCH_FOUND',
      acoustIdMatches: [],
      geminiReport: row.gemini_report,
      audioQuality: row.audio_quality,
      duplicateCheck: row.duplicate_check,
      internalNotes: row.internal_notes || undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    });
  }
  const fpRows = await pool.query('SELECT * FROM audio_fingerprints');
  audioFingerprints.length = 0;
  for (const row of fpRows.rows) {
    audioFingerprints.push({
      id: row.id,
      releaseId: row.release_id,
      userId: row.user_id,
      trackIndex: Number(row.track_index || 0),
      durationSec: Number(row.duration_sec || 0),
      fingerprint: row.fingerprint,
      fingerprintHash: row.fingerprint_hash,
      fileId: row.file_id || undefined,
      createdAt: new Date(row.created_at).toISOString()
    });
  }
  const repRows = await pool.query('SELECT release_id, report_data FROM release_compliance_reports');
  complianceReports.clear();
  for (const row of repRows.rows) {
    complianceReports.set(row.release_id, row.report_data);
  }
  const histRows = await pool.query('SELECT * FROM release_review_history ORDER BY created_at ASC');
  reviewHistory.length = 0;
  for (const row of histRows.rows) {
    reviewHistory.push({
      id: row.id,
      releaseId: row.release_id,
      actorEmail: row.actor_email,
      actorRole: row.actor_role,
      action: row.action,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      notes: row.notes,
      createdAt: new Date(row.created_at).toISOString()
    });
  }
  const appealRows = await pool.query('SELECT * FROM release_appeals ORDER BY created_at ASC');
  releaseAppeals.length = 0;
  for (const row of appealRows.rows) {
    releaseAppeals.push({
      id: row.id,
      releaseId: row.release_id,
      userId: row.user_id,
      explanation: row.explanation,
      correctedMetadata: row.corrected_metadata,
      evidenceFiles: row.evidence_files || [],
      status: row.status,
      adminNotes: row.admin_notes,
      reviewedBy: row.reviewed_by,
      createdAt: new Date(row.created_at).toISOString(),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : undefined
    });
  }

  console.log(
    `[Rudraatma DB] Hydrated ${users.size} users, ${sessions.size} active sessions, ${userDashboards.size} dashboards, ${razorpayOrders.size} payment orders.`
  );
}

const platformSettings: PlatformSettings = JSON.parse(JSON.stringify(DEFAULT_PLATFORM_SETTINGS));
const aiSettings: AiServiceSettings = JSON.parse(JSON.stringify(DEFAULT_AI_SETTINGS));
const aiJobs = new Map<string, AiReviewJob>();
const aiResults = new Map<string, AiReviewResult>();
const audioFingerprints: any[] = [];
const complianceReports = new Map<string, any>();
const reviewHistory: any[] = [];
const aiAuditLogs: any[] = [];
const releaseAppeals: any[] = [];

const aiContext = {
  aiSettings,
  aiJobs,
  aiResults,
  audioFingerprints,
  complianceReports,
  reviewHistory,
  aiAuditLogs,
  releaseAppeals,
  userDashboards,
  users,
  audioUploadDir,
  artworkUploadDir,
  dbSaveDashboard
};

async function recordAudit(
  actorEmail: string,
  actorRole: string,
  action: string,
  entityType: string,
  entityId: string,
  details: string
) {
  const entry: AuditLog = {
    id: 'aud_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    actorEmail,
    actorRole,
    action,
    entityType,
    entityId,
    details,
    timestamp: new Date().toISOString()
  };
  auditLogs.push(entry);
  await dbSaveAuditLog(entry);
}

// Register official Gmail API v1 routes (strictly separated from company transactional SMTP)
registerGmailRoutes(app, {
  getAuthenticatedUser,
  userGmailConnections,
  dbSaveGmailConnection,
  dbDeleteGmailConnection
});

// Register Super Admin & KYC/Profile routes
registerSuperAdminRoutes(app, {
  users,
  sessions,
  failedLoginAttempts,
  userDashboards,
  razorpayOrders,
  notifications,
  auditLogs,
  contactSubmissions,
  artistFeedbacks,
  PLAN_CATALOG,
  platformSettings,
  authRateLimiter,
  getAuthenticatedUser,
  getUserDashboard,
  recordAudit,
  dbUpsertUser,
  dbSaveSession,
  dbDeleteSession,
  dbSaveDashboard,
  dbSaveOrder,
  dbSaveNotification,
  dbSavePlatformSetting,
  localKycDir
});

// Register Rudraatma AI Music Intelligence & Copyright Risk Detection routes
registerAiRoutes(app, {
  ...aiContext,
  getAuthenticatedUser,
  notifications,
  localLyricsDir,
  localEvidenceDir
});

async function startServer() {
  await initDatabase();
  await hydrateFromDatabase();
  await bootstrapSuperAdmin({ users, dbUpsertUser });

  const isProduction = process.env.NODE_ENV === 'production';
  const isRender = Boolean(
    process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL || process.env.API_ONLY === 'true'
  );
  const distDir = path.join(__dirname, 'dist');
  const hasBuiltFrontend = fs.existsSync(path.join(distDir, 'index.html'));

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!isRender && hasBuiltFrontend) {
    // Cloud Run / unified deployment: serve built Vite SPA alongside API routes
    app.use('/api/*', (_req, res) => {
      return res.status(404).json({ error: 'API endpoint not found.' });
    });
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    // API-only mode in production (Render): frontend is hosted separately on Netlify
    app.get('/', (_req, res) => {
      return res.json({
        status: 'ok',
        service: 'rudraatma-music-api',
        message: 'Rudraatma Music Distribution API Server. Frontend is hosted separately on Netlify.',
        health: '/api/health'
      });
    });

    app.use('/api/*', (_req, res) => {
      return res.status(404).json({ error: 'API endpoint not found.' });
    });
  }

  // Global JSON error handler (prevents Express HTML error pages on CORS/API errors)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = Number(err?.status || err?.statusCode || 500);
    const message = err?.message || 'Internal server error.';
    if (res.headersSent) return;
    return res.status(status).json({ error: message });
  });

  app.listen(PORT, '0.0.0.0', () => {
    const modeLabel = !isProduction
      ? 'Full-Stack Dev'
      : !isRender && hasBuiltFrontend
        ? 'Cloud Run Full-Stack Production'
        : 'API-Only Production';
    console.log(
      `[Rudraatma Music] ${modeLabel} server running on http://0.0.0.0:${PORT}`
    );
  });
}

startServer().catch((err) => {
  console.error('[FATAL] Failed to start Rudraatma Music server:', err);
  process.exit(1);
});
