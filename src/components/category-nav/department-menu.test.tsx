// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DepartmentMenu } from "./department-menu"

const category = {
  slug: "department", label: "Department", children: [{
    slug: "child", label: "Child category", children: [{ slug: "grandchild", label: "Nested category", children: [] }],
  }],
} as never

describe("department category menu", () => {
  let root: Root | null = null
  let host: HTMLDivElement | null = null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<DepartmentMenu category={category} inline />))
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = null
    host = null
  })

  it("does not render nested category trees until the relevant department is expanded", async () => {
    expect(host!.textContent).toContain("Explore Department")
    expect(host!.textContent).not.toContain("Child category")
    expect(host!.textContent).not.toContain("Nested category")

    await act(async () => {
      const details = host!.querySelector("details")!
      details.open = true
      details.dispatchEvent(new Event("toggle"))
      await Promise.resolve()
    })
    expect(host!.textContent).toContain("Child category")
    expect(host!.textContent).not.toContain("Nested category")

    const childDisclosure = [...host!.querySelectorAll("summary")].find((summary) => summary.textContent === "More in Child category")!
    await act(async () => {
      const details = childDisclosure.parentElement as HTMLDetailsElement
      details.open = true
      details.dispatchEvent(new Event("toggle"))
      await Promise.resolve()
    })
    expect(host!.textContent).toContain("Nested category")
  })
})
