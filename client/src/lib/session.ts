/**
 * Client-side session management for demo isolation
 *
 * Generates a unique session ID per browser tab/session.
 * This session ID is sent with every API request to scope data access.
 */

const SESSION_STORAGE_KEY = 'pdf-agent-session-id';

// Generate a cryptographically random 32-char hex string
function generateSessionId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create the session ID for this browser tab
 * Uses sessionStorage so each tab gets its own session
 */
export function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);

  if (!sessionId || !/^[a-f0-9]{32}$/.test(sessionId)) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }

  return sessionId;
}

/**
 * Clear the current session (for logout/reset)
 */
export function clearSession(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Get headers to include with API requests
 */
export function getSessionHeaders(): Record<string, string> {
  return {
    'X-Session-Id': getSessionId(),
  };
}
