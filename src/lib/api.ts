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
  stock?: number
  hasEbook?: boolean
  hasAudiobook?: boolean
  isFree?: boolean
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
}

export async function getPurchases(email: string): Promise<{
  ebooks: PurchaseItem[]
  audiobooks: PurchaseItem[]
}> {
  if (!email) return { ebooks: [], audiobooks: [] }
  const res = await fetch(
    `${API}/orders/purchases/?email=${encodeURIComponent(email)}`,
  )
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
}): Promise<Paginated<ApiBook> | ApiBook[]> {
  if (!API) throw new Error('NEXT_PUBLIC_API_URL is not set')

  const q = new URLSearchParams()
  if (params?.featured) q.set('featured', '1')
  if (params?.category) q.set('category', params.category)
  if (params?.search) q.set('search', params.search)
  if (params?.page) q.set('page', String(params.page))

  const qs = q.toString()
  const url = `${API}/books/${qs ? `?${qs}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load books')
  return res.json()
}

export async function createCheckout(payload: {
  book_id: number
  product_type: 'ebook' | 'audiobook'
  email: string
}) {
  return api<{ order_id: number; checkout_url: string; dev_mode?: boolean }>(
    '/checkout/',
    { method: 'POST', body: JSON.stringify(payload) },
  )
}

export async function confirmOrderPayment(
  orderId: string,
  payload: { reference?: string; email: string },
) {
  const res = await fetch(`${API}/orders/${orderId}/confirm/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || 'Confirm failed')
  }
  return res.json()
}

export function freeBookUrl(
  bookId: string | number,
  type: 'ebook' | 'audiobook' = 'ebook',
  inline = false,
) {
  const q = new URLSearchParams({ type })
  if (inline) q.set('inline', '1')
  return `${API}/books/${bookId}/free/?${q}`
}

export async function getOrder(orderId: string, email?: string) {
  const q = email ? `?email=${encodeURIComponent(email)}` : ''
  return api(`/orders/${orderId}/${q}`)
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token')
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem('access_token', access)
  if (refresh) localStorage.setItem('refresh_token', refresh)
}

export function setToken(access: string) {
  setTokens(access)
}

export function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      (data as { error?: string; detail?: string }).error ||
      (data as { detail?: string }).detail ||
      'Request failed'
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data as T
}

export async function register(
  email: string,
  password: string,
  name = '',
  confirmPassword = '',
) {
  return api('/auth/register/', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      confirm_password: confirmPassword || password,
      name,
    }),
  })
}

export async function verifyEmail(email: string, code: string) {
  const data = await api<{
    access?: string
    refresh?: string
    user?: { email?: string; name?: string }
  }>('/auth/verify-email/', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
  if (data.access) setTokens(data.access, data.refresh)
  return data
}

export async function resendCode(
  email: string,
  purpose: 'verify' | 'reset' = 'verify',
) {
  return api('/auth/resend-code/', {
    method: 'POST',
    body: JSON.stringify({ email, purpose }),
  })
}

export async function forgotPassword(email: string) {
  return api('/auth/forgot-password/', {
    method: 'POST',
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
  }>('/auth/reset-password/', {
    method: 'POST',
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

export async function googleLogin(credential: string) {
  const data = await api<{
    access?: string
    refresh?: string
    user?: { email?: string; name?: string }
  }>('/auth/google/', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  })
  if (data.access) setTokens(data.access, data.refresh)
  return data
}

export async function login(email: string, password: string) {
  const data = await api<{ access: string; refresh: string }>('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username: email, email, password }),
  })
  setTokens(data.access, data.refresh)
  return data
}

export function logout() {
  clearTokens()
}

export async function fetchBookmarks() {
  return api<
    Array<{
      id: number
      book: ApiBook
      created_at: string
    }>
  >('/bookmarks/')
}

export async function addBookmarkApi(bookId: string | number) {
  return api('/bookmarks/', {
    method: 'POST',
    body: JSON.stringify({ book_id: Number(bookId) }),
  })
}

export async function removeBookmarkApi(bookId: string | number) {
  return api(`/bookmarks/${bookId}/`, { method: 'DELETE' })
}

export async function getRatings(bookId: string) {
  return api<{ average: number; count: number; myRating: number | null }>(
    `/books/${bookId}/ratings/`,
  )
}

export async function postRating(bookId: string, value: number) {
  return api(`/books/${bookId}/ratings/`, {
    method: 'POST',
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
    method: 'POST',
    body: JSON.stringify({
      body,
      parentId: parentId != null ? Number(parentId) : null,
    }),
  })
}