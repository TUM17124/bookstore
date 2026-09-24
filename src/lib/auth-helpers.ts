/**
 * Auth helpers for the PDF-math API routes (src/app/api/pdf/*, src/app/api/office/*).
 *
 * GigaPDF's real routes validate a Better Auth session here. Bookstore has its
 * own, simpler auth: a JWT issued by the Django backend, sent as
 * `Authorization: Bearer <token>` (see src/lib/pdf-editor/auth-token.ts /
 * src/lib/pdf-editor/api.ts). These routes do a presence check on that header
 * (and a best-effort decode of the JWT payload for logging) rather than
 * verifying the signature - they operate on PDF bytes passed directly in the
 * request, not on stored documents keyed by ownership, so per-user
 * authorization is Django's job (see the parallel Django-endpoints task), not
 * this layer's.
 */

import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthContext = {
  userId: string;
  email: string;
  role: string;
};

type RequireSessionSuccess = { ok: true; context: AuthContext };
type RequireSessionFailure = { ok: false; response: Response };
export type RequireSessionResult = RequireSessionSuccess | RequireSessionFailure;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Best-effort decode of a JWT's payload claims, for logging only - never trust this for authorization. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf-8");
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Validates that the request carries a bearer token. Does not verify the JWT
 * signature (Next.js doesn't hold Django's signing key) - see module docblock.
 *
 * Usage:
 *   const authResult = await requireSession();
 *   if (!authResult.ok) return authResult.response;
 *   const { userId } = authResult.context;
 */
export async function requireSession(): Promise<RequireSessionResult> {
  const incomingHeaders = await headers();
  const authHeader = incomingHeaders.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.length <= 7) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.slice(7);
  const claims = decodeJwtPayload(token);
  const userId = (claims?.user_id ?? claims?.sub ?? "unknown") as string | number;

  return {
    ok: true,
    context: {
      userId: String(userId),
      email: typeof claims?.email === "string" ? claims.email : "",
      role: "user",
    },
  };
}

// ─── Internal service-to-service auth ───────────────────────────────────────

/**
 * Checks whether the request carries the shared internal-service secret, for
 * trusted server-to-server callers with no user session (e.g. a future export
 * worker rendering pages via POST /api/pdf/preview).
 *
 * Fail-closed: returns false when the secret is unset or too short, so the
 * caller falls back to requireSession() and the route never becomes public.
 */
export function isInternalServiceRequest(request: Request): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected || expected.length < 16) return false;

  const provided = request.headers.get("x-internal-secret");
  if (!provided) return false;

  const { timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}
