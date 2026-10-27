'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { BadgeCheck, CreditCard, FileLock2 } from 'lucide-react'
import { authFetch } from '@/lib/auth-fetch'

const API = process.env.NEXT_PUBLIC_API_URL || ''
type DocumentType = { id: number; label: string; instructions: string; allowed_extensions: string[]; max_size_mb: number }
type Options = { enabled: boolean; document_types: DocumentType[]; privacy_notice: string; monthly_price: string; currency: string; billing_days: number }
type State = { identity: { status: string; rejection_reason: string; submitted_at: string | null; review_expires_at: string | null }; subscription: { status: string; amount: string; currency: string; expires_at: string | null } | null; badge_active: boolean }

export default function VerificationClient() {
  const [options, setOptions] = useState<Options | null>(null)
  const [state, setState] = useState<State | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [optionsResponse, stateResponse] = await Promise.all([
        authFetch(`${API}/seller-verification/options/`),
        authFetch(`${API}/seller-verification/me/`),
      ])
      if (!optionsResponse.ok || !stateResponse.ok) throw new Error('Could not load seller verification.')
      setOptions(await optionsResponse.json())
      setState(await stateResponse.json())
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load seller verification.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const reference = new URLSearchParams(window.location.search).get('reference')
    if (!reference) return
    void authFetch(`${API}/seller-verification/confirm/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Payment confirmation is still pending. Your badge remains subject to identity review.')
      setNotice('Payment confirmation received. Identity approval is still required for the badge.')
      await load()
    }).catch((error) => setNotice(error instanceof Error ? error.message : 'Payment confirmation is pending.'))
  }, [load])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!options?.enabled || !options.document_types.length) return
    setBusy(true); setNotice('')
    try {
      const response = await authFetch(`${API}/seller-verification/me/`, { method: 'POST', body: new FormData(event.currentTarget) })
      if (!response.ok) throw new Error((await response.json()).error || 'The verification application could not be submitted.')
      setNotice('Your identity application is awaiting administrator review.')
      await load()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The verification application could not be submitted.') }
    finally { setBusy(false) }
  }

  async function subscribe() {
    if (!options?.enabled) return
    setBusy(true); setNotice('')
    try {
      const response = await authFetch(`${API}/seller-verification/subscribe/`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok || !data.checkout_url) throw new Error(data.error || 'Subscription checkout could not be started.')
      window.location.href = data.checkout_url
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Subscription checkout could not be started.') }
    finally { setBusy(false) }
  }

  const canApply = Boolean(options?.enabled && options.document_types.length && !['pending', 'approved', 'suspended', 'revoked'].includes(state?.identity.status || ''))
  return <main className="mx-auto max-w-4xl px-4 py-10">
    <div className="flex items-center gap-3"><BadgeCheck className="h-9 w-9 text-[var(--brand-pink-text)]"/><h1 className="text-4xl font-black">Seller Verification</h1></div>
    <p className="mt-3 text-muted-foreground">A public checkmark requires an authorized identity review and an eligible active subscription. Payment alone never grants a badge.</p>
    {notice && <p role="status" className="mt-4 rounded-xl bg-muted p-3 text-foreground">{notice}</p>}
    {loading && <p role="status" className="mt-7">Loading current verification status…</p>}
    {!loading && notice && !options && <button onClick={() => void load()} className="mt-3 rounded-full border px-4 py-2 font-semibold">Try again</button>}
    {!loading && state && <div className="mt-7 grid gap-4 sm:grid-cols-3"><Status label="Identity review" value={state.identity.status}/><Status label="Subscription" value={state.subscription?.status || 'inactive'}/><Status label="Public badge" value={state.badge_active ? 'active' : 'inactive'}/></div>}
    {!loading && options && !options.enabled && <section role="status" className="mt-7 rounded-3xl border border-border bg-card p-6 text-card-foreground"><h2 className="text-xl font-bold">Applications are currently unavailable</h2><p className="mt-2 text-muted-foreground">PlugYard is not collecting identity documents or accepting verification-subscription payments at this time. Existing verification decisions continue to follow their recorded status.</p></section>}
    {!loading && options?.enabled && <>
      <section className="mt-7 rounded-3xl border border-border bg-card p-6 text-card-foreground"><div className="flex items-center gap-2"><FileLock2 className="text-[var(--brand-pink-text)]"/><h2 className="text-xl font-bold">Identity application</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">{options.privacy_notice || 'Identity documents are private and reviewed only by authorized staff.'}</p>
        {!options.document_types.length ? <p className="mt-4 rounded-xl bg-muted p-3">Applications are not available because administrators have not configured accepted document types.</p> : <form onSubmit={submit} className="mt-5 grid gap-4">
          <label>Legal name<input required name="legal_name" className="mt-1 w-full rounded-xl border border-border bg-background p-3"/></label>
          <label>Document type<select required name="document_type" className="mt-1 w-full rounded-xl border border-border bg-background p-3"><option value="">Choose a document</option>{options.document_types.map((doc) => <option key={doc.id} value={doc.id}>{doc.label}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">{options.document_types.map((doc) => <div key={doc.id} className="rounded-xl border p-3 text-sm"><p className="font-semibold">{doc.label}</p><p className="mt-1 text-muted-foreground">{doc.instructions || 'Follow the instructions shown by the review team.'}</p><p className="mt-2 text-xs text-muted-foreground">Accepted: {doc.allowed_extensions.join(', ') || 'PDF, JPG, JPEG, PNG'} · Up to {doc.max_size_mb} MB</p></div>)}</div>
          <label>Private identity document<input required name="document" type="file" accept="image/jpeg,image/png,application/pdf" className="mt-1 block w-full rounded-xl border border-border bg-background p-3"/></label>
          <label>Supporting information (optional)<textarea name="supporting_information" rows={3} className="mt-1 w-full rounded-xl border border-border bg-background p-3"/></label>
          <p className="text-xs text-muted-foreground">Documents are never displayed on your public seller profile. Submission does not guarantee approval.</p>
          <button disabled={!canApply || busy} className="min-h-11 rounded-full bg-pink-600 px-5 font-bold text-white disabled:opacity-50">{busy ? 'Submitting…' : 'Submit for review'}</button>
          {state?.identity.rejection_reason && <p className="text-sm">Previous review: {state.identity.rejection_reason}</p>}
        </form>}</section>
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 text-card-foreground"><div className="flex items-center gap-2"><CreditCard className="text-[var(--brand-pink-text)]"/><h2 className="text-xl font-bold">Seller Verification Subscription</h2></div><p className="mt-3">{options.currency} {options.monthly_price} every {options.billing_days} days. The provider must confirm payment; subscription does not itself grant verification.</p>{state?.subscription?.expires_at && <p className="mt-2 text-sm">Current period ends: {new Date(state.subscription.expires_at).toLocaleDateString()}</p>}<button disabled={busy || Number(options.monthly_price) <= 0} onClick={() => void subscribe()} className="mt-5 min-h-11 rounded-full bg-pink-600 px-5 font-bold text-white disabled:opacity-50">Continue to secure payment</button></section>
    </>}
  </main>
}

function Status({label, value}: {label: string; value: string}) { return <div className="rounded-2xl border p-4"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 font-bold capitalize">{value.replaceAll('_', ' ')}</p></div> }
