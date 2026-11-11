// Centralized API Base URL helper for hybrid Netlify (frontend) + Render (backend) architecture.
// In local development, VITE_API_BASE_URL is empty so relative /api/* paths route to the local Express + Vite server.
// In Netlify production, set VITE_API_BASE_URL=https://YOUR-RENDER-BACKEND.onrender.com

const DEFAULT_PROD_API_URL = 'https://rudraatma-music.onrender.com';

function resolveApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  if (import.meta.env.PROD && typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    const isLocalOrPreview =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.run.app') ||
      host.endsWith('.onrender.com');
    if (!isLocalOrPreview) {
      return DEFAULT_PROD_API_URL;
    }
  }
  return '';
}

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Resolves a backend API or media path against VITE_API_BASE_URL.
 */
export function apiUrl(path: string): string {
  if (!path) return API_BASE_URL || '/';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const target = API_BASE_URL || window.location.origin;
    throw new Error(
      `Server at ${target} returned HTTP ${res.status} (non-JSON response). If Render is waking up, wait a few seconds and retry.`
    );
  }
}

export function formatNetworkError(err: any, fallback: string): string {
  const msg = String(err?.message || '');
  if (
    msg === 'Failed to fetch' ||
    msg === 'Load failed' ||
    msg.includes('NetworkError') ||
    msg.includes('fetch')
  ) {
    const target = API_BASE_URL || 'the backend server';
    return `Unable to reach ${target}. Please check your internet connection or wait 20–30s if the Render backend is waking from sleep, then try again.`;
  }
  return msg || fallback;
}
