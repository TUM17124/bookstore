'use client'

import { useState } from 'react'
import { Plus, Trash2, RotateCw, Copy, CheckSquare, Square } from 'lucide-react'
import type { EditorPage } from '@/lib/pdf-editor-types'

export function PagesSidebar({
  pages,
  activePageId,
  onSelect,
  onReorder,
  onAdd,
  onRemove,
  onDuplicate,
  onRotate,
  selectMode,
  selectedForSplit,
  onToggleSelectForSplit,
}: {
  pages: EditorPage[]
  activePageId: string | null
  onSelect: (id: string) => void
  onReorder: (fromId: string, toId: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onRotate: (id: string) => void
  selectMode: boolean
  selectedForSplit: string[]
  onToggleSelectForSplit: (id: string) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  return (
    <div className="flex gap-2 overflow-x-auto rounded-2xl border border-foreground/10 p-3 lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:max-h-[70vh]">
      {pages.map((p, i) => {
        const isChecked = selectedForSplit.includes(p.id)
        return (
          <div
            key={p.id}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragOver={(e) => {
              e.preventDefault()
              setOverId(p.id)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId && dragId !== p.id) onReorder(dragId, p.id)
              setDragId(null)
              setOverId(null)
            }}
            onDragEnd={() => {
              setDragId(null)
              setOverId(null)
            }}
            className={`flex shrink-0 flex-col items-center gap-1 rounded-lg p-1 transition-colors ${
              overId === p.id ? 'bg-sky-500/10' : ''
            } ${dragId === p.id ? 'opacity-40' : ''}`}
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => (selectMode ? onToggleSelectForSplit(p.id) : onSelect(p.id))}
                className={`relative flex h-20 w-14 items-center justify-center overflow-hidden rounded-md border-2 bg-white text-[10px] text-black/40 ${
                  p.id === activePageId ? 'border-sky-500' : 'border-foreground/15'
                }`}
                style={{ transform: `rotate(${p.rotationDeg}deg)` }}
              >
                {p.previewDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.previewDataUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </button>
              {selectMode && (
                <button
                  type="button"
                  onClick={() => onToggleSelectForSplit(p.id)}
                  className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background shadow"
                  aria-label={isChecked ? 'Deselect page' : 'Select page'}
                >
                  {isChecked ? (
                    <CheckSquare className="h-4 w-4 text-sky-500" />
                  ) : (
                    <Square className="h-4 w-4 text-foreground/40" />
                  )}
                </button>
              )}
            </div>
            <span className="text-[10px] text-foreground/45">{i + 1}</span>
            {!selectMode && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Rotate page"
                  onClick={() => onRotate(p.id)}
                  className="rounded p-0.5 hover:bg-foreground/10"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Duplicate page"
                  onClick={() => onDuplicate(p.id)}
                  className="rounded p-0.5 hover:bg-foreground/10"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete page"
                  onClick={() => onRemove(p.id)}
                  disabled={pages.length <= 1}
                  className="rounded p-0.5 hover:bg-foreground/10 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )
      })}
      {!selectMode && (
        <button
          type="button"
          onClick={onAdd}
          className="flex h-20 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-foreground/20 text-foreground/50 hover:border-foreground/40 hover:text-foreground/70"
        >
          <Plus className="h-4 w-4" />
          <span className="text-[10px]">Page</span>
        </button>
      )}
    </div>
  )
}


