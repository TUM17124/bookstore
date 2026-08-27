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
  const hostRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Loading…')
  const [zoom, setZoom] = useState(1.55)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
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
        await loadScript()
        const res = await fetch(url)
        if (!res.ok) throw new Error('download failed')
        const data = await res.arrayBuffer()
        if (cancelled) return

        const pdf = await window.pdfjsLib!.getDocument({ data }).promise
        const host = hostRef.current
        if (!host) return
        host.innerHTML = ''
        setTotal(pdf.numPages)

        const cssWidth = Math.min(
          (host.clientWidth || Math.min(window.innerWidth, 900)) * zoom,
          1400,
        )
        const dpr = Math.min(window.devicePixelRatio || 1, 3)

        for (let i = 1; i <= pdf.numPages; i++) {
          const pdfPage = await pdf.getPage(i)
          const base = pdfPage.getViewport({ scale: 1 })
          const scale = (cssWidth / base.width) * dpr
          const viewport = pdfPage.getViewport({ scale })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.dataset.page = String(i)
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.style.marginBottom = '16px'
          host.appendChild(canvas)

          await pdfPage.render({
            canvasContext: canvas.getContext('2d')!,
            viewport,
          }).promise
          if (cancelled) return
        }

        setStatus('')

        const saved = Number(localStorage.getItem(markKey(url)) || 0)
        if (saved > 1) {
          const el = host.querySelector(`[data-page="${saved}"]`)
          el?.scrollIntoView({ block: 'start' })
          setPage(saved)
        }
      } catch {
        if (!cancelled) setStatus('Could not open this book.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url, zoom])

  function onScroll() {
    const root = scrollRef.current
    const host = hostRef.current
    if (!root || !host) return
    const mid = root.scrollTop + root.clientHeight * 0.35
    const canvases = host.querySelectorAll<HTMLCanvasElement>('canvas[data-page]')
    let current = 1
    canvases.forEach((c) => {
      const top = c.offsetTop
      if (top <= mid) current = Number(c.dataset.page || 1)
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
    const el = hostRef.current?.querySelector(`[data-page="${marked}"]`)
    el?.scrollIntoView({ block: 'start' })
    if (marked) setPage(marked)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-black">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-white/10 px-2 py-2">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(1, z - 0.2))}
          className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white"
        >
          A−
        </button>
        <span className="min-w-[3.5rem] text-center text-xs text-white/60">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.6, z + 0.2))}
          className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white"
        >
          A+
        </button>

        <span className="text-xs text-white/60">
          {page} / {total || '—'}
        </span>

        <button
          type="button"
          onClick={markHere}
          className="rounded-full bg-pink-400 px-3 py-1 text-sm font-semibold text-zinc-900"
        >
          Mark page {page}
        </button>
        {marked > 0 && (
          <button
            type="button"
            onClick={goToMark}
            className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white"
          >
            Go to mark ({marked})
          </button>
        )}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto">
        {status ? <p className="p-6 text-sm text-white/50">{status}</p> : null}
        <div ref={hostRef} className="mx-auto max-w-5xl px-1 py-3" />
      </div>
    </div>
  )
}