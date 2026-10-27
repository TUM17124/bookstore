import { afterEach, describe, expect, it, vi } from "vitest"

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }))

vi.mock("./auth-fetch", () => ({
  authFetch,
  errorMessage: (reason: unknown) => reason instanceof Error ? reason.message : "Request failed",
  newIdempotencyKey: () => "test-key",
}))

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("myListings pagination", () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("loads every API page for seller tools that need the complete listing set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api")
    authFetch
      .mockResolvedValueOnce(response({
        count: 3,
        next: "https://api.example.test/api/marketplace/me/listings/?page=2",
        previous: null,
        results: [{ id: 1 }, { id: 2 }],
      }))
      .mockResolvedValueOnce(response({ count: 3, next: null, previous: "?page=1", results: [{ id: 3 }] }))

    const { myListings } = await import("./marketplace")
    const page = await myListings()

    expect(page.count).toBe(3)
    expect(page.results.map((row) => row.id)).toEqual([1, 2, 3])
    expect(page.next).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(2)
  })

  it("refuses to send authenticated pagination requests off the listings API endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test/api")
    authFetch.mockResolvedValueOnce(response({
      count: 2,
      next: "https://attacker.example/collect?token=1",
      previous: null,
      results: [{ id: 1 }],
    }))

    const { myListings } = await import("./marketplace")
    await expect(myListings()).rejects.toThrow("invalid next-page link")
    expect(authFetch).toHaveBeenCalledTimes(1)
  })
})
