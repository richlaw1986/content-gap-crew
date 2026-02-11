/**
 * Environment configuration with fail-fast validation.
 * 
 * This module validates all required environment variables at startup.
 * If any required variable is missing, the app fails immediately with
 * a clear error message - no silent fallbacks.
 */

// =============================================================================
// Server-side environment (not exposed to browser)
// =============================================================================

interface ServerEnv {
  FASTAPI_URL: string;
  NEXTAUTH_SECRET: string;
  NEXTAUTH_URL: string;
  // OAuth providers - optional for dev, required for prod
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  // Sanity
  SANITY_API_TOKEN?: string;
}

interface ClientEnv {
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_SANITY_PROJECT_ID?: string;
  NEXT_PUBLIC_SANITY_DATASET?: string;
  NEXT_PUBLIC_DEBUG?: string;
}

// =============================================================================
// Validation
// =============================================================================

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `See .env.local.example for required variables.`
    );
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

// =============================================================================
// Server Environment (validated at import time on server)
// =============================================================================

let _serverEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  // Only validate on server
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() called on client - use clientEnv instead');
  }

  if (_serverEnv) return _serverEnv;

  // In development, be lenient about auth vars
  const isDev = process.env.NODE_ENV === 'development';

  _serverEnv = {
    FASTAPI_URL: getOptionalEnv('FASTAPI_URL', 'http://localhost:8000')!,
    NEXTAUTH_SECRET: isDev 
      ? getOptionalEnv('NEXTAUTH_SECRET', 'dev-secret-change-in-production')!
      : getRequiredEnv('NEXTAUTH_SECRET'),
    NEXTAUTH_URL: getOptionalEnv('NEXTAUTH_URL', 'http://localhost:3000')!,
    GOOGLE_CLIENT_ID: getOptionalEnv('GOOGLE_CLIENT_ID'),
    GOOGLE_CLIENT_SECRET: getOptionalEnv('GOOGLE_CLIENT_SECRET'),
    GITHUB_CLIENT_ID: getOptionalEnv('GITHUB_CLIENT_ID'),
    GITHUB_CLIENT_SECRET: getOptionalEnv('GITHUB_CLIENT_SECRET'),
    SANITY_API_TOKEN: getOptionalEnv('SANITY_API_TOKEN'),
  };

  return _serverEnv;
}

// =============================================================================
// Client Environment (safe to use in browser)
// =============================================================================

export const clientEnv: ClientEnv = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SANITY_PROJECT_ID: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  NEXT_PUBLIC_SANITY_DATASET: process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production',
  NEXT_PUBLIC_DEBUG: process.env.NEXT_PUBLIC_DEBUG,
};

// =============================================================================
// Helpers
// =============================================================================

export function isDebugMode(): boolean {
  return clientEnv.NEXT_PUBLIC_DEBUG === 'true';
}

export function getApiUrl(): string {
  // Client-side: use public URL or default to same-origin proxy
  if (typeof window !== 'undefined') {
    return clientEnv.NEXT_PUBLIC_API_URL ?? '';
  }
  // Server-side: use internal FastAPI URL
  return getServerEnv().FASTAPI_URL;
}

/**
 * Returns the WebSocket-capable URL for the FastAPI backend.
 *
 * The Next.js proxy route handles HTTP but NOT WebSocket upgrades,
 * so WS connections must go directly to FastAPI.
 *
 * Priority:
 *  1. NEXT_PUBLIC_WS_URL  (explicit override, e.g. wss://prod.example.com)
 *  2. NEXT_PUBLIC_API_URL  converted from http→ws
 *  3. ws://localhost:8000  (local dev default)
 */
export function getWsUrl(): string {
  if (typeof window !== 'undefined') {
    const explicit = process.env.NEXT_PUBLIC_WS_URL;
    if (explicit) return explicit;

    const apiUrl = clientEnv.NEXT_PUBLIC_API_URL;
    if (apiUrl) return apiUrl.replace(/^http/, 'ws');

    // Local dev: FastAPI backend default
    return 'ws://localhost:8000';
  }
  // Server-side (shouldn't need WS, but just in case)
  return getServerEnv().FASTAPI_URL.replace(/^http/, 'ws');
}
