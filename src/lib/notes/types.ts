export const NOTE_COLORS = ["yellow", "green", "blue", "pink"] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

/** A ProseMirror / TipTap document, exactly as the server stores it. */
export type NoteDoc = { type: "doc"; content?: NoteNode[] }
export type NoteNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: NoteNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export type NoteRow = {
  id: string
  book_id: number | string
  kind: "pdf" | "audio"
  page: number | null
  start_offset: number | null
  end_offset: number | null
  quote: string
  position: number | null
  chapter: string
  color: NoteColor | ""
  body: NoteDoc
  body_text: string
  created_at: string
  /** Client clock of the last edit: the last-writer-wins stamp. */
  client_updated_at: string
  updated_at?: string
  deleted?: boolean
  book_title?: string
}

/** What the UI hands the store when creating/editing a note. */
export type NoteInput = Partial<Omit<NoteRow, "id" | "book_id" | "created_at" | "client_updated_at">> & {
  kind: "pdf" | "audio"
}

export type SyncStatus = "saved" | "saving" | "offline" | "error"
