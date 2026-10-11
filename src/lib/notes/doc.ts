import type { NoteColor, NoteDoc, NoteNode } from "./types"

export const EMPTY_DOC: NoteDoc = { type: "doc", content: [{ type: "paragraph" }] }

export function docFromText(text: string): NoteDoc {
  const lines = (text || "").replace(/\r/g, "").split("\n")
  const content: NoteNode[] = lines.map((l) => (l.trim() ? { type: "paragraph", content: [{ type: "text", text: l }] } : { type: "paragraph" }))
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] }
}

function inline(n: NoteNode): string {
  if (n.type === "text") return n.text || ""
  if (n.type === "hardBreak") return "\n"
  return (n.content || []).map(inline).join("")
}

/** Plain text of a document (search, previews, empty checks). */
export function docPlainText(doc: NoteDoc | null | undefined): string {
  const out: string[] = []
  const walk = (n: NoteNode) => {
    if (n.type === "paragraph" || n.type === "heading") out.push(inline(n))
    else for (const c of n.content || []) walk(c)
  }
  for (const c of doc?.content || []) walk(c)
  return out.join("\n").trim()
}

export function isDocEmpty(doc: NoteDoc | null | undefined): boolean {
  return docPlainText(doc) === ""
}

export const COLOR_LABEL: Record<NoteColor, string> = { yellow: "Yellow", green: "Green", blue: "Blue", pink: "Pink" }

/** Highlight background (works on light and dark) + a solid swatch. */
export const COLOR_BG: Record<NoteColor, string> = {
  yellow: "bg-[#f6e27a] dark:bg-[#f6e27a]/35",
  green: "bg-[#a8e6a1] dark:bg-[#a8e6a1]/35",
  blue: "bg-[#a6d4ff] dark:bg-[#a6d4ff]/35",
  pink: "bg-[#ffb3cf] dark:bg-[#ffb3cf]/35",
}
export const COLOR_SWATCH: Record<NoteColor, string> = {
  yellow: "bg-[#f2cf3a]",
  green: "bg-[#5fcf7a]",
  blue: "bg-[#4aa3ff]",
  pink: "bg-[#ff6fa3]",
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`
}
