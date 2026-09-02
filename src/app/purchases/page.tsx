'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getPurchases, downloadOrderUrl, type PurchaseItem } from '@/lib/api'
import { getStoredUser } from '@/lib/auth-client'

export default function PurchasesPage() {
  const router = useRouter()
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

  function close() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/')
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-foreground/10 px-3 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-foreground/10"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold">My purchases</h1>
          <p className="text-[12px] text-foreground/50">Close to go back</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg px-4 py-8">
          <p className="text-sm text-foreground/55">
            Use the email from checkout. Open a title to return to that book on the shelf.
          </p>

          <form
            className="mt-6 flex gap-2"
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

          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">
              Ebooks
            </h2>
            <ul className="mt-2 space-y-2">
              {ebooks.map((p) => (
                <li
                  key={p.order_id}
                  className="flex items-center justify-between rounded-xl border border-foreground/10 px-3 py-2 text-sm"
                >
                  <Link href={`/?book=${p.book_id}`} className="font-medium underline">
                    Book #{p.book_id}
                  </Link>
                  <a
                    href={downloadOrderUrl(p.order_id, email)}
                    className="text-xs font-semibold"
                  >
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">
              Audiobooks
            </h2>
            <ul className="mt-2 space-y-2">
              {audiobooks.map((p) => (
                <li
                  key={p.order_id}
                  className="flex items-center justify-between rounded-xl border border-foreground/10 px-3 py-2 text-sm"
                >
                  <Link href={`/?book=${p.book_id}`} className="font-medium underline">
                    Book #{p.book_id}
                  </Link>
                  <a
                    href={downloadOrderUrl(p.order_id, email)}
                    className="text-xs font-semibold"
                  >
                    Download
                  </a>
                </li>
              ))}
              {!busy && audiobooks.length === 0 ? (
                <li className="text-sm text-foreground/45">No audiobook purchases yet.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}