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
