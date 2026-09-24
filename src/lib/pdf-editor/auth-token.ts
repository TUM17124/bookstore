"use client";

// GigaPDF's real version of this file fetches a short-lived JWT from Better
// Auth. Bookstore has its own, simpler token store (a single access token
// set at login, see src/lib/api.ts's getToken/clearTokens) - this adapts the
// editor's getAuthToken()/invalidateAuthToken() calls to that, rather than
// inventing a second auth mechanism.
import { getToken, clearTokens } from "@/lib/api";

export async function getAuthToken(): Promise<string | null> {
  return getToken();
}

export function invalidateAuthToken(): void {
  clearTokens();
}
