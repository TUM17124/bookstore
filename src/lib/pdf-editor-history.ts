import type { EditorSnapshot } from '@/lib/pdf-editor-types'

const MAX_HISTORY = 60

/** A simple linear undo/redo stack over document-content snapshots. Kept
 * as plain state (not a hook) so the editor page controls exactly when a
 * snapshot is pushed — e.g. once per discrete action, not per pointermove
 * frame while dragging. */
export class EditorHistory {
  private past: EditorSnapshot[] = []
  private future: EditorSnapshot[] = []

  push(snapshot: EditorSnapshot) {
    this.past.push(clone(snapshot))
    if (this.past.length > MAX_HISTORY) this.past.shift()
    this.future = []
  }

  canUndo() {
    return this.past.length > 1
  }

  canRedo() {
    return this.future.length > 0
  }

  /** Pop the current state off, returning the previous one to restore. */
  undo(): EditorSnapshot | null {
    if (this.past.length <= 1) return null
    const current = this.past.pop()!
    this.future.push(current)
    return clone(this.past[this.past.length - 1])
  }

  redo(): EditorSnapshot | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(next)
    return clone(next)
  }

  reset(snapshot: EditorSnapshot) {
    this.past = [clone(snapshot)]
    this.future = []
  }
}

function clone(snapshot: EditorSnapshot): EditorSnapshot {
  // structuredClone handles the Uint8Array bytes on image elements fine;
  // it's supported in all evergreen browsers this tool targets.
  return structuredClone(snapshot)
}
