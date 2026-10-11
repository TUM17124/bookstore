import { getToken } from "@/lib/api"
import { NotesStore } from "./store"

const stores = new Map<string, NotesStore>()

/** Who is signed in, so two accounts on one browser never share local notes. */
export function ownerTagFromToken(): string {
  try {
    const t = getToken()
    if (!t) return ""
    const payload = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    return String(payload.user_id ?? payload.sub ?? "")
  } catch {
    return ""
  }
}

/** One shared store per book+identity, so the reader, the panel and the editor
 * all see the same notes, and every tab converges through localStorage. */
export function getNotesStore(bookId: string, guest: string | null, ownerTag = guest ? "" : ownerTagFromToken()): NotesStore {
  const k = `${guest ? "g" : "u"}${ownerTag}:${bookId}`
  let s = stores.get(k)
  if (!s) {
    s = new NotesStore(bookId, guest, undefined, ownerTag)
    stores.set(k, s)
    if (typeof window !== "undefined") {
      const store = s
      window.addEventListener("storage", (e) => {
        if (e.key === store.key) store.reloadFromStorage()
      })
      window.addEventListener("online", () => void store.sync())
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void store.sync()
      })
      setInterval(() => {
        if (document.visibilityState === "visible") void store.sync()
      }, 45000)
    }
  }
  return s
}
