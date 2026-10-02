import { describe, expect, it, vi } from "vitest"
import { formatRemaining, noteServerTime, serverNow } from "./countdown"

describe("countdown (Part C)", () => {
  it("formats days and h:m:s", () => {
    expect(formatRemaining((2 * 86400 + 4 * 3600 + 12 * 60 + 9) * 1000)).toBe("2d 04:12:09")
    expect(formatRemaining(59_000)).toBe("00:00:59")
    expect(formatRemaining(-5000)).toBe("00:00:00")
  })

  it("uses the server's clock, not the device's", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-02T10:00:00Z"))
    // The phone is 10 minutes slow: the server says 10:10.
    noteServerTime("2026-10-02T10:10:00Z")
    expect(new Date(serverNow()).toISOString()).toBe("2026-10-02T10:10:00.000Z")
    // Time passing keeps the same correction (no reset).
    vi.advanceTimersByTime(60_000)
    expect(new Date(serverNow()).toISOString()).toBe("2026-10-02T10:11:00.000Z")
    vi.useRealTimers()
  })
})
