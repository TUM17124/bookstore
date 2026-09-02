'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LegalOverlay } from '@/components/legal-overlay'
import { getPurchases, downloadOrderUrl, type PurchaseItem } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-client'

export default function PurchasesPage() {
  const [email, setEmail] = useState('')
  const [input, setInput] = useState('')
  const [ebooks, setEbooks] = useState<PurchaseItem[]>([])
  const [audiobooks, setAudiobooks] = useState<PurchaseItem[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const u =
      getStoredUser()?.email ||
      (typeof window !== 'undefined'
        ? localStorage.getItem('checkout_email') ||
          sessionStorage.getItem('checkout_email') ||
          ''
        : '')
    const e = u.trim().toLowerCase()
    if (e) {
      setEmail(e)
      setInput(e)
    }
  }, [])

  useEffect(() => {
    if (!email) return
    setBusy(true)
    getPurchases(email)
      .then((d) => {
        setEbooks(d.ebooks || [])
        setAudiobooks(d.audiobooks || [])
      })
      .finally(() => setBusy(false))
  }, [email])

  return (
    <LegalOverlay title="My purchases" updated="Use checkout email">
      <p>
        Use the email from checkout. Open a title to return to that book on the
        shelf. Close with X to go back.
      </p>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const next = input.trim().toLowerCase()
          if (!next) return
          sessionStorage.setItem('checkout_email', next)
          localStorage.setItem('checkout_email', next)
          setEmail(next)
        }}
      >
        <input
          type="email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="email used at checkout"
          className="min-w-0 flex-1 rounded-xl border border-foreground/15 bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
        >
          Load
        </button>
      </form>

      {busy ? <p className="mt-6 text-sm text-foreground/50">Loading…</p> : null}

      <h2>Ebooks</h2>
      <ul>
        {ebooks.map((p) => (
          <li key={p.order_id}>
            <Link href={`/?book=${p.book_id}`}>Book #{p.book_id}</Link>
            {' · '}
            <a href={downloadOrderUrl(p.order_id, email)}>Download</a>
          </li>
        ))}
        {!busy && ebooks.length === 0 ? <li>No ebook purchases yet.</li> : null}
      </ul>

      <h2>Audiobooks</h2>
      <ul>
        {audiobooks.map((p) => (
          <li key={p.order_id}>
            <Link href={`/?book=${p.book_id}`}>Book #{p.book_id}</Link>
            {' · '}
            <a href={downloadOrderUrl(p.order_id, email)}>Download</a>
          </li>
        ))}
        {!busy && audiobooks.length === 0 ? (
          <li>No audiobook purchases yet.</li>
        ) : null}
      </ul>
    </LegalOverlay>
  )
}