'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function OverlayInner({
  title,
  updated,
  children,
}: {
  title: string
  updated?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const bookId = (sp.get('book') || sp.get('bookId') || '').trim()

  function close() {
    if (bookId) {
      router.push(`/?book=${encodeURIComponent(bookId)}`)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/')
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-foreground/10 px-3 pt-[env(safe-area-inset-top)] sm:px-4">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-bold">{title}</h1>
          {updated && (
            <p className="truncate text-[12px] text-foreground/45">
              Last updated: {updated}
            </p>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div className="text-[15px] leading-relaxed text-foreground/80 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:first:mt-0 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LegalOverlay(props: {
  title: string
  updated?: string
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={null}>
      <OverlayInner {...props} />
    </Suspense>
  )
}