import { formatTime } from "./doc"
import type { NoteColor, NoteRow } from "./types"

export type TypeFilter = "all" | "highlights" | "notes" | "position" | "audio"
export type SortKey = "position" | "newest" | "oldest"

export type Filters = { q: string; type: TypeFilter; color: NoteColor | "all" }

export function filterNotes(notes: NoteRow[], f: Filters): NoteRow[] {
  const q = f.q.trim().toLowerCase()
  return notes.filter((n) => {
    if (f.color !== "all" && n.color !== f.color) return false
    if (f.type === "highlights" && !n.quote) return false
    if (f.type === "notes" && !n.body_text) return false
    if (f.type === "position" && !(n.kind === "pdf" && !n.quote)) return false
    if (f.type === "audio" && n.kind !== "audio") return false
    if (!q) return true
    return `${n.body_text}\n${n.quote}\n${n.chapter}\n${n.book_title || ""}`.toLowerCase().includes(q)
  })
}

export function sortNotes(notes: NoteRow[], key: SortKey): NoteRow[] {
  const arr = [...notes]
  if (key === "newest") return arr.sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (key === "oldest") return arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return arr.sort(
    (a, b) => (a.page ?? 0) - (b.page ?? 0) || (a.position ?? 0) - (b.position ?? 0) || (a.start_offset ?? 0) - (b.start_offset ?? 0) || a.created_at.localeCompare(b.created_at),
  )
}

/** "Page 3" / "Chapter title" for reader notes, a ten-minute bucket (or chapter) for audio. */
export function groupLabel(n: NoteRow): string {
  if (n.kind === "audio") {
    if (n.chapter) return n.chapter
    const start = Math.floor((n.position ?? 0) / 600) * 600
    return `${formatTime(start)} – ${formatTime(start + 600)}`
  }
  return n.chapter ? `${n.chapter}` : `Page ${n.page ?? 1}`
}

export function groupNotes(notes: NoteRow[]): { label: string; notes: NoteRow[] }[] {
  const out: { label: string; notes: NoteRow[] }[] = []
  for (const n of notes) {
    const label = groupLabel(n)
    const last = out[out.length - 1]
    if (last && last.label === label) last.notes.push(n)
    else out.push({ label, notes: [n] })
  }
  return out
}

export function locationLabel(n: NoteRow): string {
  return n.kind === "audio" ? formatTime(n.position ?? 0) : `p.${n.page ?? 1}`
}
