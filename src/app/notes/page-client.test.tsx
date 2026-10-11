// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { docFromText } from "@/lib/notes/doc"
import type { NoteRow } from "@/lib/notes/types"

const store = {
  notes: {} as Record<string, NoteRow>,
  sync: vi.fn(async () => {}),
  update: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  get(id: string) { return this.notes[id] },
  status: () => "saved" as const,
  subscribe: () => () => {},
}
const note: NoteRow = {
  id: "n1", book_id: 7, kind: "pdf", page: 3, start_offset: null, end_offset: null, quote: "a line",
  position: null, chapter: "", color: "yellow", body: docFromText("hello"), body_text: "hello",
  created_at: "2026-01-01T00:00:00Z", client_updated_at: "2026-01-01T00:00:00Z", book_title: "Book Seven",
}

vi.mock("@/lib/api", () => ({ contentFetch: vi.fn(), getToken: () => null }))
vi.mock("@/lib/use-logged-in", () => ({ useLoggedIn: () => true }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/notes/api", () => ({
  fetchAllNotes: vi.fn(async () => ({ total: 1, notes: [note] })),
  downloadNotesExport: vi.fn(),
}))
vi.mock("@/lib/notes/registry", () => ({ getNotesStore: () => store }))

import NotesPage from "./page-client"

let root: Root | null = null
let el: HTMLDivElement | null = null
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom lacks layout APIs ProseMirror asks for
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} }
  const list = { length: 0, item: () => null, [Symbol.iterator]: function* () {} }
  for (const proto of [Range.prototype, Element.prototype] as unknown as Record<string, unknown>[]) {
    proto.getClientRects = proto.getClientRects || (() => list)
    proto.getBoundingClientRect = proto.getBoundingClientRect || (() => rect)
  }
  ;(document as unknown as Record<string, unknown>).elementFromPoint = (document as unknown as Record<string, unknown>).elementFromPoint || (() => null)
  store.notes = { n1: note }
  store.update.mockClear(); store.remove.mockClear(); store.sync.mockClear()
})
afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  root = null
})

describe("My notes page", () => {
  it("lets notes be deleted through the book's store after pulling that book's notes", async () => {
    el = document.createElement("div")
    document.body.append(el)
    root = createRoot(el)
    await act(async () => root!.render(<NotesPage />))
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(el.textContent).toContain("Book Seven")
    const del = el.querySelector('button[aria-label="Delete note"]') as HTMLButtonElement
    expect(del).not.toBeNull()
    await act(async () => { del.click(); await new Promise((r) => setTimeout(r, 20)) })
    expect(store.sync).toHaveBeenCalledTimes(1)
    expect(store.remove).toHaveBeenCalledWith("n1")
  })

  it("changes colour through the same store", async () => {
    el = document.createElement("div")
    document.body.append(el)
    root = createRoot(el)
    await act(async () => root!.render(<NotesPage />))
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    await act(async () => (el!.querySelector('button[aria-label="Edit note"]') as HTMLButtonElement).click())
    const green = el.querySelector('[aria-label="Highlight colour"] button[aria-label="Green"]') as HTMLButtonElement | null
    const any = green || (el.querySelector('[aria-label="Highlight colour"] button') as HTMLButtonElement)
    await act(async () => { any.click(); await new Promise((r) => setTimeout(r, 20)) })
    expect(store.update).toHaveBeenCalledWith("n1", expect.objectContaining({ color: expect.any(String) }))
  })
})
