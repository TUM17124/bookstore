"use client";

// GigaPDF's real version of this file fetches a short-lived JWT from Better
// Auth. Bookstore has its own, simpler token store (access + refresh, see
// src/lib/api.ts's getToken/refreshAccessToken) - this adapts the editor's
// getAuthToken()/invalidateAuthToken() calls to that, rather than inventing a
// second auth mechanism.
import { getToken, refreshAccessToken, tokenExpiresInMs } from "@/lib/api";

export async function getAuthToken(): Promise<string | null> {
  return getToken();
}

/**
 * Called when a request comes back 401 so the next attempt uses a fresh token.
 *
 * This used to call `clearTokens()`, which was the single most damaging bug in
 * the editor: the access token is short-lived (1h, see SIMPLE_JWT), so any
 * expired-token 401 wiped the *refresh* token too and logged the user out
 * permanently. Every subsequent retry then read a null token, so
 * `getAuthToken()` could never return anything new and the "retry once with a
 * fresh token" branch in api.ts was unreachable by construction. The user was
 * stuck: cannot open a document, cannot upload, until they logged in again.
 *
 * `invalidateAuthToken` must therefore only drop the *stale access* token and
 * let the next `getAuthToken()` transparently refresh. A genuinely revoked
 * session still ends up logged out — `refreshAccessToken` throws and we fall
 * back to clearing only when there is no refresh token to redeem at all.
 */
export function invalidateAuthToken(): void {
  try {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("refresh_token")) return;
    localStorage.removeItem("access_token");
    localStorage.removeItem("access");
    localStorage.removeItem("token");
  } catch {
    /* private-mode storage failures must not break the request path */
  }
}

/**
 * Read the bearer token for a request, refreshing transparently when the
 * stored access token is missing or known-expired.
 *
 * The previous contract (`getAuthToken` = plain `getToken()`) meant every
 * caller had to already hold a valid token. Combined with the `clearTokens()`
 * bug above, a stale token degraded into a permanent lockout. Refreshing here
 * means the raw `fetch` callers (PDF parse-from-s3, document download, blank
 * page) recover on their own instead of dead-ending on a 401.
 */
export async function ensureFreshAuthToken(): Promise<string | null> {
  const token = getToken();
  const left = tokenExpiresInMs(token);
  // Use the stored token unless it is missing or (about to be) expired.
  if (token && (left === null || left > 30_000)) return token;
  if (typeof window === "undefined") return token;
  if (!localStorage.getItem("refresh_token")) return token;
  try {
    // Single-flight in src/lib/api.ts: a burst of editor requests that all
    // find the token expired causes ONE refresh, not one each.
    return await refreshAccessToken(token);
  } catch {
    // Refresh failed: the session is genuinely over. Do not throw here —
    // callers send the request unauthenticated and surface the real 401.
    return null;
  }
}
