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

function stripOuterQuotes(value?: string): string {
  const trimmed = (value || '').trim();
  return trimmed.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
}

export function resolveAppsScriptEmailConfig(): ResolvedAppsScriptEmailConfig {
  const warnings: string[] = [];
  const missingVars: string[] = [];

  const rawUrl = stripOuterQuotes(process.env.GOOGLE_SCRIPT_URL);
  const secret = stripOuterQuotes(process.env.GOOGLE_SCRIPT_SECRET);
  const timeoutMs = DEFAULT_APPS_SCRIPT_TIMEOUT_MS;

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

export const OFFICIAL_WEBSITE_URL = 'https://rudraatma-music.onrender.com';
export const OTP_EMAIL_SUBJECT = 'Your Rudraatma Music Verification Code';
export const OTP_EXPIRY_MINUTES = 10;

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildOtpEmailTemplate(params: {
  otp: string;
  purpose: 'signup' | 'login' | 'reset';
  recipientEmail?: string;
  expiryMinutes?: number;
}): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const rawOtp = String(params.otp || '').trim();
  const cleanOtp = escapeHtml(rawOtp);
  const expiryMinutes = params.expiryMinutes ?? OTP_EXPIRY_MINUTES;

  const htmlBody = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${OTP_EMAIL_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background-color:#07070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#07070a;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#0d0d12;border:1px solid #8a6d1f;border-radius:16px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.65);">
          <!-- Gold Top Accent Bar -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#926f1c,#facc15,#d4af37,#926f1c);background-color:#d4af37;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Brand Header -->
          <tr>
            <td style="padding:28px 32px 22px 32px;border-bottom:1px solid #262115;text-align:center;background-color:#0a0a0e;">
              <div style="display:inline-block;padding:6px 16px;border:1px solid #8a6d1f;border-radius:999px;background-color:#15120a;color:#facc15;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
                RUDRAATMA MUSIC DISTRIBUTION
              </div>
            </td>
          </tr>

          <!-- Main Body (Exact Wording & Paragraph Order) -->
          <tr>
            <td style="padding:30px 32px 28px 32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#f8fafc;font-weight:600;">
                Hello,
              </p>

              <p style="margin:0 0 16px 0;font-size:18px;line-height:1.45;font-weight:700;color:#facc15;">
                Welcome to Rudraatma Music Distribution!
              </p>

              <p style="margin:0 0 22px 0;font-size:15px;line-height:1.65;color:#e2e8f0;">
                Your One-Time Password (OTP) for verifying your email address and securely accessing your Rudraatma account is:
              </p>

              <!-- Gold-Bordered OTP Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 26px 0;">
                <tr>
                  <td align="center" style="background-color:#131008;border:2px solid #d4af37;border-radius:12px;padding:24px 16px;">
                    <div style="font-family:'Courier New',Courier,monospace;font-size:38px;line-height:1.15;font-weight:800;letter-spacing:10px;color:#facc15;margin:0;padding-left:10px;">
                      ${cleanOtp}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Information Panel -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;background-color:#111118;border:1px solid #2b2517;border-left:3px solid #d4af37;border-radius:8px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#facc15;">
                      Security Information:
                    </p>
                    <ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.7;color:#cbd5e1;">
                      <li>This OTP is valid for ${expiryMinutes} minutes only.</li>
                      <li>Do not share this verification code with anyone.</li>
                      <li>Rudraatma representatives will never ask you to disclose your OTP.</li>
                      <li>If you did not request this verification code, please ignore this email.</li>
                      <li>For your security, never forward this email or disclose its contents to anyone.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;font-weight:700;color:#ffffff;">
                Your Account Security Matters to Us.
              </p>

              <p style="margin:0 0 24px 0;font-size:14px;line-height:1.65;color:#cbd5e1;">
                Thank you for choosing Rudraatma Music Distribution. We are committed to providing a secure, reliable and professional music distribution experience.
              </p>

              <div style="padding-top:18px;border-top:1px solid #262115;font-size:13.5px;line-height:1.7;color:#e2e8f0;">
                <p style="margin:0;">Best Regards,</p>
                <p style="margin:0;font-weight:700;color:#facc15;">Rudraatma Music Distribution</p>
                <p style="margin:4px 0 0 0;color:#cbd5e1;">
                  Official Website: <a href="${OFFICIAL_WEBSITE_URL}" style="color:#facc15;text-decoration:none;">${OFFICIAL_WEBSITE_URL}</a>
                </p>
                <p style="margin:2px 0 0 0;color:#cbd5e1;">
                  Email: <a href="mailto:${OFFICIAL_COMPANY_EMAIL}" style="color:#facc15;text-decoration:none;">${OFFICIAL_COMPANY_EMAIL}</a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Automated Notification Footer -->
          <tr>
            <td style="padding:18px 32px 24px 32px;background-color:#09090d;border-top:1px solid #262115;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.55;color:#94a3b8;">
                This is an automated security notification. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = [
    'Hello,',
    '',
    'Welcome to Rudraatma Music Distribution!',
    '',
    'Your One-Time Password (OTP) for verifying your email address and securely accessing your Rudraatma account is:',
    '',
    rawOtp,
    '',
    'Security Information:',
    '',
    `- This OTP is valid for ${expiryMinutes} minutes only.`,
    '- Do not share this verification code with anyone.',
    '- Rudraatma representatives will never ask you to disclose your OTP.',
    '- If you did not request this verification code, please ignore this email.',
    '- For your security, never forward this email or disclose its contents to anyone.',
    '',
    'Your Account Security Matters to Us.',
    '',
    'Thank you for choosing Rudraatma Music Distribution. We are committed to providing a secure, reliable and professional music distribution experience.',
    '',
    'Best Regards,',
    'Rudraatma Music Distribution',
    `Official Website: ${OFFICIAL_WEBSITE_URL}`,
    `Email: ${OFFICIAL_COMPANY_EMAIL}`,
    '',
    'This is an automated security notification. Please do not reply to this email.'
  ].join('\n');

  return {
    subject: OTP_EMAIL_SUBJECT,
    htmlBody,
    textBody
  };
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
  const emailTemplate = buildOtpEmailTemplate({
    otp: cleanOtp,
    purpose: params.purpose,
    recipientEmail: normalizedEmail,
    expiryMinutes: OTP_EXPIRY_MINUTES
  });
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
        otp: cleanOtp,
        type: 'otp',
        purpose: params.purpose,
        brandName: 'Rudraatma Music Distribution',
        expiresInMinutes: OTP_EXPIRY_MINUTES,
        websiteUrl: OFFICIAL_WEBSITE_URL,
        supportEmail: OFFICIAL_COMPANY_EMAIL,
        replyTo: OFFICIAL_COMPANY_EMAIL,
        subject: emailTemplate.subject,
        htmlBody: emailTemplate.htmlBody,
        html: emailTemplate.htmlBody,
        textBody: emailTemplate.textBody,
        message: emailTemplate.textBody
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

export async function sendArtistNotificationEmail(params: {
  email: string;
  subject: string;
  title: string;
  body: string;
  purpose: 'profile_approved' | 'profile_rejected' | 'profile_changes_requested' | 'promo_activated' | 'payout_update';
}): Promise<AppsScriptEmailResult> {
  const { dbQueueEmailJob } = await import('./db');
  const jobId = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const normalizedEmail = params.email.trim().toLowerCase();
  const config = resolveAppsScriptEmailConfig();
  const senderDisplay = `"${OFFICIAL_SENDER_NAME}" <${config.senderEmail}>`;

  await dbQueueEmailJob({
    id: jobId,
    recipientEmail: normalizedEmail,
    subject: params.subject,
    purpose: params.purpose,
    payload: { title: params.title, bodyPreview: params.body.slice(0, 240) },
    status: 'QUEUED'
  }).catch(() => {});

  if (!config.configured) {
    const errText = `Email relay unconfigured (missing: ${config.missingVars.join(', ')}). Queued in email_queue.`;
    await dbQueueEmailJob({
      id: jobId,
      recipientEmail: normalizedEmail,
      subject: params.subject,
      purpose: params.purpose,
      payload: { title: params.title },
      status: 'FAILED',
      lastError: errText
    }).catch(() => {});
    return {
      success: false,
      delivered: false,
      missingConfig: true,
      error: errText,
      sender: senderDisplay,
      senderAddress: config.senderEmail
    };
  }

  const safeTitle = escapeHtml(params.title);
  const safeBody = escapeHtml(params.body).replace(/\r?\n/g, '<br />');
  const notificationHtmlBody = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(params.subject)}</title></head>
<body style="margin:0;padding:0;background-color:#07070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#07070a;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background-color:#0d0d12;border:1px solid #8a6d1f;border-radius:16px;overflow:hidden;">
        <tr><td style="height:4px;background-color:#d4af37;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:24px 32px;border-bottom:1px solid #262115;background-color:#0a0a0e;">
          <div style="color:#facc15;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">RUDRAATMA MUSIC DISTRIBUTION</div>
          <h1 style="margin:10px 0 0 0;font-size:20px;line-height:1.3;color:#ffffff;">${safeTitle}</h1>
        </td></tr>
        <tr><td style="padding:26px 32px;font-size:14px;line-height:1.65;color:#e2e8f0;">${safeBody}</td></tr>
        <tr><td style="padding:18px 32px;background-color:#09090d;border-top:1px solid #262115;font-size:12px;color:#94a3b8;text-align:center;">
          Website: <a href="${OFFICIAL_WEBSITE_URL}" style="color:#facc15;text-decoration:none;">${OFFICIAL_WEBSITE_URL}</a> |
          Support: <a href="mailto:${OFFICIAL_SUPPORT_EMAIL}" style="color:#facc15;text-decoration:none;">${OFFICIAL_SUPPORT_EMAIL}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const notificationTextBody = `${params.title}\n\n${params.body}\n\nRudraatma Music Distribution\nWebsite: ${OFFICIAL_WEBSITE_URL}\nSupport: ${OFFICIAL_SUPPORT_EMAIL}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        secret: config.secret,
        email: normalizedEmail,
        subject: params.subject,
        title: params.title,
        message: params.body,
        htmlBody: notificationHtmlBody,
        textBody: notificationTextBody,
        supportEmail: OFFICIAL_SUPPORT_EMAIL,
        type: 'notification',
        purpose: params.purpose
      }),
      signal: controller.signal
    });
    const latencyMs = Date.now() - startedAt;
    const rawBody = await response.text();
    let parsed: any = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsed = null;
    }
    const ok = Boolean(response.ok && parsed && typeof parsed === 'object' && parsed.success === true);
    await dbQueueEmailJob({
      id: jobId,
      recipientEmail: normalizedEmail,
      subject: params.subject,
      purpose: params.purpose,
      payload: { title: params.title },
      status: ok ? 'SENT' : 'FAILED',
      lastError: ok ? undefined : `Relay status ${response.status}`
    }).catch(() => {});
    return {
      success: ok,
      delivered: ok,
      error: ok ? undefined : `Notification email relay status ${response.status}`,
      sender: senderDisplay,
      senderAddress: config.senderEmail,
      latencyMs
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    const safeReason = redactSensitiveText(String(err?.message || 'Relay request failed'), config.url, config.secret);
    await dbQueueEmailJob({
      id: jobId,
      recipientEmail: normalizedEmail,
      subject: params.subject,
      purpose: params.purpose,
      payload: { title: params.title },
      status: 'FAILED',
      lastError: safeReason
    }).catch(() => {});
    return {
      success: false,
      delivered: false,
      error: safeReason,
      sender: senderDisplay,
      senderAddress: config.senderEmail,
      latencyMs
    };
  } finally {
    clearTimeout(timer);
  }
}

export function buildPromotionalEmailTemplate(params: {
  subject: string;
  headline: string;
  preheader?: string;
  categoryLabel?: string;
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
  recipientName?: string;
  unsubscribeUrl?: string;
}): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const safeSubject = escapeHtml(params.subject.trim() || 'Rudraatma Music Distribution Update');
  const safeHeadline = escapeHtml(params.headline.trim() || params.subject.trim());
  const safePreheader = escapeHtml((params.preheader || '').trim());
  const safeCategory = escapeHtml((params.categoryLabel || 'ANNOUNCEMENT & OFFERS').trim().toUpperCase());
  const greetingName = params.recipientName?.trim() ? `Hello ${escapeHtml(params.recipientName.trim())},` : 'Hello Artist,';
  const greetingPlain = params.recipientName?.trim() ? `Hello ${params.recipientName.trim()},` : 'Hello Artist,';

  const paragraphs = String(params.bodyText || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const htmlParagraphs = (paragraphs.length ? paragraphs : [String(params.bodyText || '')])
    .map(
      p =>
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.68;color:#e2e8f0;">${escapeHtml(p).replace(/\r?\n/g, '<br />')}</p>`
    )
    .join('\n');

  const cleanCtaLabel = params.ctaLabel?.trim();
  const cleanCtaUrl = params.ctaUrl?.trim();
  const safeCtaUrl =
    cleanCtaUrl && /^https?:\/\//i.test(cleanCtaUrl) ? escapeHtml(cleanCtaUrl) : OFFICIAL_WEBSITE_URL;
  const ctaHtml = cleanCtaLabel
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
        <tr>
          <td align="center" style="border-radius:10px;background-color:#d4af37;">
            <a href="${safeCtaUrl}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:700;color:#07070a;text-decoration:none;border-radius:10px;">
              ${escapeHtml(cleanCtaLabel)}
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const unsubUrl = params.unsubscribeUrl?.trim() || `${OFFICIAL_WEBSITE_URL}/dashboard/profile`;

  const htmlBody = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background-color:#07070a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  ${safePreheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>` : ''}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#07070a;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#0d0d12;border:1px solid #8a6d1f;border-radius:16px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.65);">
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#926f1c,#facc15,#d4af37,#926f1c);background-color:#d4af37;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:26px 32px 20px 32px;border-bottom:1px solid #262115;background-color:#0a0a0e;">
              <div style="color:#facc15;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
                RUDRAATMA MUSIC DISTRIBUTION · ${safeCategory}
              </div>
              <h1 style="margin:12px 0 0 0;font-size:22px;line-height:1.35;color:#ffffff;font-weight:700;">
                ${safeHeadline}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 24px 32px;">
              <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#facc15;font-weight:600;">
                ${greetingName}
              </p>
              ${htmlParagraphs}
              ${ctaHtml}
              <div style="margin-top:22px;padding-top:18px;border-top:1px solid #262115;font-size:13.5px;line-height:1.65;color:#cbd5e1;">
                <p style="margin:0;">Best Regards,</p>
                <p style="margin:0;font-weight:700;color:#facc15;">Rudraatma Music Distribution</p>
                <p style="margin:4px 0 0 0;">
                  Official Website: <a href="${OFFICIAL_WEBSITE_URL}" style="color:#facc15;text-decoration:none;">${OFFICIAL_WEBSITE_URL}</a>
                </p>
                <p style="margin:2px 0 0 0;">
                  Support: <a href="mailto:${OFFICIAL_COMPANY_EMAIL}" style="color:#facc15;text-decoration:none;">${OFFICIAL_COMPANY_EMAIL}</a>
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 22px 32px;background-color:#09090d;border-top:1px solid #262115;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;line-height:1.55;color:#94a3b8;">
                You received this promotional update as a registered Rudraatma Music Distribution user.
              </p>
              <p style="margin:0;font-size:12px;line-height:1.55;color:#94a3b8;">
                Prefer not to receive promotional emails?
                <a href="${escapeHtml(unsubUrl)}" style="color:#facc15;text-decoration:underline;">Unsubscribe here</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    'RUDRAATMA MUSIC DISTRIBUTION',
    params.headline.trim(),
    '',
    greetingPlain,
    '',
    params.bodyText.trim()
  ];
  if (cleanCtaLabel) {
    textParts.push('', `${cleanCtaLabel}: ${cleanCtaUrl || OFFICIAL_WEBSITE_URL}`);
  }
  textParts.push(
    '',
    'Best Regards,',
    'Rudraatma Music Distribution',
    `Official Website: ${OFFICIAL_WEBSITE_URL}`,
    `Support: ${OFFICIAL_COMPANY_EMAIL}`,
    '',
    `To unsubscribe from promotional updates, visit: ${unsubUrl}`
  );

  return {
    subject: params.subject.trim(),
    htmlBody,
    textBody: textParts.join('\n')
  };
}

export async function sendPromotionalEmail(params: {
  email: string;
  recipientName?: string;
  subject: string;
  headline: string;
  preheader?: string;
  categoryLabel?: string;
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
  unsubscribeUrl?: string;
  campaignId: string;
}): Promise<AppsScriptEmailResult> {
  const { dbQueueEmailJob } = await import('./db');
  const jobId = `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const normalizedEmail = params.email.trim().toLowerCase();
  const config = resolveAppsScriptEmailConfig();
  const senderDisplay = `"${OFFICIAL_SENDER_NAME}" <${config.senderEmail}>`;

  const rendered = buildPromotionalEmailTemplate({
    subject: params.subject,
    headline: params.headline,
    preheader: params.preheader,
    categoryLabel: params.categoryLabel,
    bodyText: params.bodyText,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
    recipientName: params.recipientName,
    unsubscribeUrl: params.unsubscribeUrl
  });

  await dbQueueEmailJob({
    id: jobId,
    recipientEmail: normalizedEmail,
    subject: rendered.subject,
    purpose: 'promotional_campaign',
    payload: { campaignId: params.campaignId, headline: params.headline },
    status: 'QUEUED'
  }).catch(() => {});

  if (!config.configured) {
    const errText = `Email relay unconfigured (missing: ${config.missingVars.join(', ')}).`;
    await dbQueueEmailJob({
      id: jobId,
      recipientEmail: normalizedEmail,
      subject: rendered.subject,
      purpose: 'promotional_campaign',
      payload: { campaignId: params.campaignId },
      status: 'FAILED',
      lastError: errText
    }).catch(() => {});
    return {
      success: false,
      delivered: false,
      missingConfig: true,
      error: errText,
      sender: senderDisplay,
      senderAddress: config.senderEmail
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        secret: config.secret,
        email: normalizedEmail,
        subject: rendered.subject,
        title: params.headline,
        message: rendered.textBody,
        htmlBody: rendered.htmlBody,
        textBody: rendered.textBody,
        supportEmail: OFFICIAL_COMPANY_EMAIL,
        replyTo: OFFICIAL_COMPANY_EMAIL,
        type: 'promotional',
        purpose: 'promotional_campaign',
        campaignId: params.campaignId
      }),
      signal: controller.signal
    });
    const latencyMs = Date.now() - startedAt;
    const rawBody = await response.text();
    let parsed: any = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsed = null;
    }
    const ok = Boolean(response.ok && parsed && typeof parsed === 'object' && parsed.success === true);
    const errorMsg = ok
      ? undefined
      : typeof parsed?.error === 'string'
        ? redactSensitiveText(parsed.error, config.url, config.secret)
        : `Relay status ${response.status}`;

    await dbQueueEmailJob({
      id: jobId,
      recipientEmail: normalizedEmail,
      subject: rendered.subject,
      purpose: 'promotional_campaign',
      payload: { campaignId: params.campaignId },
      status: ok ? 'SENT' : 'FAILED',
      lastError: errorMsg
    }).catch(() => {});

    return {
      success: ok,
      delivered: ok,
      error: errorMsg,
      sender: senderDisplay,
      senderAddress: config.senderEmail,
      latencyMs
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    const safeReason = redactSensitiveText(String(err?.message || 'Relay request failed'), config.url, config.secret);
    await dbQueueEmailJob({
      id: jobId,
      recipientEmail: normalizedEmail,
      subject: rendered.subject,
      purpose: 'promotional_campaign',
      payload: { campaignId: params.campaignId },
      status: 'FAILED',
      lastError: safeReason
    }).catch(() => {});
    return {
      success: false,
      delivered: false,
      error: safeReason,
      sender: senderDisplay,
      senderAddress: config.senderEmail,
      latencyMs
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendSupportTicketNotificationEmail(params: {
  email: string;
  ticketId: string;
  subject: string;
  title: string;
  body: string;
  purpose: 'ticket_auto_reply' | 'ticket_escalated' | 'ticket_reply_approved';
}): Promise<AppsScriptEmailResult> {
  return sendArtistNotificationEmail({
    email: params.email,
    subject: `[${params.ticketId}] ${params.subject}`,
    title: params.title,
    body: params.body,
    purpose: 'profile_changes_requested'
  });
}


