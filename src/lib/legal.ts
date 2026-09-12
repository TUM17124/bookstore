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

export async function getLegalStatus(token: string): Promise<LegalStatus> {
  const response = await fetch(`${API}/legal/status/`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data?.error || 'Unable to check legal status.')
  }

  return data
}

export async function acceptLegal(token: string) {
  const response = await fetch(`${API}/legal/accept/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accepted: true,
      terms_accepted: true,
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data?.error || 'Unable to accept the legal terms.')
  }

  return data
}