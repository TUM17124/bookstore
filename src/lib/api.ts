// src/lib/api.ts
import { splitName } from "@/lib/name"
import { AuthFetchError, authFetch, type CallOptions, type RequestOptions } from "@/lib/auth-fetch"
import { UserError } from "@/lib/user-error"

const API = process.env.NEXT_PUBLIC_API_URL!

export type ApiBook = {
  id: string
  title: string
  author: string
  year: string
  stars: number
  desc: string
  images?: {
    front?: string | null
    spine?: string | null
    back?: string | null
  }
  edge?: string
  spineBg?: string
  spineInk?: string
  spineFont?: string
  backBg?: string
  backInk?: string
  chapters?: string[]
  category?: string
  price?: number
  ebook_price?: number
  audiobook_price?: number
  stock?: number
  hasEbook?: boolean
  hasAudiobook?: boolean
  ebookDownloadable?: boolean
  audiobookDownloadable?: boolean
  isFree?: boolean
  is_featured?: boolean
  previewPages?: number
  audioUrl?: string | null
  pdfUrl?: string | null
}

export type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export function asBookList(data: Paginated<ApiBook> | ApiBook[]): ApiBook[] {
  return Array.isArray(data) ? data : data.results ?? []
}

export type PurchaseItem = {
  order_id: number
  book_id: string
  product_type: string
  downloadable?: boolean
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    localStorage.getItem("token")
  )
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem("access_token", access)
  localStorage.setItem("access", access)
  if (refresh) localStorage.setItem("refresh_token", refresh)
}

export function setToken(access: string) {
  setTokens(access)
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("refresh_token")
}

export class SessionEvictedError extends Error {
  constructor() {
    super("You've been signed out because you logged in on another device.")
    this.name = "SessionEvictedError"
  }
}

export class CheckoutError extends UserError {
  legalRequired: boolean
  constructor(message: string, legalRequired = false) {
    super(message)
    this.name = "CheckoutError"
    this.legalRequired = legalRequired
  }
}

/** Exchanges the stored refresh token for a new access token — the access
 * token is intentionally short-lived (see backend SIMPLE_JWT comment), so
 * this has to run periodically in the background or every page reload
 * would eventually hit a stale token. Throws SessionEvictedError
 * specifically when this session was the one silently evicted by the
 * concurrent-session cap (its refresh token got blacklisted), so callers
 * can show that distinctly rather than a generic "please log in again." */
/** Milliseconds until the JWT expires (negative if expired); null if the
 * token can't be decoded. Reads the payload only — never trusted for
 * anything but deciding WHEN to refresh. */
export function tokenExpiresInMs(token: string | null | undefined): number | null {
  if (!token) return null
  try {
    const part = token.split(".")[1]
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))
    return typeof json.exp === "number" ? json.exp * 1000 - Date.now() : null
  } catch {
    return null
  }
}

// Single shared refresh. Production logs showed bursts of ~30 refreshes in
// the same second from one client (every parallel editor request refreshed on
// its own after the token expired) plus several per 45-minute navbar tick;
// they tripped the refresh rate limit (429) and then retried. Now:
// - concurrent callers share ONE in-flight request;
// - a token that is still valid and was obtained after the caller's stale one
//   (by another request or another tab — tokens live in localStorage) is
//   reused without a network call;
// - after a failed refresh, calls fail fast for REFRESH_FAIL_COOLDOWN_MS
//   instead of hammering the endpoint.
const REFRESH_FAIL_COOLDOWN_MS = 30_000
let refreshInFlight: Promise<string> | null = null
let lastRefreshFailure: { at: number; error: Error } | null = null

/** Test hook: forget single-flight/cooldown state. */
export function _resetRefreshStateForTests() {
  refreshInFlight = null
  lastRefreshFailure = null
}

async function doRefresh(): Promise<string> {
  const refresh = getRefreshToken()
  if (!refresh) throw new Error("No refresh token")
  const res = await fetch(`${API}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if ((data as { code?: string }).code === "session_evicted") throw new SessionEvictedError()
    if (res.status === 429) throw new UserError("Too many sign-in refreshes — please wait a moment and try again.")
    throw new Error((data as { error?: string; detail?: string }).error || "Session expired")
  }
  const access = (data as { access?: string }).access
  if (!access) throw new Error("Refresh response had no access token")
  setTokens(access)
  return access
}

/** Exchanges the stored refresh token for a new access token — the access
 * token is intentionally short-lived (see backend SIMPLE_JWT comment).
 * Throws SessionEvictedError specifically when this session was the one
 * silently evicted by the concurrent-session cap (its refresh token got
 * blacklisted), so callers can show that distinctly.
 *
 * `staleToken`: the access token the caller found to be rejected/expired.
 * If the stored token is already a different, still-valid one, it is
 * returned without contacting the server. */
export async function refreshAccessToken(staleToken?: string | null): Promise<string> {
  const current = getToken()
  if (current && current !== staleToken && (tokenExpiresInMs(current) ?? 0) > 30_000) {
    return current
  }
  if (refreshInFlight) return refreshInFlight
  if (lastRefreshFailure && Date.now() - lastRefreshFailure.at < REFRESH_FAIL_COOLDOWN_MS) {
    throw lastRefreshFailure.error
  }
  refreshInFlight = doRefresh()
    .then((token) => {
      lastRefreshFailure = null
      return token
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err))
      if (!(error instanceof SessionEvictedError)) lastRefreshFailure = { at: Date.now(), error }
      throw error
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

export function clearTokens() {
  localStorage.removeItem("access_token")
  localStorage.removeItem("access")
  localStorage.removeItem("token")
  localStorage.removeItem("refresh_token")
}

function bearer(token?: string) {
  return token || getToken() || ""
}

/** JSON request to the Django API through authFetch (token + one refresh on
 * 401 + transient-failure retries + readable errors). Throws AuthFetchError
 * (an Error whose message is the server's error text) on failure.
 *
 * Writes are retried only with `idempotencyKey` (pass the action's
 * CallOptions through) on endpoints the backend lists in
 * shop/idempotency.py. */
export async function api<T = unknown>(
  path: string,
  options: RequestInit & RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  const res = await authFetch(`${API}${path}`, { ...options, headers })
  if (res.status === 204) return {} as T
  return (await res.json().catch(() => ({}))) as T
}

/** GET through authFetch (token when logged in, transient retries); resolves
 * to `fallback` on failure, preserving each caller's existing contract. */
async function getOr<T>(path: string, fallback: T, init: RequestInit & RequestOptions = {}): Promise<T> {
  try {
    const res = await authFetch(`${API}${path}`, init)
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

/** api() for login-type calls: no token sent, no retry (their responses
 * carry tokens and are never stored server-side for replay). */
function apiNoAuth<T = unknown>(path: string, options: RequestInit & CallOptions = {}): Promise<T> {
  return api<T>(path, { ...options, auth: false, idempotencyKey: undefined, retries: 0 })
}

/** api() for an action the backend makes idempotent: retryable with the
 * caller's idempotency key. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- these endpoints returned untyped JSON before
function apiAction<T = any>(
  path: string,
  options: RequestInit & Pick<RequestOptions, "auth">,
  call?: CallOptions,
): Promise<T> {
  return api<T>(path, { ...options, ...call })
}

/** The logged-in account's own purchases (the server no longer answers
 * anonymous lookups by email). */
export async function getPurchases(): Promise<{
  ebooks: PurchaseItem[]
  audiobooks: PurchaseItem[]
}> {
  if (!getToken()) return { ebooks: [], audiobooks: [] }
  try {
    const res = await authFetch(`${API}/orders/purchases/`)
    return await res.json()
  } catch (err) {
    if (err instanceof AuthFetchError && err.status === 429) {
      throw new UserError("Too many lookups. Wait a minute and try again.")
    }
    return { ebooks: [], audiobooks: [] }
  }
}

export async function getBooks(params?: {
  featured?: boolean
  category?: string
  search?: string
  page?: number
  pageSize?: number
}): Promise<Paginated<ApiBook> | ApiBook[]> {
  if (!API) throw new Error("NEXT_PUBLIC_API_URL is not set")

  const q = new URLSearchParams()
  if (params?.featured) q.set("featured", "1")
  if (params?.category) q.set("category", params.category)
  if (params?.search) q.set("search", params.search)
  if (params?.page) q.set("page", String(params.page))
  if (params?.pageSize) q.set("page_size", String(params.pageSize))

  const qs = q.toString()
  try {
    const res = await authFetch(`${API}/books/${qs ? `?${qs}` : ""}`, { auth: false })
    return await res.json()
  } catch {
    throw new UserError("Failed to load books")
  }
}

export async function getBook(id: string | number): Promise<ApiBook | null> {
  if (!API) throw new Error("NEXT_PUBLIC_API_URL is not set")
  return getOr<ApiBook | null>(`/books/${id}/`, null, { auth: false })
}

/** "You might also like" for a single book — item-similarity + collaborative
 * "also bought/rated/bookmarked" + (when logged in) personal affinity. See
 * shop/recommend.py:related_books_for on the backend. Sends the auth token
 * when present so the personal-affinity signal actually applies. */
export async function getRelatedBooks(
  bookId: string | number,
  limit = 10,
): Promise<ApiBook[]> {
  if (!API) throw new Error("NEXT_PUBLIC_API_URL is not set")
  const data = await getOr<unknown>(`/books/${bookId}/related/?limit=${limit}`, [], { auth: !!getToken() })
  return Array.isArray(data) ? data : []
}

export type ProStatus = {
  is_pro: boolean
  subscription: {
    id: number
    status: string
    amount: string
    started_at: string | null
    expires_at: string | null
  } | null
}

export async function getProStatus(): Promise<ProStatus> {
  if (!getToken()) return { is_pro: false, subscription: null }
  return getOr<ProStatus>("/pro/status/", { is_pro: false, subscription: null })
}

/** Public — no auth required, so the /pro page can show the real
 * admin-configured price to logged-out visitors too. Never hardcode
 * this value in frontend code; SiteSettings.pro_price_monthly is the
 * single source of truth. */
export async function getProPricing(): Promise<{ price_monthly: string }> {
  return getOr("/pro/pricing/", { price_monthly: "0" }, { auth: false })
}

export async function subscribePro(call?: CallOptions): Promise<{
  subscription_id: number
  checkout_url: string
  reference: string
  amount: string
}> {
  if (!getToken()) throw new UserError("Log in required")
  return apiAction("/pro/subscribe/", { method: "POST" }, call)
}

export async function cancelProSubscription(subscriptionId: number, call?: CallOptions): Promise<{
  ok: boolean
  already_cancelled?: boolean
  error?: string
}> {
  if (!getToken()) throw new UserError("Log in required")
  return apiAction(`/pro/subscriptions/${subscriptionId}/`, { method: "DELETE" }, call)
}

export async function confirmProPayment(reference: string, call?: CallOptions): Promise<{
  ok: boolean
  paid?: boolean
  already_paid?: boolean
  error?: string
  subscription?: ProStatus["subscription"]
}> {
  if (!getToken()) return { ok: false, error: "Log in required" }
  return apiAction("/pro/confirm/", { method: "POST", body: JSON.stringify({ reference }) }, call)
}

export type TtsVoice = {
  id: string
  label: string
  gender: string
  description: string
}

export type TtsTimepoint = { mark: string; time_seconds: number }

export type TtsUsageSnapshot = {
  chars_used_today: number
  daily_limit: number
  chars_used_week: number
  weekly_limit: number
  daily_percent: number
  weekly_percent: number
  warn: boolean
  warn_percent: number
  credit_chars: number
  credits_enabled: boolean
  credit_percent?: number
  credit_chars_used?: number
  credit_chars_total?: number
  credit_min_kes: string
  chars_per_kes: number
  volume_bonus_percent: number
}

export type TtsCreditQuote = {
  enabled: boolean
  amount: string
  min_kes: string
  chars: number
  chars_per_kes: number
  volume_bonus_percent: number
  example_double_chars: number
}

export type TtsResult = {
  token: string
  sentences: string[]
  timepoints: TtsTimepoint[]
  cached: boolean
  usage?: TtsUsageSnapshot
}

export class TtsError extends UserError {
  proRequired: boolean
  creditsRequired: boolean
  usage?: TtsUsageSnapshot
  constructor(message: string, proRequired = false, extra?: { creditsRequired?: boolean; usage?: TtsUsageSnapshot }) {
    super(message)
    this.name = "TtsError"
    this.proRequired = proRequired
    this.creditsRequired = !!extra?.creditsRequired
    this.usage = extra?.usage
  }
}

export async function getTtsVoices(): Promise<TtsVoice[]> {
  const data = await getOr<{ voices?: unknown }>("/tts/voices/", {}, { auth: false })
  return Array.isArray(data.voices) ? (data.voices as TtsVoice[]) : []
}

export async function synthesizePage(
  bookId: string | number,
  page: number,
  voice: string,
  text: string,
): Promise<TtsResult> {
  const token = getToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}/books/${bookId}/tts/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ page, voice, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new TtsError(
      data.error || "Could not read this page aloud",
      !!data.pro_required,
      { creditsRequired: !!data.credits_required, usage: data.usage },
    )
  }
  return data as TtsResult
}

export function ttsAudioUrl(token: string) {
  return `${API}/tts-audio/?token=${encodeURIComponent(token)}`
}

export async function getTtsUsage(): Promise<TtsUsageSnapshot | null> {
  if (!getToken()) return null
  return getOr<TtsUsageSnapshot | null>(`/tts/usage/?_=${Date.now()}`, null, { cache: "no-store" })
}

export async function quoteTtsCredits(amount?: string | number): Promise<TtsCreditQuote | null> {
  const q = amount != null ? `?amount=${encodeURIComponent(String(amount))}` : ""
  return getOr<TtsCreditQuote | null>(`/tts/credits/quote/${q}${q ? "&" : "?"}_=${Date.now()}`, null, { auth: false })
}

export async function buyTtsCredits(amount: string | number, next = "", call?: CallOptions): Promise<{
  purchase_id: number
  checkout_url: string
  reference: string
  amount: string
  chars: number
}> {
  if (!getToken()) throw new UserError("Log in required")
  return apiAction(
    "/tts/credits/buy/",
    { method: "POST", body: JSON.stringify({ amount: String(amount), next }), cache: "no-store" },
    call,
  )
}

export async function confirmTtsCredits(reference: string, call?: CallOptions): Promise<{
  ok: boolean
  paid?: boolean
  already_paid?: boolean
  chars?: number
  error?: string
  usage?: TtsUsageSnapshot
}> {
  if (!getToken()) return { ok: false, error: "Log in required" }
  return apiAction(
    "/tts/credits/confirm/",
    { method: "POST", body: JSON.stringify({ reference }), cache: "no-store" },
    call,
  )
}

export async function createCheckout(
  payload: {
    book_id: number
    product_type: "ebook" | "audiobook"
    email: string
    terms_accepted?: boolean
  },
  call?: CallOptions,
) {
  try {
    return await apiAction<{ order_id: number; checkout_url: string; dev_mode?: boolean }>(
      "/checkout/",
      { method: "POST", body: JSON.stringify(payload) },
      call,
    )
  } catch (err) {
    const body = (err as { body?: { legal_required?: boolean } }).body
    if (body?.legal_required) throw new CheckoutError((err as Error).message, true)
    throw err
  }
}

export async function confirmOrderPayment(
  orderId: string,
  payload: { reference?: string; email: string },
  call?: CallOptions,
) {
  return apiAction(`/orders/${orderId}/confirm/`, { method: "POST", body: JSON.stringify(payload) }, call)
}

export async function getOrder(orderId: string, email?: string) {
  const q = email ? `?email=${encodeURIComponent(email)}` : ""
  return api(`/orders/${orderId}/${q}`)
}

export async function register(
  email: string,
  password: string,
  name = "",
  confirmPassword = "",
  termsAccepted = false,
  referralCode = "",
  call?: CallOptions,
) {
  const [first_name, last_name] = splitName(name)
  return apiAction(
    "/auth/register/",
    {
      method: "POST",
      auth: false,
      body: JSON.stringify({
        email,
        password,
        confirm_password: confirmPassword || password,
        name,
        first_name,
        last_name,
        terms_accepted: termsAccepted,
        referral_code: (referralCode || "").trim(),
        ref: (referralCode || "").trim(),
      }),
    },
    call,
  )
}

export async function verifyEmail(email: string, code: string, call?: CallOptions) {
  const data = await apiNoAuth<{
    access?: string
    refresh?: string
    user?: { email?: string; name?: string }
  }>("/auth/verify-email/", {
    method: "POST",
    body: JSON.stringify({ email, code }),
    signal: call?.signal,
  })
  if (data.access) setTokens(data.access, data.refresh)
  return data
}

export async function resendCode(
  email: string,
  purpose: "verify" | "reset" = "verify",
  call?: CallOptions,
) {
  return apiAction(
    "/auth/resend-code/",
    { method: "POST", auth: false, body: JSON.stringify({ email, purpose }) },
    call,
  )
}

export async function forgotPassword(email: string, call?: CallOptions) {
  return apiAction("/auth/forgot-password/", { method: "POST", auth: false, body: JSON.stringify({ email }) }, call)
}

export async function resetPassword(
  email: string,
  code: string,
  password: string,
  confirmPassword: string,
  call?: CallOptions,
) {
  const data = await apiNoAuth<{
    access?: string
    refresh?: string
    user?: { email?: string; name?: string }
  }>("/auth/reset-password/", {
    method: "POST",
    body: JSON.stringify({
      email,
      code,
      password,
      confirm_password: confirmPassword,
    }),
    signal: call?.signal,
  })
  if (data.access) setTokens(data.access, data.refresh)
  return data
}

export async function googleLogin(
  credential: string,
  termsAccepted = false,
  referralCode = "",
  call?: CallOptions,
) {
  const data = await apiNoAuth<{
    access?: string
    refresh?: string
    user?: { email?: string; name?: string; terms_accepted?: boolean }
    new_user?: boolean
  }>("/auth/google/", {
    method: "POST",
    body: JSON.stringify({
      credential,
      terms_accepted: termsAccepted,
      referral_code: (referralCode || "").trim(),
      ref: (referralCode || "").trim(),
    }),
    signal: call?.signal,
  })
  if (data.access) setTokens(data.access, data.refresh)
  return data
}

export async function login(email: string, password: string, termsAccepted = false, call?: CallOptions) {
  const data = await apiNoAuth<{
    access: string
    refresh: string
    user?: { email?: string; name?: string; terms_accepted?: boolean }
  }>("/auth/login/", {
    method: "POST",
    body: JSON.stringify({
      username: email,
      email,
      password,
      terms_accepted: termsAccepted,
    }),
    signal: call?.signal,
  })
  setTokens(data.access, data.refresh)
  return data
}

export function logout() {
  clearTokens()
}

export async function getAudioProgress(bookId: string) {
  return api<{ position: number; duration: number }>(
    `/books/${bookId}/audio-progress/`,
  )
}

export async function saveAudioProgress(
  bookId: string,
  position: number,
  duration: number,
) {
  return api(`/books/${bookId}/audio-progress/`, {
    method: "POST",
    body: JSON.stringify({ position, duration }),
  })
}

export async function getAudioNotes(bookId: string) {
  return api<Array<{ id: number; position: number; note: string }>>(
    `/books/${bookId}/audio-notes/`,
  )
}

export async function addAudioNote(
  bookId: string,
  position: number,
  note: string,
  call?: CallOptions,
) {
  return apiAction(`/books/${bookId}/audio-notes/`, { method: "POST", body: JSON.stringify({ position, note }) }, call)
}

export async function deleteAudioNote(id: number, call?: CallOptions) {
  return apiAction(`/audio-notes/${id}/`, { method: "DELETE" }, call)
}

export async function updateAudioNote(
  id: number,
  note: string,
  position?: number,
  call?: CallOptions,
) {
  return apiAction<{ id: number; position: number; note: string }>(
    `/audio-notes/${id}/`,
    { method: "PATCH", body: JSON.stringify(position == null ? { note } : { note, position }) },
    call,
  )
}

export type PdfNoteRow = {
  id: number | string
  page: number
  quote: string
  thought?: string
  note?: string
}

export async function getPdfNotes(bookId: string) {
  return api<PdfNoteRow[]>(`/books/${bookId}/pdf-notes/`)
}

export async function addPdfNote(
  bookId: string,
  page: number,
  quote: string,
  thought: string,
  call?: CallOptions,
) {
  return apiAction<PdfNoteRow>(
    `/books/${bookId}/pdf-notes/`,
    { method: "POST", body: JSON.stringify({ page, quote, thought, note: thought }) },
    call,
  )
}

export async function deletePdfNote(id: string, call?: CallOptions) {
  return apiAction(`/pdf-notes/${id}/`, { method: "DELETE" }, call)
}



export async function updatePdfNote(
  id: string,
  page: number,
  quote: string,
  thought: string,
  call?: CallOptions,
) {
  return apiAction<PdfNoteRow>(
    `/pdf-notes/${id}/`,
    { method: "PATCH", body: JSON.stringify({ page, quote, thought, note: thought }) },
    call,
  )
}



export async function getPdfProgress(bookId: string) {
  return api<{ page: number }>(`/books/${bookId}/pdf-progress/`)
}

export async function savePdfProgress(bookId: string, page: number) {
  return api(`/books/${bookId}/pdf-progress/`, {
    method: "PUT",
    body: JSON.stringify({ page }),
  })
}

export type SearchTrackKind = "search" | "click" | "preview" | "view"

export async function searchTrack(payload: {
  event_type?: SearchTrackKind
  kind?: SearchTrackKind
  query?: string
  book_id?: number | string | null
  book_slug?: string
  source?: string
  path?: string
}) {
  try {
    await fetch(`${API}/track/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        event_type: payload.event_type || payload.kind || "search",
        query: payload.query ?? "",
        book_id: payload.book_id ?? null,
        book_slug: payload.book_slug ?? "",
        source: payload.source ?? "",
        path:
          payload.path ||
          (typeof window !== "undefined" ? window.location.pathname : ""),
      }),
    })
  } catch {
    // never block UI
  }
}

export type BookmarkRow = {
  id: number
  book: ApiBook
  created_at?: string
}

export async function fetchBookmarks(page = 1): Promise<
  Paginated<BookmarkRow> | BookmarkRow[]
> {
  const q = page > 1 ? `?page=${page}` : ""
  return api(`/bookmarks/${q}`)
}

export async function addBookmarkApi(bookId: string | number, call?: CallOptions) {
  return apiAction("/bookmarks/", { method: "POST", body: JSON.stringify({ book_id: Number(bookId) }) }, call)
}

export async function removeBookmarkApi(bookId: string | number, call?: CallOptions) {
  return apiAction(`/bookmarks/${bookId}/`, { method: "DELETE" }, call)
}

export async function getRatings(bookId: string) {
  return api<{ average: number; count: number; myRating: number | null }>(
    `/books/${bookId}/ratings/`,
  )
}

export async function postRating(bookId: string, value: number, call?: CallOptions) {
  return apiAction(`/books/${bookId}/ratings/`, { method: "POST", body: JSON.stringify({ value }) }, call)
}

export async function getComments(bookId: string) {
  return api<
    Array<{
      id: number
      body: string
      parentId: number | null
      created_at: string
      user_name: string
      user_email: string
      userRating: number | null
    }>
  >(`/books/${bookId}/comments/`)
}

export async function postComment(
  bookId: string,
  body: string,
  parentId?: number | string | null,
  call?: CallOptions,
) {
  return apiAction(
    `/books/${bookId}/comments/`,
    {
      method: "POST",
      body: JSON.stringify({
        body,
        parentId: parentId != null ? Number(parentId) : null,
      }),
    },
    call,
  )
}

export async function getMySales() {
  return getOr("/me/sales/", { ok: true, sales: [], books: [] })
}

export async function requestPayout(call?: CallOptions) {
  return apiAction("/me/payouts/", { method: "POST" }, call)
}

export async function createBoost(book_id: number, days = 7) {
  return initBoost(bearer(), book_id, days)
}

export async function publishBook(form: FormData, call?: CallOptions) {
  return apiAction("/me/books/", { method: "POST", body: form }, call)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept for existing callers; the token now comes from authFetch
export async function myBooks(_token?: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await api<any>("/me/books/")
  } catch {
    throw new UserError("Could not load your books")
  }
}

export async function updateMyBook(bookId: string | number, form: FormData, call?: CallOptions) {
  return apiAction(`/me/books/${bookId}/`, { method: "PATCH", body: form }, call)
}

export async function deleteMyBook(bookId: string | number, call?: CallOptions) {
  return apiAction(`/me/books/${bookId}/`, { method: "DELETE" }, call)
}

export async function initBoost(_token: string, bookId: number, days = 7, call?: CallOptions) {
  return apiAction("/me/boost/init/", { method: "POST", body: JSON.stringify({ book_id: bookId, days }) }, call)
}

export async function confirmBoost(_token: string, reference: string, call?: CallOptions) {
  return apiAction("/me/boost/confirm/", { method: "POST", body: JSON.stringify({ reference }) }, call)
}

/** GET that resolves to the server's JSON even for an error status (these
 * callers read `error` fields from it), with authFetch's token handling and
 * transient retries. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJsonAlways(path: string, init: RequestInit & RequestOptions = {}): Promise<any> {
  try {
    const res = await authFetch(`${API}${path}`, init)
    return await res.json().catch(() => ({}))
  } catch (err) {
    if (err instanceof AuthFetchError && err.status) return err.body
    throw err
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept for existing callers; the token now comes from authFetch
export async function myBoosts(_token?: string) {
  return getJsonAlways("/me/boosts/")
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept for existing callers; the token now comes from authFetch
export async function payoutAccount(_token?: string) {
  return getJsonAlways("/me/payout-account/")
}

export async function savePayoutAccount(
  _token: string,
  body: {
    method: string
    account_name?: string
    account_number?: string
    extra?: string
  },
  call?: CallOptions,
) {
  return apiAction("/me/payout-account/", { method: "POST", body: JSON.stringify(body) }, call)
}

export async function deletePayoutAccount(_token?: string, call?: CallOptions) {
  return apiAction("/me/payout-account/", { method: "DELETE" }, call)
}

export async function getLegalPages(slug?: string) {
  const q = slug ? `?slug=${encodeURIComponent(slug)}` : ""
  return getJsonAlways(`/legal/${q}`, { cache: "no-store", auth: false })
}

export async function getLegalStatus(token?: string) {
  return getJsonAlways("/legal/status/", { cache: "no-store", auth: !!token })
}

export async function acceptLegal(
  _token: string,
  source = "reaccept",
  call?: CallOptions,
) {
  return apiAction("/legal/accept/", { method: "POST", body: JSON.stringify({ source }) }, call)
}

export const getSettings = () => api<any>("/me/settings/")
export const changeUsername = (username: string, call?: CallOptions) =>
  apiAction("/me/settings/username/", { method: "POST", body: JSON.stringify({ username }) }, call)
export async function changeName(first_name: string, last_name: string, call?: CallOptions) {
  return apiAction("/settings/name/", { method: "POST", body: JSON.stringify({ first_name, last_name }) }, call)
}
export const startEmailChange = (email: string, current_password: string, call?: CallOptions) =>
  apiAction("/me/settings/email/", { method: "POST", body: JSON.stringify({ email, current_password }) }, call)
export const confirmEmailChange = (code: string, call?: CallOptions) =>
  apiAction("/me/settings/email/confirm/", { method: "POST", body: JSON.stringify({ code }) }, call)
export const requestAffiliateWithdrawal = (amount: string, call?: CallOptions) =>
  apiAction("/me/affiliate/withdrawals/", { method: "POST", body: JSON.stringify({ amount }) }, call)
export const deleteAccount = (
  body: { current_password?: string; google_credential?: string; reason?: string },
  call?: CallOptions,
) => apiAction("/me/settings/delete-account/", { method: "POST", body: JSON.stringify(body) }, call)

export type NotificationPrefs = {
  push_enabled: boolean
  email_enabled: boolean
  active_devices: number
}
export const getNotificationPrefs = () => api<NotificationPrefs>("/me/notification-prefs/")
export const updateNotificationPrefs = (
  body: Partial<Pick<NotificationPrefs, "push_enabled" | "email_enabled">>,
  call?: CallOptions,
) =>
  // Setting the same preference twice is harmless: retry on the safe side
  // only for network-level failures via the signal; no key needed server-side.
  api<NotificationPrefs>("/me/notification-prefs/", { method: "POST", body: JSON.stringify(body), signal: call?.signal })
export async function unsubscribePush(endpoint?: string, call?: CallOptions) {
  return api("/push/unsubscribe/", {
    method: "POST",
    body: JSON.stringify({ endpoint: endpoint || "" }),
    signal: call?.signal,
  })
}

export default searchTrack


// ─── Book content (entitlement-checked; see backend shop/views_books.py) ──
//
// The browser never receives a protected book FILE. The reader asks the
// server for a short-lived manifest of per-page URLs and fetches one page's
// text at a time; audio plays from a short-lived signed stream URL; downloads
// go through an endpoint that re-checks the downloadable flag + limit.
// Guests (no account) are identified by their purchase-link token in the
// X-Guest-Token header instead of a Bearer JWT.

export type BookKind = "ebook" | "audiobook"

export type BookAccessEntry = {
  available: boolean
  read: "full" | "preview" | "none"
  preview_pages: number | null
  can_download: boolean
  purchased: boolean
  privileged: boolean
  downloads_remaining?: number
}

export type BookAccess = { ebook: BookAccessEntry; audiobook: BookAccessEntry }

export type ReaderManifest = {
  book_id: string
  total_pages: number
  allowed_pages: number
  preview: boolean
  expires_in: number
  watermark: string
  copy_protected: boolean
  pages: { page: number; url: string }[]
}

export class ContentError extends UserError {
  status: number
  code: string
  constructor(message: string, status: number, code = "") {
    super(message)
    this.name = "ContentError"
    this.status = status
    this.code = code
  }
}

/** Origin of the Django API ("https://plugyard.com" for ".../api"). The
 * server hands back paths like "/api/books/…"; resolve them against this. */
export function apiOrigin(): string {
  try {
    return new URL(API).origin
  } catch {
    return ""
  }
}

function contentHeaders(guestToken?: string | null): Record<string, string> {
  const h: Record<string, string> = {}
  if (guestToken) h["X-Guest-Token"] = guestToken
  else {
    const t = getToken()
    if (t) h.Authorization = `Bearer ${t}`
  }
  return h
}

/** fetch() for book-content endpoints: attaches the Bearer token (or guest
 * token), retries once after refreshing an expired access token, and turns
 * error bodies into ContentError with the server's message + code. */
export async function contentFetch(
  pathOrUrl: string,
  init: RequestInit & Pick<RequestOptions, "pure" | "timeoutMs" | "retries" | "signal" | "onRetry"> = {},
  guestToken?: string | null,
): Promise<Response> {
  const url = /^https?:/.test(pathOrUrl)
    ? pathOrUrl
    : pathOrUrl.startsWith("/api/")
      ? `${apiOrigin()}${pathOrUrl}`
      : `${API}${pathOrUrl}`
  const headers = new Headers(init.headers || {})
  if (guestToken) headers.set("X-Guest-Token", guestToken)
  try {
    // Guests are identified by their link token, never a Bearer JWT.
    return await authFetch(url, { ...init, headers, cache: "no-store", auth: !guestToken })
  } catch (err) {
    if (!(err instanceof AuthFetchError) || err.code === "aborted") throw err
    // Keep the server's own wording and code (guest_link_expired, expired,
    // page_not_allowed...) — the reader and guest library branch on them.
    const body = err.body as { error?: string; detail?: string }
    const msg =
      (err.status === 401 && guestToken ? body.error || body.detail : "") ||
      (err.status === 429 ? body.error || "Too many requests — slow down and try again in a minute." : "") ||
      (err.status !== 401 ? body.error || body.detail : "") ||
      err.message
    throw new ContentError(msg, err.status, typeof err.body.code === "string" ? err.body.code : err.code)
  }
}

export async function getBookAccess(bookId: string | number, guestToken?: string | null): Promise<BookAccess> {
  const res = await contentFetch(`/books/${bookId}/access/`, {}, guestToken)
  return res.json()
}

export async function getReaderManifest(bookId: string | number, guestToken?: string | null): Promise<ReaderManifest> {
  const res = await contentFetch(`/books/${bookId}/reader/`, {}, guestToken)
  return res.json()
}

export async function getReaderPageText(url: string, guestToken?: string | null): Promise<string> {
  const res = await contentFetch(url, {}, guestToken)
  const data = (await res.json()) as { text?: string }
  return data.text || ""
}

export async function getAudioStreamUrl(bookId: string | number, guestToken?: string | null): Promise<string> {
  // POST only mints a short-lived signed URL (nothing stored): safe to retry.
  const res = await contentFetch(`/books/${bookId}/audio/stream-url/`, { method: "POST", pure: true }, guestToken)
  const data = (await res.json()) as { url: string }
  return `${apiOrigin()}${data.url}`
}

function filenameFrom(res: Response, fallback: string) {
  const cd = res.headers.get("Content-Disposition") ?? ""
  const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  return m?.[1] ? decodeURIComponent(m[1].replace(/"/g, "")) : fallback
}

/** Fetch an allowed download (server re-checks flag + limit every time). */
export async function fetchBookDownload(
  bookId: string | number,
  kind: BookKind,
  guestToken?: string | null,
  fallbackName?: string,
): Promise<{ blob: Blob; filename: string }> {
  // No timeout: a large file must not be cut off and re-requested (each
  // completed download counts toward the limit server-side).
  const res = await contentFetch(`/books/${bookId}/download/?kind=${kind}`, { timeoutMs: 0, retries: 0 }, guestToken)
  return {
    blob: await res.blob(),
    filename: filenameFrom(res, fallbackName || (kind === "ebook" ? "book.pdf" : "book.mp3")),
  }
}

/** Download and hand the file to the browser's save flow. */
export async function downloadBook(
  bookId: string | number,
  kind: BookKind,
  fallbackName: string,
  guestToken?: string | null,
): Promise<void> {
  const { blob, filename } = await fetchBookDownload(bookId, kind, guestToken, fallbackName)
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objUrl
  a.download = filename || fallbackName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objUrl), 1000)
}

// ─── Guest purchases ─────────────────────────────────────────────────────

export type GuestLibraryItem = {
  order_id: number
  kind: BookKind
  book: { id: string; title: string; author: string }
  available: boolean
  can_read: boolean
  can_download: boolean
  downloads_remaining: number
}

export type GuestLibrary = { email: string; expires_at: string; items: GuestLibraryItem[] }

export async function getGuestLibrary(guestToken: string): Promise<GuestLibrary> {
  const res = await contentFetch(`/guest/access/`, {}, guestToken)
  return res.json()
}

/** "Get a new access link". Always resolves with the same generic message
 * (the server never reveals whether the email bought anything). */
export async function requestGuestLink(email: string, call?: CallOptions): Promise<string> {
  try {
    const data = await apiAction<{ message?: string }>(
      "/guest/renew/",
      { method: "POST", auth: false, body: JSON.stringify({ email }) },
      call,
    )
    return data.message || "If this email has purchases, we've sent a link."
  } catch (err) {
    if (err instanceof AuthFetchError && err.status === 429) {
      throw new AuthFetchError("Too many requests for a new link. Try again later.", 429, err.code, err.body)
    }
    throw err
  }
}

const GUEST_TOKEN_KEY = "plugyard_guest_token"

export function storeGuestToken(token: string) {
  try {
    sessionStorage.setItem(GUEST_TOKEN_KEY, token)
  } catch {
    // private mode: token only lives in memory for this page
  }
}

export function readGuestToken(): string | null {
  try {
    return sessionStorage.getItem(GUEST_TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearGuestToken() {
  try {
    sessionStorage.removeItem(GUEST_TOKEN_KEY)
  } catch {
    // ignore
  }
}
