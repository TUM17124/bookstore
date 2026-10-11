'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NotesPanel } from '@/components/notes/notes-panel'
import { downloadNotesExport, fetchAllNotes } from '@/lib/notes/api'
import { useLoggedIn } from '@/lib/use-logged-in'
import type { NoteRow } from '@/lib/notes/types'

const PAGE = 200
const CAP = 1000

/** Every note and highlight across all the reader's books. Read-only here:
 * editing happens in the book, where the note's context is. */
export default function NotesPage() {
  const loggedIn = useLoggedIn()
  const router = useRouter()
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [exportBook, setExportBook] = useState('')
  const [exportMsg, setExportMsg] = useState('')

  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    ;(async () => {
      try {
        let all: NoteRow[] = []
        let count = 0
        do {
          const res = await fetchAllNotes({ limit: String(PAGE), offset: String(all.length), sort: 'book' }, null)
          count = res.total
          all = all.concat(res.notes)
          if (!res.notes.length) break
        } while (all.length < Math.min(count, CAP))
        if (cancelled) return
        setNotes(all)
        setTotal(count)
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [loggedIn])

  const books = useMemo(() => {
    const m = new Map<number | string, string>()
    for (const n of notes) m.set(n.book_id, n.book_title || `Book #${n.book_id}`)
    return [...m.entries()]
  }, [notes])
  const bookId = exportBook || (books[0] ? String(books[0][0]) : '')

  async function run(as: 'md' | 'pdf') {
    setExportMsg('Preparing…')
    try {
      await downloadNotesExport(bookId, as, null)
      setExportMsg('')
    } catch {
      setExportMsg("Couldn't export. Try again.")
    }
  }

  return (
    <main className="site-main site-main-offset mx-auto flex w-full max-w-3xl flex-col px-4 py-6">
      <h1 className="text-xl font-bold text-foreground">My notes</h1>
      <p className="mb-3 text-sm text-foreground/60">All your highlights and notes, from every book you read or listen to.</p>
      {!loggedIn ? (
        <p className="text-sm text-foreground/60">
          <Link href="/login?next=%2Fnotes%2F" className="font-semibold text-[var(--brand-pink-text)] underline">Log in</Link> to see your notes.
        </p>
      ) : state === 'loading' ? (
        <p role="status" className="text-sm text-foreground/50">Loading your notes…</p>
      ) : state === 'error' ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">Couldn’t load your notes. Check your connection and refresh.</p>
      ) : (
        <>
          <NotesPanel
            open
            variant="page"
            readOnly
            showBook
            title="All notes"
            notes={notes}
            status="saved"
            emptyHint="Highlights and notes you make while reading or listening appear here."
            onClose={() => {}}
            onJump={(n: NoteRow) => router.push(`/?book=${encodeURIComponent(String(n.book_id))}${n.kind === 'audio' ? '&view=listen' : ''}`)}
          />
          {total > notes.length ? <p className="mt-2 text-xs text-foreground/50">Showing your first {notes.length} of {total} notes.</p> : null}
          {books.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-foreground/10 pt-3">
              <label className="text-sm font-semibold text-foreground/70" htmlFor="export-book">Export notes for</label>
              <select
                id="export-book"
                value={bookId}
                onChange={(e) => setExportBook(e.target.value)}
                className="max-w-[16rem] rounded-lg border border-foreground/15 bg-background px-2 py-1 text-sm text-foreground"
              >
                {books.map(([id, title]) => <option key={id} value={String(id)}>{title}</option>)}
              </select>
              <button type="button" onClick={() => void run('md')} className="rounded-full bg-foreground/10 px-3 py-1 text-sm font-bold text-foreground">Markdown</button>
              <button type="button" onClick={() => void run('pdf')} className="rounded-full bg-foreground/10 px-3 py-1 text-sm font-bold text-foreground">PDF</button>
              {exportMsg ? <span role="status" className="text-xs text-foreground/60">{exportMsg}</span> : null}
            </div>
          ) : null}
        </>
      )}
    </main>
  )
}
