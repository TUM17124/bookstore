"use client"

import { useEffect, useSyncExternalStore } from "react"
import { getNotesStore } from "./registry"
import type { NotesStore } from "./store"
import type { NoteRow, SyncStatus } from "./types"

const EMPTY: { notes: NoteRow[]; status: SyncStatus } = { notes: [], status: "saved" }

/** Notes of one book from the shared local-first store (syncs on mount). */
export function useNotes(bookId: string | undefined, guestToken?: string | null) {
  const store: NotesStore | null = bookId ? getNotesStore(bookId, guestToken || null) : null
  const snap = useSyncExternalStore(
    store ? store.subscribe : () => () => {},
    store ? store.getSnapshot : () => EMPTY,
    () => EMPTY,
  )
  useEffect(() => {
    if (store) void store.sync()
  }, [store])
  return { store, notes: snap.notes, status: snap.status }
}
