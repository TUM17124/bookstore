'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { COLOR_BG, COLOR_LABEL, COLOR_SWATCH, docPlainText } from '@/lib/notes/doc'
import { NOTE_COLORS, type NoteColor, type NoteDoc } from '@/lib/notes/types'

export const NOTE_MAX_CHARS = 5000

/** Highlight marks carry a colour *name*, styled with the same classes as page highlights. */
const NoteHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: 'yellow',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-color') || 'yellow',
        renderHTML: (attrs: { color?: string }) => {
          const c = (NOTE_COLORS as readonly string[]).includes(attrs.color || '') ? (attrs.color as NoteColor) : 'yellow'
          return { 'data-color': c, class: `rounded px-0.5 text-inherit ${COLOR_BG[c]}` }
        },
      },
    }
  },
}).configure({ multicolor: true })

function safeHref(raw: string): string | null {
  let v = raw.trim()
  if (!v) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}` : `https://${v}`
  return /^(https?:\/\/|mailto:)\S+$/i.test(v) && v.length <= 500 ? v : null
}

type BtnProps = { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }
function Btn({ label, shortcut, active, disabled, onClick, children }: BtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // keep the selection in the editor when a toolbar button is pressed
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-bold transition-colors disabled:opacity-35 ${
        active ? 'bg-[#f591ac] text-[var(--on-brand)]' : 'text-foreground hover:bg-foreground/10'
      }`}
    >
      {children}
    </button>
  )
}

const Sep = () => <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-foreground/15" />

export function RichNoteEditor({
  value,
  onChange,
  autoFocus,
  placeholder = 'Write a note…',
  ariaLabel = 'Note',
  minHeight = 112,
}: {
  value: NoteDoc
  onChange: (doc: NoteDoc) => void
  autoFocus?: boolean
  placeholder?: string
  ariaLabel?: string
  minHeight?: number
}) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')
  const [linkErr, setLinkErr] = useState(false)
  const [hlOpen, setHlOpen] = useState(false)
  const openLinkRef = useRef<() => void>(() => {})
  const lastEmitted = useRef<string>('')

  const editor = useEditor({
    immediatelyRender: false, // static export: render on the client only
    autofocus: autoFocus ? 'end' : false,
    content: value as never,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
      }),
      NoteHighlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      // Ctrl/Cmd+K opens the link field
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          openLinkRef.current()
          return true
        }
        return false
      },
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
        class: 'note-editor max-w-none px-3 py-2 text-[15px] leading-relaxed text-foreground outline-none [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/25 [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:text-[var(--brand-pink-text)] [&_a]:underline [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:items-start [&_li[data-type=taskItem]]:gap-2 [&_li[data-type=taskItem]>label]:mt-1 [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-foreground/40 [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON() as NoteDoc
      if (docPlainText(json).length > NOTE_MAX_CHARS) {
        ed.commands.undo() // the server refuses longer notes; never accept more than it will keep
        return
      }
      lastEmitted.current = JSON.stringify(json)
      onChange(json)
    },
  })

  // Adopt outside changes (another tab, another device) without fighting the cursor.
  useEffect(() => {
    if (!editor || editor.isFocused) return
    const next = JSON.stringify(value)
    if (next !== lastEmitted.current && next !== JSON.stringify(editor.getJSON())) {
      editor.commands.setContent(value as never, { emitUpdate: false })
    }
  }, [value, editor])

  const openLink = useCallback(() => {
    if (!editor) return
    setLink((editor.getAttributes('link').href as string) || '')
    setLinkErr(false)
    setLinkOpen(true)
  }, [editor])
  useEffect(() => { openLinkRef.current = openLink }, [openLink])

  const s = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'), italic: ed.isActive('italic'), underline: ed.isActive('underline'), strike: ed.isActive('strike'),
            h1: ed.isActive('heading', { level: 1 }), h2: ed.isActive('heading', { level: 2 }), h3: ed.isActive('heading', { level: 3 }),
            bullet: ed.isActive('bulletList'), ordered: ed.isActive('orderedList'), task: ed.isActive('taskList'),
            quote: ed.isActive('blockquote'), link: ed.isActive('link'), hl: ed.isActive('highlight'),
            canUndo: ed.can().undo(), canRedo: ed.can().redo(),
            len: docPlainText(ed.getJSON() as NoteDoc).length,
          }
        : null,
  })

  if (!editor || !s) {
    // same height as the live editor: nothing moves when it mounts
    return <div aria-hidden className="rounded-xl border border-foreground/15 bg-background" style={{ minHeight: minHeight + 44 }} />
  }
  const chain = () => editor.chain().focus()

  function applyLink() {
    const href = safeHref(link)
    if (!href) {
      if (!link.trim()) {
        chain().extendMarkRange('link').unsetLink().run()
        setLinkOpen(false)
        return
      }
      setLinkErr(true)
      return
    }
    chain().extendMarkRange('link').setLink({ href }).run()
    setLinkOpen(false)
  }

  return (
    <div className="rounded-xl border border-foreground/15 bg-background focus-within:border-[#f591ac]">
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 overflow-x-auto border-b border-foreground/10 px-1 py-1 [scrollbar-width:none]">
        <Btn label="Undo" shortcut="Ctrl+Z" disabled={!s.canUndo} onClick={() => chain().undo().run()}>↶</Btn>
        <Btn label="Redo" shortcut="Ctrl+Shift+Z" disabled={!s.canRedo} onClick={() => chain().redo().run()}>↷</Btn>
        <Sep />
        <Btn label="Bold" shortcut="Ctrl+B" active={s.bold} onClick={() => chain().toggleBold().run()}><b>B</b></Btn>
        <Btn label="Italic" shortcut="Ctrl+I" active={s.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></Btn>
        <Btn label="Underline" shortcut="Ctrl+U" active={s.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></Btn>
        <Btn label="Strikethrough" shortcut="Ctrl+Shift+S" active={s.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></Btn>
        <Sep />
        <Btn label="Heading 1" shortcut="Ctrl+Alt+1" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>H1</Btn>
        <Btn label="Heading 2" shortcut="Ctrl+Alt+2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>H2</Btn>
        <Btn label="Heading 3" shortcut="Ctrl+Alt+3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>H3</Btn>
        <Sep />
        <Btn label="Bullet list" shortcut="Ctrl+Shift+8" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>•</Btn>
        <Btn label="Numbered list" shortcut="Ctrl+Shift+7" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>1.</Btn>
        <Btn label="Checklist" shortcut="Ctrl+Shift+9" active={s.task} onClick={() => chain().toggleTaskList().run()}>☑</Btn>
        <Btn label="Quote" shortcut="Ctrl+Shift+B" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>❝</Btn>
        <Sep />
        <Btn label="Link" shortcut="Ctrl+K" active={s.link} onClick={openLink}>🔗</Btn>
        <Btn label="Highlight colour" active={s.hl || hlOpen} onClick={() => setHlOpen((v) => !v)}>
          <span className={`inline-block h-4 w-4 rounded ${COLOR_SWATCH.yellow}`} />
        </Btn>
      </div>
      {hlOpen ? (
        <div role="group" aria-label="Highlight colours" className="flex items-center gap-2 border-b border-foreground/10 px-3 py-1.5">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`${COLOR_LABEL[c]} highlight`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { chain().setHighlight({ color: c }).run(); setHlOpen(false) }}
              className={`h-7 w-7 rounded-full border-2 border-foreground/20 ${COLOR_SWATCH[c]}`}
            />
          ))}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { chain().unsetHighlight().run(); setHlOpen(false) }} className="ml-1 rounded-full bg-foreground/10 px-3 py-1 text-xs font-bold text-foreground">
            None
          </button>
        </div>
      ) : null}
      {linkOpen ? (
        <form
          className="flex items-center gap-2 border-b border-foreground/10 px-3 py-1.5"
          onSubmit={(e) => { e.preventDefault(); applyLink() }}
        >
          <input
            autoFocus
            value={link}
            onChange={(e) => { setLink(e.target.value); setLinkErr(false) }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setLinkOpen(false); editor.commands.focus() } }}
            inputMode="url"
            aria-label="Link address"
            aria-invalid={linkErr}
            placeholder="https://…"
            className="min-w-0 flex-1 rounded-full border border-foreground/15 bg-background px-3 py-1.5 text-sm text-foreground outline-none"
          />
          <button type="submit" className="rounded-full bg-[#f591ac] px-3 py-1.5 text-sm font-bold text-[var(--on-brand)]">Set</button>
          <button type="button" onClick={() => setLinkOpen(false)} className="rounded-full bg-foreground/10 px-3 py-1.5 text-sm font-bold text-foreground">Cancel</button>
          {linkErr ? <span role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">Use an http(s) or email link</span> : null}
        </form>
      ) : null}
      <EditorContent editor={editor} />
      <p className={`px-3 pb-1 text-right text-[11px] ${s.len > NOTE_MAX_CHARS * 0.9 ? 'text-red-600 dark:text-red-400' : 'text-foreground/40'}`} aria-live="off">
        {s.len}/{NOTE_MAX_CHARS}
      </p>
    </div>
  )
}
