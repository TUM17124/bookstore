// src/lib/api.ts
import { splitName } from "@/lib/name"

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

/** Exchanges the stored refresh token for a new access token — the access
 * token is intentionally short-lived (see backend SIMPLE_JWT comment), so
 * this has to run periodically in the background or every page reload
 * would eventually hit a stale token. Throws SessionEvictedError
 * specifically when this session was the one silently evicted by the
 * concurrent-session cap (its refresh token got blacklisted), so callers
 * can show that distinctly rather than a generic "please log in again." */
export async function refreshAccessToken(): Promise<string> {
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
    throw new Error((data as { error?: string; detail?: string }).error || "Session expired")
  }
  const access = (data as { access?: string }).access
  if (!access) throw new Error("Refresh response had no access token")
  setTokens(access)
  return access
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

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      (data as { error?: string; detail?: string }).error ||
      (data as { detail?: string }).detail ||
      "Request failed"
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg))
  }
  return data as T
}

export async function getPurchases(email: string): Promise<{
  ebooks: PurchaseItem[]
  audiobooks: PurchaseItem[]
}> {
  if (!email) return { ebooks: [], audiobooks: [] }
  const res = await fetch(
    `${API}/orders/purchases/?email=${encodeURIComponent(email)}`,
  )
  if (res.status === 429) {
    throw new Error("Too many lookups. Wait a minute and try again.")
  }
  if (!res.ok) return { ebooks: [], audiobooks: [] }
  return res.json()
}

export function downloadOrderUrl(orderId: number, email: string) {
  return `${API}/orders/${orderId}/download/?email=${encodeURIComponent(email)}`
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
  const url = `${API}/books/${qs ? `?${qs}` : ""}`
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to load books")
  return res.json()
}

export async function getBook(id: string | number): Promise<ApiBook | null> {
  if (!API) throw new Error("NEXT_PUBLIC_API_URL is not set")
  const res = await fetch(`${API}/books/${id}/`)
  if (!res.ok) return null
  return res.json()
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
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}/books/${bookId}/related/?limit=${limit}`, { headers })
  if (!res.ok) return []
  const data = await res.json().catch(() => [])
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
  const token = getToken()
  if (!token) return { is_pro: false, subscription: null }
  const res = await fetch(`${API}/pro/status/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return { is_pro: false, subscription: null }
  return res.json()
}

/** Public — no auth required, so the /pro page can show the real
 * admin-configured price to logged-out visitors too. Never hardcode
 * this value in frontend code; SiteSettings.pro_price_monthly is the
 * single source of truth. */
export async function getProPricing(): Promise<{ price_monthly: string }> {
  const res = await fetch(`${API}/pro/pricing/`)
  if (!res.ok) return { price_monthly: "0" }
  return res.json()
}

export async function subscribePro(): Promise<{
  subscription_id: number
  checkout_url: string
  reference: string
  amount: string
}> {
  const token = getToken()
  if (!token) throw new Error("Log in required")
  const res = await fetch(`${API}/pro/subscribe/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || "Could not start subscription")
  return data
}

export async function confirmProPayment(reference: string): Promise<{
  ok: boolean
  paid?: boolean
  already_paid?: boolean
  error?: string
  subscription?: ProStatus["subscription"]
}> {
  const token = getToken()
  if (!token) return { ok: false, error: "Log in required" }
  const res = await fetch(`${API}/pro/confirm/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reference }),
  })
  return res.json()
}

export type TtsVoice = {
  id: string
  label: string
  gender: string
  description: string
}

export async function getTtsVoices(): Promise<TtsVoice[]> {
  const res = await fetch(`${API}/tts/voices/`)
  if (!res.ok) return []
  const data = await res.json().catch(() => ({}))
  return Array.isArray(data.voices) ? data.voices : []
}

export type TtsTimepoint = { mark: string; time_seconds: number }

export type TtsResult = {
  token: string
  sentences: string[]
  timepoints: TtsTimepoint[]
  cached: boolean
}

/** Synthesizes (or reuses cached) audio for one reading-view page — Pro
 * "robot reader" feature. Throws with `.proRequired` set if the caller
 * isn't an active Pro subscriber, so the UI can show an upsell instead of
 * a generic error. */
export class TtsError extends Error {
  proRequired: boolean
  constructor(message: string, proRequired = false) {
    super(message)
    this.name = "TtsError"
    this.proRequired = proRequired
  }
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
    throw new TtsError(data.error || "Could not read this page aloud", !!data.pro_required)
  }
  return data as TtsResult
}

export function ttsAudioUrl(token: string) {
  return `${API}/tts-audio/?token=${encodeURIComponent(token)}`
}

/** Thrown by createCheckout — carries `legalRequired` so the checkout page
 * can show the "accept the terms" message inline instead of a generic
 * error (the generic `api()` helper above discards extra response fields,
 * so this endpoint parses its own response instead of using it). */
export class CheckoutError extends Error {
  legalRequired: boolean
  constructor(message: string, legalRequired = false) {
    super(message)
    this.name = "CheckoutError"
    this.legalRequired = legalRequired
  }
}

export async function createCheckout(payload: {
  book_id: number
  product_type: "ebook" | "audiobook"
  email: string
  terms_accepted?: boolean
}) {
  const token = getToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API}/checkout/`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const body = data as { error?: string; legal_required?: boolean }
    throw new CheckoutError(body.error || "Checkout failed", !!body.legal_required)
  }
  return data as { order_id: number; checkout_url: string; dev_mode?: boolean }
}

export async function confirmOrderPayment(
  orderId: string,
  payload: { reference?: string; email: string },
) {
  const res = await fetch(`${API}/orders/${orderId}/confirm/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || "Confirm failed")
  }
  return res.json()
}

export function freeBookUrl(
  bookId: string | number,
  type: "ebook" | "audiobook" = "ebook",
  inline = false,
) {
  const q = new URLSearchParams({ type })
  if (inline) q.set("inline", "1")
  return `${API}/books/${bookId}/free/?${q}`
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
) {
  const [first_name, last_name] = splitName(name)
  return api("/auth/register/", {
    method: "POST",
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
  })
}

export async function verifyEmail(email: string, code: string) {
  const data = await api<{
    access?: string
    refresh?: string
    user?: { email?: string; name?: string }
  }>("/auth/verify-email/", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  })
  if (data.access) setTokens(data.access, data.refresh)
  return data
}

export async function resendCode(
  email: string,
  purpose: "verify" | "reset" = "verify",
) {
  return api("/auth/resend-code/", {
    method: "POST",
    body: JSON.stringify({ email, purpose }),
  })
}

export async function forgotPassword(email: string) {
  return api("/auth/forgot-password/", {
    method: "POST",
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(
  email: string,
  code: string,
  password: string,
  confirmPassword: string,
) {
  const data = await api<{
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
  })
  if (data.access) setTokens(data.access, data.refresh)
  return data
}

export async function googleLogin(
  credential: string,
  termsAccepted = false,
  referralCode = "",
) {
  const data = await api<{
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
  })
  if (data.access) setTokens(data.access, data.refresh)
  return data
}

export async function login(email: string, password: string, termsAccepted = false) {
  const data = await api<{
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
) {
  return api(`/books/${bookId}/audio-notes/`, {
    method: "POST",
    body: JSON.stringify({ position, note }),
  })
}

export async function deleteAudioNote(id: number) {
  return api(`/audio-notes/${id}/`, { method: "DELETE" })
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

export function previewBookUrl(bookId: string | number) {
  return `${API}/books/${bookId}/preview/?inline=1`
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

export async function addBookmarkApi(bookId: string | number) {
  return api("/bookmarks/", {
    method: "POST",
    body: JSON.stringify({ book_id: Number(bookId) }),
  })
}

export async function removeBookmarkApi(bookId: string | number) {
  return api(`/bookmarks/${bookId}/`, { method: "DELETE" })
}

export async function getRatings(bookId: string) {
  return api<{ average: number; count: number; myRating: number | null }>(
    `/books/${bookId}/ratings/`,
  )
}

export async function postRating(bookId: string, value: number) {
  return api(`/books/${bookId}/ratings/`, {
    method: "POST",
    body: JSON.stringify({ value }),
  })
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
) {
  return api(`/books/${bookId}/comments/`, {
    method: "POST",
    body: JSON.stringify({
      body,
      parentId: parentId != null ? Number(parentId) : null,
    }),
  })
}

export async function getMySales() {
  const token = bearer()
  const res = await fetch(`${API}/me/sales/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return { ok: true, sales: [], books: [] }
  return res.json()
}

export async function requestPayout() {
  const token = bearer()
  const res = await fetch(`${API}/me/payouts/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error || "Payout failed")
  }
  return res.json()
}

export async function createBoost(book_id: number, days = 7) {
  return initBoost(bearer(), book_id, days)
}

export async function publishBook(form: FormData) {
  const token = bearer()
  const res = await fetch(`${API}/me/books/`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Could not submit book")
  return data
}

export async function myBooks(_token?: string) {
  const token = bearer(_token)
  const res = await fetch(`${API}/me/books/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error("Could not load your books")
  return res.json()
}

export async function updateMyBook(bookId: string | number, form: FormData) {
  const token = bearer()
  const res = await fetch(`${API}/me/books/${bookId}/`, {
    method: "PATCH",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Could not update book")
  return data
}

export async function deleteMyBook(bookId: string | number) {
  const token = bearer()
  const res = await fetch(`${API}/me/books/${bookId}/`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "Could not delete book")
  return data
}

export async function initBoost(token: string, bookId: number, days = 7) {
  const r = await fetch(`${API}/me/boost/init/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer(token)}`,
    },
    body: JSON.stringify({ book_id: bookId, days }),
  })
  return r.json()
}

export async function confirmBoost(token: string, reference: string) {
  const r = await fetch(`${API}/me/boost/confirm/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer(token)}`,
    },
    body: JSON.stringify({ reference }),
  })
  return r.json()
}

export async function myBoosts(token?: string) {
  const r = await fetch(`${API}/me/boosts/`, {
    headers: { Authorization: `Bearer ${bearer(token)}` },
  })
  return r.json()
}

export async function payoutAccount(token?: string) {
  const r = await fetch(`${API}/me/payout-account/`, {
    headers: { Authorization: `Bearer ${bearer(token)}` },
  })
  return r.json()
}

export async function savePayoutAccount(
  token: string,
  body: {
    method: string
    account_name?: string
    account_number?: string
    extra?: string
  },
) {
  const r = await fetch(`${API}/me/payout-account/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer(token)}`,
    },
    body: JSON.stringify(body),
  })
  return r.json()
}

export async function deletePayoutAccount(token?: string) {
  const t =
    token ||
    (typeof window !== "undefined"
      ? localStorage.getItem("access_token") ||
        localStorage.getItem("access") ||
        localStorage.getItem("token") ||
        ""
      : "")
  const API = process.env.NEXT_PUBLIC_API_URL!
  const r = await fetch(`${API}/me/payout-account/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${t}` },
  })
  return r.json().catch(() => ({ ok: r.ok }))
}

export async function getLegalPages(slug?: string) {
  const q = slug ? `?slug=${encodeURIComponent(slug)}` : ""

  const r = await fetch(`${API}/legal/${q}`, {
    cache: "no-store",
  })

  return r.json()
}

export async function getLegalStatus(token?: string) {
  const r = await fetch(`${API}/legal/status/`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
    cache: "no-store",
  })

  return r.json()
}

export async function acceptLegal(
  token: string,
  source = "reaccept",
) {
  const r = await fetch(`${API}/legal/accept/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ source }),
  })

  return r.json()
}

export const getSettings = () => api<any>("/me/settings/")
export const changeUsername = (username: string) => api("/me/settings/username/", { method: "POST", body: JSON.stringify({ username }) })
export async function changeName(first_name: string, last_name: string) {
  return api("/settings/name/", {
    method: "POST",
    body: JSON.stringify({ first_name, last_name }),
  })
}
export const startEmailChange = (email: string, current_password: string) => api("/me/settings/email/", { method: "POST", body: JSON.stringify({ email, current_password }) })
export const confirmEmailChange = (code: string) => api("/me/settings/email/confirm/", { method: "POST", body: JSON.stringify({ code }) })
export const requestAffiliateWithdrawal = (amount: string) => api("/me/affiliate/withdrawals/", { method: "POST", body: JSON.stringify({ amount }) })
export const deleteAccount = (body: { current_password?: string; google_credential?: string; reason?: string }) => api("/me/settings/delete-account/", { method: "POST", body: JSON.stringify(body) })

export type NotificationPrefs = {
  push_enabled: boolean
  email_enabled: boolean
  active_devices: number
}
export const getNotificationPrefs = () => api<NotificationPrefs>("/me/notification-prefs/")
export const updateNotificationPrefs = (
  body: Partial<Pick<NotificationPrefs, "push_enabled" | "email_enabled">>,
) => api<NotificationPrefs>("/me/notification-prefs/", { method: "POST", body: JSON.stringify(body) })
export async function unsubscribePush(endpoint?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}/push/unsubscribe/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ endpoint: endpoint || "" }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || "Could not unsubscribe")
  return data
}

export default searchTrack


