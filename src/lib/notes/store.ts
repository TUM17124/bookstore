import { newIdempotencyKey } from "@/lib/auth-fetch"
import { docPlainText } from "./doc"
import * as defaultApi from "./api"
import type { NoteInput, NoteRow, SyncStatus } from "./types"

/**
 * Local-first notes for one book.
 *
 * - Every change is applied locally at once and saved to localStorage, so notes
 *   work offline and survive reloads.
 * - Changes are queued (`pending`) and pushed with idempotent requests (the
 *   server keeps a note per client-chosen id, so a replay never duplicates).
 * - Failures retry with exponential backoff; coming back online, regaining
 *   focus or a change in another tab triggers a sync.
 * - Conflicts are last-writer-wins on `client_updated_at` (server enforces the
 *   same rule), deletes are tombstones, so no device resurrects a deleted note
 *   with an older edit.
 */

type Persisted = { notes: Record<string, NoteRow>; pending: Record<string, { op: "put" | "delete" | "restore"; rev: number }>; cursor: string | null; rev: number }

export type Deps = {
  api: Pick<typeof defaultApi, "fetchNotes" | "putNote" | "deleteNote" | "restoreNote">
  storage: Pick<Storage, "getItem" | "setItem"> | null
  now: () => number
  online: () => boolean
  uuid: () => string
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (t: unknown) => void
}

export const realDeps = (): Deps => ({
  api: defaultApi,
  storage: (() => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage
    } catch {
      return null
    }
  })(),
  now: () => Date.now(),
  online: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  uuid: () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : fallbackUuid()),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
})

function fallbackUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const BACKOFF = [2000, 5000, 15000, 30000, 60000]

export class NotesStore {
  readonly key: string
  private s: Persisted = { notes: {}, pending: {}, cursor: null, rev: 0 }
  private listeners = new Set<() => void>()
  private timer: unknown = null
  private failures = 0
  private syncing: Promise<void> | null = null
  private again = false
  private lastError = false
  private snapshot: { notes: NoteRow[]; status: SyncStatus } | null = null

  constructor(
    readonly bookId: string,
    private guest: string | null,
    private deps: Deps = realDeps(),
    ownerTag = "",
  ) {
    this.key = `plugyard-notes:v2:${guest ? "g" : "u"}${ownerTag}:${bookId}`
    this.load()
  }

  // ── persistence ──────────────────────────────────────────────
  private load() {
    try {
      const raw = this.deps.storage?.getItem(this.key)
      if (raw) this.s = { ...this.s, ...(JSON.parse(raw) as Persisted) }
    } catch {
      /* corrupted -> start clean; the server copy is pulled again */
    }
    this.snapshot = null
  }
  private save() {
    try {
      this.deps.storage?.setItem(this.key, JSON.stringify(this.s))
    } catch {
      /* quota / private mode: still works in memory */
    }
  }
  /** Another tab wrote the store: adopt its state. */
  reloadFromStorage() {
    this.load()
    this.emit()
  }

  // ── subscription (useSyncExternalStore) ──────────────────────
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit() {
    this.snapshot = null
    this.listeners.forEach((l) => l())
  }
  getSnapshot = () => {
    if (!this.snapshot) this.snapshot = { notes: this.list(), status: this.status() }
    return this.snapshot
  }

  list(): NoteRow[] {
    return Object.values(this.s.notes)
      .filter((n) => !n.deleted)
      .sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at))
  }
  get(id: string) {
    return this.s.notes[id]
  }
  pendingCount() {
    return Object.keys(this.s.pending).length
  }
  status(): SyncStatus {
    if (!this.pendingCount()) return "saved"
    if (!this.deps.online()) return "offline"
    return this.lastError ? "error" : "saving"
  }

  // ── local changes ────────────────────────────────────────────
  private stamp() {
    return new Date(this.deps.now()).toISOString()
  }
  private queue(id: string, op: "put" | "delete" | "restore") {
    this.s.rev += 1
    this.s.pending[id] = { op, rev: this.s.rev }
    this.save()
    this.emit()
    this.schedule(300)
  }

  create(input: NoteInput): string {
    const id = this.deps.uuid()
    const t = this.stamp()
    this.s.notes[id] = {
      page: null, start_offset: null, end_offset: null, quote: "", position: null, chapter: "", color: "",
      body: { type: "doc", content: [{ type: "paragraph" }] }, body_text: "",
      ...input, id, book_id: this.bookId, created_at: t, client_updated_at: t,
    } as NoteRow
    if (input.body) this.s.notes[id].body_text = docPlainText(input.body)
    this.queue(id, "put")
    return id
  }

  update(id: string, patch: Partial<NoteRow>) {
    const cur = this.s.notes[id]
    if (!cur) return
    const next = { ...cur, ...patch, id, client_updated_at: this.stamp(), deleted: false } as NoteRow
    if (patch.body) next.body_text = docPlainText(patch.body)
    this.s.notes[id] = next
    this.queue(id, "put")
  }

  remove(id: string) {
    const cur = this.s.notes[id]
    if (!cur) return
    this.s.notes[id] = { ...cur, deleted: true, client_updated_at: this.stamp() }
    this.queue(id, "delete")
  }

  restore(id: string) {
    const cur = this.s.notes[id]
    if (!cur) return
    this.s.notes[id] = { ...cur, deleted: false, client_updated_at: this.stamp() }
    // A put (not "restore") so a delete that never reached the server is simply superseded.
    this.queue(id, "put")
  }

  // ── sync ─────────────────────────────────────────────────────
  schedule(ms: number) {
    if (this.timer) this.deps.clearTimer(this.timer)
    this.timer = this.deps.setTimer(() => {
      this.timer = null
      void this.sync()
    }, ms)
  }

  sync(): Promise<void> {
    if (this.syncing) {
      this.again = true
      return this.syncing
    }
    this.syncing = this.run().finally(() => {
      this.syncing = null
      if (this.again) {
        this.again = false
        void this.sync()
      }
    })
    return this.syncing
  }

  private async run() {
    if (!this.deps.online()) {
      this.emit()
      return
    }
    try {
      await this.push()
      await this.pull()
      this.failures = 0
      this.lastError = false
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0
      this.lastError = true
      // Permanent refusals (bad doc, no access, limit) would retry forever: drop them from the queue.
      if (status >= 400 && status < 500 && status !== 408 && status !== 429 && status !== 401) {
        this.dropFirstRefused()
      }
      const wait = BACKOFF[Math.min(this.failures, BACKOFF.length - 1)]
      this.failures += 1
      this.schedule(wait)
    }
    this.emit()
  }

  private refused: string | null = null
  private dropFirstRefused() {
    if (this.refused && this.s.pending[this.refused]) {
      delete this.s.pending[this.refused]
      this.save()
    }
  }

  private async push() {
    for (const [id, p] of Object.entries({ ...this.s.pending })) {
      this.refused = id
      const note = this.s.notes[id]
      if (!note) {
        delete this.s.pending[id]
        continue
      }
      const key = newIdempotencyKey()
      if (p.op === "delete") await this.deps.api.deleteNote(this.bookId, id, key, this.guest)
      else if (p.op === "restore") await this.deps.api.restoreNote(this.bookId, id, key, this.guest)
      else {
        const saved = await this.deps.api.putNote(this.bookId, note, key, this.guest)
        if (saved.conflict) this.adopt(saved)
      }
      // Only forget the op if the note wasn't edited while the request was in flight.
      if (this.s.pending[id]?.rev === p.rev) delete this.s.pending[id]
      this.save()
    }
    this.refused = null
  }

  private adopt(row: NoteRow) {
    if (this.s.pending[row.id]) return
    if (row.deleted) delete this.s.notes[row.id]
    else this.s.notes[row.id] = { ...row, book_id: this.bookId }
  }

  private async pull() {
    const first = this.s.cursor == null
    const res = await this.deps.api.fetchNotes(this.bookId, this.s.cursor, this.guest)
    const seen = new Set<string>()
    for (const n of res.notes) {
      seen.add(n.id)
      if (this.s.pending[n.id]) continue // our unsent change wins until it is pushed
      const mine = this.s.notes[n.id]
      if (n.deleted) {
        if (!mine || mine.client_updated_at <= n.client_updated_at) delete this.s.notes[n.id]
        continue
      }
      if (!mine || mine.client_updated_at <= n.client_updated_at) this.s.notes[n.id] = { ...n, book_id: this.bookId }
    }
    if (first) {
      // Full list: anything we hold that the server doesn't (and isn't unsent) was deleted elsewhere.
      for (const id of Object.keys(this.s.notes)) if (!seen.has(id) && !this.s.pending[id]) delete this.s.notes[id]
    }
    this.s.cursor = res.server_time
    this.save()
  }
}
