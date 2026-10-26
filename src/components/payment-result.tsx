import Link from 'next/link'
import type { ReactNode } from 'react'

export type PaymentResultKind = 'pending' | 'success' | 'failed'

const TONE: Record<PaymentResultKind, { ring: string; icon: string; mark: string }> = {
  pending: { ring: 'border-foreground/10', icon: 'bg-foreground/10 text-foreground', mark: '…' },
  success: { ring: 'border-emerald-500/30', icon: 'bg-emerald-500/15 text-emerald-600', mark: '✓' },
  failed: { ring: 'border-red-500/30', icon: 'bg-red-500/15 text-destructive', mark: '!' },
}

/** One themed card for the pages Paystack sends people back to. */
export function PaymentResultCard({
  kind,
  title,
  children,
  action,
}: {
  kind: PaymentResultKind
  title: string
  children?: ReactNode
  action?: { href: string; label: string }
}) {
  const t = TONE[kind]
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-md flex-col items-center justify-center px-4 py-12">
      <section
        role={kind === 'failed' ? 'alert' : 'status'}
        data-kind={kind}
        className={`w-full rounded-3xl border bg-background p-7 text-center ${t.ring}`}
      >
        <div
          aria-hidden="true"
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold ${t.icon}`}
        >
          {t.mark}
        </div>
        <h1 className="mt-4 text-lg font-bold">{title}</h1>
        {children ? <div className="mt-2 text-sm text-foreground/70">{children}</div> : null}
        {action ? (
          <Link
            href={action.href}
            className="mt-5 inline-block rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background"
          >
            {action.label}
          </Link>
        ) : null}
      </section>
    </main>
  )
}
