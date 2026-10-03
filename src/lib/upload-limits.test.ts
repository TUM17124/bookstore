import { describe, expect, it } from "vitest"
import { EDITOR_UPLOAD_MAX_BYTES, editorUploadProblem } from "./upload-limits"

// F5: the editor's limit is the server's real one (80 MB), said up front.

describe("editorUploadProblem", () => {
  it("accepts files up to 80 MB", () => {
    expect(EDITOR_UPLOAD_MAX_BYTES).toBe(80 * 1024 * 1024)
    expect(editorUploadProblem({ size: EDITOR_UPLOAD_MAX_BYTES, name: "a.pdf" })).toBe("")
  })

  it("explains a file that is too big", () => {
    const msg = editorUploadProblem({ size: 92 * 1024 * 1024, name: "big.pdf" })
    expect(msg).toContain("“big.pdf” is 92 MB")
    expect(msg).toContain("up to 80 MB")
  })
})
