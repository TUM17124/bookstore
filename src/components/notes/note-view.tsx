import type { ReactNode } from 'react'
import { COLOR_BG } from '@/lib/notes/doc'
import { NOTE_COLORS, type NoteColor, type NoteDoc, type NoteNode } from '@/lib/notes/types'

function safeLink(href: unknown): string | null {
  const v = typeof href === 'string' ? href.trim() : ''
  return /^(https?:\/\/|mailto:)\S+$/i.test(v) ? v : null
}

function textNode(n: NoteNode, key: number): ReactNode {
  let el: ReactNode = n.text || ''
  for (const m of n.marks || []) {
    if (m.type === 'bold') el = <strong>{el}</strong>
    else if (m.type === 'italic') el = <em>{el}</em>
    else if (m.type === 'underline') el = <u>{el}</u>
    else if (m.type === 'strike') el = <s>{el}</s>
    else if (m.type === 'code') el = <code className="rounded bg-foreground/10 px-1">{el}</code>
    else if (m.type === 'highlight') {
      const c = (NOTE_COLORS as readonly string[]).includes(String(m.attrs?.color)) ? (m.attrs!.color as NoteColor) : 'yellow'
      el = <mark className={`rounded px-0.5 text-inherit ${COLOR_BG[c]}`}>{el}</mark>
    } else if (m.type === 'link') {
      const href = safeLink(m.attrs?.href)
      if (href) el = <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-[var(--brand-pink-text)] underline">{el}</a>
    }
  }
  return <span key={key}>{el}</span>
}

function inline(n: NoteNode): ReactNode[] {
  return (n.content || []).map((c, i) => (c.type === 'text' ? textNode(c, i) : c.type === 'hardBreak' ? <br key={i} /> : null))
}

function block(n: NoteNode, key: number): ReactNode {
  const kids = () => (n.content || []).map(block)
  switch (n.type) {
    case 'paragraph':
      return <p key={key} className="min-h-[1em] break-words">{inline(n)}</p>
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(n.attrs?.level) || 2))
      const cls = level === 1 ? 'text-lg font-bold' : level === 2 ? 'text-base font-bold' : 'text-sm font-bold'
      return <p key={key} role="heading" aria-level={level + 1} className={`${cls} break-words`}>{inline(n)}</p>
    }
    case 'bulletList':
      return <ul key={key} className="list-disc pl-5">{kids()}</ul>
    case 'orderedList':
      return <ol key={key} className="list-decimal pl-5">{kids()}</ol>
    case 'listItem':
      return <li key={key}>{kids()}</li>
    case 'taskList':
      return <ul key={key} className="space-y-0.5">{kids()}</ul>
    case 'taskItem':
      return (
        <li key={key} className="flex items-start gap-2">
          <span aria-hidden>{n.attrs?.checked ? '☑' : '☐'}</span>
          <span className="sr-only">{n.attrs?.checked ? 'Done:' : 'To do:'}</span>
          <div className={`min-w-0 flex-1 ${n.attrs?.checked ? 'line-through opacity-60' : ''}`}>{kids()}</div>
        </li>
      )
    case 'blockquote':
      return <blockquote key={key} className="border-l-2 border-foreground/25 pl-3 italic">{kids()}</blockquote>
    case 'horizontalRule':
      return <hr key={key} className="border-foreground/15" />
    default:
      return null
  }
}

/** Read-only rendering of a note document. Built from React elements only (no
 * HTML strings), links are re-checked and open with noopener. */
export function NoteView({ doc, className = '' }: { doc: NoteDoc; className?: string }) {
  return <div className={`space-y-1 text-sm text-foreground ${className}`}>{(doc?.content || []).map(block)}</div>
}
