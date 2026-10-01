import { authFetch, errorMessage, type CallOptions } from '@/lib/auth-fetch'

export async function getLegalPages(slug?: string) {
  const q = slug ? `?slug=${encodeURIComponent(slug)}` : ""
  const r = await fetch(`${API}/legal/${q}`, { cache: "no-store" })
  return r.json()
}


const API = process.env.NEXT_PUBLIC_API_URL!

export type LegalStatus = {
  accepted?: boolean
  terms_accepted?: boolean
  legal_required?: boolean
  must_accept?: boolean
  legal_version?: string
  accepted_version?: string | null
  legal_change_summary?: string
  summary?: string
}

export function needsLegalAccept(data: LegalStatus | null | undefined) {
  if (!data) return false
  if (typeof data.legal_required === 'boolean') return data.legal_required
  if (typeof data.must_accept === 'boolean') return data.must_accept
  if (typeof data.accepted === 'boolean') return !data.accepted
  if (typeof data.terms_accepted === 'boolean') return !data.terms_accepted
  if (data.legal_version && data.accepted_version) {
    return data.legal_version !== data.accepted_version
  }
  return false
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept for existing callers; the token now comes from authFetch
export async function getLegalStatus(_token: string): Promise<LegalStatus> {
  try {
    const response = await authFetch(`${API}/legal/status/`, { cache: 'no-store' })
    return await response.json()
  } catch (err) {
    throw new Error(errorMessage(err, 'Unable to check legal status.'))
  }
}

/** Idempotent server-side (shop/idempotency.py): retried with `call`'s key. */
export async function acceptLegal(_token: string, call?: CallOptions) {
  const response = await authFetch(`${API}/legal/accept/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accepted: true,
      terms_accepted: true,
    }),
    ...call,
  })
  return response.json().catch(() => ({}))
}
