import { describe, expect, it } from "vitest"
import { conversionNote } from "./page-client"

describe("conversionNote", () => {
  it("says nothing when there is no conversion or it is done", () => {
    expect(conversionNote(null)).toBe("")
    expect(conversionNote(undefined)).toBe("")
    expect(conversionNote({ status: "ok", format: "docx" })).toBe("")
  })
  it("tells the author a file is converting", () => {
    expect(conversionNote({ status: "queued", format: "docx" })).toContain("converting your DOCX file")
    expect(conversionNote({ status: "running", format: "pptx" })).toContain("PPTX")
  })
  it("shows the reason when it failed", () => {
    const note = conversionNote({ status: "failed", format: "odt", error: "The document took longer than 90 seconds to convert." })
    expect(note).toContain("could not convert your ODT file")
    expect(note).toContain("90 seconds")
  })
})
