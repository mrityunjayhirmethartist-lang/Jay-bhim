// Centralized API Base URL helper for hybrid Netlify (frontend) + Render (backend) architecture.
// In local development, VITE_API_BASE_URL is empty so relative /api/* paths route to the local Express + Vite server.
// In Netlify production, set VITE_API_BASE_URL=https://YOUR-RENDER-BACKEND.onrender.com

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');

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
