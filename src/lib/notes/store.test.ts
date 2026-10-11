import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Deps } from "./store"
import { NotesStore } from "./store"
import type { NoteRow } from "./types"
import { docFromText } from "./doc"

vi.mock("@/lib/api", () => ({ contentFetch: vi.fn() }))
vi.mock("@/lib/auth-fetch", () => ({ newIdempotencyKey: () => Math.random().toString(36).slice(2) }))

/** A tiny in-memory copy of the server's rules (LWW, tombstones, ownership by id). */
class FakeServer {
  rows = new Map<string, NoteRow & { deleted?: boolean }>()
  clock = 1_000
  down = false
  calls: string[] = []
  tick() { this.clock += 1; return new Date(this.clock * 1000).toISOString() }
  api = {
    fetchNotes: async (_b: string, since: string | null) => {
      this.calls.push("get")
      if (this.down) throw Object.assign(new Error("net"), { status: 0 })
      const rows = [...this.rows.values()].filter((r) => (since ? (r as unknown as { u: string }).u > since : !r.deleted))
      return { notes: JSON.parse(JSON.stringify(rows)) as NoteRow[], server_time: this.tick() }
    },
    putNote: async (_b: string, n: NoteRow) => {
      this.calls.push("put")
      if (this.down) throw Object.assign(new Error("net"), { status: 0 })
      const cur = this.rows.get(n.id)
      if (cur && n.client_updated_at < cur.client_updated_at) return { ...cur, conflict: true } as NoteRow & { conflict: boolean }
      const row = { ...JSON.parse(JSON.stringify(n)), deleted: false, u: this.tick() }
      this.rows.set(n.id, row)
      return row
    },
    deleteNote: async (_b: string, id: string) => {
      this.calls.push("delete")
      if (this.down) throw Object.assign(new Error("net"), { status: 0 })
      const cur = this.rows.get(id)
      if (cur) this.rows.set(id, { ...cur, deleted: true, u: this.tick() } as never)
    },
    restoreNote: async () => {},
  }
}

function mem(): Storage {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 }
}

function make(server: FakeServer, storage: Storage, opts: { online?: () => boolean; t?: { v: number } } = {}) {
  let n = 0
  const timers: Array<() => void> = []
  const t = opts.t ?? { v: 1_000_000 }
  const deps: Deps = {
    api: server.api as unknown as Deps["api"],
    storage,
    now: () => (t.v += 1000),
    online: opts.online ?? (() => true),
    uuid: () => `id-${++n}-${Math.random().toString(36).slice(2, 6)}`,
    setTimer: (fn) => (timers.push(fn), timers.length),
    clearTimer: () => {},
  }
  const store = new NotesStore("7", null, deps, "1")
  return { store, timers, runTimers: async () => { while (timers.length) await timers.shift()!() } }
}

const base = { kind: "pdf" as const, page: 2, quote: "a highlighted passage", color: "yellow" as const }

describe("NotesStore", () => {
  let server: FakeServer
  let storage: Storage
  beforeEach(() => { server = new FakeServer(); storage = mem() })

  it("applies changes locally at once and syncs them", async () => {
    const { store } = make(server, storage)
    const id = store.create({ ...base, body: docFromText("hello") })
    expect(store.list()).toHaveLength(1)
    expect(store.status()).toBe("saving")
    await store.sync()
    expect(store.status()).toBe("saved")
    expect(server.rows.get(id)?.body_text).toBe("hello")
  })

  it("works offline, persists across reloads, and syncs when back online", async () => {
    let online = false
    const a = make(server, storage, { online: () => online })
    const id = a.store.create({ ...base, body: docFromText("offline note") })
    a.store.update(id, { body: docFromText("offline note v2") })
    await a.store.sync()
    expect(a.store.status()).toBe("offline")
    expect(server.calls).toEqual([])
    // a fresh page load (new store, same storage) still has the note and the queue
    const b = make(server, storage, { online: () => online })
    expect(b.store.list().map((n) => n.body_text)).toEqual(["offline note v2"])
    expect(b.store.pendingCount()).toBe(1)
    online = true
    await b.store.sync()
    expect(b.store.status()).toBe("saved")
    expect(server.rows.get(id)?.body_text).toBe("offline note v2")
    expect(server.calls.filter((c) => c === "put")).toHaveLength(1) // one coalesced save, not one per keystroke
  })

  it("retries with backoff after a failure and never duplicates", async () => {
    const { store, timers, runTimers } = make(server, storage)
    server.down = true
    const id = store.create({ ...base, body: docFromText("x") })
    await store.sync()
    expect(store.status()).toBe("error")
    expect(timers.length).toBeGreaterThan(0)
    server.down = false
    await runTimers()
    await store.sync()
    expect(store.status()).toBe("saved")
    expect([...server.rows.keys()]).toEqual([id])
  })

  it("an edit made while a save is in flight is not lost", async () => {
    const { store } = make(server, storage)
    const id = store.create({ ...base, body: docFromText("one") })
    const real = server.api.putNote
    let first = true
    server.api.putNote = async (b, n) => {
      if (first) { first = false; store.update(id, { body: docFromText("two") }) }
      return real(b, n)
    }
    await store.sync() // sync() re-runs because a change arrived during the run
    await store.sync()
    expect(server.rows.get(id)?.body_text).toBe("two")
    expect(store.status()).toBe("saved")
  })

  it("two devices converge: last writer wins, deletes propagate and are not resurrected", async () => {
    const t = { v: 1_000_000 }
    const A = make(server, mem(), { t })
    const B = make(server, mem(), { t })
    const id = A.store.create({ ...base, body: docFromText("v1") })
    await A.store.sync()
    await B.store.sync()
    expect(B.store.list().map((n) => n.body_text)).toEqual(["v1"])
    A.store.update(id, { body: docFromText("from A") })
    B.store.update(id, { body: docFromText("from B (later)") })
    await A.store.sync()
    await B.store.sync()
    await A.store.sync()
    expect(A.store.get(id)?.body_text).toBe("from B (later)")
    expect(B.store.get(id)?.body_text).toBe("from B (later)")
    A.store.remove(id)
    await A.store.sync()
    await B.store.sync()
    expect(B.store.list()).toEqual([])
    // B edits nothing; A's tombstone stays
    await A.store.sync()
    expect(A.store.list()).toEqual([])
  })

  it("undo after delete brings the note back everywhere", async () => {
    const { store } = make(server, storage)
    const id = store.create({ ...base, body: docFromText("keep me") })
    await store.sync()
    store.remove(id)
    expect(store.list()).toEqual([])
    store.restore(id)
    await store.sync()
    expect(store.list()).toHaveLength(1)
    expect(server.rows.get(id)?.deleted).toBe(false)
  })

  it("a change in another tab (shared storage) is adopted", async () => {
    const A = make(server, storage)
    const B = make(server, storage)
    const id = A.store.create({ ...base, body: docFromText("tab A") })
    B.store.reloadFromStorage()
    expect(B.store.get(id)?.body_text).toBe("tab A")
  })

  it("two tabs pushing the same queued note do not duplicate it", async () => {
    const A = make(server, storage)
    const B = make(server, storage)
    A.store.create({ ...base, body: docFromText("once") })
    B.store.reloadFromStorage()
    await Promise.all([A.store.sync(), B.store.sync()])
    expect(server.rows.size).toBe(1)
  })

  it("a permanently refused note is dropped from the queue instead of retrying forever", async () => {
    const { store } = make(server, storage)
    server.api.putNote = async () => { throw Object.assign(new Error("not allowed"), { status: 403 }) }
    store.create({ ...base, body: docFromText("x") })
    await store.sync()
    expect(store.pendingCount()).toBe(0)
  })

  it("notes of another account or a guest are kept apart", () => {
    const d = (): Deps => ({ api: server.api as unknown as Deps["api"], storage, now: () => 1, online: () => true, uuid: () => "x", setTimer: () => 0, clearTimer: () => {} })
    const a = new NotesStore("7", null, d(), "1")
    const b = new NotesStore("7", null, d(), "2")
    expect(a.key).not.toBe(b.key)
    expect(new NotesStore("7", "tok", d()).key).toContain(":g")
  })
})
