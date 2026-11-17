/**
 * Rudraatma Music Distribution - Google Apps Script Transactional Email Relay
 *
 * Deployment configuration:
 * 1. Set Script Property `GOOGLE_SCRIPT_SECRET` in Apps Script
 *    (Project Settings -> Script Properties) to match your server's `GOOGLE_SCRIPT_SECRET`.
 * 2. Deploy as Web App:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 3. When updating an existing deployment, use Deploy -> Manage deployments -> Edit -> New version
 *    so the existing Web App URL (`GOOGLE_SCRIPT_URL`) remains unchanged.
 */

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function constantTimeEquals_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a.length || a.length !== b.length) {
    return false;
  }
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isValidRecipientEmail_(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ success: false, error: 'Empty request body.' });
    }

    var data = JSON.parse(e.postData.contents);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return jsonResponse_({ success: false, error: 'Invalid JSON payload.' });
    }

    var expectedSecret = (PropertiesService.getScriptProperties().getProperty('GOOGLE_SCRIPT_SECRET') || '').trim();
    if (!expectedSecret) {
      return jsonResponse_({ success: false, error: 'Relay secret is not configured in Script Properties.' });
    }

    var providedSecret = typeof data.secret === 'string' ? data.secret.trim() : '';
    if (!constantTimeEquals_(providedSecret, expectedSecret)) {
      return jsonResponse_({ success: false, error: 'Unauthorized relay request.' });
    }

    var recipient = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    if (!isValidRecipientEmail_(recipient)) {
      return jsonResponse_({ success: false, error: 'Invalid recipient email address.' });
    }

    var subject = typeof data.subject === 'string' ? data.subject.trim() : '';
    var htmlBody = typeof data.htmlBody === 'string' ? data.htmlBody.trim() : '';
    var textBody = typeof data.textBody === 'string' ? data.textBody.trim() : '';

    if (!subject) {
      return jsonResponse_({ success: false, error: 'Missing required email subject (data.subject).' });
    }

    if (!htmlBody || !textBody) {
      return jsonResponse_({
        success: false,
        error: 'Missing required dynamic email content (data.htmlBody and data.textBody).'
      });
    }

    var rawReplyTo =
      typeof data.replyTo === 'string' && data.replyTo.trim()
        ? data.replyTo.trim()
        : typeof data.supportEmail === 'string'
          ? data.supportEmail.trim()
          : '';
    var replyTo = isValidRecipientEmail_(rawReplyTo) ? rawReplyTo : 'rudraatmamusic@gmail.com';

    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: textBody,
      htmlBody: htmlBody,
      name: 'Rudraatma Music Distribution',
      replyTo: replyTo
    });

    return jsonResponse_({ success: true });
  } catch (err) {
    return jsonResponse_({
      success: false,
      error: err && err.message ? String(err.message) : 'Unexpected email relay error.'
    });
  }
}
