import pg from 'pg';

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === 'production';
const isRender = Boolean(
  process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL
);
const isCloudRun = Boolean(process.env.K_SERVICE || process.env.CLOUD_RUN_JOB);

function extractDbHostname(connStr: string): string {
  try {
    return new URL(connStr).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isRenderInternalHost(hostname: string): boolean {
  return /^dpg-[a-z0-9-]+-a$/i.test(hostname);
}

let pool: pg.Pool | null = null;
let dbEnabled = false;

export function isDatabaseEnabled(): boolean {
  return dbEnabled && pool !== null;
}

export function getDbPool(): pg.Pool {
  if (!pool) {
    throw new Error('PostgreSQL pool is not initialized.');
  }
  return pool;
}

/**
 * Initializes PostgreSQL connection pool and runs idempotent schema migrations + indexes.
 * On Render production, DATABASE_URL is strictly required — never silently falls back to memory.
 * On Google Cloud Run preview deployments, if DATABASE_URL uses a Render-internal VPC hostname (dpg-...-a),
 * prefers EXTERNAL_DATABASE_URL or falls back safely so Cloud Run container startup does not crash.
 */
export async function initDatabase(): Promise<void> {
  const primaryUrl = process.env.DATABASE_URL?.trim() || '';
  const externalUrl = process.env.EXTERNAL_DATABASE_URL?.trim() || '';

  let activeUrl = primaryUrl;
  const primaryHost = primaryUrl ? extractDbHostname(primaryUrl) : '';

  if (primaryUrl && isRenderInternalHost(primaryHost) && !isRender && externalUrl) {
    console.warn(
      `[Rudraatma DB] Primary DATABASE_URL uses Render-internal host (${primaryHost}) outside Render; using EXTERNAL_DATABASE_URL instead.`
    );
    activeUrl = externalUrl;
  }

  if (!activeUrl) {
    if (isProduction && !isCloudRun) {
      throw new Error(
        '[FATAL] DATABASE_URL environment variable is required in production. Refusing to silently fall back to in-memory storage.'
      );
    }
    console.warn(
      `[Rudraatma DB] DATABASE_URL not set (${isCloudRun ? 'Cloud Run preview' : 'development'}). Running with in-memory storage.`
    );
    return;
  }

  const activeHost = extractDbHostname(activeUrl);
  if (isCloudRun && !isRender && isRenderInternalHost(activeHost)) {
    console.warn(
      `[Rudraatma DB] Skipping Render-internal PostgreSQL host (${activeHost}) on Google Cloud Run because dpg-*-a only resolves inside Render's private network. Set EXTERNAL_DATABASE_URL for persistent Cloud Run DB.`
    );
    return;
  }

  const useSsl =
    process.env.DATABASE_SSL === 'true' ||
    activeUrl.includes('render.com') ||
    activeUrl.includes('neon.tech') ||
    activeUrl.includes('supabase.co') ||
    activeUrl.includes('sslmode=require');

  pool = new Pool({
    connectionString: activeUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('[Rudraatma DB] Unexpected PostgreSQL pool error:', err.message);
  });

  try {
    await pool.query('SELECT 1');
    dbEnabled = true;
    console.log(`[Rudraatma DB] Connected to PostgreSQL (${activeHost || 'configured host'}) successfully.`);
  } catch (err: any) {
    if (isProduction && !(isCloudRun && !isRender)) {
      throw new Error(`[FATAL] Failed to connect to PostgreSQL in production: ${err.message}`);
    }
    console.error(
      `[Rudraatma DB] PostgreSQL connection failed (${isCloudRun ? 'Cloud Run preview' : 'development'}): ${err.message}`
    );
    pool = null;
    dbEnabled = false;
    return;
  }

  // Run idempotent migrations & indexes
  await runMigrations();
}

async function runMigrations(): Promise<void> {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      country TEXT NOT NULL DEFAULT 'India',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'artist',
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      selected_plan_id TEXT,
      account_status TEXT NOT NULL DEFAULT 'active',
      status_reason TEXT,
      kyc_data JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_data JSONB;
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_sent_at BIGINT NOT NULL,
      PRIMARY KEY (email, purpose)
    );
    CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes (expires_at);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

    CREATE TABLE IF NOT EXISTS user_dashboards (
      user_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS razorpay_orders (
      order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_razorpay_orders_user_id ON razorpay_orders (user_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS drive_connections (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      photo_url TEXT,
      connected_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gmail_connections (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      photo_url TEXT,
      connected_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_provider TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      file_bytes BYTEA,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_id ON uploaded_files (user_id);

    -- ======================== RUDRAATMA AI TABLES ========================
    CREATE TABLE IF NOT EXISTS ai_review_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      release_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      stage TEXT NOT NULL DEFAULT 'Release Submitted',
      progress INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      error_details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_release_id ON ai_review_jobs (release_id);
    CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_review_jobs (status);

    CREATE TABLE IF NOT EXISTS ai_review_results (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      release_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
      recommended_decision TEXT NOT NULL DEFAULT 'ADMIN REVIEW REQUIRED',
      final_decision TEXT NOT NULL DEFAULT 'PENDING',
      reviewer_id TEXT,
      confidence_score INTEGER NOT NULL DEFAULT 0,
      gemini_report JSONB,
      audio_quality JSONB,
      duplicate_check JSONB,
      internal_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_results_user_id ON ai_review_results (user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_results_risk ON ai_review_results (risk_level);

    CREATE TABLE IF NOT EXISTS audio_fingerprints (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      track_index INTEGER NOT NULL DEFAULT 0,
      duration_sec REAL NOT NULL DEFAULT 0,
      fingerprint TEXT NOT NULL,
      fingerprint_hash TEXT NOT NULL,
      file_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fingerprints_hash ON audio_fingerprints (fingerprint_hash);
    CREATE INDEX IF NOT EXISTS idx_fingerprints_release ON audio_fingerprints (release_id);

    CREATE TABLE IF NOT EXISTS acoustid_matches (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      release_id TEXT NOT NULL,
      acoustid_id TEXT,
      score REAL NOT NULL DEFAULT 0,
      title TEXT,
      artist TEXT,
      musicbrainz_id TEXT,
      raw_response JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_acoustid_release ON acoustid_matches (release_id);

    CREATE TABLE IF NOT EXISTS release_compliance_reports (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL,
      release_id TEXT UNIQUE NOT NULL,
      report_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS release_review_history (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_review_history_release ON release_review_history (release_id);

    CREATE TABLE IF NOT EXISTS ai_service_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_audit_logs (
      id TEXT PRIMARY KEY,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      release_id TEXT,
      details TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_audit_release ON ai_audit_logs (release_id);

    CREATE TABLE IF NOT EXISTS release_appeals (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      explanation TEXT NOT NULL,
      corrected_metadata JSONB,
      evidence_files JSONB,
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_notes TEXT,
      reviewed_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_appeals_release ON release_appeals (release_id);
  `);

  console.log('[Rudraatma DB] PostgreSQL migrations and indexes verified.');
}

// ======================== CRUD HELPERS ========================

export async function dbUpsertUser(user: {
  id: string;
  fullName: string;
  email: string;
  country: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  selectedPlanId?: string;
  accountStatus?: string;
  statusReason?: string;
  kyc?: unknown;
  createdAt: string;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO users (id, full_name, email, country, password_hash, role, is_active, selected_plan_id, account_status, status_reason, kyc_data, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
     ON CONFLICT (email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       country = EXCLUDED.country,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_active = EXCLUDED.is_active,
       selected_plan_id = EXCLUDED.selected_plan_id,
       account_status = EXCLUDED.account_status,
       status_reason = EXCLUDED.status_reason,
       kyc_data = EXCLUDED.kyc_data`,
    [
      user.id,
      user.fullName,
      user.email,
      user.country,
      user.passwordHash,
      user.role,
      user.isActive,
      user.selectedPlanId || null,
      user.accountStatus || 'active',
      user.statusReason || null,
      user.kyc ? JSON.stringify(user.kyc) : null,
      user.createdAt
    ]
  );
}

export async function dbDeleteUserByEmail(email: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM users WHERE email = $1', [email]);
}

export async function dbSaveOtp(otp: {
  email: string;
  purpose: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO otp_codes (email, purpose, code_hash, expires_at, attempts, last_sent_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email, purpose) DO UPDATE SET
       code_hash = EXCLUDED.code_hash,
       expires_at = EXCLUDED.expires_at,
       attempts = EXCLUDED.attempts,
       last_sent_at = EXCLUDED.last_sent_at`,
    [otp.email, otp.purpose, otp.codeHash, otp.expiresAt, otp.attempts, otp.lastSentAt]
  );
}

export async function dbDeleteOtp(email: string, purpose: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM otp_codes WHERE email = $1 AND purpose = $2', [email, purpose]);
}

export async function dbSaveSession(session: { token: string; userId: string; expiresAt: number }): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [session.token, session.userId, session.expiresAt]
  );
}

export async function dbDeleteSession(token: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function dbSaveDashboard(userId: string, data: unknown): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO user_dashboards (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [userId, JSON.stringify(data)]
  );
}

export async function dbSaveOrder(order: { orderId: string; userId: string; status: string } & Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO razorpay_orders (order_id, user_id, status, data, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (order_id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data, updated_at = NOW()`,
    [order.orderId, order.userId, order.status, JSON.stringify(order)]
  );
}

export async function dbSaveNotification(notif: { id: string; userId: string } & Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO notifications (id, user_id, data)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
    [notif.id, notif.userId, JSON.stringify(notif)]
  );
}

export async function dbSaveAuditLog(log: { id: string } & Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO audit_logs (id, data)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [log.id, JSON.stringify(log)]
  );
}

export async function dbSaveDriveConnection(conn: {
  userId: string;
  accessToken: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
  connectedAt: number;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO drive_connections (user_id, access_token, email, display_name, photo_url, connected_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       photo_url = EXCLUDED.photo_url,
       connected_at = EXCLUDED.connected_at`,
    [conn.userId, conn.accessToken, conn.email || '', conn.displayName || '', conn.photoUrl || '', conn.connectedAt]
  );
}

export async function dbDeleteDriveConnection(userId: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM drive_connections WHERE user_id = $1', [userId]);
}

export async function dbSaveGmailConnection(conn: {
  userId: string;
  accessToken: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
  connectedAt: number;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO gmail_connections (user_id, access_token, email, display_name, photo_url, connected_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       photo_url = EXCLUDED.photo_url,
       connected_at = EXCLUDED.connected_at`,
    [conn.userId, conn.accessToken, conn.email || '', conn.displayName || '', conn.photoUrl || '', conn.connectedAt]
  );
}

export async function dbDeleteGmailConnection(userId: string): Promise<void> {
  if (!pool) return;
  await pool.query('DELETE FROM gmail_connections WHERE user_id = $1', [userId]);
}

export async function dbSavePlatformSetting(key: string, value: unknown): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

export async function dbGetAllPlatformSettings(): Promise<Record<string, any>> {
  if (!pool) return {};
  const res = await pool.query('SELECT key, value FROM platform_settings');
  const out: Record<string, any> = {};
  for (const row of res.rows) {
    out[row.key] = row.value;
  }
  return out;
}

// ======================== RUDRAATMA AI DB HELPERS ========================

export async function dbSaveAiJob(job: Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO ai_review_jobs (id, user_id, release_id, status, stage, progress, attempts, max_attempts, error_details, created_at, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       stage = EXCLUDED.stage,
       progress = EXCLUDED.progress,
       attempts = EXCLUDED.attempts,
       error_details = EXCLUDED.error_details,
       started_at = EXCLUDED.started_at,
       completed_at = EXCLUDED.completed_at`,
    [
      job.id,
      job.userId,
      job.releaseId,
      job.status,
      job.stage,
      job.progress || 0,
      job.attempts || 0,
      job.maxAttempts || 3,
      job.errorDetails || null,
      job.createdAt,
      job.startedAt || null,
      job.completedAt || null
    ]
  );
}

export async function dbSaveAiResult(result: Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO ai_review_results (id, job_id, release_id, user_id, risk_level, recommended_decision, final_decision, reviewer_id, confidence_score, gemini_report, audio_quality, duplicate_check, internal_notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, NOW())
     ON CONFLICT (release_id) DO UPDATE SET
       job_id = EXCLUDED.job_id,
       risk_level = EXCLUDED.risk_level,
       recommended_decision = EXCLUDED.recommended_decision,
       final_decision = EXCLUDED.final_decision,
       reviewer_id = EXCLUDED.reviewer_id,
       confidence_score = EXCLUDED.confidence_score,
       gemini_report = EXCLUDED.gemini_report,
       audio_quality = EXCLUDED.audio_quality,
       duplicate_check = EXCLUDED.duplicate_check,
       internal_notes = EXCLUDED.internal_notes,
       updated_at = NOW()`,
    [
      result.id,
      result.jobId,
      result.releaseId,
      result.userId,
      result.riskLevel,
      result.recommendedDecision,
      result.finalDecision,
      result.reviewerId || null,
      result.confidenceScore || 0,
      JSON.stringify(result.geminiReport || null),
      JSON.stringify(result.audioQuality || null),
      JSON.stringify(result.duplicateCheck || null),
      result.internalNotes || null,
      result.createdAt
    ]
  );
}

export async function dbSaveAudioFingerprint(fp: Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO audio_fingerprints (id, release_id, user_id, track_index, duration_sec, fingerprint, fingerprint_hash, file_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING`,
    [fp.id, fp.releaseId, fp.userId, fp.trackIndex || 0, fp.durationSec || 0, fp.fingerprint, fp.fingerprintHash, fp.fileId || null, fp.createdAt]
  );
}

export async function dbSaveAcoustIdMatch(m: Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO acoustid_matches (id, review_id, release_id, acoustid_id, score, title, artist, musicbrainz_id, raw_response, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     ON CONFLICT (id) DO NOTHING`,
    [m.id, m.reviewId, m.releaseId, m.acoustidId || null, m.score || 0, m.title || null, m.artist || null, m.musicbrainzId || null, JSON.stringify(m.rawResponse || null), m.createdAt]
  );
}

export async function dbSaveComplianceReport(rep: { id: string; reviewId: string; releaseId: string; reportData: unknown; createdAt: string }): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO release_compliance_reports (id, review_id, release_id, report_data, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (release_id) DO UPDATE SET review_id = EXCLUDED.review_id, report_data = EXCLUDED.report_data`,
    [rep.id, rep.reviewId, rep.releaseId, JSON.stringify(rep.reportData), rep.createdAt]
  );
}

export async function dbSaveReviewHistory(entry: Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO release_review_history (id, release_id, actor_email, actor_role, action, previous_status, new_status, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [entry.id, entry.releaseId, entry.actorEmail, entry.actorRole, entry.action, entry.previousStatus || null, entry.newStatus || null, entry.notes || null, entry.createdAt]
  );
}

export async function dbSaveAiServiceSetting(key: string, value: unknown): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO ai_service_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

export async function dbSaveAiAuditLog(log: Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO ai_audit_logs (id, actor_email, actor_role, action, release_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [log.id, log.actorEmail, log.actorRole, log.action, log.releaseId || null, log.details, log.createdAt]
  );
}

export async function dbSaveReleaseAppeal(appeal: Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO release_appeals (id, release_id, user_id, explanation, corrected_metadata, evidence_files, status, admin_notes, reviewed_by, created_at, reviewed_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       admin_notes = EXCLUDED.admin_notes,
       reviewed_by = EXCLUDED.reviewed_by,
       reviewed_at = EXCLUDED.reviewed_at`,
    [
      appeal.id,
      appeal.releaseId,
      appeal.userId,
      appeal.explanation,
      JSON.stringify(appeal.correctedMetadata || null),
      JSON.stringify(appeal.evidenceFiles || []),
      appeal.status,
      appeal.adminNotes || null,
      appeal.reviewedBy || null,
      appeal.createdAt,
      appeal.reviewedAt || null
    ]
  );
}

