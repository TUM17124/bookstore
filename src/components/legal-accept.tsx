'use client'

import Link from 'next/link'

export function LegalAcceptTick({
  checked,
  onChange,
  id = 'legal-accept',
  error = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  id?: string
  error?: boolean
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2.5 text-sm leading-snug ${
        error ? 'text-red-500' : 'text-foreground/80'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={`mt-1 h-4 w-4 shrink-0 ${
          error ? 'accent-red-500' : 'accent-foreground'
        }`}
      />

      <span>
        I have read and accept the{' '}
        <Link href="/terms" className="underline hover:text-foreground" target="_blank">
          Terms &amp; Conditions
        </Link>
        ,{' '}
        <Link href="/terms-of-use" className="underline hover:text-foreground" target="_blank">
          Terms of Use
        </Link>
        ,{' '}
        <Link href="/privacy" className="underline hover:text-foreground" target="_blank">
          Privacy Policy
        </Link>
        {' '}and{' '}
        <Link href="/refund-policy" className="underline hover:text-foreground" target="_blank">
          Refund Policy
        </Link>
        . This includes uploading ebooks, audiobooks, covers and spines, how
        you are paid when a title sells, PlugYard’s cut (set by the admin),
        buying Boost ads, and the affiliate programme (invite links, rewards
        when referred authors are published, and withdrawals).
      </span>
    </label>
  )
}