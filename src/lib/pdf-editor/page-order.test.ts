import { describe, expect, it } from "vitest"
import { renumberPages, sortPagesByNumber } from "./page-order"

type P = { pageNumber?: number; tag: string }

const mk = (...tags: string[]): P[] => tags.map((tag, i) => ({ pageNumber: i + 1, tag }))

describe("editor page ordering", () => {
  it("leaves an already-ordered document untouched", () => {
    const pages = mk("a", "b", "c")
    expect(sortPagesByNumber(pages).map((p) => p.tag)).toEqual(["a", "b", "c"])
  })

  it("restores order when the parser emits pages out of sequence", () => {
    // THE regression: a page arriving out of order makes the canvas draw page
    // N's elements onto page M ("text lines moved onto other pages").
    const scrambled = [
      { pageNumber: 3, tag: "c" },
      { pageNumber: 1, tag: "a" },
      { pageNumber: 2, tag: "b" },
    ]
    expect(sortPagesByNumber(scrambled).map((p) => p.tag)).toEqual(["a", "b", "c"])
  })

  it("keeps unnumbered pages instead of dropping the user's content", () => {
    const pages = [
      { pageNumber: 2, tag: "b" },
      { pageNumber: undefined, tag: "orphan1" },
      { pageNumber: 1, tag: "a" },
      { pageNumber: 0, tag: "orphan2" },
    ]
    const out = sortPagesByNumber(pages)
    expect(out.map((p) => p.tag)).toEqual(["a", "b", "orphan1", "orphan2"])
  })

  it("numbers pages 1..N positionally", () => {
    const out = renumberPages(mk("a", "b", "c"))
    expect(out.map((p) => p.pageNumber)).toEqual([1, 2, 3])
  })

  it("collapses duplicate page numbers left by pasting into a blank document", () => {
    // THE regression: the blank document's page 1 is still numbered 1 when 114
    // pasted pages follow it, so two pages both claim to be page 1. Every
    // element API is keyed on pageNumber, so that collision pushed text onto
    // the wrong pages on reopen.
    const pasted = [
      { pageNumber: 1, tag: "blank" },
      { pageNumber: 1, tag: "pasted-1" },
      { pageNumber: 1, tag: "pasted-2" },
      { pageNumber: 2, tag: "pasted-3" },
    ]
    const out = renumberPages(pasted)
    expect(out.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4])
    expect(out.map((p) => p.tag)).toEqual(["blank", "pasted-1", "pasted-2", "pasted-3"])
  })

  it("makes save/reopen stable: sort then renumber is idempotent", () => {
    // A document reopened after save must render identically to the one that
    // was on screen, however the parser chose to order it.
    const scrambled = [
      { pageNumber: 5, tag: "e" },
      { pageNumber: 1, tag: "a" },
      { pageNumber: 3, tag: "c" },
      { pageNumber: 2, tag: "b" },
      { pageNumber: 4, tag: "d" },
    ]
    const first = renumberPages(sortPagesByNumber(scrambled))
    const second = renumberPages(sortPagesByNumber(first))
    expect(second).toEqual(first)
    expect(first.map((p) => p.tag)).toEqual(["a", "b", "c", "d", "e"])
    expect(first.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5])
  })

  it("does not mutate its input", () => {
    const pages = [{ pageNumber: 2, tag: "b" }, { pageNumber: 1, tag: "a" }]
    const snapshot = JSON.parse(JSON.stringify(pages))
    sortPagesByNumber(pages)
    renumberPages(pages)
    expect(pages).toEqual(snapshot)
  })

  it("handles a 60-page paste without collisions", () => {
    const pages = Array.from({ length: 60 }, (_, i) => ({ pageNumber: 1, tag: `p${i}` }))
    const out = renumberPages(pages)
    expect(new Set(out.map((p) => p.pageNumber)).size).toBe(60)
    expect(out.at(-1)?.pageNumber).toBe(60)
  })
})
