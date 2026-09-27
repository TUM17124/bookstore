import { describe, expect, it } from "vitest"
import {
  notesStorageKey,
  piecesBetween,
  quoteRanges,
} from "./pdf-notes"

describe("pdf note highlights", () => {
  const page = "The river was bright. She wrote a thought in the margin."

  it("marks a selected phrase and leaves the rest plain", () => {
    const ranges = quoteRanges(page, ["bright. She wrote"])
    const head = piecesBetween("The river was bright.", 0, ranges)
    expect(head.map((piece) => [piece.text, piece.marked])).toEqual([
      ["The river was ", false],
      ["bright.", true],
    ])
    const tail = piecesBetween(
      "She wrote a thought in the margin.",
      "The river was bright. ".length,
      ranges,
    )
    expect(tail[0]).toEqual({ text: "She wrote", marked: true })
    expect(tail[1]?.marked).toBe(false)
  })

  it("merges overlapping highlights into one mark", () => {
    const ranges = quoteRanges("alpha beta gamma", ["alpha beta", "beta gamma"])
    expect(piecesBetween("alpha beta gamma", 0, ranges)).toEqual([
      { text: "alpha beta gamma", marked: true },
    ])
  })

  it("keys notes by the book, then by the file address", () => {
    expect(notesStorageKey("42", "https://x/a.pdf?token=1")).toBe(
      "plugyard-pdf-notes:42",
    )
    expect(notesStorageKey(undefined, "https://x/a.pdf?token=1")).toBe(
      "plugyard-pdf-notes:https://x/a.pdf",
    )
  })
})
