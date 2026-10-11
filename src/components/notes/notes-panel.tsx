'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { RichNoteEditor } from '@/components/notes/rich-note-editor'
import { NoteView } from '@/components/notes/note-view'
import { SaveIndicator } from '@/components/notes/save-indicator'
import { COLOR_BG, COLOR_LABEL, COLOR_SWATCH } from '@/lib/notes/doc'
import { NOTE_COLORS, type NoteColor, type NoteDoc, type NoteRow, type SyncStatus } from '@/lib/notes/types'
import { filterNotes, groupNotes, locationLabel, sortNotes, type SortKey, type TypeFilter } from '@/lib/notes/view'

type ItemProps = {
  note: NoteRow
  editing: boolean
  status: SyncStatus
  showBook?: boolean
  readOnly?: boolean
  onJump: (n: NoteRow) => void
  onEdit: (id: string | null) => void
  onChange: (id: string, patch: Partial<NoteRow>) => void
  onDelete: (n: NoteRow) => void
}

function NoteItem({ note, editing, status, showBook, readOnly, onJump, onEdit, onChange, onDelete }: ItemProps) {
  const [draft, setDraft] = useState<NoteDoc>(note.body)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<NoteDoc | null>(null)

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (latest.current) {
      onChange(note.id, { body: latest.current })
      latest.current = null
    }
  }
  // Leaving edit mode / unmounting never loses the last keystrokes.
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const hasQuote = !!note.quote
  const loc = locationLabel(note)

  return (
    <li className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-3">
      <div className="flex items-start gap-2">
        <span aria-hidden className={`mt-1 h-3 w-3 shrink-0 rounded-full ${note.color ? COLOR_SWATCH[note.color as NoteColor] : 'border border-foreground/30'}`} />
        <button
          type="button"
          onClick={() => onJump(note)}
          className="shrink-0 rounded-full bg-[#f591ac]/20 px-2.5 py-0.5 text-xs font-bold text-[var(--brand-pink-text)] hover:bg-[#f591ac]/35"
          aria-label={`Go to ${note.kind === 'audio' ? 'time' : 'page'} ${loc}`}
        >
          {note.kind === 'audio' ? '▶ ' : ''}{loc}
        </button>
        <div className="min-w-0 flex-1">
          {showBook && note.book_title ? <p className="truncate text-[11px] font-bold uppercase tracking-wide text-foreground/45">{note.book_title}</p> : null}
          {hasQuote ? (
            <button
              type="button"
              onClick={() => onJump(note)}
              className={`block w-full break-words rounded px-1 text-left text-sm font-semibold text-foreground ${note.color ? COLOR_BG[note.color as NoteColor] : ''}`}
            >
              {note.quote}
            </button>
          ) : null}
          {!editing && note.body_text ? <NoteView doc={note.body} className="mt-1.5" /> : null}
          {!editing && !note.body_text && !hasQuote ? <p className="text-sm italic text-foreground/45">Empty note</p> : null}
        </div>
        {!readOnly ? (
          <span className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => { if (editing) flush(); onEdit(editing ? null : note.id) }}
              className="text-xs font-bold text-[var(--brand-pink-text)]"
              aria-label={editing ? 'Done editing' : 'Edit note'}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
            <button type="button" onClick={() => onDelete(note)} className="text-xs font-semibold text-foreground/50 hover:text-red-600" aria-label="Delete note">
              Delete
            </button>
          </span>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          {hasQuote ? (
            <div role="group" aria-label="Highlight colour" className="flex items-center gap-2">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={COLOR_LABEL[c]}
                  aria-pressed={note.color === c}
                  onClick={() => onChange(note.id, { color: c })}
                  className={`h-6 w-6 rounded-full ${COLOR_SWATCH[c]} ${note.color === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'opacity-80'}`}
                />
              ))}
            </div>
          ) : null}
          <RichNoteEditor
            value={draft}
            autoFocus
            ariaLabel="Edit note"
            minHeight={96}
            onChange={(doc) => {
              setDraft(doc)
              latest.current = doc
              if (timer.current) clearTimeout(timer.current)
              timer.current = setTimeout(flush, 600)
            }}
          />
          <div className="flex justify-end"><SaveIndicator status={status} /></div>
        </div>
      ) : null}
    </li>
  )
}

export type NotesPanelProps = {
  open: boolean
  onClose: () => void
  notes: NoteRow[]
  status: SyncStatus
  title?: string
  /** "drawer": side panel on desktop, bottom sheet on phones. "page": inline list. */
  variant?: 'drawer' | 'page'
  showBook?: boolean
  readOnly?: boolean
  onJump: (n: NoteRow) => void
  onChange?: (id: string, patch: Partial<NoteRow>) => void
  onDelete?: (id: string) => void
  onRestore?: (id: string) => void
  onExport?: (as: 'md' | 'pdf') => Promise<void> | void
  emptyHint?: string
  initialEditId?: string | null
}

const TYPES: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'highlights', label: 'Highlights' },
  { key: 'notes', label: 'With notes' },
  { key: 'position', label: 'Page notes' },
  { key: 'audio', label: 'Audio' },
]

export function NotesPanel(p: NotesPanelProps) {
  const [q, setQ] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [color, setColor] = useState<NoteColor | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('position')
  const [editId, setEditId] = useState<string | null>(p.initialEditId ?? null)
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null)
  const [exportMsg, setExportMsg] = useState('')
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!p.open || p.variant === 'page') return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.open, p.variant]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => sortNotes(filterNotes(p.notes, { q, type, color }), sort), [p.notes, q, type, color, sort])
  const groups = useMemo(() => (sort === 'position' ? groupNotes(shown) : [{ label: '', notes: shown }]), [shown, sort])
  const hasAudio = p.notes.some((n) => n.kind === 'audio')

  if (!p.open) return null

  function del(n: NoteRow) {
    p.onDelete?.(n.id)
    if (editId === n.id) setEditId(null)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndo({ id: n.id, label: n.quote || n.body_text.slice(0, 40) || 'Note' })
    undoTimer.current = setTimeout(() => setUndo(null), 8000)
  }

  async function doExport(as: 'md' | 'pdf') {
    setExportMsg('Preparing…')
    try {
      await p.onExport?.(as)
      setExportMsg('')
    } catch {
      setExportMsg("Couldn't export. Check your connection and try again.")
    }
  }

  const body = (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h2 className="min-w-0 truncate text-sm font-bold text-foreground">
          {p.title || 'Notes & highlights'} <span className="font-semibold text-foreground/50">({p.notes.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {p.variant !== 'page' ? <SaveIndicator status={p.status} className="hidden sm:inline-block" /> : null}
          {p.variant !== 'page' ? (
            <button ref={closeRef} type="button" onClick={p.onClose} className="rounded-full bg-foreground/10 px-3 py-1 text-sm font-bold text-foreground">Close</button>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 space-y-2 px-4 pb-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
          className="h-10 w-full rounded-full border border-foreground/15 bg-background px-4 text-sm text-foreground outline-none focus:border-[#f591ac]"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" role="group" aria-label="Filter by type">
          {TYPES.filter((t) => t.key !== 'audio' || hasAudio).map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={type === t.key}
              onClick={() => setType(t.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${type === t.key ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div role="group" aria-label="Filter by colour" className="flex items-center gap-1.5">
            <button type="button" aria-pressed={color === 'all'} onClick={() => setColor('all')} className={`rounded-full px-2.5 py-1 text-xs font-bold ${color === 'all' ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground'}`}>Any</button>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`${COLOR_LABEL[c]} only`}
                aria-pressed={color === c}
                onClick={() => setColor(color === c ? 'all' : c)}
                className={`h-6 w-6 rounded-full ${COLOR_SWATCH[c]} ${color === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'opacity-80'}`}
              />
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs font-semibold text-foreground/60">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-foreground/15 bg-background px-2 py-1 text-xs text-foreground">
              <option value="position">In book order</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {!shown.length ? (
          <p className="py-6 text-center text-sm text-foreground/50">
            {p.notes.length ? 'No notes match these filters.' : p.emptyHint || 'No notes yet.'}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.label || 'all'} aria-label={g.label || undefined} className="mb-3">
              {g.label ? <h3 className="sticky top-0 z-[1] bg-background/95 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground/45">{g.label}</h3> : null}
              <ul className="space-y-2">
                {g.notes.map((n) => (
                  <NoteItem
                    key={n.id}
                    note={n}
                    editing={editId === n.id}
                    status={p.status}
                    showBook={p.showBook}
                    readOnly={p.readOnly}
                    onJump={p.onJump}
                    onEdit={setEditId}
                    onChange={(id, patch) => p.onChange?.(id, patch)}
                    onDelete={del}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {undo ? (
        <div role="status" className="mx-4 mb-2 flex shrink-0 items-center justify-between gap-2 rounded-xl bg-foreground px-3 py-2 text-sm text-background">
          <span className="min-w-0 truncate">Deleted “{undo.label}”</span>
          <button type="button" onClick={() => { p.onRestore?.(undo.id); setUndo(null) }} className="shrink-0 font-bold underline">Undo</button>
        </div>
      ) : null}

      {p.onExport ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-foreground/10 px-4 py-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <span className="text-xs font-semibold text-foreground/55">Export</span>
          <button type="button" onClick={() => void doExport('md')} disabled={!p.notes.length} className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-bold text-foreground disabled:opacity-40">Markdown</button>
          <button type="button" onClick={() => void doExport('pdf')} disabled={!p.notes.length} className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-bold text-foreground disabled:opacity-40">PDF</button>
          {exportMsg ? <span role="status" className="text-xs text-foreground/60">{exportMsg}</span> : null}
          <span className="ml-auto sm:hidden"><SaveIndicator status={p.status} /></span>
        </div>
      ) : null}
    </>
  )

  if (p.variant === 'page') return <div className="flex min-h-0 flex-col">{body}</div>

  return (
    <>
      <div className="fixed inset-0 z-[59] bg-black/35 md:hidden" onClick={p.onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={p.title || 'Notes and highlights'}
        className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[85dvh] min-h-[50dvh] flex-col overflow-hidden rounded-t-2xl border border-foreground/10 bg-background shadow-2xl md:inset-y-0 md:bottom-0 md:left-auto md:right-0 md:max-h-none md:min-h-0 md:w-[400px] md:rounded-none md:border-y-0 md:border-r-0"
      >
        {body}
      </aside>
    </>
  )
}
