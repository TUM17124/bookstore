'use client'

import { useEffect, useState } from 'react'
import { getReaderImage, type ReaderBlock, type ReaderChapter } from '@/lib/api'

/** An EPUB page needs the block renderer only when it has something the plain
 * text can't show (images, tables); everything else stays on the text path. */
export function hasFigures(blocks?: ReaderBlock[]): boolean {
  return !!blocks?.some((b) => b.t === 'img' || b.t === 'table')
}

/** Index (0-based) of the chapter that contains `page`, or -1 before the first. */
export function chapterIndexFor(chapters: ReaderChapter[], page: number): number {
  let idx = -1
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].page <= page) idx = i
    else break
  }
  return idx
}

export function EpubImage({ url, alt, guestToken }: { url: string; alt: string; guestToken?: string | null }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let revoked = false
    let made: string | null = null
    setSrc(null)
    setFailed(false)
    getReaderImage(url, guestToken)
      .then((blob) => {
        if (revoked) return
        made = URL.createObjectURL(blob)
        setSrc(made)
      })
      .catch(() => {
        if (!revoked) setFailed(true)
      })
    return () => {
      revoked = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [url, guestToken])
  if (failed) {
    return <span className="my-3 block text-[13px] text-foreground/50" role="img" aria-label={alt || 'Image'}>{alt || 'Image unavailable'}</span>
  }
  if (!src) return <span className="my-3 block h-24 animate-pulse rounded-lg bg-foreground/[0.06]" aria-hidden />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      className="my-3 mx-auto block h-auto max-w-full select-none rounded-md"
    />
  )
}

/** Renders one EPUB page from its blocks. Text is rendered as React text nodes
 * only (never as HTML), so nothing in the book can inject markup or script. */
export function EpubBlocks({
  blocks,
  fontSize,
  guestToken,
}: {
  blocks: ReaderBlock[]
  fontSize: number
  guestToken?: string | null
}) {
  return (
    <div data-epub-blocks className="space-y-3 text-foreground" style={{ fontSize: `${fontSize}px` }}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return <h3 key={i} className="pt-2 font-bold leading-snug" style={{ fontSize: `${Math.round(fontSize * 1.2)}px` }}>{b.x}</h3>
          case 'li':
            return <p key={i} className="ml-5 list-item font-semibold leading-relaxed">{b.x}</p>
          case 'q':
            return <p key={i} className="border-l-2 border-foreground/20 pl-3 font-semibold italic leading-relaxed">{b.x}</p>
          case 'img':
            return <EpubImage key={i} url={b.url} alt={b.alt} guestToken={guestToken} />
          case 'table':
            return (
              <div key={i} className="max-w-full overflow-x-auto">
                <table className="w-full border-collapse text-[0.9em]">
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => {
                          const Cell = r === 0 ? 'th' : 'td'
                          return <Cell key={c} className="border border-foreground/20 px-2 py-1 text-left align-top font-semibold">{cell}</Cell>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          default:
            return <p key={i} className="font-semibold leading-relaxed">{b.x}</p>
        }
      })}
    </div>
  )
}

/** Table of contents panel + current-chapter label. */
export function ChapterList({
  chapters,
  page,
  onGo,
}: {
  chapters: ReaderChapter[]
  page: number
  onGo: (page: number) => void
}) {
  const current = chapterIndexFor(chapters, page)
  return (
    <nav aria-label="Table of contents" className="max-h-72 overflow-y-auto">
      <ol className="space-y-1">
        {chapters.map((c, i) => (
          <li key={`${i}-${c.page}`}>
            <button
              type="button"
              onClick={() => onGo(c.page)}
              aria-current={i === current ? 'location' : undefined}
              className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${i === current ? 'bg-[#f591ac]/25 font-bold text-foreground' : 'text-foreground/80 hover:bg-foreground/[0.06]'}`}
            >
              <span className="min-w-0 flex-1 break-words">{c.title || `Chapter ${i + 1}`}</span>
              <span className="shrink-0 text-xs text-foreground/50">p.{c.page}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
