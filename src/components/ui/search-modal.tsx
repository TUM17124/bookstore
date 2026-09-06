"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Buildings,
  ChatTeardropText,
  Checks,
  EnvelopeSimple,
  FileArrowDown,
  ListPlus,
  MagnifyingGlass,
  Plus,
  RadioButton,
  ShareFat,
  SlidersHorizontal,
  Users,
  X,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { searchTrack } from "@/lib/api"

export interface SearchTag {
  label: string
  icon?: React.ReactNode
}

export interface SearchResultAction {
  icon: React.ReactNode
  label?: string
  onClick?: () => void
}

export interface SearchResult {
  name: string
  meta?: string
  avatar?: string
  href?: string
  actions?: SearchResultAction[]
  book_id?: number | string
  book_slug?: string
}

export interface QuickAction {
  label: string
  icon?: React.ReactNode
  shortcut?: string
  onClick?: () => void
}

export interface SearchFile {
  name: string
  ext?: string
  icon?: React.ReactNode
  verified?: boolean
  onShare?: () => void
  book_id?: number | string
  book_slug?: string
}

export interface SearchModalProps {
  placeholder?: string
  tags?: SearchTag[]
  results?: SearchResult[]
  quickActions?: QuickAction[]
  files?: SearchFile[]
  defaultQuery?: string
  onQueryChange?: (query: string) => void
  onSelectResult?: (result: SearchResult, index: number) => void
  className?: string
  modal?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  hotkey?: string | null
  closeOnEscape?: boolean
  overlayClassName?: string
  source?: string
}

const ICON = "h-[18px] w-[18px] text-neutral-400 dark:text-neutral-500"

const DEFAULT_TAGS: SearchTag[] = [
  { label: "Reactions", icon: <RadioButton className="h-4 w-4" /> },
  { label: "People", icon: <Users className="h-4 w-4" /> },
  { label: "Companies", icon: <Buildings className="h-4 w-4" /> },
]

const DEFAULT_RESULTS: SearchResult[] = [
  {
    name: "Jason Woordheart",
    meta: "jason@dribbble.com",
    actions: [
      { icon: <ChatTeardropText className="h-4 w-4" />, label: "Message" },
      { icon: <ListPlus className="h-4 w-4" />, label: "Add to list" },
    ],
  },
]

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { label: "Create new task", shortcut: "E" },
  { label: "Create note", shortcut: "S" },
  { label: "Add member", shortcut: "R" },
]

const DEFAULT_FILES: SearchFile[] = [{ name: "Invoice", ext: ".pdf", verified: true }]

function slugFromHref(href?: string): string | undefined {
  if (!href) return undefined
  try {
    const path = href.startsWith("http") ? new URL(href).pathname : href
    const parts = path.split("/").filter(Boolean)
    const i = parts.findIndex((p) => p === "book" || p === "books" || p === "guides")
    if (i >= 0 && parts[i + 1]) return decodeURIComponent(parts[i + 1])
    const book = parts.find((p) => p.startsWith("book="))
    if (book) return book.replace("book=", "")
    return parts[parts.length - 1]
  } catch {
    return undefined
  }
}

export function SearchModal({
  placeholder = "Search guides, topics, questions…",
  tags = DEFAULT_TAGS,
  results = DEFAULT_RESULTS,
  quickActions = DEFAULT_QUICK_ACTIONS,
  files = DEFAULT_FILES,
  defaultQuery = "",
  onQueryChange,
  onSelectResult,
  className,
  modal = false,
  open,
  defaultOpen = false,
  onOpenChange,
  hotkey = "k",
  closeOnEscape = true,
  overlayClassName,
  source = "search-modal",
}: SearchModalProps) {
  const [query, setQuery] = useState(defaultQuery)
  const [activeTags, setActiveTags] = useState<SearchTag[]>(tags)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTrackedQuery = useRef("")

  const isControlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const actualOpen = isControlled ? open : internalOpen

  const setOpen = useCallback(
    (value: boolean) => {
      if (!isControlled) setInternalOpen(value)
      onOpenChange?.(value)
    },
    [isControlled, onOpenChange],
  )

  const openRef = useRef(actualOpen)
  const setOpenRef = useRef(setOpen)
  useEffect(() => {
    openRef.current = actualOpen
    setOpenRef.current = setOpen
  })

  useEffect(() => {
    if (!modal) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        hotkey &&
        e.key &&
        e.key.toLowerCase() === hotkey.toLowerCase() &&
        (e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault()
        setOpenRef.current(!openRef.current)
      } else if (closeOnEscape && e.key === "Escape" && openRef.current) {
        setOpenRef.current(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [modal, hotkey, closeOnEscape])

  useEffect(() => {
    if (modal && actualOpen) {
      const id = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [modal, actualOpen])

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return results
    return results.filter((r) =>
      `${r.name} ${r.meta ?? ""} ${r.book_slug ?? ""}`.toLowerCase().includes(q),
    )
  }, [query, results])

  const trackSearch = useCallback(
    (value: string) => {
      const q = value.trim()
      if (q.length < 2) return
      if (q === lastTrackedQuery.current) return
      lastTrackedQuery.current = q
      void searchTrack({
        event_type: "search",
        query: q,
        source,
      })
    },
    [source],
  )

  const trackClick = useCallback(
    (opts: { book_id?: number | string; book_slug?: string; name?: string }) => {
      void searchTrack({
        event_type: "click",
        query: query.trim() || undefined,
        book_id: opts.book_id,
        book_slug: opts.book_slug,
        source,
      })
    },
    [query, source],
  )

  const handleQuery = (value: string) => {
    setQuery(value)
    onQueryChange?.(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => trackSearch(value), 400)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const removeTag = (index: number) =>
    setActiveTags((prev) => prev.filter((_, i) => i !== index))

  const panel = (
    <div
      role={modal ? "dialog" : undefined}
      aria-modal={modal ? true : undefined}
      className={cn(
        "mx-auto w-full max-w-xl overflow-hidden rounded-2xl border backdrop-blur-xl",
        "border-black/[0.07] bg-white/85 text-neutral-900 shadow-[0_10px_40px_-14px_rgba(0,0,0,0.22)]",
        "dark:border-white/[0.08] dark:bg-neutral-900/85 dark:text-white dark:shadow-[0_18px_50px_-16px_rgba(0,0,0,0.7)]",
        className,
      )}
    >
      <div className="flex items-center gap-1 border-b border-black/[0.06] px-4 py-3.5 dark:border-white/[0.06]">
        <MagnifyingGlass className={ICON} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (debounceRef.current) clearTimeout(debounceRef.current)
              trackSearch(query)
            }
          }}
          placeholder={placeholder}
          aria-label="Search"
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-current outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
        />
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            aria-label="Filters"
            className="text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </button>
          <kbd className="flex items-center gap-0.5 rounded-md border border-black/[0.06] bg-black/[0.03] px-1.5 py-0.5 font-sans text-[11px] font-medium text-neutral-400 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-neutral-500">
            <span className="text-[13px] leading-none">⌘</span>
            {modal && hotkey ? hotkey.toUpperCase() : "F"}
          </kbd>
        </div>
      </div>

      {activeTags.length > 0 ? (
        <div className="border-b border-black/[0.06] px-4 py-3.5 dark:border-white/[0.06]">
          <span className="text-[13px] text-neutral-400 dark:text-neutral-500">
            I&apos;m looking for...
          </span>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeTags.map((tag, i) => (
              <span
                key={`${tag.label}-${i}`}
                className="flex items-center gap-1.5 rounded-full bg-black/[0.04] py-1 pl-2.5 pr-2 text-[13px] ring-1 ring-inset ring-black/[0.04] dark:bg-white/[0.06] dark:ring-white/[0.06]"
              >
                {tag.icon}
                <span>{tag.label}</span>
                <button
                  type="button"
                  onClick={() => removeTag(i)}
                  aria-label={`Remove ${tag.label}`}
                  className="text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="border-b border-black/[0.06] dark:border-white/[0.06]">
          <p className="px-4 pt-3.5 pb-2 text-[13px] text-neutral-400 dark:text-neutral-500">
            Last search&nbsp;&nbsp;
            <span className="text-neutral-600 dark:text-neutral-300">
              {filteredResults.length}
            </span>
          </p>
          <ul className="px-1.5 pb-1.5">
            {filteredResults.map((result, i) => {
              const slug = result.book_slug || slugFromHref(result.href)
              return (
                <li key={`${result.name}-${i}`}>
                  <a
                    href={result.href ?? "#"}
                    onClick={(e) => {
                      if (!result.href || result.href === "#") e.preventDefault()
                      trackClick({
                        book_id: result.book_id,
                        book_slug: slug,
                        name: result.name,
                      })
                      onSelectResult?.(result, i)
                    }}
                    className="group relative flex items-center rounded-lg px-2.5 py-2 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    {result.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={result.avatar}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-black/5 dark:ring-white/10"
                      />
                    ) : (
                      <span className="h-6 w-6 shrink-0 rounded-full bg-neutral-300 ring-1 ring-black/5 dark:bg-neutral-600 dark:ring-white/10" />
                    )}
                    <span className="ml-2.5 truncate text-sm">
                      {result.name}
                      {result.meta ? (
                        <span className="pl-1.5 text-neutral-400 dark:text-neutral-500">
                          {result.meta}
                        </span>
                      ) : null}
                    </span>
                    {result.actions && result.actions.length > 0 ? (
                      <span className="ml-auto flex items-center gap-2.5 pl-3 text-neutral-400 opacity-70 transition-opacity group-hover:opacity-100 dark:text-neutral-500">
                        {result.actions.map((action, ai) => (
                          <button
                            key={ai}
                            type="button"
                            aria-label={action.label}
                            onClick={(e) => {
                              e.preventDefault()
                              action.onClick?.()
                            }}
                            className="transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
                          >
                            {action.icon}
                          </button>
                        ))}
                      </span>
                    ) : null}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {quickActions.length > 0 ? (
        <div className="border-b border-black/[0.06] px-1.5 py-1.5 dark:border-white/[0.06]">
          <p className="px-2.5 pt-2 pb-1 text-[13px] text-neutral-400 dark:text-neutral-500">
            Quick actions
          </p>
          {quickActions.map((action, i) => (
            <button
              key={`${action.label}-${i}`}
              type="button"
              onClick={action.onClick}
              className="relative flex w-full items-center rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            >
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-300">
                {action.icon ?? <Plus className="h-[15px] w-[15px]" />}
              </span>
              <span className="pl-3 text-sm">{action.label}</span>
              {action.shortcut ? (
                <kbd className="ml-auto flex h-[26px] w-[26px] items-center justify-center rounded-md bg-black/[0.04] font-sans text-[13px] text-neutral-500 ring-1 ring-inset ring-black/[0.04] dark:bg-white/[0.06] dark:text-neutral-300 dark:ring-white/[0.06]">
                  {action.shortcut}
                </kbd>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="px-1.5 py-1.5">
          <p className="px-2.5 pt-2 pb-1 text-[13px] text-neutral-400 dark:text-neutral-500">
            Files&nbsp;&nbsp;
            <span className="text-neutral-600 dark:text-neutral-300">{files.length}</span>
          </p>
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="group relative flex items-center rounded-lg px-2.5 py-2 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            >
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-black/[0.04] text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-300">
                {file.icon ?? <FileArrowDown className="h-[15px] w-[15px]" />}
              </span>
              <span className="flex items-center gap-1.5 pl-3 text-sm">
                <span>
                  {file.name}
                  {file.ext ? (
                    <span className="text-neutral-400 dark:text-neutral-500">{file.ext}</span>
                  ) : null}
                </span>
                {file.verified ? <Checks className="h-4 w-4 text-emerald-500" /> : null}
              </span>
              <button
                type="button"
                onClick={() => {
                  trackClick({
                    book_id: file.book_id,
                    book_slug: file.book_slug,
                    name: file.name,
                  })
                  file.onShare?.()
                }}
                className="ml-auto flex items-center gap-1.5 text-sm text-neutral-400 opacity-80 transition-all hover:text-neutral-700 group-hover:opacity-100 dark:text-neutral-500 dark:hover:text-neutral-200"
              >
                <ShareFat weight="bold" className="h-4 w-4" />
                <span>Share</span>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )

  if (!modal) return panel

  return (
    <div
      onClick={() => setOpen(false)}
      aria-hidden={!actualOpen}
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] transition-opacity duration-200",
        actualOpen ? "opacity-100" : "pointer-events-none opacity-0",
        overlayClassName,
      )}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/60" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative z-10 w-full max-w-xl transition-all duration-200 ease-out",
          actualOpen ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-[0.98] opacity-0",
        )}
      >
        {panel}
      </div>
    </div>
  )
}

export default SearchModal