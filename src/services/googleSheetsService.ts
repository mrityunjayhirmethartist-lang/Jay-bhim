import { auth, driveProvider } from './googleDriveService';
import { GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { apiUrl } from '../utils/api';

export interface SheetsUser {
  email: string;
  displayName: string;
  photoUrl: string;
  connectedAt?: number;
}

export interface SpreadsheetSummary {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
  createdTime?: string;
}

export interface SheetMetadata {
  sheetId: number;
  title: string;
  rowCount?: number;
  columnCount?: number;
}

export interface SpreadsheetDetails {
  spreadsheetId: string;
  title: string;
  sheets: SheetMetadata[];
  webViewLink: string;
}

export interface SheetValuesResponse {
  range: string;
  majorDimension: string;
  values: string[][];
}

/**
 * Initiates Google OAuth popup and connects Google Sheets & Drive
 */
export async function connectGoogleSheets(authToken: string): Promise<{
  connected: boolean;
  sheetsUser: SheetsUser;
}> {
  try {
    const result = await signInWithPopup(auth, driveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error('Google OAuth succeeded but no access token was returned.');
    }

    const sheetsUser: SheetsUser = {
      email: result.user.email || '',
      displayName: result.user.displayName || 'Google Account',
      photoUrl: result.user.photoURL || ''
    };

    // Store token securely on backend associated with user session
    const res = await fetch(apiUrl('/api/sheets/connect'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        accessToken,
        email: sheetsUser.email,
        displayName: sheetsUser.displayName,
        photoUrl: sheetsUser.photoUrl
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save Google Sheets session on server' }));
      throw new Error(err.error || 'Server rejected Google connection.');
    }

    return { connected: true, sheetsUser };
  } catch (error: any) {
    console.error('Google Sheets OAuth connection failed:', error);
    throw error;
  }
}

/**
 * Check Google Sheets connection status
 */
export async function getSheetsStatus(authToken: string): Promise<{
  connected: boolean;
  sheetsUser?: SheetsUser;
}> {
  try {
    const res = await fetch(apiUrl('/api/sheets/status'), {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) return { connected: false };
    return await res.json();
  } catch (err) {
    console.error('Failed to get Sheets status', err);
    return { connected: false };
  }
}

/**
 * Disconnect Google Sheets
 */
export async function disconnectSheets(authToken: string): Promise<boolean> {
  try {
    await fbSignOut(auth).catch(() => {});
    const res = await fetch(apiUrl('/api/sheets/disconnect'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to disconnect Sheets', err);
    return false;
  }
}

/**
 * List spreadsheets belonging to user
 */
export async function listSpreadsheets(authToken: string): Promise<SpreadsheetSummary[]> {
  const res = await fetch(apiUrl('/api/sheets/list'), {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to list spreadsheets' }));
    throw new Error(err.error || 'Failed to list Google Spreadsheets.');
  }
  const data = await res.json();
  return data.spreadsheets || [];
}

/**
 * Create a new spreadsheet (custom or template with artist, label, release & royalty tracking)
 */
export async function createSpreadsheet(
  authToken: string,
  title: string,
  type: 'master_catalog' | 'blank' = 'master_catalog'
): Promise<SpreadsheetDetails> {
  const res = await fetch(apiUrl('/api/sheets/create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ title, type })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create spreadsheet' }));
    throw new Error(err.error || 'Failed to create Google Spreadsheet.');
  }

  return await res.json();
}

/**
 * Get spreadsheet details and sheets metadata
 */
export async function getSpreadsheetDetails(
  authToken: string,
  spreadsheetId: string
): Promise<SpreadsheetDetails> {
  const res = await fetch(apiUrl(`/api/sheets/${spreadsheetId}`), {
    headers: { Authorization: `Bearer ${authToken}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch spreadsheet' }));
    throw new Error(err.error || 'Failed to fetch spreadsheet details.');
  }

  return await res.json();
}

/**
 * Read data values from a specific sheet range
 */
export async function getSheetValues(
  authToken: string,
  spreadsheetId: string,
  range: string
): Promise<SheetValuesResponse> {
  const res = await fetch(apiUrl(`/api/sheets/${spreadsheetId}/values?range=${encodeURIComponent(range)}`), {
    headers: { Authorization: `Bearer ${authToken}` }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to read sheet data' }));
    throw new Error(err.error || 'Failed to read sheet values.');
  }

  return await res.json();
}

/**
 * Write/Update data in a sheet range
 */
export async function updateSheetValues(
  authToken: string,
  spreadsheetId: string,
  range: string,
  values: string[][]
): Promise<{ updatedCells: number; updatedRows: number }> {
  const res = await fetch(apiUrl(`/api/sheets/${spreadsheetId}/values`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ range, values })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update sheet data' }));
    throw new Error(err.error || 'Failed to update sheet values.');
  }

  return await res.json();
}

/**
 * Append row to a sheet
 */
export async function appendSheetRow(
  authToken: string,
  spreadsheetId: string,
  sheetName: string,
  rowValues: string[]
): Promise<boolean> {
  const res = await fetch(apiUrl(`/api/sheets/${spreadsheetId}/append`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ sheetName, values: [rowValues] })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to append row' }));
    throw new Error(err.error || 'Failed to append row to spreadsheet.');
  }

  return true;
}

/**
 * Trigger synchronization of latest dashboard data (artists, labels, releases, royalties) into spreadsheet
 */
export async function syncSpreadsheetWithCatalog(
  authToken: string,
  spreadsheetId: string
): Promise<{ success: boolean; message: string; lastSynced: string }> {
  const res = await fetch(apiUrl(`/api/sheets/${spreadsheetId}/sync`), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sync failed' }));
    throw new Error(err.error || 'Failed to synchronize spreadsheet.');
  }

  return await res.json();
}
