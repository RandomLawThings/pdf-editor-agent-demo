/**
 * Session-based isolation for standalone/Vercel mode
 *
 * Each browser session generates a unique session ID (client-side).
 * This session ID is used to:
 * 1. Scope file storage paths
 * 2. Isolate in-memory document tracking
 * 3. Validate file access requests
 */

import { randomBytes } from 'crypto';

// Validate session ID format (must be 32 hex characters)
export function isValidSessionId(sessionId: string | undefined): sessionId is string {
  if (!sessionId) return false;
  return /^[a-f0-9]{32}$/.test(sessionId);
}

// Generate a new session ID (for client-side use)
export function generateSessionId(): string {
  return randomBytes(16).toString('hex');
}

// Get session ID from request headers
export function getSessionIdFromRequest(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const sessionId = req.headers['x-session-id'];
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  return isValidSessionId(id) ? id : null;
}

// Build a session-scoped storage key
export function buildSessionScopedKey(sessionId: string, filename: string): string {
  return `sessions/${sessionId}/${filename}`;
}

// Extract session ID from a storage key (for validation)
export function extractSessionIdFromKey(key: string): string | null {
  const match = key.match(/^sessions\/([a-f0-9]{32})\//);
  return match ? match[1] : null;
}
