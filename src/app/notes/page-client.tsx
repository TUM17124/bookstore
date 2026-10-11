'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NotesPanel } from '@/components/notes/notes-panel'
import { downloadNotesExport, fetchAllNotes } from '@/lib/notes/api'
import { useLoggedIn } from '@/lib/use-logged-in'
import { getNotesStore } from '@/lib/notes/registry'
import type { NoteRow, SyncStatus } from '@/lib/notes/types'

const PAGE = 200
const CAP = 1000

/** Every note and highlight across all the reader's books. Notes can be
 * edited, recoloured and deleted here: the first change in a book pulls that
 * book's notes into the same local-first store the reader uses (so the edit
 * syncs, works offline and shows up in the book), then applies the change. */
export default function NotesPage() {
  const loggedIn = useLoggedIn()
  const router = useRouter()
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [exportBook, setExportBook] = useState('')
  const [exportMsg, setExportMsg] = useState('')
  // Books whose store we have touched; their copy of a note wins over the list's.
  const [touched, setTouched] = useState<string[]>([])
  const [tick, bump] = useReducer((n: number) => n + 1, 0)
  const ready = useRef(new Map<string, Promise<void>>())

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

  useEffect(() => {
    const offs = touched.map((b) => getNotesStore(b, null).subscribe(bump))
    return () => offs.forEach((off) => off())
  }, [touched])

  const shownNotes = useMemo(() => {
    void tick
    return notes.flatMap((n) => {
      if (!touched.includes(String(n.book_id))) return [n]
      const mine = getNotesStore(String(n.book_id), null).get(n.id)
      if (!mine) return [n]
      return mine.deleted ? [] : [{ ...mine, book_title: n.book_title }]
    })
  }, [notes, touched, tick])

  const status: SyncStatus = useMemo(() => {
    void tick
    for (const b of touched) {
      const st = getNotesStore(b, null).status()
      if (st !== 'saved') return st
    }
    return 'saved'
  }, [touched, tick])

  /** The note's book store, with that book's notes pulled in once. */
  const storeFor = useCallback(async (bookIdOfNote: string | number) => {
    const b = String(bookIdOfNote)
    const store = getNotesStore(b, null)
    setTouched((cur) => (cur.includes(b) ? cur : [...cur, b]))
    let p = ready.current.get(b)
    if (!p) {
      p = store.sync().catch(() => {})
      ready.current.set(b, p)
    }
    await p
    return store
  }, [])

  const edit = useCallback(async (id: string, patch: Partial<NoteRow>) => {
    const row = notes.find((n) => n.id === id)
    if (row) (await storeFor(row.book_id)).update(id, patch)
  }, [notes, storeFor])
  const del = useCallback(async (id: string) => {
    const row = notes.find((n) => n.id === id)
    if (row) (await storeFor(row.book_id)).remove(id)
  }, [notes, storeFor])
  const restore = useCallback(async (id: string) => {
    const row = notes.find((n) => n.id === id)
    if (row) (await storeFor(row.book_id)).restore(id)
  }, [notes, storeFor])

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
            showBook
            title="All notes"
            notes={shownNotes}
            status={status}
            onChange={(id, patch) => void edit(id, patch)}
            onDelete={(id) => void del(id)}
            onRestore={(id) => void restore(id)}
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
