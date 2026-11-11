import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import {
  connectGmail,
  getGmailStatus,
  disconnectGmail,
  listGmailLabels,
  createGmailLabel,
  listGmailMessages,
  getGmailMessage,
  downloadGmailAttachment,
  sendGmailMessage,
  modifyGmailMessage,
  trashGmailMessage,
  deleteGmailMessage,
  GmailUser,
  GmailLabel,
  GmailMessageSummary,
  GmailMessageDetail
} from '../../services/gmailService';
import {
  Mail,
  Inbox,
  Star,
  Send,
  FileText,
  Trash2,
  Tag,
  Plus,
  Search,
  RefreshCw,
  Paperclip,
  Download,
  Reply,
  Forward,
  Archive,
  MailOpen,
  X,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  Loader2,
  ShieldCheck,
  FolderOpen
} from 'lucide-react';

interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant: 'danger' | 'primary';
  onConfirm: () => Promise<void>;
}

const SYSTEM_FOLDERS = [
  { id: 'INBOX', label: 'Inbox', icon: Inbox },
  { id: 'STARRED', label: 'Starred', icon: Star },
  { id: 'SENT', label: 'Sent', icon: Send },
  { id: 'DRAFT', label: 'Drafts', icon: FileText },
  { id: 'ALL', label: 'All Mail', icon: FolderOpen },
  { id: 'TRASH', label: 'Trash', icon: Trash2 }
];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSenderName(from: string): string {
  if (!from) return 'Unknown Sender';
  const match = from.match(/^"?([^"<]+)"?\s*</);
  if (match && match[1].trim()) return match[1].trim();
  return from.replace(/<|>/g, '').trim();
}

function formatShortDate(dateStr: string, internalDate?: string): string {
  const d = internalDate ? new Date(Number(internalDate)) : new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr || '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const GmailPage: React.FC = () => {
  const { token } = useAuth();

  const [checkingStatus, setCheckingStatus] = useState(true);
  const [connected, setConnected] = useState(false);
  const [gmailUser, setGmailUser] = useState<GmailUser | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [activeLabel, setActiveLabel] = useState<string>('INBOX');
  const [newLabelName, setNewLabelName] = useState('');
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [showNewLabelInput, setShowNewLabelInput] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedMessage, setSelectedMessage] = useState<GmailMessageDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showLabelMenu, setShowLabelMenu] = useState(false);

  // Compose / Reply modal state
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeThreadId, setComposeThreadId] = useState<string | undefined>(undefined);
  const [composeInReplyTo, setComposeInReplyTo] = useState<string | undefined>(undefined);
  const [composeReferences, setComposeReferences] = useState<string | undefined>(undefined);
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  // Status feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Confirmation modal
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    variant: 'primary',
    onConfirm: async () => {}
  });
  const [confirmBusy, setConfirmBusy] = useState(false);

  const loadLabels = useCallback(async () => {
    if (!token) return;
    try {
      const list = await listGmailLabels(token);
      setLabels(list);
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('expired')) {
        setConnected(false);
        setGmailUser(null);
      }
    }
  }, [token]);

  const loadMessages = useCallback(
    async (labelId: string, q: string, pageToken?: string, append = false) => {
      if (!token) return;
      if (append) setLoadingMore(true);
      else setLoadingMessages(true);
      setErrorMsg(null);

      try {
        const res = await listGmailMessages(token, {
          labelId,
          q: q || undefined,
          pageToken,
          maxResults: 20
        });
        setMessages((prev) => (append ? [...prev, ...res.messages] : res.messages));
        setNextPageToken(res.nextPageToken);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to load emails.');
        if (err.message?.toLowerCase().includes('expired')) {
          setConnected(false);
          setGmailUser(null);
        }
      } finally {
        setLoadingMessages(false);
        setLoadingMore(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    (async () => {
      setCheckingStatus(true);
      const status = await getGmailStatus(token);
      setConnected(status.connected);
      setGmailUser(status.gmailUser || null);
      setCheckingStatus(false);
      if (status.connected) {
        await Promise.all([loadLabels(), loadMessages('INBOX', '')]);
      }
    })();
  }, [token, loadLabels, loadMessages]);

  const handleConnect = async () => {
    if (!token) return;
    setConnecting(true);
    setErrorMsg(null);
    try {
      const res = await connectGmail(token);
      setConnected(res.connected);
      setGmailUser(res.gmailUser);
      setSuccessMsg(`Connected Gmail account: ${res.gmailUser.email}`);
      await Promise.all([loadLabels(), loadMessages('INBOX', '')]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect Gmail.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (!token) return;
    setConfirmDialog({
      open: true,
      title: 'Disconnect Gmail Account?',
      description: `Are you sure you want to disconnect ${gmailUser?.email || 'your Gmail account'} from Rudraatma Music? Your Gmail data will not be affected, and you can reconnect anytime.`,
      confirmLabel: 'Disconnect Gmail',
      variant: 'danger',
      onConfirm: async () => {
        await disconnectGmail(token);
        setConnected(false);
        setGmailUser(null);
        setMessages([]);
        setSelectedMessage(null);
        setLabels([]);
        setSuccessMsg('Gmail account disconnected.');
      }
    });
  };

  const handleSelectFolder = (folderId: string) => {
    setActiveLabel(folderId);
    setSelectedMessage(null);
    loadMessages(folderId, activeSearch);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchInput.trim());
    setSelectedMessage(null);
    loadMessages(activeLabel, searchInput.trim());
  };

  const handleOpenMessage = async (msg: GmailMessageSummary) => {
    if (!token) return;
    setLoadingDetail(true);
    setShowLabelMenu(false);
    setErrorMsg(null);
    try {
      const detail = await getGmailMessage(token, msg.id);
      setSelectedMessage(detail);
      if (msg.isUnread) {
        await modifyGmailMessage(token, msg.id, [], ['UNREAD']);
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, isUnread: false, labelIds: m.labelIds.filter((l) => l !== 'UNREAD') } : m))
        );
        detail.isUnread = false;
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to open email.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleToggleStar = async (e: React.MouseEvent, msg: GmailMessageSummary) => {
    e.stopPropagation();
    if (!token) return;
    try {
      if (msg.isStarred) {
        await modifyGmailMessage(token, msg.id, [], ['STARRED']);
      } else {
        await modifyGmailMessage(token, msg.id, ['STARRED'], []);
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, isStarred: !m.isStarred } : m))
      );
      if (selectedMessage?.id === msg.id) {
        setSelectedMessage({ ...selectedMessage, isStarred: !selectedMessage.isStarred });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update star.');
    }
  };

  const handleToggleRead = async (msg: GmailMessageDetail) => {
    if (!token) return;
    try {
      if (msg.isUnread) {
        await modifyGmailMessage(token, msg.id, [], ['UNREAD']);
      } else {
        await modifyGmailMessage(token, msg.id, ['UNREAD'], []);
      }
      const nextUnread = !msg.isUnread;
      setSelectedMessage({ ...msg, isUnread: nextUnread });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isUnread: nextUnread } : m)));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update read status.');
    }
  };

  const handleArchive = async (msg: GmailMessageDetail) => {
    if (!token) return;
    try {
      await modifyGmailMessage(token, msg.id, [], ['INBOX']);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setSelectedMessage(null);
      setSuccessMsg('Email archived.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to archive email.');
    }
  };

  const handleTrashOrDelete = (msg: GmailMessageDetail) => {
    if (!token) return;
    const isInTrash = msg.labelIds.includes('TRASH');
    setConfirmDialog({
      open: true,
      title: isInTrash ? 'Permanently Delete Email?' : 'Move Email to Trash?',
      description: isInTrash
        ? `This will permanently delete "${msg.subject}" from your Gmail account. This action cannot be undone.`
        : `Move "${msg.subject}" to your Gmail Trash?`,
      confirmLabel: isInTrash ? 'Delete Permanently' : 'Move to Trash',
      variant: 'danger',
      onConfirm: async () => {
        if (isInTrash) {
          await deleteGmailMessage(token, msg.id);
          setSuccessMsg('Email permanently deleted.');
        } else {
          await trashGmailMessage(token, msg.id);
          setSuccessMsg('Email moved to Trash.');
        }
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        setSelectedMessage(null);
      }
    });
  };

  const handleToggleCustomLabel = async (msg: GmailMessageDetail, labelId: string) => {
    if (!token) return;
    const hasLabel = msg.labelIds.includes(labelId);
    try {
      if (hasLabel) {
        await modifyGmailMessage(token, msg.id, [], [labelId]);
      } else {
        await modifyGmailMessage(token, msg.id, [labelId], []);
      }
      const nextLabels = hasLabel
        ? msg.labelIds.filter((id) => id !== labelId)
        : [...msg.labelIds, labelId];
      setSelectedMessage({ ...msg, labelIds: nextLabels });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, labelIds: nextLabels } : m)));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update label.');
    }
  };

  const handleCreateLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newLabelName.trim()) return;
    setCreatingLabel(true);
    try {
      const created = await createGmailLabel(token, newLabelName.trim());
      setLabels((prev) => [...prev, created]);
      setNewLabelName('');
      setShowNewLabelInput(false);
      setSuccessMsg(`Created label "${created.name}".`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create label.');
    } finally {
      setCreatingLabel(false);
    }
  };

  const openComposeNew = () => {
    setComposeTo('');
    setComposeCc('');
    setComposeSubject('');
    setComposeBody('');
    setComposeThreadId(undefined);
    setComposeInReplyTo(undefined);
    setComposeReferences(undefined);
    setComposeFiles([]);
    setComposeOpen(true);
  };

  const openReply = (msg: GmailMessageDetail) => {
    setComposeTo(msg.from);
    setComposeCc('');
    setComposeSubject(msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`);
    setComposeBody(`\n\n--- On ${msg.date}, ${msg.from} wrote: ---\n${msg.textBody || msg.snippet}`);
    setComposeThreadId(msg.threadId);
    setComposeInReplyTo(msg.messageIdHeader);
    setComposeReferences(msg.referencesHeader ? `${msg.referencesHeader} ${msg.messageIdHeader || ''}`.trim() : msg.messageIdHeader);
    setComposeFiles([]);
    setComposeOpen(true);
  };

  const openForward = (msg: GmailMessageDetail) => {
    setComposeTo('');
    setComposeCc('');
    setComposeSubject(msg.subject.startsWith('Fwd:') ? msg.subject : `Fwd: ${msg.subject}`);
    setComposeBody(`\n\n---------- Forwarded message ---------\nFrom: ${msg.from}\nDate: ${msg.date}\nSubject: ${msg.subject}\n\n${msg.textBody || msg.snippet}`);
    setComposeThreadId(undefined);
    setComposeInReplyTo(undefined);
    setComposeReferences(undefined);
    setComposeFiles([]);
    setComposeOpen(true);
  };

  const handleSendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !composeTo.trim() || !composeSubject.trim()) {
      setErrorMsg('Recipient (To) and Subject are required.');
      return;
    }

    setConfirmDialog({
      open: true,
      title: 'Confirm Sending Email',
      description: `Send this email from your personal Gmail account (${gmailUser?.email || 'connected account'}) to ${composeTo.trim()} with subject "${composeSubject.trim()}"?`,
      confirmLabel: 'Confirm & Send Email',
      variant: 'primary',
      onConfirm: async () => {
        setSending(true);
        try {
          await sendGmailMessage(token, {
            to: composeTo.trim(),
            cc: composeCc.trim() || undefined,
            subject: composeSubject.trim(),
            body: composeBody,
            threadId: composeThreadId,
            inReplyTo: composeInReplyTo,
            references: composeReferences,
            attachments: composeFiles
          });
          setComposeOpen(false);
          setSuccessMsg(`Email sent to ${composeTo.trim()} via your Gmail account.`);
          if (activeLabel === 'SENT') {
            loadMessages('SENT', activeSearch);
          }
        } finally {
          setSending(false);
        }
      }
    });
  };

  const executeConfirm = async () => {
    setConfirmBusy(true);
    setErrorMsg(null);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog((prev) => ({ ...prev, open: false }));
    } catch (err: any) {
      setErrorMsg(err.message || 'Action failed.');
    } finally {
      setConfirmBusy(false);
    }
  };

  const userLabels = labels.filter((l) => l.type === 'user');
  const labelMap = new Map(labels.map((l) => [l.id, l.name]));

  return (
    <DashboardLayout title="Gmail Workspace">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <Mail className="w-6 h-6 text-blue-400" />
              <span>Gmail Management</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Manage your personal artist inbox, labels, attachments, and replies via Google OAuth 2.0.
            </p>
          </div>

          {connected && gmailUser && (
            <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-xl px-3.5 py-2">
              {gmailUser.photoUrl ? (
                <img src={gmailUser.photoUrl} alt={gmailUser.displayName} className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                  {gmailUser.email.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="text-xs">
                <div className="text-white font-medium">{gmailUser.displayName}</div>
                <div className="text-slate-400 font-mono text-[11px]">{gmailUser.email}</div>
              </div>
              <button
                onClick={handleDisconnect}
                className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/60 rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          )}
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/70 text-xs text-rose-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-rose-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/70 text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-300 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Loading State */}
        {checkingStatus ? (
          <div className="bg-[#0b1120] border border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            <span className="text-xs text-slate-400 font-mono">Checking Gmail authorization status...</span>
          </div>
        ) : !connected ? (
          /* Disconnected / Connect Card */
          <div className="bg-[#0b1120] border border-slate-800 rounded-2xl p-8 sm:p-12 max-w-2xl mx-auto text-center space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center mx-auto">
              <Mail className="w-7 h-7 text-blue-400" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Connect Your Personal Gmail</h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                Authorize Rudraatma Music Distribution to display your Gmail inbox, organize labels, download attachments, and send replies when you explicitly confirm.
              </p>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 text-left text-xs text-slate-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Privacy & Account Separation</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Your personal Gmail connection is isolated to your workspace session and stored securely on the backend. Official Rudraatma transactional emails (<span className="font-mono text-slate-300">rudraatmamusic@gmail.com</span>) remain completely separate, and no email is ever sent from your account without your explicit confirmation.
              </p>
            </div>

            {/* Official Google Sign-In Button */}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="inline-flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-100 text-[#1f1f1f] font-medium text-sm rounded-lg border border-[#747775] shadow-sm transition-all disabled:opacity-60"
              >
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 block">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                <span>{connecting ? 'Connecting Gmail...' : 'Sign in with Google'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Connected Email Management Workspace */
          <div className="bg-[#0b1120] border border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
            {/* Left Sidebar: Compose + Folders + Labels */}
            <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 flex flex-col gap-4 bg-[#080d1a]">
              <button
                onClick={openComposeNew}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Compose Email</span>
              </button>

              <div className="space-y-1">
                {SYSTEM_FOLDERS.map((folder) => {
                  const Icon = folder.icon;
                  const active = activeLabel === folder.id;
                  return (
                    <button
                      key={folder.id}
                      onClick={() => handleSelectFolder(folder.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{folder.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Labels */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Labels</span>
                  <button
                    onClick={() => setShowNewLabelInput(!showNewLabelInput)}
                    className="text-slate-400 hover:text-white p-1 rounded"
                    title="Create new label"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {showNewLabelInput && (
                  <form onSubmit={handleCreateLabel} className="flex gap-1.5">
                    <input
                      type="text"
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      placeholder="Label name..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={creatingLabel}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg"
                    >
                      Add
                    </button>
                  </form>
                )}

                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {userLabels.length === 0 ? (
                    <p className="text-[11px] text-slate-500 px-2 py-1">No custom labels yet.</p>
                  ) : (
                    userLabels.map((lbl) => (
                      <button
                        key={lbl.id}
                        onClick={() => handleSelectFolder(lbl.id)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                          activeLabel === lbl.id
                            ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30'
                            : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        <Tag className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{lbl.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Area: Search Bar + Message List / Reading Pane */}
            <div className="lg:col-span-9 flex flex-col">
              {/* Search Toolbar */}
              <form
                onSubmit={handleSearchSubmit}
                className="p-3.5 border-b border-slate-800 flex items-center gap-2.5 bg-[#090e1a]"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search mail (e.g. from:spotify, label, subject, has:attachment)..."
                    className="w-full pl-9 pr-8 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        setActiveSearch('');
                        loadMessages(activeLabel, '');
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded-lg transition-colors"
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => loadMessages(activeLabel, activeSearch)}
                  className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} />
                </button>
              </form>

              {/* Split Content: Message List + Reading Pane */}
              <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 min-h-[540px]">
                {/* Message List */}
                <div
                  className={`${
                    selectedMessage ? 'hidden xl:block xl:col-span-5 border-r border-slate-800' : 'xl:col-span-12'
                  } overflow-y-auto max-h-[600px] divide-y divide-slate-800/70`}
                >
                  {loadingMessages ? (
                    <div className="p-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                      <span>Loading emails...</span>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400">
                      No emails found in this view.
                    </div>
                  ) : (
                    <>
                      {messages.map((msg) => {
                        const isSelected = selectedMessage?.id === msg.id;
                        return (
                          <div
                            key={msg.id}
                            onClick={() => handleOpenMessage(msg)}
                            className={`p-3.5 cursor-pointer transition-colors flex items-start gap-3 ${
                              isSelected
                                ? 'bg-blue-600/15'
                                : msg.isUnread
                                ? 'bg-slate-900/60 hover:bg-slate-800/60'
                                : 'hover:bg-slate-900/40'
                            }`}
                          >
                            <button
                              onClick={(e) => handleToggleStar(e, msg)}
                              className="mt-0.5 text-slate-500 hover:text-amber-400 shrink-0"
                              title={msg.isStarred ? 'Unstar' : 'Star'}
                            >
                              <Star
                                className={`w-4 h-4 ${msg.isStarred ? 'fill-amber-400 text-amber-400' : ''}`}
                              />
                            </button>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-xs truncate ${
                                    msg.isUnread ? 'font-bold text-white' : 'font-medium text-slate-300'
                                  }`}
                                >
                                  {formatSenderName(msg.from)}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {msg.hasAttachments && <Paperclip className="w-3 h-3 text-slate-400" />}
                                  <span className="text-[11px] font-mono text-slate-400">
                                    {formatShortDate(msg.date, msg.internalDate)}
                                  </span>
                                </div>
                              </div>
                              <div
                                className={`text-xs truncate mt-0.5 ${
                                  msg.isUnread ? 'font-semibold text-blue-300' : 'text-slate-200'
                                }`}
                              >
                                {msg.subject}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate mt-0.5">{msg.snippet}</div>
                            </div>
                          </div>
                        );
                      })}

                      {nextPageToken && (
                        <div className="p-3 text-center">
                          <button
                            onClick={() => loadMessages(activeLabel, activeSearch, nextPageToken, true)}
                            disabled={loadingMore}
                            className="px-4 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
                          >
                            {loadingMore ? 'Loading...' : 'Load More Emails'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Reading Pane */}
                {selectedMessage && (
                  <div className="xl:col-span-7 flex flex-col max-h-[600px] overflow-y-auto bg-[#070b14]">
                    {loadingDetail ? (
                      <div className="p-12 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                      </div>
                    ) : (
                      <div className="p-5 space-y-5">
                        {/* Top Action Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                          <button
                            onClick={() => setSelectedMessage(null)}
                            className="xl:hidden px-2.5 py-1.5 text-xs bg-slate-800 text-white rounded-lg"
                          >
                            Back to List
                          </button>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={() => openReply(selectedMessage)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                            >
                              <Reply className="w-3.5 h-3.5" />
                              <span>Reply</span>
                            </button>
                            <button
                              onClick={() => openForward(selectedMessage)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg"
                            >
                              <Forward className="w-3.5 h-3.5" />
                              <span>Forward</span>
                            </button>
                            <button
                              onClick={() => handleToggleRead(selectedMessage)}
                              className="p-1.5 text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg"
                              title={selectedMessage.isUnread ? 'Mark as Read' : 'Mark as Unread'}
                            >
                              <MailOpen className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleArchive(selectedMessage)}
                              className="p-1.5 text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg"
                              title="Archive"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            <div className="relative">
                              <button
                                onClick={() => setShowLabelMenu(!showLabelMenu)}
                                className="p-1.5 text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg"
                                title="Organize Labels"
                              >
                                <Tag className="w-4 h-4" />
                              </button>
                              {showLabelMenu && (
                                <div className="absolute right-0 mt-1.5 w-48 bg-[#0b1120] border border-slate-700 rounded-xl shadow-2xl p-2 z-20 space-y-1">
                                  <div className="text-[10px] font-mono uppercase text-slate-400 px-2 py-1">
                                    Apply Labels
                                  </div>
                                  {userLabels.length === 0 ? (
                                    <div className="text-xs text-slate-500 px-2 py-1">No custom labels</div>
                                  ) : (
                                    userLabels.map((lbl) => {
                                      const checked = selectedMessage.labelIds.includes(lbl.id);
                                      return (
                                        <button
                                          key={lbl.id}
                                          onClick={() => handleToggleCustomLabel(selectedMessage, lbl.id)}
                                          className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 rounded-lg"
                                        >
                                          <span className="truncate">{lbl.name}</span>
                                          {checked && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => handleTrashOrDelete(selectedMessage)}
                              className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-950/30 border border-rose-900/60 rounded-lg"
                              title={selectedMessage.labelIds.includes('TRASH') ? 'Delete Permanently' : 'Move to Trash'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Subject & Headers */}
                        <div className="space-y-2">
                          <h2 className="text-lg font-bold text-white leading-snug">{selectedMessage.subject}</h2>

                          <div className="flex flex-wrap gap-1.5">
                            {selectedMessage.labelIds
                              .filter((id) => labelMap.has(id))
                              .map((id) => (
                                <span
                                  key={id}
                                  className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700"
                                >
                                  {labelMap.get(id)}
                                </span>
                              ))}
                          </div>

                          <div className="text-xs text-slate-400 space-y-1 pt-1">
                            <div>
                              <span className="text-slate-500">From:</span>{' '}
                              <span className="text-slate-200 font-medium">{selectedMessage.from}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">To:</span>{' '}
                              <span className="text-slate-300">{selectedMessage.to}</span>
                            </div>
                            {selectedMessage.cc && (
                              <div>
                                <span className="text-slate-500">Cc:</span>{' '}
                                <span className="text-slate-300">{selectedMessage.cc}</span>
                              </div>
                            )}
                            <div>
                              <span className="text-slate-500">Date:</span>{' '}
                              <span className="text-slate-300">{selectedMessage.date}</span>
                            </div>
                          </div>
                        </div>

                        {/* Attachments */}
                        {selectedMessage.attachments.length > 0 && (
                          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
                            <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                              <Paperclip className="w-3.5 h-3.5 text-blue-400" />
                              <span>Attachments ({selectedMessage.attachments.length})</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {selectedMessage.attachments.map((att) => (
                                <button
                                  key={att.attachmentId}
                                  onClick={() =>
                                    token &&
                                    downloadGmailAttachment(
                                      token,
                                      selectedMessage.id,
                                      att.attachmentId,
                                      att.filename,
                                      att.mimeType
                                    )
                                  }
                                  className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0b1120] border border-slate-800 hover:border-blue-500/50 text-left transition-colors"
                                >
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-white truncate">{att.filename}</div>
                                    <div className="text-[10px] font-mono text-slate-400">{formatBytes(att.size)}</div>
                                  </div>
                                  <Download className="w-4 h-4 text-blue-400 shrink-0" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Message Body */}
                        <div className="bg-white text-slate-900 rounded-xl p-5 text-sm overflow-x-auto leading-relaxed">
                          {selectedMessage.htmlBody ? (
                            <iframe
                              title="Email Body"
                              sandbox=""
                              srcDoc={selectedMessage.htmlBody}
                              className="w-full min-h-[320px] border-0 bg-white"
                            />
                          ) : (
                            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">
                              {selectedMessage.textBody || selectedMessage.snippet}
                            </pre>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Compose / Reply Modal */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1120] border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#080d1a]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400" />
                <span>{composeThreadId ? 'Reply via Gmail' : 'New Gmail Message'}</span>
              </h3>
              <button onClick={() => setComposeOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendSubmit} className="p-5 space-y-3.5">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">To *</label>
                <input
                  type="text"
                  required
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">Cc</label>
                <input
                  type="text"
                  value={composeCc}
                  onChange={(e) => setComposeCc(e.target.value)}
                  placeholder="Optional Cc addresses"
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">Subject *</label>
                <input
                  type="text"
                  required
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Email subject"
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">Message</label>
                <textarea
                  rows={8}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your message..."
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 cursor-pointer">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attach Files</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setComposeFiles((prev) => [...prev, ...files]);
                    }}
                  />
                </label>

                {composeFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {composeFiles.map((file, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-slate-800 text-slate-200 rounded-lg"
                      >
                        <span className="truncate max-w-[160px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setComposeFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setComposeOpen(false)}
                  className="px-4 py-2 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Review & Send</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Explicit User Confirmation Modal */}
      {confirmDialog.open && (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1120] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">{confirmDialog.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{confirmDialog.description}</p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
                className="px-4 py-2 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={executeConfirm}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg ${
                  confirmDialog.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {confirmBusy ? 'Processing...' : confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};
