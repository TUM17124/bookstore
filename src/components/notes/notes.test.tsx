// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NoteDoc, NoteRow } from "@/lib/notes/types"
import { docFromText } from "@/lib/notes/doc"
import { NoteView } from "./note-view"
import { NotesPanel } from "./notes-panel"
import { RichNoteEditor } from "./rich-note-editor"

vi.mock("@/lib/api", () => ({ contentFetch: vi.fn(), getToken: () => null }))

let root: Root | null = null
let el: HTMLDivElement | null = null
async function render(ui: React.ReactElement) {
  el = document.createElement("div")
  document.body.append(el)
  root = createRoot(el)
  await act(async () => root!.render(ui))
}
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom lacks layout APIs ProseMirror asks for
  const proto = Range.prototype as unknown as Record<string, unknown>
  proto.getClientRects = proto.getClientRects || (() => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }))
  proto.getBoundingClientRect = proto.getBoundingClientRect || (() => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} }))
  ;(document as unknown as Record<string, unknown>).elementFromPoint = (document as unknown as Record<string, unknown>).elementFromPoint || (() => null)
})
afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  root = null
})

const row = (o: Partial<NoteRow>): NoteRow =>
  ({ id: "n" + Math.random().toString(36).slice(2), book_id: 1, kind: "pdf", page: 1, start_offset: null, end_offset: null, quote: "", position: null, chapter: "", color: "", body: docFromText(""), body_text: "", created_at: "2026-01-01T00:00:00Z", client_updated_at: "2026-01-01T00:00:00Z", ...o }) as NoteRow

describe("NoteView (read-only rendering)", () => {
  it("renders formatting as elements and never as HTML", async () => {
    const doc: NoteDoc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title <img src=x onerror=alert(1)>" }] },
        { type: "paragraph", content: [
          { type: "text", text: "bold", marks: [{ type: "bold" }] }, { type: "text", text: " " },
          { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        ] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }] }] },
      ],
    }
    await render(<NoteView doc={doc} />)
    expect(el!.querySelector("strong")?.textContent).toBe("bold")
    expect(el!.querySelector("a")?.getAttribute("rel")).toContain("noopener")
    expect(el!.querySelector("img")).toBeNull()
    expect(el!.textContent).toContain("<img src=x")
    expect(el!.textContent).toContain("Done:")
  })

  it("drops unsafe link targets even if one reached the client", async () => {
    const doc: NoteDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] }
    await render(<NoteView doc={doc} />)
    expect(el!.querySelector("a")).toBeNull()
  })
})

const wait = (ms = 60) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

const RICH: NoteDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Idea" }] },
    { type: "paragraph", content: [
      { type: "text", text: "b", marks: [{ type: "bold" }] }, { type: "text", text: "i", marks: [{ type: "italic" }] },
      { type: "text", text: "u", marks: [{ type: "underline" }] }, { type: "text", text: "s", marks: [{ type: "strike" }] },
      { type: "text", text: "h", marks: [{ type: "highlight", attrs: { color: "green" } }] },
      { type: "text", text: "l", marks: [{ type: "link", attrs: { href: "https://example.com/a" } }] },
    ] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }] }] },
    { type: "paragraph", content: [{ type: "text", text: "tail" }] },
  ],
}

function marksOf(doc: NoteDoc): string[] {
  const out: string[] = []
  const walk = (n: { type: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: unknown[] }) => {
    for (const m of n.marks || []) out.push(m.type + (m.attrs?.color ? ":" + m.attrs.color : "") + (m.attrs?.href ? ":" + m.attrs.href : ""))
    for (const c of (n.content || []) as typeof n[]) walk(c)
  }
  walk(doc as never)
  return out
}

describe("RichNoteEditor", () => {
  it("has a labelled, keyboard-reachable toolbar and a textbox role", async () => {
    await render(<RichNoteEditor value={RICH} onChange={() => {}} />)
    await wait()
    const toolbar = el!.querySelector('[role="toolbar"]')!
    const labels = [...toolbar.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))
    for (const l of ["Undo", "Redo", "Bold", "Italic", "Underline", "Strikethrough", "Heading 1", "Heading 2", "Heading 3", "Bullet list", "Numbered list", "Checklist", "Quote", "Link", "Highlight colour"]) expect(labels).toContain(l)
    expect(el!.querySelector('[role="textbox"]')?.getAttribute("aria-label")).toBe("Note")
    expect(toolbar.querySelector('button[aria-label="Bold"]')?.hasAttribute("aria-pressed")).toBe(true)
    // no layout shift: the editor reserves its height before it mounts and keeps it after
    expect((el!.querySelector('[role="textbox"]') as HTMLElement).style.minHeight).toBe("112px")
  })

  it("formatting round-trips: every mark, list, task and heading survives an edit", async () => {
    const onChange = vi.fn()
    await render(<RichNoteEditor value={RICH} onChange={onChange} autoFocus />)
    await wait()
    await act(async () => (el!.querySelector('button[aria-label="Quote"]') as HTMLButtonElement).click())
    expect(onChange).toHaveBeenCalled()
    const out = onChange.mock.calls.at(-1)![0] as NoteDoc
    expect(marksOf(out).sort()).toEqual(["bold", "highlight:green", "italic", "link:https://example.com/a", "strike", "underline"].sort())
    const types = (out.content || []).map((n) => n.type)
    expect(types).toContain("heading")
    expect(types).toContain("bulletList")
    expect(types).toContain("taskList")
    expect(JSON.stringify(out)).toContain('"checked":true')
    expect(types).toContain("blockquote") // the edit we made
  })

  it("rejects content over the limit by undoing the edit", async () => {
    const onChange = vi.fn()
    const long: NoteDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(5000) }] }] }
    await render(<RichNoteEditor value={long} onChange={onChange} autoFocus />)
    await wait()
    expect(el!.textContent).toContain("5000/5000")
  })
})

describe("NotesPanel", () => {
  const notes = [
    row({ id: "a", page: 2, quote: "first passage", color: "yellow", body_text: "think about this", body: docFromText("think about this") }),
    row({ id: "b", page: 5, quote: "second passage", color: "blue" }),
    row({ id: "c", page: 5, body_text: "page-level note", body: docFromText("page-level note") }),
  ]
  const base = { open: true, onClose: () => {}, status: "saved" as const, onJump: () => {} }

  it("groups by page, searches, filters by colour and type", async () => {
    await render(<NotesPanel {...base} notes={notes} />)
    expect([...el!.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Page 2", "Page 5"])
    const search = el!.querySelector('input[type="search"]') as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => { set.call(search, "page-level"); search.dispatchEvent(new Event("input", { bubbles: true })) })
    expect(el!.querySelectorAll("li").length).toBe(1)
    await act(async () => { set.call(search, ""); search.dispatchEvent(new Event("input", { bubbles: true })) })
    await act(async () => (el!.querySelector('button[aria-label="Blue only"]') as HTMLButtonElement).click())
    expect(el!.querySelectorAll("li").length).toBe(1)
    expect(el!.textContent).toContain("second passage")
  })

  it("tapping a note jumps to its anchor", async () => {
    const onJump = vi.fn()
    await render(<NotesPanel {...base} notes={notes} onJump={onJump} />)
    await act(async () => (el!.querySelector('button[aria-label="Go to page p.5"]') as HTMLButtonElement).click())
    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ page: 5 }))
  })

  it("audio notes show their time and group by ten-minute block", async () => {
    const a = [row({ id: "t1", kind: "audio", page: null, position: 65, body_text: "x" }), row({ id: "t2", kind: "audio", page: null, position: 700, body_text: "y" })]
    const onJump = vi.fn()
    await render(<NotesPanel {...base} notes={a} onJump={onJump} />)
    expect([...el!.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["0:00 – 10:00", "10:00 – 20:00"])
    await act(async () => (el!.querySelector('button[aria-label="Go to time 1:05"]') as HTMLButtonElement).click())
    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ position: 65 }))
  })

  it("delete offers undo, and undo restores", async () => {
    const onDelete = vi.fn()
    const onRestore = vi.fn()
    await render(<NotesPanel {...base} notes={notes} onDelete={onDelete} onRestore={onRestore} />)
    await act(async () => (el!.querySelector('button[aria-label="Delete note"]') as HTMLButtonElement).click())
    expect(onDelete).toHaveBeenCalledWith("a")
    const undo = [...el!.querySelectorAll("button")].find((b) => b.textContent === "Undo")!
    await act(async () => undo.click())
    expect(onRestore).toHaveBeenCalledWith("a")
  })

  it("is a labelled dialog that closes on Escape; read-only mode hides edit and delete", async () => {
    const onClose = vi.fn()
    await render(<NotesPanel {...base} notes={notes} onClose={onClose} readOnly />)
    expect(el!.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBeTruthy()
    expect(el!.querySelector('button[aria-label="Delete note"]')).toBeNull()
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })) })
    expect(onClose).toHaveBeenCalled()
  })

  it("exports through the provided handler", async () => {
    const onExport = vi.fn().mockResolvedValue(undefined)
    await render(<NotesPanel {...base} notes={notes} onExport={onExport} />)
    await act(async () => ([...el!.querySelectorAll("button")].find((b) => b.textContent === "PDF") as HTMLButtonElement).click())
    expect(onExport).toHaveBeenCalledWith("pdf")
  })
})
