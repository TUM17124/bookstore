// @vitest-environment jsdom
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ExpandableText } from "./expandable-text"
import { DescriptionField } from "./description-field"

vi.mock("@/lib/site-config", () => ({ useLimits: () => ({ book_description_max_chars: 20 }) }))

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
})
afterEach(() => {
  act(() => root?.unmount())
  el?.remove()
  root = null
  vi.restoreAllMocks()
})

function fakeLayout(scroll: number, client: number) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(scroll)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(client)
}

describe("ExpandableText", () => {
  it("clamps a long text and toggles Read more / Show less in place", async () => {
    fakeLayout(400, 80)
    await render(<ExpandableText text={"line\n".repeat(30)} lines={4} desktopLines={6} />)
    const p = el!.querySelector("p")!
    expect(p.getAttribute("data-expanded")).toBe("false")
    expect(p.className).toContain("[-webkit-line-clamp:var(--clamp)]")
    expect(p.style.getPropertyValue("--clamp")).toBe("4")
    expect(p.style.getPropertyValue("--clamp-sm")).toBe("6")
    const btn = el!.querySelector("button")!
    expect(btn.textContent).toBe("Read more")
    expect(btn.getAttribute("aria-expanded")).toBe("false")
    await act(async () => btn.click())
    expect(el!.querySelector("p")!.getAttribute("data-expanded")).toBe("true")
    expect(el!.querySelector("button")!.textContent).toBe("Show less")
    expect(el!.querySelector("p")!.className).not.toContain("line-clamp")
    await act(async () => el!.querySelector("button")!.click())
    expect(el!.querySelector("button")!.textContent).toBe("Read more")
  })

  it("shows no toggle when the text fits", async () => {
    fakeLayout(60, 60)
    await render(<ExpandableText text="Short." />)
    expect(el!.querySelector("button")).toBeNull()
  })

  it("wraps a very long single word or URL instead of overflowing, keeps line breaks, renders text not HTML", async () => {
    fakeLayout(60, 60)
    const word = "Supercalifragilistic".repeat(30)
    await render(<ExpandableText text={`${word}\nhttps://example.com/${"a".repeat(300)}\n<b>x</b>`} />)
    const p = el!.querySelector("p")!
    expect(p.className).toContain("[overflow-wrap:anywhere]")
    expect(p.className).toContain("whitespace-pre-line")
    expect(p.className).toContain("min-w-0")
    expect(p.textContent).toContain(word)
    expect(p.querySelector("b")).toBeNull()
    expect(p.textContent).toContain("<b>x</b>")
  })
})

describe("DescriptionField", () => {
  const type = async (v: string) => {
    const ta = el!.querySelector("textarea")!
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!
      set.call(ta, v)
      ta.dispatchEvent(new Event("input", { bubbles: true }))
    })
    return ta
  }

  it("shows a live counter and blocks saving a too-long new text", async () => {
    await render(<DescriptionField />)
    expect(el!.textContent).toContain("0 / 20")
    let ta = await type("12345678901234567890")
    expect(el!.textContent).toContain("20 / 20")
    expect(ta.validity.valid).toBe(true)
    ta = await type("123456789012345678901")
    expect(el!.textContent).toContain("21 / 20")
    expect(el!.textContent).toContain("too long")
    expect(ta.validity.customError).toBe(true)
  })

  it("lets an existing longer description be saved untouched, but not edited longer", async () => {
    const long = "x".repeat(50)
    await render(<DescriptionField defaultValue={long} original={long} />)
    let ta = el!.querySelector("textarea")!
    expect(ta.value).toBe(long) // never cut
    expect(ta.validity.valid).toBe(true)
    ta = await type(long + "y")
    expect(ta.validity.customError).toBe(true)
    ta = await type("fits")
    expect(ta.validity.valid).toBe(true)
  })
})
