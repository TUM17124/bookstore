'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getToken } from '@/lib/api'
import { getPdfProgress, savePdfProgress } from '@/lib/api'

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string }
      getDocument: (opts: Record<string, unknown>) => { promise: Promise<any> }
    }
  }
}

function markKey(url: string) {
  return `plugyard-read-mark:${url.split('?')[0]}`
}

const AHEAD = 2

export function PdfReader({
  url,
  bookId,
  previewPages,
}: {
  url: string
  bookId?: string
  previewPages?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<any>(null)
  const maxPagesRef = useRef(0)
  const loadingPage = useRef<Set<number>>(new Set())
  const lastSave = useRef(0)
  const loggedIn = !!getToken()

  const [status, setStatus] = useState('Opening…')
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState<Record<number, string>>({})
  const [fontSize, setFontSize] = useState(18)
  const [page, setPage] = useState(1)
  const [marked, setMarked] = useState(0)
  const [resumeAt, setResumeAt] = useState(0)

  const nextPath =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/'
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`
  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`

  function saveLocal(n: number) {
    try {
      localStorage.setItem(markKey(url), String(n))
    } catch {
      // ignore
    }
  }

  async function saveCloud(n: number) {
    if (!loggedIn || !bookId || n < 1) return
    try {
      await savePdfProgress(bookId, n)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(markKey(url)) || 0)
      setMarked(saved)
      if (saved > 1) setResumeAt(saved)
    } catch {
      setMarked(0)
    }
  }, [url])

  async function extractPage(n: number) {
    const pdf = pdfRef.current
    const max = maxPagesRef.current
    if (!pdf || !max || n < 1 || n > max) return
    if (pages[n] || loadingPage.current.has(n)) return
    loadingPage.current.add(n)
    try {
      const pdfPage = await pdf.getPage(n)
      const content = await pdfPage.getTextContent()
      const text = content.items
        .map((item: { str?: string }) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      setPages((prev) => ({ ...prev, [n]: text || `Page ${n}` }))
    } catch {
      setPages((prev) => ({ ...prev, [n]: `Page ${n} could not be read.` }))
    } finally {
      loadingPage.current.delete(n)
    }
  }

  async function bufferAround(center: number, count = AHEAD) {
    const max = maxPagesRef.current
    if (!pdfRef.current || !max) return
    const start = Math.max(1, center)
    const end = Math.min(max, center + count)
    for (let i = start; i <= end; i++) {
      await extractPage(i)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadScript() {
      if (window.pdfjsLib) return
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('pdf.js failed'))
        document.body.appendChild(s)
      })
      window.pdfjsLib!.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    }

    ;(async () => {
      try {
        setStatus('Opening…')
        setPages({})
        maxPagesRef.current = 0
        await loadScript()
        if (cancelled) return

        const pdf = await window.pdfjsLib!.getDocument({
          url,
          disableStream: false,
          disableAutoFetch: true,
        }).promise
        if (cancelled) return

        pdfRef.current = pdf

        const rawTotal = pdf.numPages
        const totalPages = previewPages
          ? Math.min(rawTotal, previewPages)
          : rawTotal
        maxPagesRef.current = totalPages
        setTotal(totalPages)

        let saved = Number(localStorage.getItem(markKey(url)) || 0)
        if (loggedIn && bookId) {
          try {
            const cloud = await getPdfProgress(bookId)
            if (cloud.page > saved) saved = cloud.page
          } catch {
            // stay local
          }
        }

        const startAt = saved > 1 && saved <= totalPages ? saved : 1
        setPage(startAt)
        setMarked(saved > totalPages ? totalPages : saved)
        if (startAt > 1) setResumeAt(startAt)

        await bufferAround(startAt, AHEAD)
        if (cancelled) return
        setStatus('')

        requestAnimationFrame(() => {
          document
            .getElementById(`read-page-${startAt}`)
            ?.scrollIntoView({ block: 'start' })
        })
      } catch {
        if (!cancelled) setStatus('Could not open this book.')
      }
    })()

    return () => {
      cancelled = true
      pdfRef.current = null
      maxPagesRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, bookId, previewPages])

  function onScroll() {
    const root = scrollRef.current
    const max = maxPagesRef.current
    if (!root || !max) return
    const mid = root.scrollTop + 80
    let current = page
    for (let i = 1; i <= max; i++) {
      const el = document.getElementById(`read-page-${i}`)
      if (el && el.offsetTop <= mid) current = i
    }
    setPage(current)
    void bufferAround(current, AHEAD)
    saveLocal(current)
    setMarked(current)
    const now = Date.now()
    if (now - lastSave.current > 2500) {
      lastSave.current = now
      void saveCloud(current)
    }
  }

  function markHere() {
    saveLocal(page)
    setMarked(page)
    void saveCloud(page)
  }

  async function goToMark() {
    if (!marked) return
    await bufferAround(marked, AHEAD)
    setPage(marked)
    document.getElementById(`read-page-${marked}`)?.scrollIntoView({ block: 'start' })
  }

  const numbers = Array.from({ length: total }, (_, i) => i + 1)

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f4efe4]">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-black/10 bg-[#efe8d8] px-2 py-2">
        <button
          type="button"
          onClick={() => setFontSize((n) => Math.max(6, n - 2))}
          className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black"
        >
          A−
        </button>
        <span className="min-w-[3.5rem] text-center text-xs font-semibold text-black/60">
          {fontSize}px
        </span>
        <button
          type="button"
          onClick={() => setFontSize((n) => Math.min(40, n + 2))}
          className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black"
        >
          A+
        </button>
        <span className="text-xs font-semibold text-black/60">
          {page} / {total || '—'}
        </span>
        <button
          type="button"
          onClick={markHere}
          className="rounded-full bg-[#f591ac] px-3 py-1 text-sm font-bold text-[#141a32]"
        >
          Mark page {page}
        </button>
        {marked > 0 && (
          <button
            type="button"
            onClick={() => void goToMark()}
            className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black"
          >
            Go to mark ({marked})
          </button>
        )}
      </div>

      {previewPages ? (
        <p className="px-4 py-2 text-center text-[12px] text-black/55">
          Sneak peek — {previewPages} pages. Buy to unlock the rest.
        </p>
      ) : null}

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
        {status ? (
          <p className="p-6 text-sm font-semibold text-black/50">{status}</p>
        ) : null}

        {resumeAt > 1 ? (
          <p className="px-4 pt-4 text-center text-[13px] font-semibold text-[#c45b78]">
            Continuing from page {resumeAt}
            {loggedIn ? ' · synced to your account' : ''}
          </p>
        ) : null}

        {!loggedIn ? (
          <p className="px-4 pt-3 text-center text-[13px] text-black/60">
            Your place is saved on this phone only.{' '}
            <Link href={loginHref} className="font-semibold text-[#c45b78] underline">
              Log in
            </Link>
            {' · '}
            <Link href={signupHref} className="font-semibold text-[#c45b78] underline">
              Sign up
            </Link>{' '}
            to continue on another device.
          </p>
        ) : (
          <p className="px-4 pt-3 text-center text-[12px] text-black/55">
            Your page syncs to this account. Close here, open the same book on another phone.
          </p>
        )}

        <article className="mx-auto max-w-2xl px-4 py-6">
          {numbers.map((n) => (
            <section key={n} id={`read-page-${n}`} className="mb-10 min-h-[8rem]">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-black/40">
                Page {n}
              </p>
              <p
                className="font-semibold leading-relaxed text-black"
                style={{ fontSize: `${fontSize}px` }}
              >
                {pages[n] || (n <= page + AHEAD ? 'Loading page…' : '')}
              </p>
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}