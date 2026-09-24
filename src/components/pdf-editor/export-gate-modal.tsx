'use client'

import Link from 'next/link'
import { withReferralQuery } from '@/lib/referral'

export function ExportGateModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">Create a free account to download</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-foreground/10"
          >
            ×
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/70">
          Your edits stay right here in your browser — nothing was uploaded.
          We just ask for an account before the download, so this tool stays
          free to run.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-foreground/70">
          <strong className="text-foreground">It also pays to invite people.</strong>{' '}
          Every account gets an affiliate link — invite others to PlugYard and
          earn a reward when they join.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href={withReferralQuery('/signup?next=/tools/pdf-editor')}
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background"
          >
            Create a free account
          </Link>
          <Link
            href="/login?next=/tools/pdf-editor"
            onClick={onClose}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-foreground/15 px-4 py-2.5 text-sm font-semibold"
          >
            I already have one
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


