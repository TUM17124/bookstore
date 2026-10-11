import { describe, expect, it } from "vitest"
import { filterNotes, groupNotes, sortNotes } from "./view"
import type { NoteRow } from "./types"

const n = (o: Partial<NoteRow>): NoteRow =>
  ({ id: Math.random().toString(), book_id: 1, kind: "pdf", page: 1, start_offset: null, end_offset: null, quote: "", position: null, chapter: "", color: "", body: { type: "doc" }, body_text: "", created_at: "2026-01-01T00:00:00Z", client_updated_at: "2026-01-01T00:00:00Z", ...o }) as NoteRow

const set = [
  n({ id: "a", page: 3, quote: "alpha quote", color: "yellow", body_text: "first idea", created_at: "2026-01-03T00:00:00Z" }),
  n({ id: "b", page: 1, quote: "beta", color: "blue", created_at: "2026-01-01T00:00:00Z" }),
  n({ id: "c", page: 3, body_text: "page note about Gamma", created_at: "2026-01-02T00:00:00Z" }),
  n({ id: "d", kind: "audio", page: null, position: 700, body_text: "audio gamma", chapter: "Intro", created_at: "2026-01-04T00:00:00Z" }),
]
const f = (o = {}) => ({ q: "", type: "all" as const, color: "all" as const, ...o })

describe("notes view", () => {
  it("searches body, quote and chapter, case-insensitively", () => {
    expect(filterNotes(set, f({ q: "GAMMA" })).map((x) => x.id)).toEqual(["c", "d"])
    expect(filterNotes(set, f({ q: "intro" })).map((x) => x.id)).toEqual(["d"])
    expect(filterNotes(set, f({ q: "alpha" })).map((x) => x.id)).toEqual(["a"])
  })
  it("filters by colour and type", () => {
    expect(filterNotes(set, f({ color: "blue" })).map((x) => x.id)).toEqual(["b"])
    expect(filterNotes(set, f({ type: "highlights" })).map((x) => x.id)).toEqual(["a", "b"])
    expect(filterNotes(set, f({ type: "notes" })).map((x) => x.id)).toEqual(["a", "c", "d"])
    expect(filterNotes(set, f({ type: "position" })).map((x) => x.id)).toEqual(["c"])
    expect(filterNotes(set, f({ type: "audio" })).map((x) => x.id)).toEqual(["d"])
  })
  it("sorts by position, newest and oldest", () => {
    expect(sortNotes(set, "position").map((x) => x.id)).toEqual(["d", "b", "c", "a"])
    expect(sortNotes(set, "newest").map((x) => x.id)).toEqual(["d", "a", "c", "b"])
    expect(sortNotes(set, "oldest").map((x) => x.id)).toEqual(["b", "c", "a", "d"])
  })
  it("groups reader notes by page and audio by chapter or ten-minute block", () => {
    expect(groupNotes(sortNotes(set.filter((x) => x.kind === "pdf"), "position")).map((g) => [g.label, g.notes.length])).toEqual([["Page 1", 1], ["Page 3", 2]])
    expect(groupNotes([set[3], n({ kind: "audio", page: null, position: 1300 })]).map((g) => g.label)).toEqual(["Intro", "20:00 – 30:00"])
  })
})
