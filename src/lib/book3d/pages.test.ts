import { describe, expect, it } from "vitest"
import { planFaces } from "./pages"

describe("planFaces", () => {
  it("shows only real text for the pages that exist, then blank paper marked End of preview", () => {
    const plan = planFaces(8, ["one", "two", "three"])
    expect(plan.slice(0, 3).map((f) => f.kind)).toEqual(["text", "text", "text"])
    expect(plan[3]).toEqual({ kind: "blank", note: "End of preview" })
    expect(plan.slice(4).every((f) => f.kind === "blank" && !(f as { note?: string }).note)).toBe(true)
  })
  it("with no preview: title page, blank paper and a Preview not available note, never invented text", () => {
    for (const none of [null, []] as const) {
      const plan = planFaces(8, none as string[] | null)
      expect(plan[0].kind).toBe("title")
      expect(plan.some((f) => f.kind === "text")).toBe(false)
      expect(plan.filter((f) => f.kind === "blank" && (f as { note?: string }).note === "Preview not available").length).toBe(1)
    }
  })
})
