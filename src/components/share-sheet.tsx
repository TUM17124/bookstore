'use client'

import { useEffect, useRef, useState } from 'react'
import { bookShareText, bookShareUrl, copyText, nativeShare, shareTargets, type Shareable } from '@/lib/share'

/** Fallback share panel (copy link + WhatsApp, Facebook, X, Telegram, LinkedIn, email).
 * Opened when the browser has no Web Share API, or from the author's "Share your book". */
export function ShareSheet({ book, open, onClose, kind = "book" }: { book: Shareable; open: boolean; onClose: () => void; kind?: "book" | "listing" }) {
  const [copied, setCopied] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const url = bookShareUrl(book)
  const text = bookShareText(book)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={kind === "book" ? "Share this book" : "Share this listing"}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-2xl bg-background p-4 text-foreground shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-base font-bold">Share “{book.title}”</h2>
          <button ref={closeRef} type="button" onClick={onClose} className="rounded-full bg-foreground/10 px-3 py-1 text-sm font-bold">Close</button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
        <div className="mt-3 flex gap-2">
          <input readOnly value={url} aria-label={kind === "book" ? "Book link" : "Listing link"} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-full border border-foreground/15 bg-background px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={async () => { setCopied(await copyText(url)); setTimeout(() => setCopied(false), 2000) }}
            className="shrink-0 rounded-full bg-[var(--brand-pink)] px-4 py-2 text-sm font-bold text-[var(--on-brand)]"
          >
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
        </div>
        {canNative ? (
          <button type="button" onClick={() => void nativeShare(book).then((r) => { if (r === 'shared') onClose() })} className="mt-3 w-full rounded-full bg-foreground py-2 text-sm font-bold text-background">
            Share…
          </button>
        ) : null}
        <ul className="mt-3 grid grid-cols-3 gap-2" aria-label="Share on">
          {shareTargets(url, text).map((t) => (
            <li key={t.id}>
              <a href={t.href} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center rounded-xl bg-foreground/10 text-sm font-semibold hover:bg-foreground/15">
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Author dashboard: the public link, the sharing options and the downloadable preview images. */
export function ShareYourBook({ book }: { book: Shareable & { shareImage?: { og?: string; square?: string } | null } }) {
  const url = bookShareUrl(book)
  const [copied, setCopied] = useState(false)
  const [sheet, setSheet] = useState(false)
  return (
    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3 text-sm" aria-label="Share your book">
      <p className="font-semibold">Share your book</p>
      <p className="text-muted-foreground">This link shows your cover, title and description when it is shared on WhatsApp, Facebook, X, Telegram or LinkedIn, and lets Google index your book.</p>
      <div className="mt-2 flex gap-2">
        <input readOnly value={url} aria-label="Public book link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-foreground/15 bg-background px-3 py-2" />
        <button type="button" onClick={async () => { setCopied(await copyText(url)); setTimeout(() => setCopied(false), 2000) }} className="shrink-0 rounded-lg border px-3 py-2 font-semibold">
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        <button type="button" onClick={() => void nativeShare(book).then((r) => { if (r === 'unsupported') setSheet(true) })} className="shrink-0 rounded-lg bg-foreground px-3 py-2 font-semibold text-background">
          Share
        </button>
      </div>
      {book.shareImage?.og ? (
        <div className="mt-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={book.shareImage.og} alt="Preview image of your book" width={190} height={100} className="h-[100px] w-[190px] rounded-lg border border-foreground/10 object-cover" />
          <div className="flex flex-col gap-1">
            <a href={book.shareImage.og} download className="font-semibold text-[var(--brand-pink-text)] underline">Download image (1200×630)</a>
            {book.shareImage.square ? <a href={book.shareImage.square} download className="font-semibold text-[var(--brand-pink-text)] underline">Download square (1080×1080)</a> : null}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-muted-foreground">Your preview image is being made. Reload in a minute.</p>
      )}
      <ShareSheet book={book} open={sheet} onClose={() => setSheet(false)} />
    </div>
  )
}
