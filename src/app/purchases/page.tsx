'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPurchases, downloadOrderUrl, type PurchaseItem } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-client'

export default function PurchasesPage() {
  const [email, setEmail] = useState('')
  const [input, setInput] = useState('')
  const [ebooks, setEbooks] = useState<PurchaseItem[]>([])
  const [audiobooks, setAudiobooks] = useState<PurchaseItem[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const u = getStoredUser()?.email || sessionStorage.getItem('checkout_email') || ''
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
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-bold">My purchases</h1>
      <p className="mt-2 text-sm text-foreground/55">
        Use the email from checkout. Open a title to return to that book on the shelf.
      </p>

      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const next = input.trim().toLowerCase()
          if (!next) return
          sessionStorage.setItem('checkout_email', next)
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
        <button className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">
          Load
        </button>
      </form>

      {busy ? <p className="mt-6 text-sm text-foreground/50">Loading…</p> : null}

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Ebooks</h2>
        <ul className="mt-2 space-y-2">
          {ebooks.map((p) => (
            <li key={p.order_id} className="flex items-center justify-between rounded-xl border border-foreground/10 px-3 py-2 text-sm">
              <Link href={`/?book=${p.book_id}`} className="font-medium underline">
                Book #{p.book_id}
              </Link>
              <a href={downloadOrderUrl(p.order_id, email)} className="text-xs font-semibold">
                Download
              </a>
            </li>
          ))}
          {!busy && ebooks.length === 0 ? (
            <li className="text-sm text-foreground/45">No ebook purchases yet.</li>
          ) : null}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Audiobooks</h2>
        <ul className="mt-2 space-y-2">
          {audiobooks.map((p) => (
            <li key={p.order_id} className="flex items-center justify-between rounded-xl border border-foreground/10 px-3 py-2 text-sm">
              <Link href={`/?book=${p.book_id}`} className="font-medium underline">
                Book #{p.book_id}
              </Link>
              <a href={downloadOrderUrl(p.order_id, email)} className="text-xs font-semibold">
                Download
              </a>
            </li>
          ))}
          {!busy && audiobooks.length === 0 ? (
            <li className="text-sm text-foreground/45">No audiobook purchases yet.</li>
          ) : null}
        </ul>
      </section>
    </main>
  )
}