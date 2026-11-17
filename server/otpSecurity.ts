import crypto from 'crypto';

export type OtpPurpose = 'signup' | 'login' | 'reset';

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_EXPIRY_SECONDS = OTP_EXPIRY_MINUTES * 60; // 600 seconds
export const OTP_EXPIRY_MS = OTP_EXPIRY_SECONDS * 1000; // 10 minutes strictly

export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_COOLDOWN_MS = OTP_COOLDOWN_SECONDS * 1000; // 60 seconds strictly

export const OTP_MAX_ATTEMPTS = 5;

export const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000; // 15-minute rolling window
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;

export interface OtpRecord {
  email: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  purpose: OtpPurpose;
}

const otpRequestHistory = new Map<string, number[]>();

export function normalizeOtpEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

/**
 * Cryptographically secure 6-digit OTP generator (100000 - 999999).
 */
export function generateSecureOtpCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Produces a salted SHA-256 hash bound to both the normalized email and OTP purpose.
 * Format: "<32-char hex salt>$<64-char hex digest>"
 */
export function hashOtpCode(email: string, purpose: OtpPurpose, code: string): string {
  const normalizedEmail = normalizeOtpEmail(email);
  const cleanCode = String(code || '').trim();
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto
    .createHash('sha256')
    .update(`${salt}|${normalizedEmail}|${purpose}|${cleanCode}`)
    .digest('hex');
  return `${salt}$${digest}`;
}

/**
 * Constant-time comparison against stored salted OTP hash (with safe fallback for legacy unsalted hashes).
 */
export function verifyOtpHash(
  email: string,
  purpose: OtpPurpose,
  enteredCode: string,
  storedHash: string
): boolean {
  const cleanCode = String(enteredCode || '').trim();
  if (!/^\d{6}$/.test(cleanCode) || !storedHash) {
    return false;
  }

  const normalizedEmail = normalizeOtpEmail(email);

  if (storedHash.includes('$')) {
    const [salt, expectedHex] = storedHash.split('$');
    if (!salt || !expectedHex || !/^[a-f0-9]{64}$/i.test(expectedHex)) {
      return false;
    }
    const computedHex = crypto
      .createHash('sha256')
      .update(`${salt}|${normalizedEmail}|${purpose}|${cleanCode}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const computedBuf = Buffer.from(computedHex, 'hex');
    if (expectedBuf.length !== computedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, computedBuf);
  }

  // Legacy unsalted 64-char SHA-256 fallback (for in-flight OTPs generated prior to upgrade)
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const computedHex = crypto.createHash('sha256').update(cleanCode).digest('hex');
    const expectedBuf = Buffer.from(storedHash, 'hex');
    const computedBuf = Buffer.from(computedHex, 'hex');
    if (expectedBuf.length !== computedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, computedBuf);
  }

  return false;
}

export function checkOtpCooldown(
  existingOtp: Pick<OtpRecord, 'lastSentAt'> | undefined,
  now: number = Date.now()
): { allowed: boolean; remainingSeconds: number } {
  if (!existingOtp || typeof existingOtp.lastSentAt !== 'number') {
    return { allowed: true, remainingSeconds: 0 };
  }
  const elapsed = now - existingOtp.lastSentAt;
  if (elapsed < OTP_COOLDOWN_MS) {
    return {
      allowed: false,
      remainingSeconds: Math.max(1, Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000))
    };
  }
  return { allowed: true, remainingSeconds: 0 };
}

function getQuotaKey(email: string, purpose: OtpPurpose): string {
  return `${normalizeOtpEmail(email)}:${purpose}`;
}

function pruneRequestTimestamps(timestamps: number[], now: number): number[] {
  const cutoff = now - OTP_REQUEST_WINDOW_MS;
  return timestamps.filter((ts) => ts > cutoff);
}

/**
 * Checks whether the email + purpose pair has exceeded the rolling OTP dispatch quota
 * (prevents automated spam / excessive OTP requests).
 */
export function checkOtpRequestQuota(
  email: string,
  purpose: OtpPurpose,
  now: number = Date.now()
): { allowed: boolean; retryAfterSeconds: number; countInWindow: number } {
  const key = getQuotaKey(email, purpose);
  const existing = pruneRequestTimestamps(otpRequestHistory.get(key) || [], now);
  otpRequestHistory.set(key, existing);

  if (existing.length >= OTP_MAX_REQUESTS_PER_WINDOW) {
    const oldestRelevant = existing[0];
    const retryAfterMs = Math.max(1000, oldestRelevant + OTP_REQUEST_WINDOW_MS - now);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      countInWindow: existing.length
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    countInWindow: existing.length
  };
}

export function recordOtpRequest(
  email: string,
  purpose: OtpPurpose,
  now: number = Date.now()
): void {
  const key = getQuotaKey(email, purpose);
  const pruned = pruneRequestTimestamps(otpRequestHistory.get(key) || [], now);
  pruned.push(now);
  otpRequestHistory.set(key, pruned);
}

export function clearOtpRequestHistory(email?: string, purpose?: OtpPurpose): void {
  if (!email) {
    otpRequestHistory.clear();
    return;
  }
  const normalizedEmail = normalizeOtpEmail(email);
  if (purpose) {
    otpRequestHistory.delete(getQuotaKey(normalizedEmail, purpose));
    return;
  }
  for (const p of ['signup', 'login', 'reset'] as OtpPurpose[]) {
    otpRequestHistory.delete(getQuotaKey(normalizedEmail, p));
  }
}

export function createOtpRecord(params: {
  email: string;
  purpose: OtpPurpose;
  code?: string;
  now?: number;
}): { code: string; record: OtpRecord } {
  const now = params.now ?? Date.now();
  const normalizedEmail = normalizeOtpEmail(params.email);
  const code = params.code ?? generateSecureOtpCode();
  const record: OtpRecord = {
    email: normalizedEmail,
    codeHash: hashOtpCode(normalizedEmail, params.purpose, code),
    expiresAt: now + OTP_EXPIRY_MS,
    attempts: 0,
    lastSentAt: now,
    purpose: params.purpose
  };
  return { code, record };
}

export type VerifyOtpSubmissionResult =
  | { ok: true }
  | { ok: false; status: 400 | 429; error: string };

/**
 * Enforces expiration (10m), user & purpose binding, attempt limit (max 5),
 * immediate invalidation on 5th failure, constant-time hash verification, and single-use deletion.
 */
export async function verifyOtpSubmission(params: {
  email: string;
  purpose: OtpPurpose;
  enteredCode: string;
  otpMap: Map<string, OtpRecord>;
  saveOtp: (record: OtpRecord) => Promise<void>;
  deleteOtp: (email: string, purpose: OtpPurpose) => Promise<void>;
  now?: number;
  missingMessage?: string;
  expiredMessage?: string;
  lockedMessage?: string;
  invalidPrefix?: string;
}): Promise<VerifyOtpSubmissionResult> {
  const now = params.now ?? Date.now();
  const normalizedEmail = normalizeOtpEmail(params.email);
  const record = params.otpMap.get(normalizedEmail);

  if (!record || record.email !== normalizedEmail || record.purpose !== params.purpose) {
    return {
      ok: false,
      status: 400,
      error:
        params.missingMessage ||
        'No active verification code was requested for this email. Please request a new code.'
    };
  }

  if (now > record.expiresAt) {
    params.otpMap.delete(normalizedEmail);
    await params.deleteOtp(normalizedEmail, params.purpose);
    return {
      ok: false,
      status: 400,
      error:
        params.expiredMessage ||
        'This verification code has expired (10-minute limit). Please request a fresh code.'
    };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    params.otpMap.delete(normalizedEmail);
    await params.deleteOtp(normalizedEmail, params.purpose);
    return {
      ok: false,
      status: 429,
      error:
        params.lockedMessage ||
        'Too many incorrect attempts (maximum 5 attempts reached). Please request a new verification code.'
    };
  }

  const isValid = verifyOtpHash(normalizedEmail, params.purpose, params.enteredCode, record.codeHash);
  if (!isValid) {
    record.attempts += 1;
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      params.otpMap.delete(normalizedEmail);
      await params.deleteOtp(normalizedEmail, params.purpose);
      return {
        ok: false,
        status: 429,
        error:
          params.lockedMessage ||
          'Too many incorrect attempts (maximum 5 attempts reached). For your security, this verification code has been invalidated. Please request a new code.'
      };
    }

    await params.saveOtp(record);
    const remaining = OTP_MAX_ATTEMPTS - record.attempts;
    const label = params.invalidPrefix || 'Invalid verification code';
    return {
      ok: false,
      status: 400,
      error: `${label}. ${remaining} attempt(s) remaining.`
    };
  }

  // Single-use: invalidate immediately upon successful verification
  params.otpMap.delete(normalizedEmail);
  await params.deleteOtp(normalizedEmail, params.purpose);
  return { ok: true };
}
