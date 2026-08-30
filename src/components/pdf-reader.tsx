'use client'

import { useEffect, useRef, useState } from 'react'

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

export function PdfReader({ url }: { url: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<any>(null)
  const loadingPage = useRef<Set<number>>(new Set())

  const [status, setStatus] = useState('Opening…')
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState<Record<number, string>>({})
  const [fontSize, setFontSize] = useState(18)
  const [page, setPage] = useState(1)
  const [marked, setMarked] = useState(0)
  const [resumeAt, setResumeAt] = useState(0)

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
    if (!pdf || n < 1 || n > pdf.numPages) return
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
    const pdf = pdfRef.current
    if (!pdf) return
    const start = Math.max(1, center)
    const end = Math.min(pdf.numPages, center + count)
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
        await loadScript()
        if (cancelled) return

        const pdf = await window.pdfjsLib!.getDocument({
          url,
          disableStream: false,
          disableAutoFetch: true,
        }).promise
        if (cancelled) return

        pdfRef.current = pdf
        setTotal(pdf.numPages)

        const saved = Number(localStorage.getItem(markKey(url)) || 0)
        const startAt = saved > 1 && saved <= pdf.numPages ? saved : 1
        setPage(startAt)
        if (startAt > 1) setResumeAt(startAt)

        await bufferAround(startAt, AHEAD)
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
    }
  }, [url])

  function onScroll() {
    const root = scrollRef.current
    if (!root || !total) return
    const mid = root.scrollTop + 80
    let current = page
    for (let i = 1; i <= total; i++) {
      const el = document.getElementById(`read-page-${i}`)
      if (el && el.offsetTop <= mid) current = i
    }
    setPage(current)
    void bufferAround(current, AHEAD)
    try {
      localStorage.setItem(markKey(url), String(current))
      setMarked(current)
    } catch {
      // ignore
    }
  }

  function markHere() {
    try {
      localStorage.setItem(markKey(url), String(page))
      setMarked(page)
    } catch {
      // ignore
    }
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
          onClick={() => setFontSize((n) => Math.max(12, n - 2))}
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

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto"
      >
        {status ? (
          <p className="p-6 text-sm font-semibold text-black/50">{status}</p>
        ) : null}

        {resumeAt > 1 ? (
          <p className="px-4 pt-4 text-center text-[13px] font-semibold text-[#c45b78]">
            Continuing from page {resumeAt}
          </p>
        ) : null}

        <p className="px-4 pt-2 text-center text-[12px] text-black/45">
          Your place is saved on this device. Only a few pages load at a time.
        </p>

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