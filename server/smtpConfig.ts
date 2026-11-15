import nodemailer from 'nodemailer';

export const OFFICIAL_DOMAIN = 'rudraatmamusic.com';
export const OFFICIAL_SENDER_NAME = 'Rudraatma Music';
export const OFFICIAL_COMPANY_EMAIL = 'rudraatmamusic@gmail.com';
export const OFFICIAL_SUPPORT_EMAIL = 'support@rudraatmamusic.com';
export const GMAIL_SMTP_HOST = 'smtp.gmail.com';
export const DEFAULT_SMTP_PORT = 587;

export interface ResolvedSmtpConfig {
  configured: boolean;
  provider: 'gmail' | 'custom-smtp' | 'unconfigured';
  host: string;
  hostSource: 'SMTP_HOST' | 'gmail-inferred' | 'unset';
  port: number;
  portSource: 'SMTP_PORT' | 'default-587';
  secure: boolean;
  requireTLS: boolean;
  tlsMode: 'STARTTLS' | 'SSL/TLS' | 'Plain/Opportunistic';
  user: string;
  pass: string;
  passSource: 'SMTP_PASS' | 'SMTP_PASSWORD' | 'unset';
  rawFrom: string;
  fromHeader: string;
  replyTo: string;
  missingVars: string[];
  warnings: string[];
}

export interface SafeSmtpDiagnostics {
  configured: boolean;
  provider: 'gmail' | 'custom-smtp' | 'unconfigured';
  host: string | null;
  hostSource: 'SMTP_HOST' | 'gmail-inferred' | 'unset';
  port: number;
  portSource: 'SMTP_PORT' | 'default-587';
  secure: boolean;
  requireTLS: boolean;
  tlsMode: 'STARTTLS' | 'SSL/TLS' | 'Plain/Opportunistic';
  userConfigured: boolean;
  userMasked: string | null;
  passConfigured: boolean;
  passSource: 'SMTP_PASS' | 'SMTP_PASSWORD' | 'unset';
  from: string;
  replyTo: string;
  missingVars: string[];
  warnings: string[];
}

function maskEmailOrUsername(value: string): string | null {
  if (!value) return null;
  const atIdx = value.indexOf('@');
  if (atIdx > 1) {
    const local = value.slice(0, atIdx);
    const domain = value.slice(atIdx + 1);
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}***@${domain}`;
  }
  return value.length <= 2 ? '***' : `${value.slice(0, 2)}***`;
}

function isGmailAddress(email: string): boolean {
  const lower = email.trim().toLowerCase();
  return lower.endsWith('@gmail.com') || lower.endsWith('@googlemail.com');
}

export function resolveSmtpConfig(): ResolvedSmtpConfig {
  const warnings: string[] = [];
  const missingVars: string[] = [];

  const rawHost = (process.env.SMTP_HOST || '').trim();
  const rawPort = (process.env.SMTP_PORT || '').trim();
  const rawSecure = (process.env.SMTP_SECURE || '').trim().toLowerCase();
  const rawUser = (process.env.SMTP_USER || '').trim();
  const rawFromEnv = (process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL || '').trim();
  const rawReplyTo = (process.env.SMTP_REPLY_TO || OFFICIAL_COMPANY_EMAIL).trim();

  const smtpPassPrimary = (process.env.SMTP_PASS || '').trim();
  const smtpPassAlias = (process.env.SMTP_PASSWORD || '').trim();
  const pass = smtpPassPrimary || smtpPassAlias;
  const passSource: 'SMTP_PASS' | 'SMTP_PASSWORD' | 'unset' = smtpPassPrimary
    ? 'SMTP_PASS'
    : smtpPassAlias
      ? 'SMTP_PASSWORD'
      : 'unset';

  const user = rawUser || (rawFromEnv && rawFromEnv.includes('@') ? rawFromEnv : '');
  const rawFrom = rawFromEnv || user || OFFICIAL_COMPANY_EMAIL;
  const fromHeader = rawFrom.includes('<') ? rawFrom : `"${OFFICIAL_SENDER_NAME}" <${rawFrom}>`;

  // Resolve SMTP_HOST (strictly prioritize environment variable; never fall back to mail.rudraatmamusic.com)
  let host = '';
  let hostSource: 'SMTP_HOST' | 'gmail-inferred' | 'unset' = 'unset';

  if (rawHost) {
    if (rawHost.includes('@')) {
      if (rawHost.toLowerCase().includes('gmail') || rawHost.toLowerCase().includes('googlemail')) {
        host = GMAIL_SMTP_HOST;
        hostSource = 'SMTP_HOST';
        warnings.push('SMTP_HOST contained an email address; normalized to smtp.gmail.com.');
      } else {
        warnings.push('SMTP_HOST contains an invalid email format instead of an SMTP hostname.');
      }
    } else {
      host = rawHost;
      hostSource = 'SMTP_HOST';
    }
  } else if (isGmailAddress(user) || isGmailAddress(rawFromEnv)) {
    host = GMAIL_SMTP_HOST;
    hostSource = 'gmail-inferred';
  }

  // Resolve SMTP_PORT (prioritize SMTP_PORT env var; default to 587 STARTTLS)
  let port = DEFAULT_SMTP_PORT;
  let portSource: 'SMTP_PORT' | 'default-587' = 'default-587';
  if (rawPort) {
    const parsed = Number(rawPort);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      port = parsed;
      portSource = 'SMTP_PORT';
    } else {
      warnings.push(`Invalid SMTP_PORT value ignored; using port ${DEFAULT_SMTP_PORT}.`);
    }
  }

  // Resolve TLS / STARTTLS behavior (Port 587 always uses STARTTLS: secure=false, requireTLS=true)
  let secure = false;
  let requireTLS = false;
  let tlsMode: 'STARTTLS' | 'SSL/TLS' | 'Plain/Opportunistic' = 'Plain/Opportunistic';

  if (port === 587) {
    secure = false;
    requireTLS = true;
    tlsMode = 'STARTTLS';
    if (rawSecure === 'true' || rawSecure === '1') {
      warnings.push('SMTP_SECURE=true overrides broken direct-SSL on port 587 to STARTTLS (secure=false, requireTLS=true).');
    }
  } else if (rawSecure === 'true' || rawSecure === '1') {
    secure = true;
    requireTLS = false;
    tlsMode = 'SSL/TLS';
  } else if (rawSecure === 'false' || rawSecure === '0') {
    secure = false;
    requireTLS = false;
    tlsMode = 'Plain/Opportunistic';
  } else if (port === 465) {
    secure = true;
    requireTLS = false;
    tlsMode = 'SSL/TLS';
  }

  if (!host) missingVars.push('SMTP_HOST');
  if (!user) missingVars.push('SMTP_USER');
  if (!pass) missingVars.push('SMTP_PASS / SMTP_PASSWORD');

  const provider: 'gmail' | 'custom-smtp' | 'unconfigured' = !host
    ? 'unconfigured'
    : host.toLowerCase() === GMAIL_SMTP_HOST
      ? 'gmail'
      : 'custom-smtp';

  return {
    configured: Boolean(host && user && pass),
    provider,
    host,
    hostSource,
    port,
    portSource,
    secure,
    requireTLS,
    tlsMode,
    user,
    pass,
    passSource,
    rawFrom,
    fromHeader,
    replyTo: rawReplyTo,
    missingVars,
    warnings
  };
}

export function getSmtpDiagnostics(resolved: ResolvedSmtpConfig = resolveSmtpConfig()): SafeSmtpDiagnostics {
  return {
    configured: resolved.configured,
    provider: resolved.provider,
    host: resolved.host || null,
    hostSource: resolved.hostSource,
    port: resolved.port,
    portSource: resolved.portSource,
    secure: resolved.secure,
    requireTLS: resolved.requireTLS,
    tlsMode: resolved.tlsMode,
    userConfigured: Boolean(resolved.user),
    userMasked: maskEmailOrUsername(resolved.user),
    passConfigured: Boolean(resolved.pass),
    passSource: resolved.passSource,
    from: resolved.rawFrom,
    replyTo: resolved.replyTo,
    missingVars: resolved.missingVars,
    warnings: resolved.warnings
  };
}

export function createSmtpTransporter(resolved: ResolvedSmtpConfig) {
  return nodemailer.createTransport({
    host: resolved.host,
    port: resolved.port,
    secure: resolved.secure,
    requireTLS: resolved.requireTLS,
    ...(resolved.requireTLS ? { tls: { minVersion: 'TLSv1.2' } } : {}),
    auth: {
      user: resolved.user,
      pass: resolved.pass
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 12000
  });
}

export function logSmtpStartupDiagnostics(): void {
  const diag = getSmtpDiagnostics();
  if (diag.configured) {
    console.log(
      `[Rudraatma SMTP] Ready (${diag.provider}) host=${diag.host} (${diag.hostSource}) port=${diag.port} (${diag.portSource}) tls=${diag.tlsMode} user=${diag.userMasked || 'unset'} passSource=${diag.passSource}`
    );
  } else {
    console.warn(
      `[Rudraatma SMTP] Incomplete configuration (${diag.provider}): missing=[${diag.missingVars.join(', ')}] host=${diag.host || 'unset'} port=${diag.port} tls=${diag.tlsMode}`
    );
  }
  for (const w of diag.warnings) {
    console.warn(`[Rudraatma SMTP Warning] ${w}`);
  }
}
