import dns from 'dns';

export const OFFICIAL_DOMAIN = 'rudraatmamusic.com';
export const OFFICIAL_SENDER_NAME = 'Rudraatma Music';
export const OFFICIAL_COMPANY_EMAIL = 'rudraatmamusic@gmail.com';
export const OFFICIAL_SUPPORT_EMAIL = 'support@rudraatmamusic.com';
export const OFFICIAL_SENDER_EMAIL = 'noreply@rudraatmamusic.com';

const DEFAULT_APPS_SCRIPT_TIMEOUT_MS = 15_000;

export interface ResolvedAppsScriptEmailConfig {
  configured: boolean;
  provider: 'google-apps-script' | 'unconfigured';
  transport: 'https-post';
  urlConfigured: boolean;
  validHttpsUrl: boolean;
  secretConfigured: boolean;
  url: string;
  secret: string;
  senderEmail: string;
  replyTo: string;
  timeoutMs: number;
  missingVars: string[];
  warnings: string[];
}

export interface SafeEmailDiagnostics {
  configured: boolean;
  provider: 'google-apps-script' | 'unconfigured';
  transport: 'https-post';
  urlConfigured: boolean;
  validHttpsUrl: boolean;
  secretConfigured: boolean;
  senderEmail: string;
  replyTo: string;
  timeoutMs: number;
  missingVars: string[];
  warnings: string[];
}

export interface AppsScriptEmailResult {
  success: boolean;
  delivered: boolean;
  missingConfig?: boolean;
  error?: string;
  sender: string;
  senderAddress: string;
  latencyMs?: number;
}

function resolveRequestTimeoutMs(): number {
  const raw = (process.env.EMAIL_REQUEST_TIMEOUT_MS || '').trim();
  if (!raw) return DEFAULT_APPS_SCRIPT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 200 && parsed <= 60_000) {
    return Math.round(parsed);
  }
  return DEFAULT_APPS_SCRIPT_TIMEOUT_MS;
}

function redactSensitiveText(text: string, url: string, secret: string): string {
  let sanitized = text || '';
  if (secret) {
    sanitized = sanitized.split(secret).join('[REDACTED]');
  }
  if (url) {
    sanitized = sanitized.split(url).join('[REDACTED_SCRIPT_URL]');
    try {
      const parsed = new URL(url);
      if (parsed.pathname && parsed.pathname !== '/') {
        sanitized = sanitized.split(parsed.pathname).join('[REDACTED_PATH]');
      }
      if (parsed.host) {
        sanitized = sanitized.split(parsed.host).join('[REDACTED_HOST]');
      }
    } catch {
      // Ignore parse error during redaction
    }
  }
  return sanitized;
}

export function resolveAppsScriptEmailConfig(): ResolvedAppsScriptEmailConfig {
  const warnings: string[] = [];
  const missingVars: string[] = [];

  const rawUrl = (process.env.GOOGLE_SCRIPT_URL || '').trim();
  const secret = (process.env.GOOGLE_SCRIPT_SECRET || '').trim();
  const timeoutMs = resolveRequestTimeoutMs();

  let validHttpsUrl = false;
  let normalizedUrl = '';

  if (!rawUrl) {
    missingVars.push('GOOGLE_SCRIPT_URL');
  } else {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'https:') {
        validHttpsUrl = true;
        normalizedUrl = parsed.toString();
      } else {
        warnings.push('GOOGLE_SCRIPT_URL must use the HTTPS protocol.');
        missingVars.push('GOOGLE_SCRIPT_URL (valid https:// URL)');
      }
    } catch {
      warnings.push('GOOGLE_SCRIPT_URL is not a valid URL.');
      missingVars.push('GOOGLE_SCRIPT_URL (valid https:// URL)');
    }
  }

  if (!secret) {
    missingVars.push('GOOGLE_SCRIPT_SECRET');
  }

  const configured = Boolean(validHttpsUrl && normalizedUrl && secret);

  return {
    configured,
    provider: configured ? 'google-apps-script' : 'unconfigured',
    transport: 'https-post',
    urlConfigured: Boolean(rawUrl),
    validHttpsUrl,
    secretConfigured: Boolean(secret),
    url: normalizedUrl,
    secret,
    senderEmail: OFFICIAL_COMPANY_EMAIL,
    replyTo: OFFICIAL_COMPANY_EMAIL,
    timeoutMs,
    missingVars,
    warnings
  };
}

export function getSafeEmailDiagnostics(
  resolved: ResolvedAppsScriptEmailConfig = resolveAppsScriptEmailConfig()
): SafeEmailDiagnostics {
  return {
    configured: resolved.configured,
    provider: resolved.provider,
    transport: resolved.transport,
    urlConfigured: resolved.urlConfigured,
    validHttpsUrl: resolved.validHttpsUrl,
    secretConfigured: resolved.secretConfigured,
    senderEmail: resolved.senderEmail,
    replyTo: resolved.replyTo,
    timeoutMs: resolved.timeoutMs,
    missingVars: resolved.missingVars,
    warnings: resolved.warnings
  };
}

export function logEmailStartupDiagnostics(): void {
  const diag = getSafeEmailDiagnostics();
  if (diag.configured) {
    console.log(
      `[Rudraatma Email] Ready (${diag.provider}, transport=${diag.transport}, timeout=${diag.timeoutMs}ms, urlConfigured=${diag.urlConfigured}, secretConfigured=${diag.secretConfigured})`
    );
  } else {
    console.warn(
      `[Rudraatma Email] Incomplete configuration (${diag.provider}): missing=[${diag.missingVars.join(', ')}]`
    );
  }
  for (const warning of diag.warnings) {
    console.warn(`[Rudraatma Email Warning] ${warning}`);
  }
}

export async function verifyAppsScriptNetworkReadiness(): Promise<{
  connected: boolean;
  missingConfig?: boolean;
  error?: string;
  diagnostics: SafeEmailDiagnostics;
}> {
  const config = resolveAppsScriptEmailConfig();
  const diagnostics = getSafeEmailDiagnostics(config);

  if (!config.configured) {
    return {
      connected: false,
      missingConfig: true,
      error: `Email delivery configuration incomplete. Missing or invalid environment variable(s): ${config.missingVars.join(', ')}.`,
      diagnostics
    };
  }

  try {
    const parsedUrl = new URL(config.url);
    await dns.promises.lookup(parsedUrl.hostname);
    return {
      connected: true,
      diagnostics
    };
  } catch (err: any) {
    const safeMsg = redactSensitiveText(err?.code || err?.message || 'DNS resolution failed', config.url, config.secret);
    return {
      connected: false,
      error: `Unable to reach Google Apps Script email relay (${safeMsg}).`,
      diagnostics
    };
  }
}

export async function sendAppsScriptOtpEmail(params: {
  email: string;
  otp: string;
  purpose: 'signup' | 'login' | 'reset';
  timeoutMsOverride?: number;
}): Promise<AppsScriptEmailResult> {
  const config = resolveAppsScriptEmailConfig();
  const senderDisplay = `"${OFFICIAL_SENDER_NAME}" <${config.senderEmail}>`;

  if (!config.configured) {
    console.error(
      `[Rudraatma Email] OTP email aborted for ${params.email} (${params.purpose}): missing [${config.missingVars.join(', ')}].`
    );
    return {
      success: false,
      delivered: false,
      missingConfig: true,
      error: `Email delivery is not configured on the server (missing: ${config.missingVars.join(', ')}).`,
      sender: senderDisplay,
      senderAddress: config.senderEmail
    };
  }

  const normalizedEmail = params.email.trim().toLowerCase();
  const cleanOtp = String(params.otp).trim();
  const effectiveTimeoutMs = params.timeoutMsOverride ?? config.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        secret: config.secret,
        email: normalizedEmail,
        otp: cleanOtp
      }),
      signal: controller.signal
    });

    const latencyMs = Date.now() - startedAt;
    const rawBody = await response.text();

    let parsedBody: unknown = null;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = null;
    }

    const isExplicitSuccess =
      response.ok &&
      parsedBody !== null &&
      typeof parsedBody === 'object' &&
      !Array.isArray(parsedBody) &&
      (parsedBody as Record<string, unknown>).success === true;

    if (!isExplicitSuccess) {
      const upstreamError =
        parsedBody !== null &&
        typeof parsedBody === 'object' &&
        !Array.isArray(parsedBody) &&
        typeof (parsedBody as Record<string, unknown>).error === 'string'
          ? redactSensitiveText((parsedBody as Record<string, unknown>).error as string, config.url, config.secret)
          : !response.ok
            ? `Email relay returned HTTP ${response.status}.`
            : 'Email relay did not return {"success":true}.';

      console.error(
        `[Rudraatma Email] Apps Script delivery rejected for ${normalizedEmail} (${params.purpose}) status=${response.status} (${latencyMs}ms): ${upstreamError}`
      );
      return {
        success: false,
        delivered: false,
        error: `Email delivery failed: ${upstreamError}`,
        sender: senderDisplay,
        senderAddress: config.senderEmail,
        latencyMs
      };
    }

    console.log(
      `[Rudraatma Email] Delivered ${params.purpose} OTP email to ${normalizedEmail} via Google Apps Script MailApp (${latencyMs}ms)`
    );
    return {
      success: true,
      delivered: true,
      sender: senderDisplay,
      senderAddress: config.senderEmail,
      latencyMs
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = err?.name === 'AbortError';
    const rawReason = isTimeout
      ? `Request timed out after ${effectiveTimeoutMs}ms.`
      : err?.cause?.code || err?.code || err?.message || 'Network or relay error.';
    const safeReason = redactSensitiveText(String(rawReason), config.url, config.secret);

    console.error(
      `[Rudraatma Email] Apps Script delivery error for ${normalizedEmail} (${params.purpose}) (${latencyMs}ms): ${safeReason}`
    );
    return {
      success: false,
      delivered: false,
      error: isTimeout
        ? 'Email delivery timed out while contacting the mail relay. Please try again.'
        : `Email delivery failed: ${safeReason}`,
      sender: senderDisplay,
      senderAddress: config.senderEmail,
      latencyMs
    };
  } finally {
    clearTimeout(timer);
  }
}
