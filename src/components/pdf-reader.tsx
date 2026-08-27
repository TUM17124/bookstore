'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string }
      getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<any> }
    }
  }
}

function markKey(url: string) {
  return `plugyard-read-mark:${url.split('?')[0]}`
}

export function PdfReader({ url }: { url: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Loading…')
  const [pages, setPages] = useState<string[]>([])
  const [fontSize, setFontSize] = useState(28)
  const [page, setPage] = useState(1)
  const [marked, setMarked] = useState(0)

  useEffect(() => {
    try {
      setMarked(Number(localStorage.getItem(markKey(url)) || 0))
    } catch {
      setMarked(0)
    }
  }, [url])

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
        setStatus('Loading…')
        setPages([])
        await loadScript()
        const res = await fetch(url)
        if (!res.ok) throw new Error('download failed')
        const data = await res.arrayBuffer()
        if (cancelled) return

        const pdf = await window.pdfjsLib!.getDocument({ data }).promise
        const extracted: string[] = []

        for (let i = 1; i <= pdf.numPages; i++) {
          const pdfPage = await pdf.getPage(i)
          const content = await pdfPage.getTextContent()
          const text = content.items
            .map((item: { str?: string }) => item.str || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
          extracted.push(text || `Page ${i}`)
          if (cancelled) return
        }

        setPages(extracted)
        setStatus('')
        const saved = Number(localStorage.getItem(markKey(url)) || 0)
        if (saved > 1) setPage(saved)
      } catch {
        if (!cancelled) setStatus('Could not open this book.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    if (!pages.length) return
    const saved = Number(localStorage.getItem(markKey(url)) || 0)
    if (saved > 1) {
      document.getElementById(`read-page-${saved}`)?.scrollIntoView({ block: 'start' })
    }
  }, [pages, url])

  function onScroll() {
    const root = scrollRef.current
    if (!root) return
    const mid = root.scrollTop + 80
    let current = 1
    pages.forEach((_, i) => {
      const el = document.getElementById(`read-page-${i + 1}`)
      if (el && el.offsetTop <= mid) current = i + 1
    })
    setPage(current)
  }

  function markHere() {
    try {
      localStorage.setItem(markKey(url), String(page))
      setMarked(page)
    } catch {
      // ignore
    }
  }

  function goToMark() {
    document.getElementById(`read-page-${marked}`)?.scrollIntoView({ block: 'start' })
    if (marked) setPage(marked)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#f4efe4]">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-black/10 bg-[#efe8d8] px-2 py-2">
        <button
          type="button"
          onClick={() => setFontSize((n) => Math.max(18, n - 4))}
          className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black"
        >
          A−
        </button>
        <span className="min-w-[3.5rem] text-center text-xs font-semibold text-black/60">
          {fontSize}px
        </span>
        <button
          type="button"
          onClick={() => setFontSize((n) => Math.min(56, n + 4))}
          className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black"
        >
          A+
        </button>
        <span className="text-xs font-semibold text-black/60">
          {page} / {pages.length || '—'}
        </span>
        <button
          type="button"
          onClick={markHere}
          className="rounded-full bg-pink-400 px-3 py-1 text-sm font-bold text-zinc-900"
        >
          Mark page {page}
        </button>
        {marked > 0 && (
          <button
            type="button"
            onClick={goToMark}
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
        <article className="mx-auto max-w-2xl px-4 py-6">
          {pages.map((text, i) => (
            <section key={i} id={`read-page-${i + 1}`} className="mb-10">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-black/40">
                Page {i + 1}
              </p>
              <p
                className="font-bold leading-snug text-black"
                style={{ fontSize: `${fontSize}px` }}
              >
                {text}
              </p>
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}