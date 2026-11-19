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
      artist_profile_data JSONB,
      artist_profile_status TEXT NOT NULL DEFAULT 'Incomplete',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_data JSONB;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS artist_profile_data JSONB;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS artist_profile_status TEXT NOT NULL DEFAULT 'Incomplete';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_opt_out_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS promo_opt_out_token TEXT;
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, account_status);
    CREATE INDEX IF NOT EXISTS idx_users_profile_status ON users (artist_profile_status);

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

    CREATE TABLE IF NOT EXISTS admin_approval_requests (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_OWNER_APPROVAL',
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_admin_approvals_status ON admin_approval_requests (status);

    CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      error_message TEXT,
      actor_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_logs (created_at DESC);

    -- ======================== ARTIST ONBOARDING, PROMO SLOTS & FINANCIAL LEDGER ========================
    CREATE TABLE IF NOT EXISTS promotional_allocations (
      id TEXT PRIMARY KEY,
      slot_number INTEGER UNIQUE NOT NULL CHECK (slot_number >= 1 AND slot_number <= 10),
      user_id TEXT UNIQUE NOT NULL,
      user_email TEXT NOT NULL,
      artist_display_name TEXT,
      plan_id TEXT NOT NULL DEFAULT 'promo-first-10-monthly',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      approved_by TEXT NOT NULL,
      activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_promo_status_expires ON promotional_allocations (status, expires_at);

    CREATE TABLE IF NOT EXISTS artist_profile_submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      status TEXT NOT NULL,
      completion_percent INTEGER NOT NULL DEFAULT 0,
      profile_data JSONB NOT NULL,
      reviewer_email TEXT,
      review_notes TEXT,
      submitted_at TIMESTAMPTZ,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_artist_profiles_user ON artist_profile_submissions (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_artist_profiles_status ON artist_profile_submissions (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS financial_ledger_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      amount_inr NUMERIC(12,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      reference_id TEXT,
      statement_month TEXT,
      description TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'system',
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_user_status ON financial_ledger_entries (user_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS verified_royalty_statements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      month_label TEXT NOT NULL,
      status TEXT NOT NULL,
      gross_royalty NUMERIC(12,2) NOT NULL DEFAULT 0,
      net_royalty NUMERIC(12,2) NOT NULL DEFAULT 0,
      streams BIGINT NOT NULL DEFAULT 0,
      dsp_breakdown JSONB,
      statement_ref TEXT,
      payout_date TEXT,
      verified_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_royalty_user_month ON verified_royalty_statements (user_id, month DESC);

    CREATE TABLE IF NOT EXISTS payout_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount_inr NUMERIC(12,2) NOT NULL,
      method TEXT NOT NULL,
      details TEXT,
      reference TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      processed_by TEXT,
      notes TEXT,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_payout_user_status ON payout_requests (user_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS email_queue (
      id TEXT PRIMARY KEY,
      recipient_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      purpose TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue (status, created_at ASC);
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
  artistProfile?: unknown;
  artistProfileStatus?: string;
  promoOptOut?: boolean;
  promoOptOutAt?: string;
  promoOptOutToken?: string;
  createdAt: string;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO users (id, full_name, email, country, password_hash, role, is_active, selected_plan_id, account_status, status_reason, kyc_data, artist_profile_data, artist_profile_status, promo_opt_out, promo_opt_out_at, promo_opt_out_token, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17)
     ON CONFLICT (email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       country = EXCLUDED.country,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_active = EXCLUDED.is_active,
       selected_plan_id = EXCLUDED.selected_plan_id,
       account_status = EXCLUDED.account_status,
       status_reason = EXCLUDED.status_reason,
       kyc_data = EXCLUDED.kyc_data,
       artist_profile_data = COALESCE(EXCLUDED.artist_profile_data, users.artist_profile_data),
       artist_profile_status = COALESCE(EXCLUDED.artist_profile_status, users.artist_profile_status),
       promo_opt_out = EXCLUDED.promo_opt_out,
       promo_opt_out_at = EXCLUDED.promo_opt_out_at,
       promo_opt_out_token = COALESCE(EXCLUDED.promo_opt_out_token, users.promo_opt_out_token)`,
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
      user.artistProfile ? JSON.stringify(user.artistProfile) : null,
      user.artistProfileStatus || (user.artistProfile as any)?.status || 'Incomplete',
      Boolean(user.promoOptOut),
      user.promoOptOutAt || null,
      user.promoOptOutToken || null,
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

export async function dbSaveAdminApproval(reqItem: Record<string, any>): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO admin_approval_requests (id, action_type, target_type, target_id, title, status, data, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW())
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [
      reqItem.id,
      reqItem.actionType,
      reqItem.targetType,
      reqItem.targetId || null,
      reqItem.title,
      reqItem.status,
      JSON.stringify(reqItem),
      reqItem.createdAt || new Date().toISOString()
    ]
  );
}

export async function dbGetAdminApprovals(limit = 100): Promise<any[]> {
  if (!pool) return [];
  const res = await pool.query(
    'SELECT data FROM admin_approval_requests ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return res.rows.map(r => r.data);
}

export async function dbSaveAiUsageLog(log: {
  id: string;
  source: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: string;
  errorMessage?: string;
  actorEmail?: string;
  createdAt?: string;
}): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO ai_usage_logs (id, source, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, error_message, actor_email, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO NOTHING`,
    [
      log.id,
      log.source,
      log.model,
      log.promptTokens || 0,
      log.completionTokens || 0,
      log.totalTokens || 0,
      log.latencyMs || 0,
      log.status,
      log.errorMessage || null,
      log.actorEmail || null,
      log.createdAt || new Date().toISOString()
    ]
  );
}

export async function dbGetAiUsageLogs(limit = 200): Promise<any[]> {
  if (!pool) return [];
  const res = await pool.query(
    'SELECT id, source, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, error_message, actor_email, created_at FROM ai_usage_logs ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return res.rows.map(r => ({
    id: r.id,
    source: r.source,
    model: r.model,
    promptTokens: Number(r.prompt_tokens || 0),
    completionTokens: Number(r.completion_tokens || 0),
    totalTokens: Number(r.total_tokens || 0),
    latencyMs: Number(r.latency_ms || 0),
    status: r.status,
    errorMessage: r.error_message || undefined,
    actorEmail: r.actor_email || undefined,
    createdAt: new Date(r.created_at).toISOString()
  }));
}

// ======================== PROMOTIONAL ALLOCATION ATOMIC HELPERS ========================

export interface PromotionalAllocationRecord {
  id: string;
  slotNumber: number;
  userId: string;
  userEmail: string;
  artistDisplayName: string;
  planId: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  approvedBy: string;
  activatedAt: string;
  expiresAt: string;
  revokedAt?: string;
  notes?: string;
  createdAt: string;
}

const inMemoryPromotions: PromotionalAllocationRecord[] = [];
let promoMutex: Promise<unknown> = Promise.resolve();

function withPromoLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = promoMutex.then(fn, fn);
  promoMutex = next.catch(() => {});
  return next;
}

function mapPromoRow(r: any): PromotionalAllocationRecord {
  return {
    id: r.id,
    slotNumber: Number(r.slot_number),
    userId: r.user_id,
    userEmail: r.user_email,
    artistDisplayName: r.artist_display_name || '',
    planId: r.plan_id,
    status: r.status,
    approvedBy: r.approved_by,
    activatedAt: new Date(r.activated_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
    revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : undefined,
    notes: r.notes || undefined,
    createdAt: new Date(r.created_at).toISOString()
  };
}

export async function dbSyncAndListPromotions(): Promise<PromotionalAllocationRecord[]> {
  if (!pool) {
    const now = Date.now();
    for (const p of inMemoryPromotions) {
      if (p.status === 'ACTIVE' && new Date(p.expiresAt).getTime() <= now) {
        p.status = 'EXPIRED';
      }
    }
    return [...inMemoryPromotions].sort((a, b) => a.slotNumber - b.slotNumber);
  }
  await pool.query(
    `UPDATE promotional_allocations SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at <= NOW()`
  );
  const res = await pool.query(`SELECT * FROM promotional_allocations ORDER BY slot_number ASC`);
  return res.rows.map(mapPromoRow);
}

/**
 * Atomically claims one of the first 10 promotional free 1-month slots.
 * Uses PostgreSQL EXCLUSIVE TABLE LOCK inside a transaction (and mutex lock in dev in-memory mode)
 * so concurrent approvals can never exceed 10 or double-assign a slot number or user.
 */
export async function dbClaimFirst10PromotionalSlot(params: {
  userId: string;
  userEmail: string;
  artistDisplayName: string;
  approvedBy: string;
  notes?: string;
}): Promise<{
  allocated: boolean;
  reason?: string;
  allocation?: PromotionalAllocationRecord;
  slotsUsed: number;
  slotsRemaining: number;
}> {
  return withPromoLock(async () => {
    const nowDate = new Date();
    const expiresDate = new Date(nowDate);
    expiresDate.setMonth(expiresDate.getMonth() + 1);

    if (!pool) {
      const existingUser = inMemoryPromotions.find(p => p.userId === params.userId || p.userEmail === params.userEmail.toLowerCase());
      if (existingUser) {
        return {
          allocated: false,
          reason: 'Artist has already claimed a promotional slot previously.',
          slotsUsed: inMemoryPromotions.length,
          slotsRemaining: Math.max(0, 10 - inMemoryPromotions.length)
        };
      }
      if (inMemoryPromotions.length >= 10) {
        return {
          allocated: false,
          reason: 'All 10 complimentary First-10 promotional slots have already been allocated.',
          slotsUsed: 10,
          slotsRemaining: 0
        };
      }
      const nextSlot = inMemoryPromotions.length + 1;
      const rec: PromotionalAllocationRecord = {
        id: `promo_${Date.now()}_${nextSlot}`,
        slotNumber: nextSlot,
        userId: params.userId,
        userEmail: params.userEmail.toLowerCase(),
        artistDisplayName: params.artistDisplayName,
        planId: 'promo-first-10-monthly',
        status: 'ACTIVE',
        approvedBy: params.approvedBy,
        activatedAt: nowDate.toISOString(),
        expiresAt: expiresDate.toISOString(),
        notes: params.notes || 'First 10 Approved Artists — 1 Month Complimentary Access',
        createdAt: nowDate.toISOString()
      };
      inMemoryPromotions.push(rec);
      return {
        allocated: true,
        allocation: rec,
        slotsUsed: inMemoryPromotions.length,
        slotsRemaining: Math.max(0, 10 - inMemoryPromotions.length)
      };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE promotional_allocations IN EXCLUSIVE MODE');

      const dupCheck = await client.query(
        'SELECT * FROM promotional_allocations WHERE user_id = $1 OR LOWER(user_email) = LOWER($2) LIMIT 1',
        [params.userId, params.userEmail]
      );
      const countRes = await client.query('SELECT COUNT(*)::int AS cnt FROM promotional_allocations');
      const currentCount = Number(countRes.rows[0]?.cnt || 0);

      if (dupCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          allocated: false,
          reason: 'Artist has already received a First-10 promotional allocation.',
          slotsUsed: currentCount,
          slotsRemaining: Math.max(0, 10 - currentCount)
        };
      }

      if (currentCount >= 10) {
        await client.query('ROLLBACK');
        return {
          allocated: false,
          reason: 'All 10 promotional slots are filled.',
          slotsUsed: 10,
          slotsRemaining: 0
        };
      }

      const nextSlot = currentCount + 1;
      const promoId = `promo_${Date.now()}_${nextSlot}`;
      const insertRes = await client.query(
        `INSERT INTO promotional_allocations (id, slot_number, user_id, user_email, artist_display_name, plan_id, status, approved_by, activated_at, expires_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $8, $9, $10)
         RETURNING *`,
        [
          promoId,
          nextSlot,
          params.userId,
          params.userEmail.toLowerCase(),
          params.artistDisplayName,
          'promo-first-10-monthly',
          params.approvedBy,
          nowDate.toISOString(),
          expiresDate.toISOString(),
          params.notes || 'First 10 Approved Artists — 1 Month Complimentary Access'
        ]
      );
      await client.query('COMMIT');
      const rec = mapPromoRow(insertRes.rows[0]);
      return {
        allocated: true,
        allocation: rec,
        slotsUsed: nextSlot,
        slotsRemaining: Math.max(0, 10 - nextSlot)
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
}

export async function dbRevokePromotionSlot(userId: string, reason: string): Promise<PromotionalAllocationRecord | null> {
  if (!pool) {
    const found = inMemoryPromotions.find(p => p.userId === userId);
    if (!found) return null;
    found.status = 'REVOKED';
    found.revokedAt = new Date().toISOString();
    found.notes = reason;
    return found;
  }
  const res = await pool.query(
    `UPDATE promotional_allocations SET status = 'REVOKED', revoked_at = NOW(), notes = $2 WHERE user_id = $1 RETURNING *`,
    [userId, reason]
  );
  return res.rows[0] ? mapPromoRow(res.rows[0]) : null;
}

export function resetInMemoryPromotionsForTest(): void {
  inMemoryPromotions.length = 0;
}

// ======================== ARTIST PROFILE SUBMISSIONS & LEDGER HELPERS ========================

const inMemoryProfileSubmissions: any[] = [];
const inMemoryLedgerEntries: any[] = [];
const inMemoryRoyaltyStatements: any[] = [];
const inMemoryPayoutRequests: any[] = [];
const inMemoryEmailQueue: any[] = [];

export async function dbSaveArtistProfileSubmission(sub: {
  id: string;
  userId: string;
  userEmail: string;
  status: string;
  completionPercent: number;
  profileData: unknown;
  reviewerEmail?: string;
  reviewNotes?: string;
  submittedAt?: string;
  reviewedAt?: string;
}): Promise<void> {
  const entry = { ...sub, createdAt: new Date().toISOString() };
  inMemoryProfileSubmissions.unshift(entry);
  if (inMemoryProfileSubmissions.length > 500) inMemoryProfileSubmissions.length = 500;
  if (!pool) return;
  await pool.query(
    `INSERT INTO artist_profile_submissions (id, user_id, user_email, status, completion_percent, profile_data, reviewer_email, review_notes, submitted_at, reviewed_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       reviewer_email = EXCLUDED.reviewer_email,
       review_notes = EXCLUDED.review_notes,
       reviewed_at = EXCLUDED.reviewed_at`,
    [
      sub.id,
      sub.userId,
      sub.userEmail,
      sub.status,
      sub.completionPercent,
      JSON.stringify(sub.profileData),
      sub.reviewerEmail || null,
      sub.reviewNotes || null,
      sub.submittedAt || null,
      sub.reviewedAt || null
    ]
  );
}

export async function dbGetArtistProfileHistory(userId: string): Promise<any[]> {
  if (!pool) {
    return inMemoryProfileSubmissions.filter(s => s.userId === userId);
  }
  const res = await pool.query(
    `SELECT * FROM artist_profile_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [userId]
  );
  return res.rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    status: r.status,
    completionPercent: Number(r.completion_percent || 0),
    profileData: r.profile_data,
    reviewerEmail: r.reviewer_email || undefined,
    reviewNotes: r.review_notes || undefined,
    submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : undefined,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : undefined,
    createdAt: new Date(r.created_at).toISOString()
  }));
}

export async function dbSaveLedgerEntry(entry: {
  id: string;
  userId: string;
  entryType: 'ROYALTY_CLEARED' | 'ROYALTY_PENDING' | 'ROYALTY_PROJECTED' | 'PAYOUT_SUCCESS' | 'PAYOUT_PENDING' | 'ADJUSTMENT';
  amountINR: number;
  status: 'CLEARED' | 'PENDING' | 'PROJECTED' | 'COMPLETED' | 'FAILED';
  referenceId?: string;
  statementMonth?: string;
  description: string;
  source: string;
  createdBy?: string;
  createdAt?: string;
}): Promise<void> {
  const row = { ...entry, createdAt: entry.createdAt || new Date().toISOString() };
  const idx = inMemoryLedgerEntries.findIndex(e => e.id === row.id);
  if (idx >= 0) inMemoryLedgerEntries[idx] = row;
  else inMemoryLedgerEntries.unshift(row);
  if (!pool) return;
  await pool.query(
    `INSERT INTO financial_ledger_entries (id, user_id, entry_type, amount_inr, status, reference_id, statement_month, description, source, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, amount_inr = EXCLUDED.amount_inr, description = EXCLUDED.description, updated_at = NOW()`,
    [
      row.id,
      row.userId,
      row.entryType,
      row.amountINR,
      row.status,
      row.referenceId || null,
      row.statementMonth || null,
      row.description,
      row.source,
      row.createdBy || null,
      row.createdAt
    ]
  );
}

export async function dbGetLedgerEntries(userId?: string): Promise<any[]> {
  if (!pool) {
    return userId ? inMemoryLedgerEntries.filter(e => e.userId === userId) : [...inMemoryLedgerEntries];
  }
  const res = userId
    ? await pool.query(`SELECT * FROM financial_ledger_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`, [userId])
    : await pool.query(`SELECT * FROM financial_ledger_entries ORDER BY created_at DESC LIMIT 500`);
  return res.rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    entryType: r.entry_type,
    amountINR: Number(r.amount_inr || 0),
    status: r.status,
    referenceId: r.reference_id || undefined,
    statementMonth: r.statement_month || undefined,
    description: r.description,
    source: r.source,
    createdBy: r.created_by || undefined,
    createdAt: new Date(r.created_at).toISOString()
  }));
}

export async function dbSaveVerifiedRoyaltyStatement(stmt: {
  id: string;
  userId: string;
  month: string;
  monthLabel: string;
  status: 'Cleared' | 'In Clearance' | 'Processing' | 'Projected';
  grossRoyalty: number;
  netRoyalty: number;
  streams: number;
  dspBreakdown?: Record<string, number>;
  statementRef?: string;
  payoutDate?: string;
  verifiedBy?: string;
}): Promise<void> {
  const row = { ...stmt, createdAt: new Date().toISOString() };
  const idx = inMemoryRoyaltyStatements.findIndex(s => s.id === row.id);
  if (idx >= 0) inMemoryRoyaltyStatements[idx] = row;
  else inMemoryRoyaltyStatements.unshift(row);
  if (!pool) return;
  await pool.query(
    `INSERT INTO verified_royalty_statements (id, user_id, month, month_label, status, gross_royalty, net_royalty, streams, dsp_breakdown, statement_ref, payout_date, verified_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, gross_royalty = EXCLUDED.gross_royalty, net_royalty = EXCLUDED.net_royalty, streams = EXCLUDED.streams, dsp_breakdown = EXCLUDED.dsp_breakdown`,
    [
      stmt.id,
      stmt.userId,
      stmt.month,
      stmt.monthLabel,
      stmt.status,
      stmt.grossRoyalty,
      stmt.netRoyalty,
      stmt.streams,
      JSON.stringify(stmt.dspBreakdown || {}),
      stmt.statementRef || stmt.id,
      stmt.payoutDate || null,
      stmt.verifiedBy || null
    ]
  );
}

export async function dbGetVerifiedRoyaltyStatements(userId?: string): Promise<any[]> {
  if (!pool) {
    return userId ? inMemoryRoyaltyStatements.filter(s => s.userId === userId) : [...inMemoryRoyaltyStatements];
  }
  const res = userId
    ? await pool.query(`SELECT * FROM verified_royalty_statements WHERE user_id = $1 ORDER BY month DESC`, [userId])
    : await pool.query(`SELECT * FROM verified_royalty_statements ORDER BY month DESC LIMIT 500`);
  return res.rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    month: r.month,
    monthLabel: r.month_label,
    status: r.status,
    grossRoyalty: Number(r.gross_royalty || 0),
    netRoyalty: Number(r.net_royalty || 0),
    streams: Number(r.streams || 0),
    dspBreakdown: r.dsp_breakdown || {},
    statementId: r.statement_ref || r.id,
    payoutDate: r.payout_date || undefined,
    verifiedBy: r.verified_by || undefined,
    createdAt: new Date(r.created_at).toISOString()
  }));
}

export async function dbSavePayoutRequest(payout: {
  id: string;
  userId: string;
  amountINR: number;
  method: string;
  details: string;
  reference: string;
  status: 'Pending' | 'Completed' | 'Rejected';
  processedBy?: string;
  notes?: string;
  processedAt?: string;
  createdAt?: string;
}): Promise<void> {
  const row = { ...payout, createdAt: payout.createdAt || new Date().toISOString() };
  const idx = inMemoryPayoutRequests.findIndex(p => p.id === row.id);
  if (idx >= 0) inMemoryPayoutRequests[idx] = row;
  else inMemoryPayoutRequests.unshift(row);
  if (!pool) return;
  await pool.query(
    `INSERT INTO payout_requests (id, user_id, amount_inr, method, details, reference, status, processed_by, notes, processed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, processed_by = EXCLUDED.processed_by, notes = EXCLUDED.notes, processed_at = EXCLUDED.processed_at`,
    [
      row.id,
      row.userId,
      row.amountINR,
      row.method,
      row.details,
      row.reference,
      row.status,
      row.processedBy || null,
      row.notes || null,
      row.processedAt || null,
      row.createdAt
    ]
  );
}

export async function dbGetPayoutRequests(userId?: string): Promise<any[]> {
  if (!pool) {
    return userId ? inMemoryPayoutRequests.filter(p => p.userId === userId) : [...inMemoryPayoutRequests];
  }
  const res = userId
    ? await pool.query(`SELECT * FROM payout_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`, [userId])
    : await pool.query(`SELECT * FROM payout_requests ORDER BY created_at DESC LIMIT 500`);
  return res.rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    amountINR: Number(r.amount_inr || 0),
    method: r.method,
    details: r.details || '',
    reference: r.reference,
    status: r.status,
    processedBy: r.processed_by || undefined,
    notes: r.notes || undefined,
    processedAt: r.processed_at ? new Date(r.processed_at).toISOString() : undefined,
    createdAt: new Date(r.created_at).toISOString()
  }));
}

export async function dbQueueEmailJob(job: {
  id: string;
  recipientEmail: string;
  subject: string;
  purpose: string;
  payload: unknown;
  status: string;
  lastError?: string;
}): Promise<void> {
  const row = { ...job, attempts: 1, createdAt: new Date().toISOString() };
  const idx = inMemoryEmailQueue.findIndex(e => e.id === row.id);
  if (idx >= 0) inMemoryEmailQueue[idx] = row;
  else inMemoryEmailQueue.unshift(row);
  if (inMemoryEmailQueue.length > 200) inMemoryEmailQueue.length = 200;
  if (!pool) return;
  await pool.query(
    `INSERT INTO email_queue (id, recipient_email, subject, purpose, payload, status, attempts, last_error, sent_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, 1, $7, $8)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, attempts = email_queue.attempts + 1, last_error = EXCLUDED.last_error, sent_at = EXCLUDED.sent_at`,
    [
      job.id,
      job.recipientEmail,
      job.subject,
      job.purpose,
      JSON.stringify(job.payload || {}),
      job.status,
      job.lastError || null,
      job.status === 'SENT' ? new Date().toISOString() : null
    ]
  );
}

export async function dbGetEmailQueueStats(): Promise<{ queued: number; sent: number; failed: number; recent: any[] }> {
  if (!pool) {
    return {
      queued: inMemoryEmailQueue.filter(e => e.status === 'QUEUED').length,
      sent: inMemoryEmailQueue.filter(e => e.status === 'SENT').length,
      failed: inMemoryEmailQueue.filter(e => e.status === 'FAILED').length,
      recent: inMemoryEmailQueue.slice(0, 20)
    };
  }
  const [counts, recent] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS cnt FROM email_queue GROUP BY status`),
    pool.query(`SELECT id, recipient_email, subject, purpose, status, attempts, last_error, created_at, sent_at FROM email_queue ORDER BY created_at DESC LIMIT 20`)
  ]);
  let queued = 0;
  let sent = 0;
  let failed = 0;
  for (const r of counts.rows) {
    if (r.status === 'QUEUED') queued = Number(r.cnt);
    else if (r.status === 'SENT') sent = Number(r.cnt);
    else if (r.status === 'FAILED') failed = Number(r.cnt);
  }
  return {
    queued,
    sent,
    failed,
    recent: recent.rows.map(r => ({
      id: r.id,
      recipientEmail: r.recipient_email,
      subject: r.subject,
      purpose: r.purpose,
      status: r.status,
      attempts: Number(r.attempts || 0),
      lastError: r.last_error || undefined,
      createdAt: new Date(r.created_at).toISOString(),
      sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : undefined
    }))
  };
}


