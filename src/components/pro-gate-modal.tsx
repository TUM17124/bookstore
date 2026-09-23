'use client'

import Link from 'next/link'

export function ProGateModal({
  open,
  onClose,
  feature,
  benefit,
}: {
  open: boolean
  onClose: () => void
  feature: string
  benefit: string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#d4af37]/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#a3811f]">
              Pro
            </span>
            <h2 className="text-lg font-bold">{feature}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-foreground/10"
          >
            ×
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-foreground/70">
          This is a Pro feature. {benefit}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-foreground/70">
          You can also buy robot-reader credits without a monthly plan. Pay more, get more characters.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/pro"
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-[#d4af37] px-4 py-2.5 text-sm font-semibold text-[#3a2e08]"
          >
            See PlugYard Pro
          </Link>
          <Link
            href="/pro#credits"
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-[#f591ac] px-4 py-2.5 text-sm font-semibold text-[#141a32]"
          >
            Buy credits
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full text-center text-xs text-foreground/45"
        >
          Not now
        </button>
      </div>
    </div>
  )
}