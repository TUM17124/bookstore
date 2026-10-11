import { contentFetch } from "@/lib/api"
import type { NoteRow } from "./types"

/** Network calls for notes. Everything goes through contentFetch, so it gets the
 * Bearer token (or the guest link token), the 401-refresh, and - with an
 * idempotency key - the same retry-with-backoff as every other write. */

export class NoteApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type Guest = string | null | undefined

async function json<T>(p: Promise<Response>): Promise<T> {
  try {
    return (await p).json()
  } catch (e) {
    const err = e as { status?: number; message?: string }
    throw new NoteApiError(err.message || "Request failed", err.status ?? 0)
  }
}

export function fetchNotes(bookId: string | number, since: string | null, guest: Guest) {
  const q = since ? `?since=${encodeURIComponent(since)}` : ""
  return json<{ notes: NoteRow[]; server_time: string }>(contentFetch(`/books/${bookId}/notes/${q}`, {}, guest))
}

export function putNote(bookId: string | number, note: NoteRow, key: string, guest: Guest) {
  const { id, body, kind, page, start_offset, end_offset, quote, position, chapter, color, created_at, client_updated_at } = note
  return json<NoteRow & { conflict?: boolean }>(
    contentFetch(
      `/books/${bookId}/notes/${id}/`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, page, start_offset, end_offset, quote, position, chapter, color, body, created_at, client_updated_at }),
        idempotencyKey: key,
      },
      guest,
    ),
  )
}

export async function deleteNote(bookId: string | number, id: string, key: string, guest: Guest) {
  try {
    await contentFetch(`/books/${bookId}/notes/${id}/`, { method: "DELETE", idempotencyKey: key }, guest)
  } catch (e) {
    if ((e as { status?: number }).status === 404) return // already gone
    throw e
  }
}

export async function restoreNote(bookId: string | number, id: string, key: string, guest: Guest) {
  await contentFetch(`/books/${bookId}/notes/${id}/restore/`, { method: "POST", idempotencyKey: key }, guest)
}

export function fetchAllNotes(params: Record<string, string>, guest: Guest) {
  const qs = new URLSearchParams(params).toString()
  return json<{ total: number; notes: NoteRow[] }>(contentFetch(`/notes/${qs ? `?${qs}` : ""}`, {}, guest))
}

/** Export a book's notes and save the file (needs the auth header, so fetch + blob). */
export async function downloadNotesExport(bookId: string | number, as: "md" | "pdf", guest: Guest) {
  const res = await contentFetch(`/books/${bookId}/notes/export/?as=${as}`, { timeoutMs: 60000 }, guest)
  const blob = await res.blob()
  const cd = res.headers.get("Content-Disposition") || ""
  const m = cd.match(/filename="?([^";]+)"?/i)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = m?.[1] || `notes.${as}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
