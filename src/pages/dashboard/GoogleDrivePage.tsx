import React, { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import {
  connectGoogleDrive,
  getDriveStatus,
  disconnectDrive,
  getDriveAbout,
  listDriveFiles,
  createDriveFolder,
  renameDriveItem,
  deleteDriveItem,
  uploadDriveFileWithProgress,
  DriveUser,
  DriveFileItem,
  DriveStorageQuota
} from '../../services/googleDriveService';
import {
  HardDrive,
  UploadCloud,
  FolderPlus,
  RefreshCw,
  Search,
  Folder,
  Music,
  Image as ImageIcon,
  FileText,
  File,
  Download,
  Trash2,
  Edit3,
  Play,
  Pause,
  X,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Grid,
  List,
  ExternalLink,
  ShieldCheck,
  LogOut,
  Layers,
  ArrowUpDown,
  Volume2
} from 'lucide-react';

interface BreadcrumbItem {
  id: string;
  name: string;
}

export const GoogleDrivePage: React.FC = () => {
  const { token } = useAuth();

  // Connection state
  const [connecting, setConnecting] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [connected, setConnected] = useState<boolean>(false);
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [quota, setQuota] = useState<DriveStorageQuota | null>(null);

  // Files & folders state
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'root', name: 'My Drive' }
  ]);

  // Filtering & search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'audio' | 'images' | 'documents' | 'folders'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Modals state
  const [newFolderModalOpen, setNewFolderModalOpen] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [folderActionLoading, setFolderActionLoading] = useState<boolean>(false);

  const [renameModalOpen, setRenameModalOpen] = useState<boolean>(false);
  const [itemToRename, setItemToRename] = useState<DriveFileItem | null>(null);
  const [newItemName, setNewItemName] = useState<string>('');
  const [renameLoading, setRenameLoading] = useState<boolean>(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [itemToDelete, setItemToDelete] = useState<DriveFileItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  // Upload state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string>('');
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio Player Preview state
  const [activeAudioItem, setActiveAudioItem] = useState<DriveFileItem | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Artwork Lightbox Modal state
  const [previewImage, setPreviewImage] = useState<DriveFileItem | null>(null);

  // Notifications / Alert messages
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Initial load: check backend connection status
  useEffect(() => {
    if (!token) return;

    const checkStatus = async () => {
      setLoading(true);
      try {
        const status = await getDriveStatus(token);
        if (status.connected) {
          setConnected(true);
          if (status.driveUser) setDriveUser(status.driveUser);
          await fetchAboutAndFiles('root');
        } else {
          setConnected(false);
        }
      } catch (err: any) {
        console.error('Check Drive status failed', err);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [token]);

  // Fetch storage and files
  const fetchAboutAndFiles = async (folderId: string = currentFolder) => {
    if (!token) return;
    setLoadingFiles(true);
    try {
      // 1. Storage quota
      try {
        const aboutData = await getDriveAbout(token);
        if (aboutData.storageQuota) setQuota(aboutData.storageQuota);
        if (aboutData.user && !driveUser?.displayName) {
          setDriveUser({
            email: aboutData.user.emailAddress || '',
            displayName: aboutData.user.displayName || 'Google Drive User',
            photoUrl: aboutData.user.photoLink || ''
          });
        }
      } catch (aboutErr) {
        console.warn('Storage quota query error:', aboutErr);
      }

      // 2. Files list
      const res = await listDriveFiles(token, {
        folderId: searchQuery ? undefined : folderId,
        search: searchQuery || undefined,
        category: selectedCategory
      });
      setFiles(res.files || []);
    } catch (err: any) {
      if (err.message && err.message.includes('TOKEN_EXPIRED')) {
        setConnected(false);
        showToast('error', 'Google Drive authorization expired. Please reconnect your account.');
      } else {
        showToast('error', err.message || 'Failed to fetch files from Google Drive.');
      }
    } finally {
      setLoadingFiles(false);
    }
  };

  // Trigger search or filter refresh
  useEffect(() => {
    if (connected && token) {
      fetchAboutAndFiles(currentFolder);
    }
  }, [selectedCategory, searchQuery, currentFolder]);

  // Handle Connect with OAuth 2.0
  const handleConnect = async () => {
    if (!token) return;
    setConnecting(true);
    try {
      const res = await connectGoogleDrive(token);
      setConnected(true);
      setDriveUser(res.driveUser);
      showToast('success', 'Google Drive successfully connected!');
      await fetchAboutAndFiles('root');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to connect Google Drive.');
    } finally {
      setConnecting(false);
    }
  };

  // Handle Disconnect
  const handleDisconnect = async () => {
    if (!token) return;
    if (confirm('Disconnect Google Drive from Rudraatma Music? Your files in Drive will remain safe.')) {
      await disconnectDrive(token);
      setConnected(false);
      setDriveUser(null);
      setFiles([]);
      setQuota(null);
      showToast('info', 'Google Drive disconnected from your session.');
    }
  };

  // Navigate folder
  const handleFolderClick = (folder: DriveFileItem) => {
    setCurrentFolder(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery('');
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = breadcrumbs[index];
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    setCurrentFolder(target.id);
    setSearchQuery('');
  };

  // Create Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newFolderName.trim()) return;
    setFolderActionLoading(true);
    try {
      await createDriveFolder(token, newFolderName.trim(), currentFolder);
      setNewFolderModalOpen(false);
      setNewFolderName('');
      showToast('success', `Folder "${newFolderName.trim()}" created successfully!`);
      await fetchAboutAndFiles(currentFolder);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to create folder.');
    } finally {
      setFolderActionLoading(false);
    }
  };

  // Rename File / Folder
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !itemToRename || !newItemName.trim()) return;
    setRenameLoading(true);
    try {
      await renameDriveItem(token, itemToRename.id, newItemName.trim());
      setRenameModalOpen(false);
      showToast('success', `Item renamed to "${newItemName.trim()}" successfully!`);
      await fetchAboutAndFiles(currentFolder);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to rename item.');
    } finally {
      setRenameLoading(false);
      setItemToRename(null);
    }
  };

  // Delete Item with Confirmation
  const handleDelete = async () => {
    if (!token || !itemToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteDriveItem(token, itemToDelete.id);
      setDeleteModalOpen(false);
      showToast('success', `"${itemToDelete.name}" deleted from Google Drive.`);
      if (activeAudioItem?.id === itemToDelete.id) {
        setActiveAudioItem(null);
      }
      await fetchAboutAndFiles(currentFolder);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to delete item.');
    } finally {
      setDeleteLoading(false);
      setItemToDelete(null);
    }
  };

  // File Upload with real-time progress
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile || !token) return;

    setUploadFileName(uploadedFile.name);
    setUploadProgress(0);
    setUploadStatusText('Uploading to Google Drive...');

    try {
      await uploadDriveFileWithProgress(token, uploadedFile, currentFolder, (percent) => {
        setUploadProgress(percent);
        if (percent >= 100) {
          setUploadStatusText('Saving and finalizing in your Drive...');
        }
      });
      showToast('success', `File "${uploadedFile.name}" uploaded successfully!`);
      await fetchAboutAndFiles(currentFolder);
    } catch (err: any) {
      showToast('error', err.message || 'File upload to Google Drive failed.');
    } finally {
      setTimeout(() => {
        setUploadProgress(null);
        setUploadFileName('');
        setUploadStatusText('');
      }, 1500);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Audio Playback
  const handlePlayAudio = (file: DriveFileItem) => {
    if (activeAudioItem?.id === file.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
    } else {
      setActiveAudioItem(file);
      setIsPlaying(true);
    }
  };

  // Helper: Format bytes
  const formatBytes = (bytesStr?: string | number) => {
    if (!bytesStr) return '0 B';
    const bytes = typeof bytesStr === 'string' ? parseInt(bytesStr, 10) : bytesStr;
    if (isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Helper: Check file type
  const isAudioFile = (file: DriveFileItem) => {
    return (
      file.mimeType.startsWith('audio/') ||
      file.name.endsWith('.wav') ||
      file.name.endsWith('.mp3') ||
      file.name.endsWith('.flac') ||
      file.name.endsWith('.m4a') ||
      file.name.endsWith('.aiff')
    );
  };

  const isImageFile = (file: DriveFileItem) => {
    return (
      file.mimeType.startsWith('image/') ||
      file.name.endsWith('.jpg') ||
      file.name.endsWith('.jpeg') ||
      file.name.endsWith('.png') ||
      file.name.endsWith('.webp')
    );
  };

  const isFolder = (file: DriveFileItem) => {
    return file.mimeType === 'application/vnd.google-apps.folder';
  };

  // Quota percentage
  const totalLimit = quota?.limit ? parseInt(quota.limit, 10) : 0;
  const usedAmount = quota?.usage ? parseInt(quota.usage, 10) : 0;
  const usedPercent = totalLimit > 0 ? Math.min(100, Math.round((usedAmount / totalLimit) * 100)) : 0;

  return (
    <DashboardLayout title="Google Drive Cloud Storage">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl animate-in slide-in-from-bottom-5 duration-200 text-xs font-medium ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/50 text-rose-200'
              : 'bg-blue-950/95 border-blue-500/50 text-blue-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toastMessage.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 hover:opacity-80 p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="space-y-6">
        {/* Top Header Card */}
        <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-6 sm:p-7 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold mb-3">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Google Drive Workspace Integration</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Artist Cloud Storage
              </h1>
              <p className="text-sm text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
                Connect your Google Drive using official Google OAuth 2.0 to securely store uncompressed WAV stems, high-resolution 3000×3000 cover artwork, release lyric sheets, and legal agreements.
              </p>
            </div>

            {/* Connection Actions */}
            <div>
              {loading ? (
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  Checking connection...
                </div>
              ) : connected ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3 bg-[#080d1a] border border-slate-800 px-3.5 py-2 rounded-xl">
                    {driveUser?.photoUrl ? (
                      <img
                        src={driveUser.photoUrl}
                        alt="Drive User"
                        className="w-8 h-8 rounded-full border border-blue-500/40"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center text-xs">
                        {driveUser?.displayName?.charAt(0) || 'G'}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <span>{driveUser?.displayName || 'Google Account'}</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {driveUser?.email || 'Connected via OAuth 2.0'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchAboutAndFiles(currentFolder)}
                      disabled={loadingFiles}
                      className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                      title="Refresh files"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingFiles ? 'animate-spin text-blue-400' : ''}`} />
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-800/40 rounded-xl transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                  <span>{connecting ? 'Connecting...' : 'Connect Google Drive'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Storage Quota Bar (When connected) */}
          {connected && quota && (
            <div className="mt-6 pt-6 border-t border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2 mb-2 font-mono">
                <span className="text-slate-300 font-sans font-semibold">
                  Storage Allocation: <span className="text-blue-400">{formatBytes(quota.usage)}</span> used of{' '}
                  <span className="text-white">{quota.limit ? formatBytes(quota.limit) : 'Unlimited'}</span>
                </span>
                <span className="text-slate-400">{usedPercent}% Capacity</span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    usedPercent > 85 ? 'bg-rose-500' : usedPercent > 70 ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Not Connected State Card */}
        {!connected && !loading && (
          <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto my-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 mx-auto flex items-center justify-center mb-5">
              <HardDrive className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
              Sync Your Master Music Catalog
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
              Connect your Google Drive account with full privacy. Each artist's files remain 100% private in their own Google account. Tokens are securely encrypted and verified per session.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-lg mx-auto mb-8">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <Music className="w-4 h-4 text-blue-400 mb-1" />
                <div className="font-semibold text-white">Audio Masters</div>
                <div className="text-slate-400 text-[11px]">WAV, MP3, FLAC stems</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <ImageIcon className="w-4 h-4 text-amber-400 mb-1" />
                <div className="font-semibold text-white">Cover Artwork</div>
                <div className="text-slate-400 text-[11px]">3000×3000 JPG/PNG</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <FileText className="w-4 h-4 text-emerald-400 mb-1" />
                <div className="font-semibold text-white">Legal & Lyrics</div>
                <div className="text-slate-400 text-[11px]">Agreements & metadata</div>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-xl shadow-blue-600/25 transition-all hover:scale-[1.02]"
            >
              <HardDrive className="w-4 h-4" />
              <span>{connecting ? 'Authorizing in popup...' : 'Connect with Google Drive'}</span>
            </button>
          </div>
        )}

        {/* Connected Dashboard View */}
        {connected && (
          <div className="space-y-4">
            {/* Action Bar: Breadcrumbs, Upload, New Folder, Search, Filters */}
            <div className="bg-[#090e1a] border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
              {/* Top Row: Breadcrumbs & Primary Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1.5 text-xs text-slate-400 overflow-x-auto py-1">
                  {breadcrumbs.map((item, idx) => (
                    <React.Fragment key={item.id}>
                      {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                      <button
                        onClick={() => handleBreadcrumbClick(idx)}
                        className={`hover:text-blue-400 transition-colors whitespace-nowrap font-medium px-1.5 py-0.5 rounded ${
                          idx === breadcrumbs.length - 1 ? 'text-white font-bold bg-slate-800/60' : 'text-slate-400'
                        }`}
                      >
                        {item.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept="audio/*,image/*,.pdf,.doc,.docx,.txt"
                  />

                  {/* Upload File Button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadProgress !== null}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors shadow-sm disabled:opacity-50"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload File</span>
                  </button>

                  {/* New Folder Button */}
                  <button
                    onClick={() => setNewFolderModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                  >
                    <FolderPlus className="w-4 h-4 text-amber-400" />
                    <span>New Folder</span>
                  </button>

                  {/* View Mode Switcher */}
                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-white'}`}
                      title="Grid View"
                    >
                      <Grid className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-white'}`}
                      title="List View"
                    >
                      <List className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Upload Progress Banner (Real-time XHR progress) */}
              {uploadProgress !== null && (
                <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-800/60 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-blue-200 truncate max-w-sm">
                      {uploadStatusText || `Uploading "${uploadFileName}"...`}
                    </span>
                    <span className="font-mono font-bold text-blue-400">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Bottom Row: Search & Category Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/70">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search music, stems, artwork, contracts..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === 'all'
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
                    }`}
                  >
                    All Items
                  </button>
                  <button
                    onClick={() => setSelectedCategory('audio')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === 'audio'
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                        : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
                    }`}
                  >
                    <Music className="w-3 h-3 text-blue-400" />
                    <span>Music & Audio</span>
                  </button>
                  <button
                    onClick={() => setSelectedCategory('images')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === 'images'
                        ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                        : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
                    }`}
                  >
                    <ImageIcon className="w-3 h-3 text-amber-400" />
                    <span>Artwork</span>
                  </button>
                  <button
                    onClick={() => setSelectedCategory('documents')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === 'documents'
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
                    }`}
                  >
                    <FileText className="w-3 h-3 text-emerald-400" />
                    <span>Documents</span>
                  </button>
                  <button
                    onClick={() => setSelectedCategory('folders')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === 'folders'
                        ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                        : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
                    }`}
                  >
                    <Folder className="w-3 h-3 text-purple-400" />
                    <span>Folders</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Audio Stream Player Bar (If an audio track is selected) */}
            {activeAudioItem && (
              <div className="bg-[#0b1329] border border-blue-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl animate-in slide-in-from-top-3 duration-200">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                    <Music className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate max-w-xs sm:max-w-md">
                      {activeAudioItem.name}
                    </div>
                    <div className="text-[11px] font-mono text-blue-400">
                      Drive Stream Preview · {formatBytes(activeAudioItem.size)}
                    </div>
                  </div>
                </div>

                {/* Audio Element & Controls */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  <audio
                    ref={audioRef}
                    src={`/api/drive/files/${activeAudioItem.id}/stream`}
                    controls
                    autoPlay
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    className="h-8 max-w-xs"
                  />
                  <button
                    onClick={() => setActiveAudioItem(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Close Player"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Files Grid / List View */}
            {loadingFiles ? (
              <div className="py-20 text-center">
                <RefreshCw className="w-7 h-7 animate-spin text-blue-400 mx-auto mb-3" />
                <div className="text-xs font-mono text-slate-400">Loading Google Drive catalog...</div>
              </div>
            ) : files.length === 0 ? (
              <div className="bg-[#090e1a] border border-slate-800 rounded-2xl p-12 text-center">
                <Folder className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">
                  {searchQuery ? 'No matching files found' : 'This folder is empty'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
                  {searchQuery
                    ? `No Drive files matched "${searchQuery}". Try a different keyword or change category.`
                    : 'Upload high-resolution master tracks, cover art or create subfolders for your release releases.'}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload to this folder</span>
                  </button>
                  <button
                    onClick={() => setNewFolderModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Create Folder</span>
                  </button>
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              /* GRID VIEW */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {files.map((file) => {
                  const folder = isFolder(file);
                  const audio = isAudioFile(file);
                  const img = isImageFile(file);

                  return (
                    <div
                      key={file.id}
                      className="group bg-[#090e1a] hover:bg-[#0c1426] border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all duration-150 flex flex-col justify-between"
                    >
                      {/* Top icon & Actions */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          {/* Item Icon */}
                          <div
                            onClick={() => (folder ? handleFolderClick(file) : img ? setPreviewImage(file) : audio ? handlePlayAudio(file) : null)}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                              folder
                                ? 'bg-amber-500/10 text-amber-400'
                                : audio
                                ? 'bg-blue-500/10 text-blue-400'
                                : img
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {folder ? (
                              <Folder className="w-5 h-5 fill-current" />
                            ) : audio ? (
                              <Music className="w-5 h-5" />
                            ) : img ? (
                              <ImageIcon className="w-5 h-5" />
                            ) : (
                              <File className="w-5 h-5" />
                            )}
                          </div>

                          {/* Quick Actions Drop/Buttons */}
                          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                            {!folder && (
                              <a
                                href={`/api/drive/files/${file.id}/download`}
                                download
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                                title="Download File"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              onClick={() => {
                                setItemToRename(file);
                                setNewItemName(file.name);
                                setRenameModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                              title="Rename"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setItemToDelete(file);
                                setDeleteModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Title & Clickable Name */}
                        <div
                          onClick={() => (folder ? handleFolderClick(file) : img ? setPreviewImage(file) : audio ? handlePlayAudio(file) : null)}
                          className="cursor-pointer"
                        >
                          <h4 className="text-xs font-semibold text-white truncate hover:text-blue-400 transition-colors" title={file.name}>
                            {file.name}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-1">
                            {folder ? (
                              <span className="text-amber-400">Folder</span>
                            ) : (
                              <>
                                <span>{formatBytes(file.size)}</span>
                                {file.modifiedTime && (
                                  <>
                                    <span>·</span>
                                    <span>{new Date(file.modifiedTime).toLocaleDateString()}</span>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bottom contextual action */}
                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        {folder ? (
                          <button
                            onClick={() => handleFolderClick(file)}
                            className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                          >
                            <span>Open Folder</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        ) : audio ? (
                          <button
                            onClick={() => handlePlayAudio(file)}
                            className="inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                          >
                            {activeAudioItem?.id === file.id && isPlaying ? (
                              <>
                                <Pause className="w-3 h-3" />
                                <span>Pause Preview</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3" />
                                <span>Listen Audio</span>
                              </>
                            )}
                          </button>
                        ) : img ? (
                          <button
                            onClick={() => setPreviewImage(file)}
                            className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium"
                          >
                            <span>View Cover Art</span>
                          </button>
                        ) : (
                          <a
                            href={`/api/drive/files/${file.id}/download`}
                            download
                            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white font-medium"
                          >
                            <span>Download</span>
                          </a>
                        )}

                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-200"
                            title="Open in official Google Drive"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* LIST VIEW */
              <div className="bg-[#090e1a] border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-4 hidden sm:table-cell">Type</th>
                      <th className="py-3 px-4 hidden md:table-cell">Size</th>
                      <th className="py-3 px-4 hidden lg:table-cell">Last Modified</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {files.map((file) => {
                      const folder = isFolder(file);
                      const audio = isAudioFile(file);
                      const img = isImageFile(file);

                      return (
                        <tr key={file.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                onClick={() => (folder ? handleFolderClick(file) : img ? setPreviewImage(file) : audio ? handlePlayAudio(file) : null)}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer ${
                                  folder
                                    ? 'bg-amber-500/10 text-amber-400'
                                    : audio
                                    ? 'bg-blue-500/10 text-blue-400'
                                    : img
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {folder ? (
                                  <Folder className="w-4 h-4 fill-current" />
                                ) : audio ? (
                                  <Music className="w-4 h-4" />
                                ) : img ? (
                                  <ImageIcon className="w-4 h-4" />
                                ) : (
                                  <File className="w-4 h-4" />
                                )}
                              </div>
                              <span
                                onClick={() => (folder ? handleFolderClick(file) : img ? setPreviewImage(file) : audio ? handlePlayAudio(file) : null)}
                                className="font-medium text-white truncate max-w-xs sm:max-w-md cursor-pointer hover:text-blue-400"
                                title={file.name}
                              >
                                {file.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-400 hidden sm:table-cell font-mono">
                            {folder ? 'Folder' : audio ? 'Audio Master' : img ? 'Cover Artwork' : 'Document'}
                          </td>
                          <td className="py-3 px-4 text-slate-400 hidden md:table-cell font-mono">
                            {folder ? '—' : formatBytes(file.size)}
                          </td>
                          <td className="py-3 px-4 text-slate-400 hidden lg:table-cell font-mono">
                            {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {audio && (
                                <button
                                  onClick={() => handlePlayAudio(file)}
                                  className="p-1.5 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-950/40"
                                  title="Play Preview"
                                >
                                  {activeAudioItem?.id === file.id && isPlaying ? (
                                    <Pause className="w-4 h-4" />
                                  ) : (
                                    <Play className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                              {!folder && (
                                <a
                                  href={`/api/drive/files/${file.id}/download`}
                                  download
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                                  title="Download File"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setItemToRename(file);
                                  setNewItemName(file.name);
                                  setRenameModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                                title="Rename"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setItemToDelete(file);
                                  setDeleteModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================== MODALS ======================== */}

      {/* 1. Create New Folder Modal */}
      {newFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0b1222] border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Create New Folder</h3>
              </div>
              <button
                onClick={() => setNewFolderModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Folder Name
                </label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Master Stems 2026, Single Release Artwork"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setNewFolderModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={folderActionLoading || !newFolderName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
                >
                  {folderActionLoading ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Rename Item Modal */}
      {renameModalOpen && itemToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0b1222] border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Rename Item</h3>
              </div>
              <button
                onClick={() => setRenameModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRename} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  New Name
                </label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setRenameModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renameLoading || !newItemName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
                >
                  {renameLoading ? 'Renaming...' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Delete Confirmation Modal (Explicit confirmation required) */}
      {deleteModalOpen && itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0b1222] border border-rose-800/60 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="w-9 h-9 rounded-xl bg-rose-950/60 text-rose-400 flex items-center justify-center shrink-0 border border-rose-800/50">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Confirm Permanent Deletion</h3>
                <p className="text-[11px] text-slate-400 font-mono">Google Drive File Operation</p>
              </div>
            </div>

            <div className="my-4 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <div className="text-slate-300 font-semibold truncate mb-1">
                {itemToDelete.name}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {isFolder(itemToDelete) ? 'Folder' : `File · ${formatBytes(itemToDelete.size)}`}
              </div>
            </div>

            <p className="text-xs text-rose-300/90 leading-relaxed mb-5">
              Warning: This action will delete this item permanently from your Google Drive account. This action cannot be reversed.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors shadow-lg shadow-rose-600/30 disabled:opacity-50"
              >
                {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Artwork Lightbox Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative max-w-3xl w-full bg-[#090e1a] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="text-xs font-bold text-white truncate max-w-md">
                {previewImage.name}
              </div>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center bg-black/60 rounded-xl overflow-hidden p-2 min-h-[300px] max-h-[70vh]">
              <img
                src={`/api/drive/files/${previewImage.id}/download`}
                alt={previewImage.name}
                className="max-h-[65vh] object-contain rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800 text-xs">
              <span className="text-slate-400 font-mono">{formatBytes(previewImage.size)}</span>
              <a
                href={`/api/drive/files/${previewImage.id}/download`}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Artwork</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};
