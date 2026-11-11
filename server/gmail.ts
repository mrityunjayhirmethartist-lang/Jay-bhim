import express from 'express';
import multer from 'multer';
import crypto from 'crypto';

export interface UserGmailConnection {
  userId: string;
  accessToken: string;
  email?: string;
  displayName?: string;
  photoUrl?: string;
  connectedAt: number;
}

interface GmailRouteDeps {
  getAuthenticatedUser: (req: express.Request) => { id: string; fullName: string; email: string } | null;
  userGmailConnections: Map<string, UserGmailConnection>;
  dbSaveGmailConnection: (conn: UserGmailConnection) => Promise<void>;
  dbDeleteGmailConnection: (userId: string) => Promise<void>;
}

const gmailAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 }
});

function decodeBase64Url(data?: string): Buffer {
  if (!data) return Buffer.alloc(0);
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

function encodeBase64Url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf-8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getHeaderValue(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  if (!headers) return '';
  const target = name.toLowerCase();
  const found = headers.find((h) => h.name.toLowerCase() === target);
  return found?.value || '';
}

interface ParsedAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

function extractBodyAndAttachments(payload: any): {
  htmlBody: string;
  textBody: string;
  attachments: ParsedAttachment[];
} {
  let htmlBody = '';
  let textBody = '';
  const attachments: ParsedAttachment[] = [];

  function walk(part: any) {
    if (!part) return;

    const filename = part.filename || '';
    const mimeType = (part.mimeType || '').toLowerCase();
    const body = part.body || {};

    if (filename && body.attachmentId) {
      attachments.push({
        attachmentId: body.attachmentId,
        filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: Number(body.size || 0)
      });
    } else if (mimeType === 'text/html' && body.data && !htmlBody) {
      htmlBody = decodeBase64Url(body.data).toString('utf-8');
    } else if (mimeType === 'text/plain' && body.data && !textBody) {
      textBody = decodeBase64Url(body.data).toString('utf-8');
    }

    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);
  return { htmlBody, textBody, attachments };
}

function sanitizeHeader(val: string): string {
  return String(val || '').replace(/[\r\n]+/g, ' ').trim();
}

function buildRawMimeMessage(params: {
  from?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
  attachments?: Express.Multer.File[];
}): string {
  const boundary = `rudraatma_mime_${crypto.randomBytes(12).toString('hex')}`;
  const altBoundary = `rudraatma_alt_${crypto.randomBytes(12).toString('hex')}`;
  const hasAttachments = Boolean(params.attachments && params.attachments.length > 0);

  const headers: string[] = [];
  if (params.from) headers.push(`From: ${sanitizeHeader(params.from)}`);
  headers.push(`To: ${sanitizeHeader(params.to)}`);
  if (params.cc?.trim()) headers.push(`Cc: ${sanitizeHeader(params.cc)}`);
  if (params.bcc?.trim()) headers.push(`Bcc: ${sanitizeHeader(params.bcc)}`);
  headers.push(`Subject: =?UTF-8?B?${Buffer.from(sanitizeHeader(params.subject), 'utf-8').toString('base64')}?=`);
  if (params.inReplyTo?.trim()) headers.push(`In-Reply-To: ${sanitizeHeader(params.inReplyTo)}`);
  if (params.references?.trim()) headers.push(`References: ${sanitizeHeader(params.references)}`);
  headers.push('MIME-Version: 1.0');

  const htmlEscaped = params.bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  const alternativePart = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.bodyText, 'utf-8').toString('base64'),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6;">${htmlEscaped}</div>`,
    `--${altBoundary}--`
  ];

  // Re-encode the HTML part cleanly in base64 as well
  const htmlContent = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6;">${htmlEscaped}</div>`;
  alternativePart[alternativePart.length - 2] = Buffer.from(htmlContent, 'utf-8').toString('base64');

  if (!hasAttachments) {
    return [...headers, ...alternativePart].join('\r\n');
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts: string[] = [
    ...headers,
    '',
    `--${boundary}`,
    ...alternativePart
  ];

  for (const file of params.attachments || []) {
    const safeFilename = sanitizeHeader(file.originalname || 'attachment').replace(/"/g, '');
    const b64 = file.buffer.toString('base64').replace(/(.{76})/g, '$1\r\n');
    parts.push(
      `--${boundary}`,
      `Content-Type: ${file.mimetype || 'application/octet-stream'}; name="${safeFilename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeFilename}"`,
      '',
      b64
    );
  }

  parts.push(`--${boundary}--`);
  return parts.join('\r\n');
}

export function registerGmailRoutes(app: express.Express, deps: GmailRouteDeps) {
  const { getAuthenticatedUser, userGmailConnections, dbSaveGmailConnection, dbDeleteGmailConnection } = deps;

  async function handleTokenExpiry(userId: string, res: express.Response) {
    userGmailConnections.delete(userId);
    await dbDeleteGmailConnection(userId);
    return res.status(401).json({
      error: 'Gmail authorization expired. Please reconnect your Gmail account.',
      code: 'TOKEN_EXPIRED'
    });
  }

  // 1. Check Gmail connection status
  app.get('/api/gmail/status', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) {
      return res.json({ connected: false });
    }

    return res.json({
      connected: true,
      gmailUser: {
        email: conn.email || '',
        displayName: conn.displayName || 'Gmail User',
        photoUrl: conn.photoUrl || '',
        connectedAt: conn.connectedAt
      }
    });
  });

  // 2. Store user Gmail OAuth credentials securely on backend
  app.post('/api/gmail/connect', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized. Please login.' });

    const { accessToken, email, displayName, photoUrl } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: 'Gmail OAuth access token is required.' });
    }

    const conn: UserGmailConnection = {
      userId: user.id,
      accessToken,
      email: email || '',
      displayName: displayName || user.fullName,
      photoUrl: photoUrl || '',
      connectedAt: Date.now()
    };

    userGmailConnections.set(user.id, conn);
    await dbSaveGmailConnection(conn);

    return res.json({
      success: true,
      message: 'Personal Gmail connected securely to your Rudraatma session.'
    });
  });

  // 3. Disconnect Gmail
  app.post('/api/gmail/disconnect', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    userGmailConnections.delete(user.id);
    await dbDeleteGmailConnection(user.id);
    return res.json({ success: true, message: 'Gmail account disconnected.' });
  });

  // 4. Get Gmail profile
  app.get('/api/gmail/profile', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    try {
      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${conn.accessToken}` }
      });
      if (gmailRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!gmailRes.ok) {
        const details = await gmailRes.text();
        return res.status(gmailRes.status).json({ error: 'Gmail API error', details });
      }
      return res.json(await gmailRes.json());
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch Gmail profile.' });
    }
  });

  // 5. List Gmail labels
  app.get('/api/gmail/labels', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    try {
      const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        headers: { Authorization: `Bearer ${conn.accessToken}` }
      });
      if (listRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!listRes.ok) {
        const details = await listRes.text();
        return res.status(listRes.status).json({ error: 'Failed to list Gmail labels', details });
      }
      const data = await listRes.json();
      return res.json({ labels: data.labels || [] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to list Gmail labels.' });
    }
  });

  // 6. Create custom Gmail label
  app.post('/api/gmail/labels', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Label name is required.' });
    }

    try {
      const createRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: String(name).trim(),
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show'
        })
      });
      if (createRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!createRes.ok) {
        const details = await createRes.text();
        return res.status(createRes.status).json({ error: 'Failed to create Gmail label', details });
      }
      return res.json(await createRes.json());
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to create Gmail label.' });
    }
  });

  // 7. List & search messages with metadata hydration
  app.get('/api/gmail/messages', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    const q = (req.query.q as string) || '';
    const labelId = (req.query.labelId as string) || 'INBOX';
    const pageToken = (req.query.pageToken as string) || '';
    const maxResults = Math.min(Number(req.query.maxResults) || 20, 40);

    try {
      const params = new URLSearchParams({ maxResults: String(maxResults) });
      if (q.trim()) params.append('q', q.trim());
      if (labelId && labelId !== 'ALL') params.append('labelIds', labelId);
      if (pageToken) params.append('pageToken', pageToken);

      const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
        headers: { Authorization: `Bearer ${conn.accessToken}` }
      });
      if (listRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!listRes.ok) {
        const details = await listRes.text();
        return res.status(listRes.status).json({ error: 'Failed to list messages', details });
      }

      const listData = await listRes.json();
      const refs: Array<{ id: string; threadId: string }> = listData.messages || [];

      const messages = await Promise.all(
        refs.map(async (ref) => {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
            { headers: { Authorization: `Bearer ${conn.accessToken}` } }
          );
          if (!msgRes.ok) return null;
          const msg = await msgRes.json();
          const headers = msg.payload?.headers || [];
          const parsed = extractBodyAndAttachments(msg.payload);
          const labels: string[] = msg.labelIds || [];
          return {
            id: msg.id,
            threadId: msg.threadId,
            snippet: msg.snippet || '',
            internalDate: msg.internalDate,
            labelIds: labels,
            isUnread: labels.includes('UNREAD'),
            isStarred: labels.includes('STARRED'),
            from: getHeaderValue(headers, 'From'),
            to: getHeaderValue(headers, 'To'),
            subject: getHeaderValue(headers, 'Subject') || '(No Subject)',
            date: getHeaderValue(headers, 'Date'),
            hasAttachments: parsed.attachments.length > 0
          };
        })
      );

      return res.json({
        messages: messages.filter(Boolean),
        nextPageToken: listData.nextPageToken,
        resultSizeEstimate: listData.resultSizeEstimate || 0
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch Gmail messages.' });
    }
  });

  // 8. Get single full message with decoded body & attachments
  app.get('/api/gmail/messages/:id', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${req.params.id}?format=full`,
        { headers: { Authorization: `Bearer ${conn.accessToken}` } }
      );
      if (msgRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!msgRes.ok) {
        const details = await msgRes.text();
        return res.status(msgRes.status).json({ error: 'Failed to read email message', details });
      }

      const msg = await msgRes.json();
      const headers = msg.payload?.headers || [];
      const { htmlBody, textBody, attachments } = extractBodyAndAttachments(msg.payload);
      const labels: string[] = msg.labelIds || [];

      return res.json({
        id: msg.id,
        threadId: msg.threadId,
        snippet: msg.snippet || '',
        internalDate: msg.internalDate,
        labelIds: labels,
        isUnread: labels.includes('UNREAD'),
        isStarred: labels.includes('STARRED'),
        from: getHeaderValue(headers, 'From'),
        to: getHeaderValue(headers, 'To'),
        cc: getHeaderValue(headers, 'Cc'),
        subject: getHeaderValue(headers, 'Subject') || '(No Subject)',
        date: getHeaderValue(headers, 'Date'),
        messageIdHeader: getHeaderValue(headers, 'Message-ID'),
        referencesHeader: getHeaderValue(headers, 'References'),
        htmlBody,
        textBody,
        attachments
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to read Gmail message.' });
    }
  });

  // 9. Download attachment
  app.get('/api/gmail/messages/:messageId/attachments/:attachmentId', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    const { messageId, attachmentId } = req.params;
    const filename = (req.query.filename as string) || 'attachment';
    const mimeType = (req.query.mimeType as string) || 'application/octet-stream';

    try {
      const attRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
        { headers: { Authorization: `Bearer ${conn.accessToken}` } }
      );
      if (attRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!attRes.ok) {
        const details = await attRes.text();
        return res.status(attRes.status).json({ error: 'Failed to download attachment', details });
      }

      const attData = await attRes.json();
      const buffer = decodeBase64Url(attData.data);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      return res.send(buffer);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to download attachment.' });
    }
  });

  // 10. Send or Reply to Email (only when explicitly authorized by user)
  app.post('/api/gmail/send', gmailAttachmentUpload.array('attachments', 10), async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    const { to, cc, bcc, subject, body, threadId, inReplyTo, references } = req.body;
    if (!to || !String(to).trim() || !subject || !String(subject).trim()) {
      return res.status(400).json({ error: 'Recipient (To) and Subject are required.' });
    }

    try {
      const rawMime = buildRawMimeMessage({
        from: conn.email || undefined,
        to: String(to),
        cc: cc ? String(cc) : undefined,
        bcc: bcc ? String(bcc) : undefined,
        subject: String(subject),
        bodyText: String(body || ''),
        inReplyTo: inReplyTo ? String(inReplyTo) : undefined,
        references: references ? String(references) : undefined,
        attachments: (req.files as Express.Multer.File[]) || []
      });

      const payload: Record<string, string> = {
        raw: encodeBase64Url(rawMime)
      };
      if (threadId && String(threadId).trim()) {
        payload.threadId = String(threadId).trim();
      }

      const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      if (sendRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!sendRes.ok) {
        const details = await sendRes.text();
        return res.status(sendRes.status).json({ error: 'Failed to send email via Gmail', details });
      }

      const sent = await sendRes.json();
      return res.json({ success: true, message: sent });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to send email.' });
    }
  });

  // 11. Modify message labels (read/unread, star, archive, custom labels)
  app.post('/api/gmail/messages/:id/modify', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    const { addLabelIds = [], removeLabelIds = [] } = req.body;
    try {
      const modRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${req.params.id}/modify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${conn.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ addLabelIds, removeLabelIds })
        }
      );
      if (modRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!modRes.ok) {
        const details = await modRes.text();
        return res.status(modRes.status).json({ error: 'Failed to update message labels', details });
      }
      return res.json(await modRes.json());
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to modify message.' });
    }
  });

  // 12. Move message to Trash
  app.post('/api/gmail/messages/:id/trash', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    try {
      const trashRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${req.params.id}/trash`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${conn.accessToken}` }
        }
      );
      if (trashRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!trashRes.ok) {
        const details = await trashRes.text();
        return res.status(trashRes.status).json({ error: 'Failed to move message to trash', details });
      }
      return res.json({ success: true, message: await trashRes.json() });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to trash message.' });
    }
  });

  // 13. Permanently delete message
  app.delete('/api/gmail/messages/:id', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const conn = userGmailConnections.get(user.id);
    if (!conn) return res.status(400).json({ error: 'Gmail is not connected.' });

    try {
      const delRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${req.params.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${conn.accessToken}` }
        }
      );
      if (delRes.status === 401) return handleTokenExpiry(user.id, res);
      if (!delRes.ok) {
        const details = await delRes.text();
        return res.status(delRes.status).json({ error: 'Failed to delete message', details });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to delete message.' });
    }
  });
}
