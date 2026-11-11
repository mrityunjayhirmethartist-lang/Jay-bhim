import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './googleDriveService';
import { apiUrl } from '../utils/api';

// Dedicated Google OAuth Provider requesting only the necessary Gmail permissions
export const gmailProvider = new GoogleAuthProvider();
gmailProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
gmailProvider.addScope('https://www.googleapis.com/auth/gmail.modify');
gmailProvider.addScope('https://www.googleapis.com/auth/gmail.send');
gmailProvider.addScope('https://www.googleapis.com/auth/gmail.labels');

gmailProvider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline'
});

// In-memory token cache (never stored in localStorage/sessionStorage)
let gmailClientAccessToken: string | null = null;
export const getGmailClientToken = () => gmailClientAccessToken;

export interface GmailUser {
  email: string;
  displayName: string;
  photoUrl: string;
  connectedAt?: number;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  labelIds: string[];
  isUnread: boolean;
  isStarred: boolean;
  from: string;
  to: string;
  subject: string;
  date: string;
  hasAttachments: boolean;
}

export interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessageDetail extends GmailMessageSummary {
  cc?: string;
  messageIdHeader?: string;
  referencesHeader?: string;
  htmlBody: string;
  textBody: string;
  attachments: GmailAttachment[];
}

export async function connectGmail(authToken: string): Promise<{
  connected: boolean;
  gmailUser: GmailUser;
}> {
  const result = await signInWithPopup(auth, gmailProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;

  if (!accessToken) {
    throw new Error('Google OAuth succeeded but no Gmail access token was returned.');
  }

  gmailClientAccessToken = accessToken;

  const gmailUser: GmailUser = {
    email: result.user.email || '',
    displayName: result.user.displayName || 'Gmail User',
    photoUrl: result.user.photoURL || ''
  };

  const res = await fetch(apiUrl('/api/gmail/connect'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      accessToken,
      email: gmailUser.email,
      displayName: gmailUser.displayName,
      photoUrl: gmailUser.photoUrl
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to store Gmail session on server.' }));
    throw new Error(err.error || 'Server rejected Gmail connection.');
  }

  return { connected: true, gmailUser };
}

export async function getGmailStatus(authToken: string): Promise<{
  connected: boolean;
  gmailUser?: GmailUser;
}> {
  try {
    const res = await fetch(apiUrl('/api/gmail/status'), {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) return { connected: false };
    return await res.json();
  } catch {
    return { connected: false };
  }
}

export async function disconnectGmail(authToken: string): Promise<boolean> {
  gmailClientAccessToken = null;
  const res = await fetch(apiUrl('/api/gmail/disconnect'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` }
  });
  return res.ok;
}

export async function listGmailLabels(authToken: string): Promise<GmailLabel[]> {
  const res = await fetch(apiUrl('/api/gmail/labels'), {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to load Gmail labels' }));
    throw new Error(err.error || 'Failed to load Gmail labels.');
  }
  const data = await res.json();
  return data.labels || [];
}

export async function createGmailLabel(authToken: string, name: string): Promise<GmailLabel> {
  const res = await fetch(apiUrl('/api/gmail/labels'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create Gmail label' }));
    throw new Error(err.error || 'Failed to create Gmail label.');
  }
  return await res.json();
}

export async function listGmailMessages(
  authToken: string,
  options: { q?: string; labelId?: string; pageToken?: string; maxResults?: number } = {}
): Promise<{ messages: GmailMessageSummary[]; nextPageToken?: string; resultSizeEstimate?: number }> {
  const params = new URLSearchParams();
  if (options.q) params.append('q', options.q);
  if (options.labelId) params.append('labelId', options.labelId);
  if (options.pageToken) params.append('pageToken', options.pageToken);
  if (options.maxResults) params.append('maxResults', String(options.maxResults));

  const res = await fetch(apiUrl(`/api/gmail/messages?${params.toString()}`), {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch emails' }));
    throw new Error(err.error || 'Failed to fetch emails from Gmail.');
  }
  return await res.json();
}

export async function getGmailMessage(authToken: string, messageId: string): Promise<GmailMessageDetail> {
  const res = await fetch(apiUrl(`/api/gmail/messages/${messageId}`), {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to read email' }));
    throw new Error(err.error || 'Failed to read email message.');
  }
  return await res.json();
}

export async function downloadGmailAttachment(
  authToken: string,
  messageId: string,
  attachmentId: string,
  filename: string,
  mimeType: string
): Promise<void> {
  const url = apiUrl(
    `/api/gmail/messages/${messageId}/attachments/${attachmentId}?filename=${encodeURIComponent(filename)}&mimeType=${encodeURIComponent(mimeType)}`
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    throw new Error('Failed to download attachment.');
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

export async function sendGmailMessage(
  authToken: string,
  payload: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: File[];
  }
): Promise<{ success: boolean }> {
  const formData = new FormData();
  formData.append('to', payload.to);
  if (payload.cc) formData.append('cc', payload.cc);
  if (payload.bcc) formData.append('bcc', payload.bcc);
  formData.append('subject', payload.subject);
  formData.append('body', payload.body);
  if (payload.threadId) formData.append('threadId', payload.threadId);
  if (payload.inReplyTo) formData.append('inReplyTo', payload.inReplyTo);
  if (payload.references) formData.append('references', payload.references);
  if (payload.attachments) {
    for (const file of payload.attachments) {
      formData.append('attachments', file);
    }
  }

  const res = await fetch(apiUrl('/api/gmail/send'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to send email' }));
    throw new Error(err.error || 'Failed to send email.');
  }
  return await res.json();
}

export async function modifyGmailMessage(
  authToken: string,
  messageId: string,
  addLabelIds: string[] = [],
  removeLabelIds: string[] = []
): Promise<void> {
  const res = await fetch(apiUrl(`/api/gmail/messages/${messageId}/modify`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ addLabelIds, removeLabelIds })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update labels' }));
    throw new Error(err.error || 'Failed to update email labels.');
  }
}

export async function trashGmailMessage(authToken: string, messageId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/gmail/messages/${messageId}/trash`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to move message to trash' }));
    throw new Error(err.error || 'Failed to move email to trash.');
  }
}

export async function deleteGmailMessage(authToken: string, messageId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/gmail/messages/${messageId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete email' }));
    throw new Error(err.error || 'Failed to delete email permanently.');
  }
}
