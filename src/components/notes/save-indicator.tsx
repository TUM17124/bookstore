import type { SyncStatus } from '@/lib/notes/types'

const TEXT: Record<SyncStatus, string> = {
  saved: 'Saved ✓',
  saving: 'Saving…',
  offline: 'Offline · will sync',
  error: 'Retrying…',
}

/** Autosave state. Fixed width so the label changing never moves the layout. */
export function SaveIndicator({ status, className = '' }: { status: SyncStatus; className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-block min-w-[8.5rem] text-right text-[12px] font-semibold ${
        status === 'saved' ? 'text-foreground/55' : status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-[var(--brand-pink-text)]'
      } ${className}`}
    >
      {TEXT[status]}
    </span>
  )
}
