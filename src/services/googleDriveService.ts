import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { apiUrl } from '../utils/api';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Configure Google OAuth Provider for Google Drive
export const driveProvider = new GoogleAuthProvider();

// Add required Google Drive & Sheets Scopes
driveProvider.addScope('https://www.googleapis.com/auth/drive');
driveProvider.addScope('https://www.googleapis.com/auth/drive.file');
driveProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
driveProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
driveProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');

// Enforce consent prompt to obtain active access token
driveProvider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline'
});

export interface DriveUser {
  email: string;
  displayName: string;
  photoUrl: string;
  connectedAt?: number;
}

export interface DriveStorageQuota {
  limit?: string;
  usage?: string;
  usageInDrive?: string;
  usageInDriveTrash?: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
}

export interface DriveAboutResponse {
  user?: {
    displayName?: string;
    emailAddress?: string;
    photoLink?: string;
  };
  storageQuota?: DriveStorageQuota;
}

// In-memory token cache for client requests
let clientAccessToken: string | null = null;
export const getClientAccessToken = () => clientAccessToken;
export const setClientAccessToken = (token: string | null) => {
  clientAccessToken = token;
};

/**
 * Initiates Google OAuth popup and connects Google Drive
 */
export async function connectGoogleDrive(authToken: string): Promise<{
  connected: boolean;
  driveUser: DriveUser;
}> {
  try {
    const result = await signInWithPopup(auth, driveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error('Google OAuth succeeded but no access token was returned.');
    }

    setClientAccessToken(accessToken);

    const driveUser: DriveUser = {
      email: result.user.email || '',
      displayName: result.user.displayName || 'Drive User',
      photoUrl: result.user.photoURL || ''
    };

    // Store token securely on backend associated with user session
    const res = await fetch(apiUrl('/api/drive/connect'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        accessToken,
        email: driveUser.email,
        displayName: driveUser.displayName,
        photoUrl: driveUser.photoUrl
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save Drive session on server' }));
      throw new Error(err.error || 'Server rejected Drive connection.');
    }

    return { connected: true, driveUser };
  } catch (error: any) {
    console.error('Google Drive OAuth connection failed:', error);
    throw error;
  }
}

/**
 * Checks connection status with backend
 */
export async function getDriveStatus(authToken: string): Promise<{
  connected: boolean;
  driveUser?: DriveUser;
}> {
  try {
    const res = await fetch(apiUrl('/api/drive/status'), {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) return { connected: false };
    return await res.json();
  } catch (err) {
    console.error('Failed to get Drive status', err);
    return { connected: false };
  }
}

/**
 * Disconnects Google Drive from account
 */
export async function disconnectDrive(authToken: string): Promise<boolean> {
  try {
    setClientAccessToken(null);
    await fbSignOut(auth).catch(() => {});
    const res = await fetch(apiUrl('/api/drive/disconnect'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to disconnect Drive', err);
    return false;
  }
}

/**
 * Fetches Google Drive storage quota and user details
 */
export async function getDriveAbout(authToken: string): Promise<DriveAboutResponse> {
  const res = await fetch(apiUrl('/api/drive/about'), {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch storage info' }));
    throw new Error(err.error || 'Failed to fetch storage information.');
  }
  return await res.json();
}

/**
 * Lists files and folders from Google Drive
 */
export async function listDriveFiles(
  authToken: string,
  options: {
    folderId?: string;
    search?: string;
    category?: 'all' | 'audio' | 'images' | 'documents' | 'folders';
    pageToken?: string;
  } = {}
): Promise<{ files: DriveFileItem[]; nextPageToken?: string }> {
  const params = new URLSearchParams();
  if (options.folderId) params.append('folderId', options.folderId);
  if (options.search) params.append('search', options.search);
  if (options.category && options.category !== 'all') params.append('category', options.category);
  if (options.pageToken) params.append('pageToken', options.pageToken);

  const res = await fetch(apiUrl(`/api/drive/files?${params.toString()}`), {
    headers: { Authorization: `Bearer ${authToken}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to list files' }));
    throw new Error(err.error || 'Failed to retrieve files from Google Drive.');
  }

  return await res.json();
}

/**
 * Creates a new folder in Google Drive
 */
export async function createDriveFolder(
  authToken: string,
  name: string,
  parentId?: string
): Promise<DriveFileItem> {
  const res = await fetch(apiUrl('/api/drive/folders'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ name, parentId })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create folder' }));
    throw new Error(err.error || 'Failed to create folder on Google Drive.');
  }

  return await res.json();
}

/**
 * Renames a file or folder in Google Drive
 */
export async function renameDriveItem(
  authToken: string,
  fileId: string,
  newName: string
): Promise<DriveFileItem> {
  const res = await fetch(apiUrl(`/api/drive/files/${fileId}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ name: newName })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to rename item' }));
    throw new Error(err.error || 'Failed to rename item on Google Drive.');
  }

  return await res.json();
}

/**
 * Deletes a file or folder in Google Drive
 */
export async function deleteDriveItem(
  authToken: string,
  fileId: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(apiUrl(`/api/drive/files/${fileId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete item' }));
    throw new Error(err.error || 'Failed to delete item from Google Drive.');
  }

  return await res.json();
}

/**
 * Uploads a file to Google Drive with real-time XHR progress tracking
 */
export function uploadDriveFileWithProgress(
  authToken: string,
  file: File,
  parentId: string,
  onProgress?: (percent: number, loaded: number, total: number) => void
): Promise<DriveFileItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    if (parentId && parentId !== 'root') {
      formData.append('parentId', parentId);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent, event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          reject(new Error('Invalid response from server during file upload.'));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData.error || `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with HTTP status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred while uploading file to Google Drive.'));
    };

    xhr.open('POST', apiUrl('/api/drive/upload'));
    xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.send(formData);
  });
}
