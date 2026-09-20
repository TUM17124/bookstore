import type { EditorSnapshot } from '@/lib/pdf-editor-types'

const DB_NAME = 'plugyard-pdf-editor'
const STORE = 'drafts'
const DRAFT_KEY = 'draft'

export type PdfEditorDraft = {
  savedAt: number
  snapshot: EditorSnapshot
  /** Raw bytes of each uploaded source PDF, in `docIndex` order, so pages
   * with `source.kind === 'copy'` can be reconstructed on restore. */
  sourceBytesList: (Uint8Array | null)[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Could not open IndexedDB'))
  })
}

export async function saveDraft(draft: PdfEditorDraft): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(draft, DRAFT_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Autosave is best-effort — never block editing on it.
  }
}

export async function loadDraft(): Promise<PdfEditorDraft | null> {
  try {
    const db = await openDb()
    const draft = await new Promise<PdfEditorDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(DRAFT_KEY)
      req.onsuccess = () => resolve((req.result as PdfEditorDraft) || null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return draft
  } catch {
    return null
  }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(DRAFT_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // ignore
  }
}


