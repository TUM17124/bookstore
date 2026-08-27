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

export function PdfReader({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Loading…')

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
        await loadScript()
        const res = await fetch(url)
        if (!res.ok) throw new Error('download failed')
        const data = await res.arrayBuffer()
        if (cancelled) return

        const pdf = await window.pdfjsLib!.getDocument({ data }).promise
        const host = hostRef.current
        if (!host) return
        host.innerHTML = ''

                const cssWidth = Math.min(
          (host.clientWidth || Math.min(window.innerWidth, 860)) * 1.18,
          1000,
        )
        const dpr = Math.min(window.devicePixelRatio || 1, 3)

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const scale = (cssWidth / base.width) * dpr
          const viewport = page.getViewport({ scale })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.style.marginBottom = '12px'
          host.appendChild(canvas)

          const ctx = canvas.getContext('2d')!
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          await page.render({
            canvasContext: ctx,
            viewport,
          }).promise
          if (cancelled) return
        }
        setStatus('')
      } catch {
        if (!cancelled) setStatus('Could not open this book.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url])

    return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-black">
      {status ? <p className="p-6 text-sm text-white/50">{status}</p> : null}
      <div ref={hostRef} className="mx-auto max-w-4xl px-1 py-2" />
    </div>
  )
}