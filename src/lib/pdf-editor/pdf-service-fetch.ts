"use client";

import { AuthFetchError, authFetch, type RequestOptions } from "@/lib/auth-fetch";

/**
 * fetch() for the PDF service, with authFetch underneath (Part A): Bearer
 * token (refreshed first when expired, ONE shared refresh on 401) and
 * automatic retry of transient failures. The PDF service is stateless (PDF
 * in, result out, nothing stored), so every call is `pure`: safe to retry.
 *
 * Unlike authFetch it RESOLVES with the response for HTTP errors too, so the
 * many existing `if (!res.ok)` branches keep behaving exactly as before (some
 * deliberately degrade quietly, e.g. a background thumbnail refresh). Network
 * failures and timeouts still throw (a readable AuthFetchError), as fetch did.
 * Any Authorization header passed in is replaced by the current token.
 *
 * Also used for the editor's document downloads from Django (GETs, so
 * `pure` changes nothing there; they pass `timeoutMs: 0` for big files).
 */
export async function pdfServiceFetch(
  url: string,
  init: RequestInit & Pick<RequestOptions, "timeoutMs"> = {},
): Promise<Response> {
  try {
    return await authFetch(url, { ...init, pure: true });
  } catch (err) {
    if (err instanceof AuthFetchError && err.status) {
      return new Response(JSON.stringify({ success: false, error: err.message, ...err.body }), {
        status: err.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }
}
