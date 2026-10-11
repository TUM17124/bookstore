import { describe, expect, it } from "vitest"
import { colouredPieces } from "./paint"

const page = "The quick brown fox jumps over the lazy dog"

describe("colouredPieces", () => {
  it("tags each highlight with its colour and note id", () => {
    const p = colouredPieces(page, page, 0, [
      { id: "a", quote: "quick brown", color: "green" },
      { id: "b", quote: "lazy dog", color: "pink", startOffset: 35, endOffset: 43 },
    ])
    expect(p.map((x) => [x.text, x.color, x.noteId])).toEqual([
      ["The ", "plain", undefined],
      ["quick brown", "green", "a"],
      [" fox jumps over the ", "plain", undefined],
      ["lazy dog", "pink", "b"],
    ])
  })
  it("clips a sentence slice and overlapping highlights", () => {
    const p = colouredPieces(page, "brown fox jumps", 10, [
      { id: "a", quote: "quick brown fox", color: "blue" },
      { id: "b", quote: "fox jumps over", color: "yellow" },
    ])
    expect(p.map((x) => [x.text, x.color])).toEqual([["brown fox", "blue"], [" jumps", "yellow"]])
  })
  it("uses exact offsets for repeated words and ignores stale ones", () => {
    const t = "go go go"
    expect(colouredPieces(t, t, 0, [{ id: "a", quote: "go", startOffset: 3, endOffset: 5, color: "" }]).map((x) => x.color)).toEqual(["plain", "yellow", "plain"])
  })
})
