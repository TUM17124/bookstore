import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { getToken, getReaderManifest, getReaderPageText, ContentError, type ReaderManifest } from '@/lib/api'
import { getPdfProgress, savePdfProgress, getPdfNotes, addPdfNote, updatePdfNote, deletePdfNote, type PdfNoteRow } from '@/lib/api'
import {
  notesStorageKey,
  normalizeNoteText,
  piecesBetween,
  quoteRanges,
  occurrenceIndex,
  nthOccurrence,
  rawToNormalizedOffset,
  type PdfThought,
  type TextPiece,
} from '@/lib/pdf-notes'
import {
  getProStatus,
  getTtsUsage,
  getTtsVoices,
  quoteTtsCredits,
  buyTtsCredits,
  confirmTtsCredits,
  confirmProPayment,
  synthesizePage,
  ttsAudioUrl,
  TtsError,
  type TtsVoice,
  type TtsTimepoint,
  type TtsUsageSnapshot,
  type TtsCreditQuote,
} from '@/lib/api'
import { usePictureInPicture } from '@/lib/pip'
import { ProGateModal } from '@/components/pro-gate-modal'

function markKey(url: string) {
  return `plugyard-read-mark:${url.split('?')[0]}`
}

const AHEAD = 2
const MAX_TTS_CHARS = 4000

const FALLBACK_VOICES: TtsVoice[] = [
  { id: 'en-US-Neural2-C', label: 'Clara', gender: 'female', description: '' },
  { id: 'en-US-Neural2-F', label: 'Faye', gender: 'female', description: '' },
  { id: 'en-US-Neural2-D', label: 'Dean', gender: 'male', description: '' },
  { id: 'en-US-Neural2-J', label: 'Jay', gender: 'male', description: '' },
]

function usagePercent(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, Math.round(n)))
}

function buildUsageNotices(usage: TtsUsageSnapshot | null): string[] {
  if (!usage) return []
  const notices: string[] = []
  const warnAt = usagePercent(usage.warn_percent) ?? 85
  const percentFromLimit = (percent: unknown, used: unknown, limit: unknown) => {
    const reported = usagePercent(percent)
    if (reported != null) return reported
    const count = Number(used)
    const maximum = Number(limit)
    if (!Number.isFinite(count) || !Number.isFinite(maximum) || maximum <= 0) return null
    return usagePercent((count / maximum) * 100)
  }
  const dailyPct = percentFromLimit(usage.daily_percent, usage.chars_used_today, usage.daily_limit)
  const weeklyPct = percentFromLimit(usage.weekly_percent, usage.chars_used_week, usage.weekly_limit)
  const creditPct =
    usagePercent(usage.credit_percent) ??
    (() => {
      const used = Number(usage.credit_chars_used)
      const total = Number(usage.credit_chars_total)
      if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null
      return usagePercent((used / total) * 100)
    })()
  if (usage.credits_enabled && creditPct != null && creditPct >= warnAt) {
    notices.push(`Purchased robot-reader credits: ${creditPct}% used.`)
  }
  if (dailyPct != null && dailyPct >= warnAt) {
    notices.push(dailyPct >= 100
      ? "You have used up today's included robot-reader characters."
      : `You have used ${dailyPct}% of your daily robot-reader character limit.`)
  }
  if (weeklyPct != null && weeklyPct >= warnAt) {
    notices.push(weeklyPct >= 100
      ? "You have used up this week's included robot-reader characters."
      : `You have used ${weeklyPct}% of your weekly robot-reader character limit.`)
  }
  return notices
}

function charsForCreditAmount(quote: TtsCreditQuote | null, amountValue: string): number | null {
  if (!quote) return null
  const typed = Number(amountValue)
  const quotedAmount = Number(quote.amount)
  const min = Number(quote.min_kes)
  const rate = Number(quote.chars_per_kes)
  const bonus = Number(quote.volume_bonus_percent) || 0
  if (Number.isFinite(typed) && Number.isFinite(quotedAmount) && typed === quotedAmount) {
    return Math.round(Number(quote.chars) || 0)
  }
  const amount = Number.isFinite(typed) && typed > 0 ? typed : Number.isFinite(quotedAmount) ? quotedAmount : min
  if (!Number.isFinite(amount) || amount <= 0) {
    return Number.isFinite(Number(quote.chars)) ? Math.round(Number(quote.chars)) : null
  }
  if (Number.isFinite(rate) && rate > 0) {
    let chars = amount * rate
    if (bonus > 0 && Number.isFinite(min) && amount >= min * 2) chars *= 1 + bonus / 100
    return Math.round(chars)
  }
  return Number.isFinite(Number(quote.chars)) ? Math.round(Number(quote.chars)) : null
}

function splitForTts(text: string, max = MAX_TTS_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= max) return [clean]
  const parts: string[] = []
  let rest = clean
  while (rest.length > max) {
    const slice = rest.slice(0, max)
    const cut =
      slice.lastIndexOf('. ') >= max * 0.4
        ? slice.lastIndexOf('. ') + 1
        : slice.lastIndexOf(' ') >= max * 0.4
          ? slice.lastIndexOf(' ')
          : max
    const chunk = rest.slice(0, cut).trim()
    if (chunk) parts.push(chunk)
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

function finiteOffset(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function thoughtMergeKey(row: PdfThought) {
  if (finiteOffset(row.startOffset) != null && finiteOffset(row.endOffset) != null) {
    return `${row.page}:${row.startOffset}:${row.endOffset}:${row.quote}`
  }
  return `${row.page}:${row.quote}`
}

/**
 * Keeps the exact highlight position when a local note is merged with (or
 * replaced by) the row the server sent back. The API has no offset columns, so
 * a cloud row must never wipe offsets that only exist on this device.
 */
function mergeThought(prev: PdfThought, incoming: PdfThought): PdfThought {
  return {
    ...prev,
    ...incoming,
    thought: incoming.thought || prev.thought,
    startOffset: prev.startOffset ?? incoming.startOffset,
    endOffset: prev.endOffset ?? incoming.endOffset,
  }
}

function readStoredThoughts(bookId: string | undefined, url: string): PdfThought[] {
  try {
    const raw = localStorage.getItem(notesStorageKey(bookId, url))
    if (!raw) return []
    const parsed = JSON.parse(raw) as PdfThought[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((row) => row && typeof row.id === 'string' && typeof row.quote === 'string' && Number.isFinite(row.page))
      .map((row) => ({
        ...row,
        startOffset: finiteOffset(row.startOffset),
        endOffset: finiteOffset(row.endOffset),
      }))
  } catch {
    return []
  }
}

function writeStoredThoughts(bookId: string | undefined, url: string, rows: PdfThought[]) {
  try {
    localStorage.setItem(notesStorageKey(bookId, url), JSON.stringify(rows))
  } catch {
    // ignore
  }
}

function locateSentences(text: string): Array<{ sentence: string; start: number }> {
  const clean = text.replace(/\s+/g, ' ').trim()
  const sentences = splitSentences(clean)
  let cursor = 0
  return sentences.map((sentence) => {
    const at = clean.indexOf(sentence, cursor)
    const start = at < 0 ? cursor : at
    cursor = start + sentence.length
    return { sentence, start }
  })
}

function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const parts = clean.match(/[^.!?…]+(?:[.!?…]+["”']?|$)/g)
  if (!parts) return [clean]
  return parts.map((s) => s.trim()).filter(Boolean)
}

function offsetInScrollParent(container: HTMLElement, el: HTMLElement) {
  const cRect = container.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()
  return eRect.top - cRect.top + container.scrollTop
}

function preferPhonePip() {
  if (typeof window === 'undefined') return true
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.innerWidth < 768
  const ua = navigator.userAgent || ''
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  return coarse || narrow || mobileUa
}

function highlightSelectClass(on: boolean) {
  return on ? 'select-text [-webkit-user-select:text] [-webkit-touch-callout:default]' : ''
}

function highlightSelectStyle(on: boolean): CSSProperties {
  return {
    WebkitUserSelect: on ? 'text' : 'none',
    userSelect: on ? 'text' : 'none',
    touchAction: 'auto',
    WebkitTouchCallout: 'none',
  } as CSSProperties
}

/**
 * Reads a book page by page from the server (never the file itself): the
 * server returns a short-lived manifest of signed per-page URLs covering only
 * the pages this user may read (preview pages for non-buyers), and each page
 * returns just its text. Guests pass their purchase-link token instead of a
 * login. What is readable, the watermark and copy protection are all decided
 * by the server (backend shop/views_books.py).
 */
export function PdfReader({
  bookId,
  guestToken,
  onAccessError,
}: {
  bookId: string
  guestToken?: string | null
  /** Called with the server's error (e.g. an expired guest link). */
  onAccessError?: (err: ContentError) => void
}) {
  // Stable per-book key for local progress/notes (formerly the file URL).
  const url = `book:${bookId}`
  const scrollRef = useRef<HTMLDivElement>(null)
  const pipScrollRef = useRef<HTMLDivElement>(null)
  const manifestRef = useRef<ReaderManifest | null>(null)
  const [previewPages, setPreviewPages] = useState(0)
  const [watermark, setWatermark] = useState('')
  const [copyProtected, setCopyProtected] = useState(false)
  const [accessError, setAccessError] = useState<ContentError | null>(null)
  const maxPagesRef = useRef(0)
  const loadingPage = useRef<Set<number>>(new Set())
  const lastSave = useRef(0)
  const loggedIn = !!getToken()

  const [status, setStatus] = useState('Opening…')
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState<Record<number, string>>({})
  const [fontSize, setFontSize] = useState(() => (preferPhonePip() ? 10 : 18))
  const [page, setPage] = useState(1)
  const [marked, setMarked] = useState(0)
  const [resumeAt, setResumeAt] = useState(0)
  const [obscured, setObscured] = useState(false)
  const [highlightMode, setHighlightMode] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [thoughts, setThoughts] = useState<PdfThought[]>([])
  const visibleThoughts = loggedIn ? thoughts : []
  const [draft, setDraft] = useState<{
    id?: string
    page: number
    quote: string
    thought: string
    startOffset?: number
    endOffset?: number
  } | null>(null)
  const [savingNote, setSavingNote] = useState(false)
  const [noteMsg, setNoteMsg] = useState('')
  const highlightPointerDownRef = useRef(false)

  const { pipWindow, supported: pipSupported, open: openPip, close: closePip } = usePictureInPicture('#f4efe4')

  const [inAppPip, setInAppPip] = useState(false)
  const [phonePip, setPhonePip] = useState(true)
  const [pipError, setPipError] = useState('')
  const [pipPos, setPipPos] = useState({ x: 8, y: 72 })
  const dragRef = useRef({ dx: 0, dy: 0, dragging: false })
  const fontTouchedRef = useRef(false)
  const prefetchRef = useRef<{
    page: number
    voice: string
    chunks: string[]
    first: { token: string; sentences: string[]; timepoints: TtsTimepoint[] } | null
  } | null>(null)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)

  const [isPro, setIsPro] = useState(false)
  const [proGate, setProGate] = useState<'tts' | 'pip' | null>(null)
  const [ttsVoices, setTtsVoices] = useState<TtsVoice[]>([])
  const [ttsVoice, setTtsVoice] = useState('en-US-Neural2-C')
  const [ttsSynthVoice, setTtsSynthVoice] = useState('')
  const [ttsPanelOpen, setTtsPanelOpen] = useState(false)
  const [ttsBusy, setTtsBusy] = useState(false)
  const [ttsError, setTtsError] = useState('')
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const [ttsRate, setTtsRate] = useState(1)
  const [ttsSentences, setTtsSentences] = useState<string[]>([])
  const [ttsActiveSentence, setTtsActiveSentence] = useState(-1)
  const ttsActiveWordRef = useRef<{ pageNum: number; sentenceIndex: number; wordIndex: number } | null>(null)
  const [ttsPageLoaded, setTtsPageLoaded] = useState<number | null>(null)

  const lastScrolledSentence = useRef(-1)
  const pageRef = useRef(1)
  const ttsVoiceRef = useRef(ttsVoice)
  const ttsChunksRef = useRef<string[]>([])
  const ttsChunkIndexRef = useRef(0)
  const ttsSentenceOffsetRef = useRef(0)
  const ttsRateRef = useRef(ttsRate)
  const pagesRef = useRef<Record<number, string>>({})
  const ttsBusyRef = useRef(false)
  const totalRef = useRef(0)
  const ignoreScrollPageRef = useRef(false)
  const ttsGenRef = useRef(0)
  const ttsPlayingRef = useRef(false)
  const ttsPageLoadedRef = useRef<number | null>(null)
  const ttsSentencesRef = useRef<string[]>([])
  const ttsTimepointsRef = useRef<TtsTimepoint[]>([])
  const ttsActiveSentenceRef = useRef(-1)
  const followRafRef = useRef(0)
  const pipWindowRef = useRef<Window | null>(null)
  const prefetchArmedRef = useRef(false)

  const [ttsUsage, setTtsUsage] = useState<TtsUsageSnapshot | null>(null)
  const ttsUsageRef = useRef<TtsUsageSnapshot | null>(null)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [creditQuote, setCreditQuote] = useState<TtsCreditQuote | null>(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditBusy, setCreditBusy] = useState(false)
  const [creditError, setCreditError] = useState('')
  const creditQuoteTimerRef = useRef<number | null>(null)
  const [usageNotice, setUsageNotice] = useState('')
  const usageNoticeIndexRef = useRef(0)

  const canUseTts = isPro || (ttsUsage?.credit_chars || 0) > 0
  const pipOpen = !!pipWindow || inAppPip
  const estimatedCreditChars = charsForCreditAmount(creditQuote, creditAmount)
  const readerMessage = ttsError || pipError
  const visibleUsageNotice = loggedIn && ttsPlaying ? usageNotice : ''

  const readerReturnPath = (() => {
    if (typeof window === 'undefined') {
      return bookId ? `/?book=${encodeURIComponent(bookId)}&view=read` : '/'
    }
    const params = new URLSearchParams(window.location.search)
    params.delete('tts_credits_ref')
    params.delete('pro_ref')
    params.delete('reference')
    params.delete('trxref')
    if (bookId && !params.get('book')) params.set('book', String(bookId))
    if (!params.get('view')) params.set('view', 'read')
    const qs = params.toString()
    return `${window.location.pathname}${qs ? `?${qs}` : ''}`
  })()
  const nextPath = readerReturnPath
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`
  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`

  function ingestUsage(u?: TtsUsageSnapshot | null) {
    if (!u) return
    ttsUsageRef.current = u
    setTtsUsage(u)
  }

  async function refreshUsageNow(): Promise<TtsUsageSnapshot | null> {
    if (!loggedIn) return null
    try {
      const fresh = await getTtsUsage()
      if (fresh) {
        ingestUsage(fresh)
        return fresh
      }
    } catch {
      // Keep the last known usage snapshot.
    }
    return null
  }

  async function refreshUsageAggressively() {
    if (!loggedIn) return
    const delays = [0, 300, 900, 1800, 3500]
    for (const delay of delays) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      try {
        const fresh = await getTtsUsage()
        if (fresh) ingestUsage(fresh)
      } catch {
        // Keep the last known usage snapshot.
      }
    }
  }

  async function ensureTtsAvailable(): Promise<boolean> {
    if (isPro) return true
    if (!loggedIn) {
      setProGate('tts')
      setCreditsOpen(true)
      return false
    }
    const fresh = await refreshUsageNow()
    const availableChars = fresh?.credit_chars ?? ttsUsageRef.current?.credit_chars ?? 0
    if (availableChars > 0) return true
    setProGate('tts')
    setCreditsOpen(true)
    return false
  }

  function thoughtsOnPage(pageNum: number): PdfThought[] {
    return visibleThoughts.filter((row) => row.page === pageNum)
  }

  function paintPieces(pieces: TextPiece[], keyPrefix: string) {
    return pieces.map((piece, index) =>
      piece.marked ? (
        <mark
          key={`${keyPrefix}-${index}`}
          data-pdf-hl-start={piece.rangeStart != null ? String(piece.rangeStart) : undefined}
          className="rounded-sm bg-[#f6e27a] px-0.5 text-inherit"
        >
          {piece.text}
        </mark>
      ) : (
        <span key={`${keyPrefix}-${index}`}>{piece.text}</span>
      ),
    )
  }

  function pageContentRoot(section: Element | null): HTMLElement | null {
    if (!section) return null
    const paragraphs = section.querySelectorAll('p')
    return (paragraphs[1] as HTMLElement) || (paragraphs[0] as HTMLElement) || null
  }

  function offsetsFromSelection(selection: Selection, pageNum: number): { startOffset?: number; endOffset?: number } {
    const quote = normalizeNoteText(selection.toString()).slice(0, 500)
    const pageText = normalizeNoteText(pagesRef.current[pageNum] || '')
    const fallback = () => {
      const at = pageText.indexOf(quote)
      return at >= 0 ? { startOffset: at, endOffset: at + quote.length } : {}
    }
    if (!quote || selection.rangeCount === 0) return {}
    const range = selection.getRangeAt(0)
    const anchor = selection.anchorNode
    const element = anchor instanceof Element ? anchor : anchor?.parentElement
    const section = element?.closest('section[id^="read-page-"]')
    const root = pageContentRoot(section ?? null)
    if (!root || !pageText) return fallback()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let raw = ''
    let rawStart = -1
    let rawEnd = -1
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      const nodeStart = raw.length
      if (node === range.startContainer) rawStart = nodeStart + range.startOffset
      if (node === range.endContainer) rawEnd = nodeStart + range.endOffset
      raw += node.data
    }
    if (rawStart < 0 || rawEnd < 0) return fallback()
    if (rawEnd < rawStart) {
      const swap = rawStart
      rawStart = rawEnd
      rawEnd = swap
    }
    const domText = normalizeNoteText(raw)
    const domStart = rawToNormalizedOffset(raw, rawStart)
    const n = occurrenceIndex(domText, quote, domStart)
    const at = nthOccurrence(pageText, quote, n)
    if (at >= 0) return { startOffset: at, endOffset: at + quote.length }
    return fallback()
  }

   function captureCurrentSelection() {
    if (!loggedIn || !highlightMode) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
    const quote = normalizeNoteText(selection.toString()).replace(/\s+/g, ' ').trim().slice(0, 500)
    if (quote.length < 2) return
    const anchor = selection.anchorNode
    const element = anchor instanceof Element ? anchor : anchor?.parentElement
    if (element?.closest('input, textarea, button, a')) return
    const section = element?.closest('section[id^="read-page-"]')
    const pageNum = section
      ? Number(section.id.replace('read-page-', '')) || pageRef.current
      : pageRef.current
    const offsets = offsetsFromSelection(selection, pageNum)
    setDraft((prev) => {
      if (
        prev &&
        prev.page === pageNum &&
        prev.quote === quote &&
        prev.startOffset === offsets.startOffset &&
        prev.endOffset === offsets.endOffset
      ) {
        return prev
      }
      return {
        id: prev?.page === pageNum ? prev.id : undefined,
        page: pageNum,
        quote,
        thought: prev?.page === pageNum ? prev.thought : '',
        startOffset: offsets.startOffset,
        endOffset: offsets.endOffset,
      }
    })
    setEditingNote(true)
    setNoteMsg('')
  }

  function renderThoughtsList(hint: string) {
    return (
      <>
        {!loggedIn ? (
          <p className="mt-3 text-[13px] text-black/55">
            <Link href={loginHref} className="font-semibold text-[#c45b78] underline">Log in</Link>
            {' · '}
            <Link href={signupHref} className="font-semibold text-[#c45b78] underline">Sign up</Link>
          </p>
        ) : null}
        {loggedIn && !visibleThoughts.length ? (
          <p className="mt-2 text-[13px] text-black/45">No highlights yet. {hint}</p>
        ) : null}
        {loggedIn ? (
          <ul aria-label="Saved PDF highlights" className="mt-2 space-y-3 pr-1">
            {visibleThoughts.map((row) => (
              <li key={row.id} className="flex items-start gap-2 rounded-lg bg-white/60 p-2 text-sm">
                <button type="button" onClick={() => void gotoPage(row.page)} className="shrink-0 font-bold text-[#c45b78]">
                  p.{row.page}
                </button>
                <span className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => void gotoThoughtQuote(row)}
                    className="block break-words text-left font-semibold text-black"
                  >
                    {row.quote}
                  </button>
                  {row.thought ? (
                    <span className="mt-1 block whitespace-pre-wrap break-words text-black/60">{row.thought}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <button type="button" onClick={() => startEditThought(row)} className="font-semibold text-[#c45b78]" aria-label="Edit note">Edit</button>
                  <button type="button" onClick={() => removeThought(row)} className="text-black/40" aria-label="Delete note">×</button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    )
  }

  function renderReaderNotices() {
    if (!readerMessage && !visibleUsageNotice) return null
    return (
      <div className="shrink-0 space-y-1 border-b border-amber-200 bg-amber-50 px-3 py-2" role="status" aria-live="polite">
        {readerMessage ? <p className="text-[11px] font-semibold leading-snug text-red-700">{readerMessage}</p> : null}
        {visibleUsageNotice ? <p className="text-[11px] font-semibold leading-snug text-amber-900">{visibleUsageNotice}</p> : null}
      </div>
    )
  }

  useEffect(() => {
    if (!loggedIn || !ttsPlaying) return
    let cancelled = false
    let showTimer: number | null = null
    let hideTimer: number | null = null
    const scheduleNext = (delay: number) => {
      showTimer = window.setTimeout(() => {
        if (cancelled || !ttsPlayingRef.current) return
        const notices = buildUsageNotices(ttsUsageRef.current)
        if (notices.length === 0) {
          scheduleNext(10000)
          return
        }
        const index = usageNoticeIndexRef.current % notices.length
        usageNoticeIndexRef.current = (index + 1) % notices.length
        setUsageNotice(notices[index])
        hideTimer = window.setTimeout(() => {
          if (cancelled) return
          setUsageNotice('')
          scheduleNext(24000)
        }, 6000)
      }, delay)
    }
    scheduleNext(6000)
    return () => {
      cancelled = true
      if (showTimer !== null) window.clearTimeout(showTimer)
      if (hideTimer !== null) window.clearTimeout(hideTimer)
    }
  }, [loggedIn, ttsPlaying])

  useEffect(() => { pageRef.current = page }, [page])
  useEffect(() => { ttsVoiceRef.current = ttsVoice }, [ttsVoice])
  useEffect(() => { ttsRateRef.current = ttsRate }, [ttsRate])
  useEffect(() => { pagesRef.current = pages }, [pages])
  useEffect(() => { totalRef.current = total }, [total])
  useEffect(() => { ttsPlayingRef.current = ttsPlaying }, [ttsPlaying])
  useEffect(() => { ttsPageLoadedRef.current = ttsPageLoaded }, [ttsPageLoaded])
  useEffect(() => { ttsSentencesRef.current = ttsSentences }, [ttsSentences])
  useEffect(() => { ttsActiveSentenceRef.current = ttsActiveSentence }, [ttsActiveSentence])
  useEffect(() => { pipWindowRef.current = pipWindow }, [pipWindow])

  useEffect(() => {
    const apply = () => {
      const phone = preferPhonePip()
      setPhonePip(phone)
      if (phone && !fontTouchedRef.current) setFontSize(10)
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    getProStatus().then((s: { is_pro: boolean }) => { if (!cancelled) setIsPro(s.is_pro) }).catch(() => {})
    getTtsVoices().then((v: TtsVoice[]) => { if (!cancelled && v.length) setTtsVoices(v) }).catch(() => {})
    getTtsUsage().then((u) => { if (!cancelled && u) ingestUsage(u) }).catch(() => {})
    quoteTtsCredits().then((q) => {
      if (cancelled || !q) return
      setCreditQuote(q)
      setCreditAmount(String(q.min_kes ?? q.amount ?? ''))
    }).catch(() => {})
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const creditsRef = (params?.get('tts_credits_ref') || '').trim()
    const proRef = (params?.get('pro_ref') || '').trim()
    if (creditsRef) {
      confirmTtsCredits(creditsRef)
        .then(async (res) => {
          if (cancelled) return
          if (res.usage) ingestUsage(res.usage)
          const fresh = await getTtsUsage()
          if (!cancelled) ingestUsage(fresh)
          if (!cancelled) void refreshUsageAggressively()
        })
        .catch(() => {})
        .finally(() => {
          if (typeof window !== 'undefined') {
            const clean = new URL(window.location.href)
            clean.searchParams.delete('tts_credits_ref')
            clean.searchParams.delete('reference')
            clean.searchParams.delete('trxref')
            window.history.replaceState({}, '', clean.pathname + clean.search + clean.hash)
          }
        })
    }
    if (proRef) {
      confirmProPayment(proRef)
        .then((res) => {
          if (!cancelled && res.ok) {
            getProStatus().then((s: { is_pro: boolean }) => { if (!cancelled) setIsPro(s.is_pro) }).catch(() => {})
          }
        })
        .catch(() => {})
    }
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!loggedIn) return
    const tick = () => { void getTtsUsage().then((u) => ingestUsage(u)) }
    const id = window.setInterval(tick, 5000)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [loggedIn])

  useEffect(() => {
    const onVisibility = () => setObscured(document.visibilityState !== 'visible')
    const onBlur = () => setObscured(true)
    const onFocus = () => setObscured(document.visibilityState !== 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    return () => {
      const a = ttsAudioRef.current
      if (a) {
        a.pause()
        a.src = ''
      }
      if (followRafRef.current) cancelAnimationFrame(followRafRef.current)
      if (creditQuoteTimerRef.current) window.clearTimeout(creditQuoteTimerRef.current)
    }
  }, [])

  useEffect(() => {
    // Stop TTS immediately when the tab hides or the page unloads.
    // The robot reader is not a background-playback feature — unlike
    // the audio player, it should halt the moment the user leaves.
    const stopTts = () => {
      const a = ttsAudioRef.current
      if (a && !a.paused) {
        a.pause()
        a.currentTime = 0
      }
      if (ttsPlayingRef.current) {
        ttsPlayingRef.current = false
        setTtsPlaying(false)
      }
      const raf = followRafRef.current
      if (raf) cancelAnimationFrame(raf)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopTts()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', stopTts)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', stopTts)
    }
  }, [])

  useEffect(() => {
    if (!pipWindow) return
    const doc = pipWindow.document
    doc.documentElement.style.height = '100%'
    doc.body.style.height = '100%'
    doc.body.style.margin = '0'
    doc.body.style.overflow = 'hidden'
    doc.body.style.display = 'flex'
    doc.body.style.flexDirection = 'column'
  }, [pipWindow])

  function saveLocal(n: number) {
    try { localStorage.setItem(markKey(url), String(n)) } catch {
      // ignore
    }
  }

  async function saveCloud(n: number) {
    if (!loggedIn || !bookId || n < 1) return
    try { await savePdfProgress(bookId, n) } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!loggedIn) return
    const local = readStoredThoughts(bookId, url)
    setThoughts(local)
    if (!bookId) return
    let cancelled = false
    getPdfNotes(bookId)
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return
        const cloud: PdfThought[] = rows
          .map((row) => ({
            id: String(row.id),
            page: Number(row.page) || 1,
            quote: normalizeNoteText(row.quote || ''),
            thought: normalizeNoteText(row.thought || row.note || ''),
            startOffset: finiteOffset((row as PdfThought).startOffset),
            endOffset: finiteOffset((row as PdfThought).endOffset),
          }))
          .filter((row) => row.quote.length >= 2)
        const merged = new Map<string, PdfThought>()
        for (const row of local) merged.set(thoughtMergeKey(row), row)
        for (const row of cloud) {
          const exact = thoughtMergeKey(row)
          const prevExact = merged.get(exact)
          if (prevExact) {
            merged.set(exact, mergeThought(prevExact, row))
            continue
          }
          const sameQuote = [...merged.values()].find((item) => item.page === row.page && item.quote === row.quote)
          if (sameQuote) {
            merged.set(thoughtMergeKey(sameQuote), mergeThought(sameQuote, row))
          } else {
            merged.set(exact, row)
          }
        }
        const next = [...merged.values()]
        setThoughts(next)
        writeStoredThoughts(bookId, url, next)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [bookId, url, loggedIn])

    useEffect(() => {
    if (!loggedIn || !highlightMode) return

    let mouseDown = false
    let touches = 0
    let idleTimer: number | null = null

    const clearIdle = () => {
      if (idleTimer == null) return
      window.clearTimeout(idleTimer)
      idleTimer = null
    }

    const selecting = () => mouseDown || touches > 0

    const openWhenIdle = (ms: number) => {
      clearIdle()
      idleTimer = window.setTimeout(() => {
        idleTimer = null
        if (selecting()) return
        captureCurrentSelection()
      }, ms)
    }

    const blockNativeMenu = (event: Event) => {
      event.preventDefault()
    }

    const onTouchStart = (event: TouchEvent) => {
      touches = event.touches.length
      highlightPointerDownRef.current = true
      clearIdle()
    }

    const onTouchEnd = (event: TouchEvent) => {
      touches = event.touches.length
      if (touches > 0) return
      highlightPointerDownRef.current = false
      openWhenIdle(80)
    }

    const onTouchCancel = (event: TouchEvent) => {
      touches = event.touches.length
      highlightPointerDownRef.current = false
    }

    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (event.button !== 0) return
      mouseDown = true
      highlightPointerDownRef.current = true
      clearIdle()
    }

    const onMouseUp = () => {
      mouseDown = false
      highlightPointerDownRef.current = false
      openWhenIdle(0)
    }

    const onSelectionChange = () => {
      if (selecting()) return
      if (!preferPhonePip()) return
      openWhenIdle(160)
    }

    document.addEventListener('contextmenu', blockNativeMenu, true)
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    document.addEventListener('touchend', onTouchEnd, { capture: true })
    document.addEventListener('touchcancel', onTouchCancel, { capture: true })
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mouseup', onMouseUp, true)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      clearIdle()
      document.removeEventListener('contextmenu', blockNativeMenu, true)
      document.removeEventListener('touchstart', onTouchStart, true)
      document.removeEventListener('touchend', onTouchEnd, true)
      document.removeEventListener('touchcancel', onTouchCancel, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [loggedIn, highlightMode])

  function toggleHighlightMode() {
    const next = !highlightMode
    setHighlightMode(next)
    if (!next) {
      setDraft(null)
      setEditingNote(false)
      window.getSelection()?.removeAllRanges()
    }
    setNoteMsg('')
  }

  async function saveThought() {
    if (!loggedIn) {
      setNoteMsg('Log in to create and save PDF notes.')
      return
    }
    if (!draft || savingNote) return
    const quote = normalizeNoteText(draft.quote).slice(0, 500)
    if (quote.length < 2) {
      setNoteMsg('Highlight a passage first.')
      return
    }
    const thought = draft.thought.trim().slice(0, 280)
    setSavingNote(true)
    const existing = thoughts.find(
      (row) =>
        row.id === draft.id ||
        (row.page === draft.page &&
          row.quote === quote &&
          (draft.startOffset == null || row.startOffset == null || (row.startOffset === draft.startOffset && row.endOffset === draft.endOffset))),
    )
    const row: PdfThought = {
      id: existing?.id || `local-${Date.now()}`,
      page: draft.page,
      quote,
      thought,
      startOffset: draft.startOffset ?? existing?.startOffset,
      endOffset: draft.endOffset ?? existing?.endOffset,
    }
    const next = existing ? thoughts.map((item) => (item.id === existing.id ? row : item)) : [...thoughts, row]
    setThoughts(next)
    writeStoredThoughts(bookId, url, next)
    setDraft(null)
    setEditingNote(false)
    window.getSelection()?.removeAllRanges()
    if (!bookId) {
      setNoteMsg('Could not save this note because the book is unavailable.')
      setSavingNote(false)
      return
    }
    try {
      let saved: PdfNoteRow | null = null
      if (existing && /^\d+$/.test(existing.id)) {
        try {
          saved = await updatePdfNote(existing.id, row.page, row.quote, row.thought)
        } catch {
          await deletePdfNote(existing.id).catch(() => {})
          saved = await addPdfNote(bookId, row.page, row.quote, row.thought)
        }
      } else {
        saved = await addPdfNote(bookId, row.page, row.quote, row.thought)
      }
      const id = String(saved?.id || row.id)
      const swapped = next.map((item) => (item.id === row.id ? { ...item, id } : item))
      setThoughts(swapped)
      writeStoredThoughts(bookId, url, swapped)
      setNoteMsg('')
    } catch {
      setNoteMsg('Saved on this device.')
    }
    setSavingNote(false)
  }

  function startEditThought(row: PdfThought) {
    if (!loggedIn) return
    setNotesOpen(false)
    setHighlightMode(true)
    setEditingNote(true)
    setDraft({
      id: row.id,
      page: row.page,
      quote: row.quote,
      thought: row.thought || '',
      startOffset: row.startOffset,
      endOffset: row.endOffset,
    })
    setNoteMsg('')
  }

  function cancelEditThought() {
    setDraft(null)
    setEditingNote(false)
    window.getSelection()?.removeAllRanges()
  }

  function removeThought(row: PdfThought) {
    if (!loggedIn) return
    const next = thoughts.filter((item) => item.id !== row.id)
    setThoughts(next)
    writeStoredThoughts(bookId, url, next)
    if (draft?.id === row.id) setDraft(null)
    if (/^\d+$/.test(row.id)) void deletePdfNote(row.id).catch(() => {})
  }

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(markKey(url)) || 0)
      setMarked(saved)
      if (saved > 1) setResumeAt(saved)
    } catch {
      setMarked(0)
    }
  }, [url])

  function commitPageText(n: number, text: string) {
    setPages((prev: Record<number, string>) => {
      const next = { ...prev, [n]: text }
      pagesRef.current = next
      return next
    })
  }

  async function refreshManifest() {
    const m = await getReaderManifest(bookId, guestToken)
    manifestRef.current = m
    return m
  }

  async function extractPage(n: number) {
    const max = maxPagesRef.current
    if (!manifestRef.current || !max || n < 1 || n > max) return
    if (pagesRef.current[n] || loadingPage.current.has(n)) return
    loadingPage.current.add(n)
    try {
      const entry = () => manifestRef.current?.pages.find((p) => p.page === n)
      let text: string
      try {
        text = await getReaderPageText(entry()!.url, guestToken)
      } catch (err) {
        // Page URLs are short-lived: re-issue the manifest once and retry.
        if (err instanceof ContentError && err.code === 'expired') {
          await refreshManifest()
          text = await getReaderPageText(entry()!.url, guestToken)
        } else {
          throw err
        }
      }
      commitPageText(n, text || `Page ${n}`)
    } catch (err) {
      if (err instanceof ContentError && (err.status === 401 || err.status === 403) && err.code !== 'page_not_allowed') {
        setAccessError(err)
        onAccessError?.(err)
      }
      commitPageText(n, err instanceof ContentError && err.status === 429
        ? `Page ${n} is loading too fast — wait a moment and scroll again.`
        : `Page ${n} could not be read.`)
    } finally {
      loadingPage.current.delete(n)
    }
  }

  async function bufferAround(center: number, count = AHEAD) {
    const max = maxPagesRef.current
    if (!manifestRef.current || !max) return
    const start = Math.max(1, center)
    const end = Math.min(max, center + count)
    for (let i = start; i <= end; i++) await extractPage(i)
  }

  async function waitForPageText(n: number) {
    if (pagesRef.current[n]) return pagesRef.current[n]
    await extractPage(n)
    for (let i = 0; i < 25 && !pagesRef.current[n]; i++) {
      await new Promise((r) => setTimeout(r, 80))
      if (!pagesRef.current[n]) await extractPage(n)
    }
    return pagesRef.current[n] || ''
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setStatus('Opening…')
        setPages({})
        setAccessError(null)
        pagesRef.current = {}
        maxPagesRef.current = 0
        const m = await refreshManifest()
        if (cancelled) return
        // Only the pages the server allows are ever listed or fetchable.
        const totalPages = m.allowed_pages
        maxPagesRef.current = totalPages
        totalRef.current = totalPages
        setTotal(totalPages)
        setPreviewPages(m.preview ? m.allowed_pages : 0)
        setWatermark(m.watermark || '')
        setCopyProtected(!!m.copy_protected)
        let saved = Number(localStorage.getItem(markKey(url)) || 0)
        if (loggedIn && bookId && !guestToken) {
          try {
            const cloud = await getPdfProgress(bookId)
            if (cloud.page > saved) saved = cloud.page
          } catch {
            // stay local
          }
        }
        const startAt = saved > 1 && saved <= totalPages ? saved : 1
        pageRef.current = startAt
        setPage(startAt)
        setMarked(saved > totalPages ? totalPages : saved)
        if (startAt > 1) setResumeAt(startAt)
        await bufferAround(startAt, AHEAD)
        if (cancelled) return
        setStatus('')
        requestAnimationFrame(() => {
          document.getElementById(`read-page-${startAt}`)?.scrollIntoView({ block: 'start' })
        })
      } catch (err) {
        if (cancelled) return
        if (err instanceof ContentError) {
          setAccessError(err)
          onAccessError?.(err)
          setStatus(err.message)
        } else {
          setStatus('Could not open this book.')
        }
      }
    })()
    return () => {
      cancelled = true
      manifestRef.current = null
      maxPagesRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, guestToken])

  function onScroll() {
    const root = scrollRef.current
    const max = maxPagesRef.current
    if (!root || !max) return
    const mid = root.scrollTop + 80
    let current = pageRef.current
    for (let i = 1; i <= max; i++) {
      const el = document.getElementById(`read-page-${i}`)
      if (el && el.offsetTop <= mid) current = i
    }
    if (ignoreScrollPageRef.current) {
      void bufferAround(pageRef.current, AHEAD)
      return
    }
    if (current !== pageRef.current) {
      pageRef.current = current
      setPage(current)
    }
    void bufferAround(current, AHEAD)
    saveLocal(current)
    setMarked(current)
    const now = Date.now()
    if (now - lastSave.current > 2500) {
      lastSave.current = now
      void saveCloud(current)
    }
  }

  function markHere() {
    saveLocal(page)
    setMarked(page)
    void saveCloud(page)
  }

  async function goToMark() {
    if (!marked) return
    await gotoPage(marked)
  }

  function lockPageFromScroll(ms = 800) {
    ignoreScrollPageRef.current = true
    window.setTimeout(() => { ignoreScrollPageRef.current = false }, ms)
  }

  function openInAppPip() {
    setPipError('')
    if (pipWindow) {
      try { closePip() } catch {
        // ignore
      }
    }
    const vw = window.visualViewport?.width || window.innerWidth
    const vh = window.visualViewport?.height || window.innerHeight
    const w = Math.min(360, Math.max(220, vw - 16))
    const h = Math.min(460, Math.round(vh * 0.58))
    setPipPos({ x: Math.max(8, vw - w - 8), y: Math.max(48, vh - h - 12) })
    setInAppPip(true)
  }

  async function togglePopOut() {
    setPipError('')
    if (phonePip) {
      if (pipWindow) {
        try { closePip() } catch {
          // ignore
        }
      }
      setInAppPip(false)
      setPipError('Pop out only works on a computer. On a phone, keep reading on this page.')
      return
    }
    if (!isPro) {
      setProGate('pip')
      setPipError('Pop out is a Pro feature. Upgrade to use it on a computer.')
      return
    }
    if (inAppPip) {
      setInAppPip(false)
      return
    }
    if (!pipSupported) {
      openInAppPip()
      return
    }
    setInAppPip(false)
    if (pipWindow) {
      closePip()
      return
    }
    try {
      await Promise.resolve(openPip({ width: 380, height: 420 }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pop out is not available in this browser.'
      setPipError(`${msg} Use Chrome or Edge on a computer.`)
    }
  }

  function onPipDragStart(e: PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (target.closest('button, select, a')) return
    dragRef.current = { dragging: true, dx: e.clientX - pipPos.x, dy: e.clientY - pipPos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPipDragMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return
    const w = Math.min(360, window.innerWidth - 16)
    const x = Math.min(window.innerWidth - w - 8, Math.max(8, e.clientX - dragRef.current.dx))
    const y = Math.min(window.innerHeight - 80, Math.max(8, e.clientY - dragRef.current.dy))
    setPipPos({ x, y })
  }

  function onPipDragEnd() {
    dragRef.current.dragging = false
  }

  function findSentenceEl(prefix: 'tts-sentence' | 'pip-tts-sentence', pageNum: number, idx: number) {
    const id = `${prefix}-${pageNum}-${idx}`
    if (prefix === 'tts-sentence') return document.getElementById(id)
    const pipDoc = pipWindowRef.current?.document
    return pipDoc?.getElementById(id) || pipScrollRef.current?.querySelector(`#${id}`) || null
  }

  function applyActiveWordHighlight(pageNum: number, sentenceIndex: number, wordIndex: number, force = false) {
    const previous = ttsActiveWordRef.current
    if (!force && previous?.pageNum === pageNum && previous.sentenceIndex === sentenceIndex && previous.wordIndex === wordIndex) return
    if (previous) {
      for (const prefix of ['tts-sentence', 'pip-tts-sentence'] as const) {
        const sentence = findSentenceEl(prefix, previous.pageNum, previous.sentenceIndex)
        const word = sentence?.querySelector<HTMLElement>(`[data-tts-word="${previous.wordIndex}"]`)
        if (word) {
          word.style.backgroundColor = ''
          word.style.color = ''
          word.style.boxShadow = ''
        }
      }
    }
    ttsActiveWordRef.current = { pageNum, sentenceIndex, wordIndex }
    for (const prefix of ['tts-sentence', 'pip-tts-sentence'] as const) {
      const sentence = findSentenceEl(prefix, pageNum, sentenceIndex)
      const word = sentence?.querySelector<HTMLElement>(`[data-tts-word="${wordIndex}"]`)
      if (word) {
        word.style.backgroundColor = '#e34b78'
        word.style.color = '#ffffff'
        word.style.boxShadow = '0 1px 3px rgb(0 0 0 / 20%)'
      }
    }
  }

  function clearActiveWordHighlight() {
    const previous = ttsActiveWordRef.current
    if (!previous) return
    for (const prefix of ['tts-sentence', 'pip-tts-sentence'] as const) {
      const sentence = findSentenceEl(prefix, previous.pageNum, previous.sentenceIndex)
      const word = sentence?.querySelector<HTMLElement>(`[data-tts-word="${previous.wordIndex}"]`)
      if (word) {
        word.style.backgroundColor = ''
        word.style.color = ''
        word.style.boxShadow = ''
      }
    }
    ttsActiveWordRef.current = null
  }

  function scrollPipSentenceIntoView(pageNum: number, idx: number) {
    const pipRoot = pipScrollRef.current
    const el = findSentenceEl('pip-tts-sentence', pageNum, idx) as HTMLElement | null
    if (!el) return false
    if (pipRoot) {
      const top = offsetInScrollParent(pipRoot, el) - Math.max(20, pipRoot.clientHeight * 0.28)
      pipRoot.scrollTop = Math.max(0, top)
      return true
    }
    el.scrollIntoView({ block: 'center', behavior: 'auto' })
    return true
  }

  function scrollToActiveSentence(pageNum: number, idx: number, force = false) {
    if (idx < 0) return
    const main = findSentenceEl('tts-sentence', pageNum, idx) as HTMLElement | null
    const mainRoot = scrollRef.current
    if (main && mainRoot && (force || lastScrolledSentence.current !== idx)) {
      const top = offsetInScrollParent(mainRoot, main) - Math.max(40, mainRoot.clientHeight * 0.3)
      mainRoot.scrollTo({ top: Math.max(0, top), behavior: force ? 'auto' : 'smooth' })
    }
    scrollPipSentenceIntoView(pageNum, idx)
    lastScrolledSentence.current = idx
  }

  useLayoutEffect(() => {
    if (ttsActiveSentence < 0) return
    const pageNum = ttsPageLoadedRef.current ?? pageRef.current
    scrollToActiveSentence(pageNum, ttsActiveSentence, true)
    const activeWord = ttsActiveWordRef.current
    if (activeWord) {
      applyActiveWordHighlight(activeWord.pageNum, activeWord.sentenceIndex, activeWord.wordIndex, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsSentences, ttsActiveSentence, ttsPageLoaded])

  function sentenceIndexFromAudio() {
    const a = ttsAudioRef.current
    const sentences = ttsSentencesRef.current
    if (!a || !sentences.length) return -1
    const t = a.currentTime || 0
    const duration = a.duration
    const points = ttsTimepointsRef.current
    let idx = -1
    if (points.length) {
      let low = 0
      let high = points.length - 1
      let local = -1
      while (low <= high) {
        const middle = (low + high) >>> 1
        if (points[middle].time_seconds <= t) {
          local = middle
          low = middle + 1
        } else {
          high = middle - 1
        }
      }
      idx = local < 0 ? ttsSentenceOffsetRef.current : ttsSentenceOffsetRef.current + local
    } else if (Number.isFinite(duration) && duration > 0) {
      const offset = ttsSentenceOffsetRef.current
      const weights = sentences.slice(offset).map((s: string) => Math.max(s.length, 1))
      const totalWeight = weights.reduce((sum: number, n: number) => sum + n, 0) || 1
      let walked = (Math.max(t, 0) / duration) * totalWeight
      idx = sentences.length - 1
      for (let i = 0; i < weights.length; i++) {
        walked -= weights[i]
        if (walked <= 0) {
          idx = offset + i
          break
        }
      }
    } else {
      idx = Math.max(0, ttsSentenceOffsetRef.current)
    }
    return Math.min(Math.max(idx, 0), sentences.length - 1)
  }

  function wordIndexFromAudio(sentenceIndex: number) {
    const a = ttsAudioRef.current
    const sentences = ttsSentencesRef.current
    const sentence = sentences[sentenceIndex]
    if (!a || !sentence) return -1
    const words = Array.from(sentence.matchAll(/\S+/g))
    if (words.length < 2) return 0
    const points = ttsTimepointsRef.current
    const offset = ttsSentenceOffsetRef.current
    const localSentenceIndex = sentenceIndex - offset
    let progress = 0
    if (localSentenceIndex >= 0 && localSentenceIndex < points.length) {
      const start = points[localSentenceIndex].time_seconds
      const end = points[localSentenceIndex + 1]?.time_seconds ?? a.duration
      progress = Number.isFinite(end) && end > start ? (a.currentTime - start) / (end - start) : 0
    } else if (Number.isFinite(a.duration) && a.duration > 0) {
      const chunkSentences = sentences.slice(offset)
      const chunkWeight = chunkSentences.reduce((sum, item) => sum + Math.max(item.length, 1), 0)
      const beforeSentenceWeight = chunkSentences.slice(0, Math.max(0, localSentenceIndex)).reduce((sum, item) => sum + Math.max(item.length, 1), 0)
      const sentenceWeight = Math.max(sentence.length, 1)
      const elapsedWeight = (Math.max(a.currentTime, 0) / a.duration) * chunkWeight
      progress = (elapsedWeight - beforeSentenceWeight) / sentenceWeight
    }
    const totalWordLength = words.reduce((sum, word) => sum + word[0].length, 0)
    let wordProgress = Math.min(1, Math.max(0, progress)) * totalWordLength
    for (let i = 0; i < words.length; i += 1) {
      wordProgress -= words[i][0].length
      if (wordProgress < 0) return i
    }
    return words.length - 1
  }

  function syncHighlight(forceScroll = false) {
    const idx = sentenceIndexFromAudio()
    if (idx < 0) return
    const pageNum = ttsPageLoadedRef.current ?? pageRef.current
    const wordIndex = wordIndexFromAudio(idx)
    if (wordIndex >= 0) applyActiveWordHighlight(pageNum, idx, wordIndex)
    if (idx !== ttsActiveSentenceRef.current) {
      ttsActiveSentenceRef.current = idx
      setTtsActiveSentence(idx)
      scrollToActiveSentence(pageNum, idx, forceScroll)
      return
    }
    if (forceScroll || lastScrolledSentence.current !== idx) {
      scrollToActiveSentence(pageNum, idx, forceScroll)
    } else {
      const pipRoot = pipScrollRef.current
      const el = findSentenceEl('pip-tts-sentence', pageNum, idx) as HTMLElement | null
      if (pipRoot && el) {
        const top = offsetInScrollParent(pipRoot, el)
        const viewTop = pipRoot.scrollTop
        const viewBottom = viewTop + pipRoot.clientHeight
        if (top < viewTop + 12 || top + el.offsetHeight > viewBottom - 12) {
          scrollPipSentenceIntoView(pageNum, idx)
        }
      }
    }
  }

  function startFollowLoop() {
    if (followRafRef.current) cancelAnimationFrame(followRafRef.current)
    const tick = () => {
      if (ttsPlayingRef.current) syncHighlight(false)
      followRafRef.current = requestAnimationFrame(tick)
    }
    followRafRef.current = requestAnimationFrame(tick)
  }

  function stopFollowLoop() {
    if (followRafRef.current) {
      cancelAnimationFrame(followRafRef.current)
      followRafRef.current = 0
    }
  }

  async function gotoPage(n: number) {
    const last = totalRef.current || maxPagesRef.current || n
    const target = Math.max(1, Math.min(last, n))
    lockPageFromScroll(1200)
    pageRef.current = target
    setPage(target)
    saveLocal(target)
    setMarked(target)
    await bufferAround(target, AHEAD)
    requestAnimationFrame(() => {
      document.getElementById(`read-page-${target}`)?.scrollIntoView({ block: 'start' })
      if (pipScrollRef.current) pipScrollRef.current.scrollTop = 0
    })
    return target
  }

  async function gotoThoughtQuote(row: PdfThought) {
    setNotesOpen(false)
    const target = await gotoPage(row.page)
    await waitForPageText(target)
    const pageText = normalizeNoteText(pagesRef.current[target] || '')
    const quote = normalizeNoteText(row.quote)
    let start = finiteOffset(row.startOffset)
    if (start == null) {
      const at = pageText.indexOf(quote)
      start = at >= 0 ? at : undefined
    }
    for (let i = 0; i < 40; i += 1) {
      const section = document.getElementById(`read-page-${target}`)
      const markedEl =
        (start != null ? section?.querySelector(`mark[data-pdf-hl-start="${start}"]`) : null) ||
        section?.querySelector('mark')
      if (markedEl instanceof HTMLElement) {
        const root = scrollRef.current
        if (root) {
          const top = offsetInScrollParent(root, markedEl) - Math.max(40, root.clientHeight * 0.3)
          root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
        } else {
          markedEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  function resetTtsVisuals() {
    setTtsSentences([])
    ttsSentencesRef.current = []
    ttsTimepointsRef.current = []
    setTtsActiveSentence(-1)
    ttsActiveSentenceRef.current = -1
    ttsActiveWordRef.current = null
    setTtsPageLoaded(null)
    ttsPageLoadedRef.current = null
    lastScrolledSentence.current = -1
    ttsChunksRef.current = []
    ttsChunkIndexRef.current = 0
    ttsSentenceOffsetRef.current = 0
  }

  function stopAudio() {
    const a = ttsAudioRef.current
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
    }
    ttsPlayingRef.current = false
    setTtsPlaying(false)
    stopFollowLoop()
  }

  async function gotoPageAndRead(n: number) {
    const allowed = await ensureTtsAvailable()
    if (!allowed) return
    ttsGenRef.current += 1
    stopAudio()
    ttsBusyRef.current = false
    setTtsBusy(false)
    setTtsError('')
    resetTtsVisuals()
    const target = await gotoPage(n)
    await playRobotReader(target, { force: true })
  }

  function withPageCue(pageNum: number, body: string) {
    const cue = `Page ${pageNum}. `
    const clean = (body || '').trim()
    if (!clean) return cue.trim()
    if (/^page\s+\d+/i.test(clean)) return clean
    return cue + clean
  }

  type TtsResultLike = {
    token: string
    sentences?: string[]
    timepoints?: TtsTimepoint[]
    usage?: TtsUsageSnapshot
  }

  async function applyAudioResult(
    p: number,
    voice: string,
    chunk: string,
    result: { token: string; sentences?: string[]; timepoints?: TtsTimepoint[] },
    resetHighlight: boolean,
    gen: number,
  ) {
    const a = ttsAudioRef.current
    const incoming = result.sentences?.length ? result.sentences : splitSentences(chunk)
    if (resetHighlight) {
      ttsSentencesRef.current = incoming
      setTtsSentences(incoming)
      ttsSentenceOffsetRef.current = 0
    } else {
      const next = [...ttsSentencesRef.current, ...incoming]
      ttsSentenceOffsetRef.current = ttsSentencesRef.current.length
      ttsSentencesRef.current = next
      setTtsSentences(next)
    }
    ttsTimepointsRef.current = result.timepoints || []
    setTtsPageLoaded(p)
    ttsPageLoadedRef.current = p
    setTtsSynthVoice(voice)
    const startIdx = resetHighlight ? 0 : ttsSentenceOffsetRef.current
    ttsActiveSentenceRef.current = startIdx
    setTtsActiveSentence(startIdx)
    ttsActiveWordRef.current = startIdx >= 0 ? { pageNum: p, sentenceIndex: startIdx, wordIndex: 0 } : null
    lastScrolledSentence.current = -1
    if (a) {
      a.src = ttsAudioUrl(result.token)
      a.playbackRate = ttsRateRef.current
      await a.play()
      if (gen !== ttsGenRef.current) {
        a.pause()
        return
      }
      ttsPlayingRef.current = true
      setTtsPlaying(true)
      startFollowLoop()
      requestAnimationFrame(() => {
        scrollToActiveSentence(p, startIdx, true)
        requestAnimationFrame(() => scrollToActiveSentence(p, startIdx, true))
      })
    }
  }

  async function playChunk(p: number, voice: string, chunk: string, resetHighlight: boolean, gen: number) {
    const result = await synthesizePage(bookId || '', p, voice, chunk)
    if (gen !== ttsGenRef.current) return
    if ((result as TtsResultLike).usage) ingestUsage((result as TtsResultLike).usage)
    void refreshUsageAggressively()
    prefetchArmedRef.current = false
    await applyAudioResult(p, voice, chunk, result, resetHighlight, gen)
  }

  async function prefetchNextPage(fromPage: number, voice: string, gen: number) {
    const last = totalRef.current || maxPagesRef.current
    const nextPage = fromPage + 1
    if (!nextPage || nextPage > last) return
    const raw = (await waitForPageText(nextPage)) || pagesRef.current[nextPage] || ''
    if (!raw || gen !== ttsGenRef.current) return
    const chunks = splitForTts(withPageCue(nextPage, raw))
    if (!chunks.length) return
    try {
      const result = await synthesizePage(bookId || '', nextPage, voice, chunks[0])
      if (gen !== ttsGenRef.current) return
      prefetchRef.current = {
        page: nextPage,
        voice,
        chunks,
        first: {
          token: result.token,
          sentences: result.sentences || splitSentences(chunks[0]),
          timepoints: result.timepoints || [],
        },
      }
    } catch {}
  }

  async function playRobotReader(
    targetPage?: number,
    opts?: { force?: boolean; voice?: string; text?: string; silentBusy?: boolean },
  ) {
    if (ttsBusyRef.current && !opts?.force) return
    const allowed = await ensureTtsAvailable()
    if (!allowed) return
    const p = targetPage ?? pageRef.current
    const voice = opts?.voice ?? ttsVoiceRef.current
    const rawText = opts?.text || (await waitForPageText(p)) || pagesRef.current[p]
    if (!rawText) {
      setTtsError('This page has not finished loading yet.')
      return
    }
    const text = withPageCue(p, rawText)
    setTtsError('')
    const a = ttsAudioRef.current
    const canResume = !opts?.force && !opts?.text && ttsPageLoadedRef.current === p && ttsSynthVoice === voice && !!a?.src
    if (canResume && a) {
      a.playbackRate = ttsRateRef.current
      void a.play()
      ttsPlayingRef.current = true
      setTtsPlaying(true)
      startFollowLoop()
      return
    }
    const cached = prefetchRef.current
    const useCache = cached && cached.page === p && cached.voice === voice && cached.first && !opts?.text
    const chunks = useCache ? cached.chunks : splitForTts(text)
    if (!chunks.length) {
      setTtsError('This page has no readable text.')
      return
    }
    const gen = ++ttsGenRef.current
    ttsChunksRef.current = chunks
    ttsChunkIndexRef.current = 0
    ttsSentenceOffsetRef.current = 0
    if (!opts?.silentBusy && !useCache) {
      ttsBusyRef.current = true
      setTtsBusy(true)
    }
    try {
      if (useCache && cached.first) {
        prefetchRef.current = null
        await applyAudioResult(p, voice, chunks[0], cached.first, true, gen)
      } else {
        await playChunk(p, voice, chunks[0], true, gen)
      }
      if (gen === ttsGenRef.current) {
        lockPageFromScroll(1200)
        requestAnimationFrame(() => {
          document.getElementById(`read-page-${p}`)?.scrollIntoView({ block: 'start' })
        })
        void prefetchNextPage(p, voice, gen)
      }
    } catch (err: unknown) {
      if (gen !== ttsGenRef.current) return
      if (err instanceof TtsError) {
        ingestUsage(err.usage)
        if (err.creditsRequired || err.proRequired) setCreditsOpen(true)
      }
      const msg = err instanceof TtsError ? err.message : 'Could not read this page aloud. Try again.'
      const tooBig = /too large|too long|limit|exceed/i.test(msg)
      if (tooBig && chunks[0].length > 800) {
        const smaller = splitForTts(chunks[0], Math.max(800, Math.floor(chunks[0].length / 2)))
        ttsChunksRef.current = [...smaller.slice(1), ...chunks.slice(1)]
        ttsChunkIndexRef.current = 0
        try {
          await playChunk(p, voice, smaller[0], true, gen)
        } catch (err2: unknown) {
          setTtsError(err2 instanceof TtsError ? err2.message : 'Could not read this page aloud. Try again.')
        }
      } else {
        setTtsError(msg)
      }
    }
    if (gen === ttsGenRef.current) {
      ttsBusyRef.current = false
      setTtsBusy(false)
    }
  }

  async function startFromSentence(pageNum: number, sentenceIndex: number) {
    const allowed = await ensureTtsAvailable()
    if (!allowed) return
    const raw = (await waitForPageText(pageNum)) || pagesRef.current[pageNum] || ''
    const sentences =
      ttsPageLoadedRef.current === pageNum && ttsSentencesRef.current.length
        ? ttsSentencesRef.current
        : splitSentences(raw)
    if (!sentences.length) {
      setTtsError('This page has no readable text.')
      return
    }
    const from = Math.max(0, Math.min(sentences.length - 1, sentenceIndex))
    const remaining = sentences.slice(from).join(' ')
    ttsGenRef.current += 1
    stopAudio()
    ttsBusyRef.current = false
    setTtsBusy(false)
    setTtsError('')
    await gotoPage(pageNum)
    setTtsPanelOpen(true)
    await playRobotReader(pageNum, { force: true, text: remaining })
  }

  async function continueTtsAfterAudioEnds() {
    const gen = ttsGenRef.current
    const chunks = ttsChunksRef.current
    const nextChunk = ttsChunkIndexRef.current + 1
    const current = ttsPageLoadedRef.current ?? pageRef.current
    const voice = ttsVoiceRef.current
    if (nextChunk < chunks.length) {
      ttsChunkIndexRef.current = nextChunk
      ttsBusyRef.current = true
      setTtsBusy(true)
      try {
        await playChunk(current, voice, chunks[nextChunk], false, gen)
      } catch (err: unknown) {
        if (gen === ttsGenRef.current) {
          setTtsError(err instanceof TtsError ? err.message : 'Could not continue reading this page.')
          setTtsPlaying(false)
          stopFollowLoop()
        }
      }
      if (gen === ttsGenRef.current) {
        ttsBusyRef.current = false
        setTtsBusy(false)
      }
      return
    }
    const last = totalRef.current || maxPagesRef.current
    if (current < last) {
      const nextPage = current + 1
      void gotoPage(nextPage)
      await playRobotReader(nextPage, { force: true, silentBusy: true })
    } else {
      setTtsPlaying(false)
      ttsPlayingRef.current = false
      stopFollowLoop()
      setTtsActiveSentence(-1)
      ttsActiveSentenceRef.current = -1
      lastScrolledSentence.current = -1
      ttsChunksRef.current = []
      ttsChunkIndexRef.current = 0
    }
  }

  async function toggleRobotReader() {
    const a = ttsAudioRef.current
    if (ttsPlayingRef.current && a) {
      a.pause()
      setTtsPlaying(false)
      ttsPlayingRef.current = false
      stopFollowLoop()
      return
    }
    const allowed = await ensureTtsAvailable()
    if (!allowed) return
    await playRobotReader()
  }

  function changeVoice(newVoice: string) {
    if (newVoice === ttsVoiceRef.current) return
    setTtsVoice(newVoice)
    ttsVoiceRef.current = newVoice
    if (ttsPlayingRef.current || ttsAudioRef.current?.src) {
      ttsAudioRef.current?.pause()
      setTimeout(() => {
        void playRobotReader(pageRef.current, { force: true, voice: newVoice })
      }, 80)
    }
  }

  function onTtsTimeUpdate() {
    syncHighlight(false)
    const a = ttsAudioRef.current
    if (!a || prefetchArmedRef.current) return
    const dur = a.duration
    if (!Number.isFinite(dur) || dur <= 0) return
    if (a.currentTime / dur >= 0.28) {
      prefetchArmedRef.current = true
      const p = ttsPageLoadedRef.current ?? pageRef.current
      void prefetchNextPage(p, ttsVoiceRef.current, ttsGenRef.current)
    }
  }

  async function refreshCreditQuote(amount: string) {
    const q = await quoteTtsCredits(amount)
    if (q) {
      setCreditQuote(q)
      if (!amount) setCreditAmount(String(q.min_kes ?? q.amount ?? ''))
    }
  }

  function onCreditAmountChange(value: string) {
    setCreditAmount(value)
    if (creditQuoteTimerRef.current) window.clearTimeout(creditQuoteTimerRef.current)
    creditQuoteTimerRef.current = window.setTimeout(() => {
      void refreshCreditQuote(value)
    }, 250)
  }

  async function startCreditCheckout() {
    setCreditError('')
    if (!loggedIn) {
      setCreditError('Log in to buy credits.')
      return
    }
    const amount = creditAmount || creditQuote?.amount || creditQuote?.min_kes || ''
    if (!amount) {
      setCreditError('Enter an amount.')
      return
    }
    setCreditBusy(true)
    try {
      const q = await quoteTtsCredits(amount)
      if (q) setCreditQuote(q)
      try { sessionStorage.setItem('plugyard-return', nextPath) } catch {}
      const res = await buyTtsCredits(amount, nextPath)
      window.location.href = res.checkout_url
    } catch (err: unknown) {
      setCreditError(err instanceof Error ? err.message : 'Could not start checkout.')
      setCreditBusy(false)
    }
  }

  function renderClickablePage(pageNum: number, text: string) {
    const located = locateSentences(text)
    // Exact saved offsets win over quote text, so a one-word note like "and"
    // paints the occurrence the reader actually picked - not all of them.
    const ranges = quoteRanges(text, thoughtsOnPage(pageNum))
    if (!located.length) {
      return (
        <p
          className={`font-semibold leading-relaxed text-black ${highlightSelectClass(highlightMode)}`}
          style={{ fontSize: `${fontSize}px`, ...highlightSelectStyle(highlightMode) }}
        >
          {text || (pageNum <= page + AHEAD ? 'Loading page…' : '')}
        </p>
      )
    }
    return (
      <p
        className={`font-semibold leading-relaxed text-black ${highlightSelectClass(highlightMode)}`}
        style={{ fontSize: `${fontSize}px`, ...highlightSelectStyle(highlightMode) }}
      >
        {located.map(({ sentence, start }, i: number) => (
          <span
            key={i}
            {...(!highlightMode ? { role: 'button', tabIndex: 0, title: 'Start robot reader from here' } : {})}
            onClick={() => {
              if (highlightMode) return
              const selection = window.getSelection()
              if (selection && !selection.isCollapsed && normalizeNoteText(selection.toString()).length >= 2) return
              void startFromSentence(pageNum, i)
            }}
            onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
              if (highlightMode) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                void startFromSentence(pageNum, i)
              }
            }}
            className={highlightMode ? `rounded px-0.5 ${highlightSelectClass(true)}` : 'cursor-pointer rounded px-0.5 hover:bg-[#f591ac]/25'}
            style={highlightMode ? highlightSelectStyle(true) : undefined}
          >
            {paintPieces(piecesBetween(sentence, start, ranges), `${pageNum}-${i}`)}
            {' '}
          </span>
        ))}
      </p>
    )
  }

  function renderSentences(pageNum: number, idPrefix: 'tts-sentence' | 'pip-tts-sentence') {
    return (
      <p
        className={`font-semibold leading-relaxed text-black ${highlightSelectClass(highlightMode)}`}
        style={{ fontSize: `${fontSize}px`, ...highlightSelectStyle(highlightMode) }}
      >
        {ttsSentences.map((s: string, i: number) => {
          let wordIndex = 0
          const isActiveSentence = !highlightMode && i === ttsActiveSentence
          return (
            <span
              key={i}
              id={`${idPrefix}-${pageNum}-${i}`}
              {...(!highlightMode ? { role: 'button', tabIndex: 0, title: 'Start robot reader from here' } : {})}
              onClick={() => !highlightMode && void startFromSentence(pageNum, i)}
              onKeyDown={(e: KeyboardEvent<HTMLSpanElement>) => {
                if (highlightMode) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  void startFromSentence(pageNum, i)
                }
              }}
              className={
                highlightMode
                  ? `rounded px-0.5 ${highlightSelectClass(true)}`
                  : isActiveSentence
                    ? 'cursor-pointer rounded bg-[#f591ac]/50 px-0.5 transition-colors'
                    : 'cursor-pointer rounded px-0.5 transition-colors hover:bg-[#f591ac]/20'
              }
              style={highlightMode ? highlightSelectStyle(true) : undefined}
            >
              {s.split(/(\s+)/).map((part, partIndex) => {
                if (!/\S/.test(part)) return part
                const currentWord = wordIndex
                wordIndex += 1
                return (
                  <span
                    key={partIndex}
                    data-tts-word={currentWord}
                    className={highlightMode ? 'select-text rounded-sm' : 'rounded-sm transition-colors'}
                    style={highlightMode ? highlightSelectStyle(true) : undefined}
                  >
                    {part}
                  </span>
                )
              })}
              {' '}
            </span>
          )
        })}
      </p>
    )
  }

  function renderPipPane(opts?: { floating?: boolean }) {
    const voiceOptions = ttsVoices.length ? ttsVoices : FALLBACK_VOICES
    const maxPages = total || maxPagesRef.current
    const visiblePipPage = ttsPageLoaded ?? page
    const pipPageText = pages[visiblePipPage] || pagesRef.current[visiblePipPage] || 'Loading page…'
    return (
      <div className="flex h-full min-h-0 w-full flex-col bg-[#f4efe4] text-black" style={{ fontFamily: 'inherit', height: '100%', minHeight: 0 }}>
        <div
          className={`shrink-0 border-b border-black/10 px-3 py-2 ${opts?.floating ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
          onPointerDown={opts?.floating ? onPipDragStart : undefined}
          onPointerMove={opts?.floating ? onPipDragMove : undefined}
          onPointerUp={opts?.floating ? onPipDragEnd : undefined}
          onPointerCancel={opts?.floating ? onPipDragEnd : undefined}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-black/60">
              Page {visiblePipPage} / {total || '—'}
            </span>
            {opts?.floating ? (
              <button type="button" onClick={() => setInAppPip(false)} className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-bold text-black">
                Close
              </button>
            ) : null}
          </div>
          {opts?.floating ? (
            <p className="mt-0.5 text-[10px] font-semibold text-black/40">
              {phonePip ? 'Phone pop-out stays on this page' : 'Drag this bar to move'}
            </p>
          ) : null}
        </div>
        {renderReaderNotices()}
        <div
          ref={(node: HTMLDivElement | null) => { pipScrollRef.current = node }}
          className="min-h-0 flex-1 overflow-auto px-4 py-3"
        >
          <div className="pb-24">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-black/40">Current: Page {visiblePipPage}</p>
            {ttsPageLoaded === visiblePipPage && ttsSentences.length > 0
              ? renderSentences(visiblePipPage, 'pip-tts-sentence')
              : renderClickablePage(visiblePipPage, pipPageText)}
          </div>
        </div>
        <div className="sticky bottom-0 z-10 shrink-0 space-y-2 border-t border-black/10 bg-[#efe8d8] p-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-black/10 px-1 py-0.5">
              <button type="button" onClick={() => { fontTouchedRef.current = true; setFontSize((n: number) => Math.max(6, n - 2)) }} className="rounded-full px-2 py-0.5 text-[10px] font-bold text-black" aria-label="Decrease text size">A−</button>
              <span className="min-w-[2.5rem] text-center text-[10px] font-bold text-black/60">{fontSize}px</span>
              <button type="button" onClick={() => { fontTouchedRef.current = true; setFontSize((n: number) => Math.min(40, n + 2)) }} className="rounded-full px-2 py-0.5 text-[10px] font-bold text-black" aria-label="Increase text size">A+</button>
            </div>
            <select value={ttsVoice} onChange={(e: ChangeEvent<HTMLSelectElement>) => changeVoice(e.target.value)} className="h-7 min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2 text-xs text-black">
              {voiceOptions.map((v: TtsVoice) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
            <button type="button" onClick={() => void toggleRobotReader()} disabled={ttsBusy} className="flex h-7 items-center gap-1 rounded-full bg-[#f591ac] px-2.5 text-xs font-bold text-[#141a32] disabled:opacity-50">
              {ttsBusy ? 'Loading…' : ttsPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <div className="flex items-center gap-1">
              {[0.75, 1, 1.25, 1.5].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setTtsRate(r)
                    if (ttsAudioRef.current) ttsAudioRef.current.playbackRate = r
                  }}
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${ttsRate === r ? 'bg-black text-white' : 'bg-black/10 text-black'}`}
                >
                  {r}×
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => void gotoPageAndRead(page - 1)} disabled={page <= 1 || ttsBusy} className="h-8 flex-1 rounded-full bg-black/10 px-2.5 text-xs font-bold text-black disabled:opacity-40">← Prev</button>
            <button type="button" onClick={() => void gotoPageAndRead(page + 1)} disabled={(maxPages > 0 && page >= maxPages) || ttsBusy} className="h-8 flex-1 rounded-full bg-black/10 px-2.5 text-xs font-bold text-black disabled:opacity-40">Next →</button>
          </div>
        </div>
      </div>
    )
  }

  const voiceOptions = ttsVoices.length ? ttsVoices : FALLBACK_VOICES
  const numbers = Array.from({ length: total }, (_, i) => i + 1)
  const creditChars = ttsUsage?.credit_chars ?? 0

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#f4efe4]">
      <div
        className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-black/10 bg-[#efe8d8] px-2 py-2"
        onContextMenu={(e: MouseEvent) => e.preventDefault()}
        onCopy={(e: ClipboardEvent) => e.preventDefault()}
      >
        <button type="button" onClick={() => { fontTouchedRef.current = true; setFontSize((n: number) => Math.max(6, n - 2)) }} className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black">A−</button>
        <span className="min-w-[3.5rem] text-center text-xs font-semibold text-black/60">{fontSize}px</span>
        <button type="button" onClick={() => { fontTouchedRef.current = true; setFontSize((n: number) => Math.min(40, n + 2)) }} className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black">A+</button>
        <span className="text-xs font-semibold text-black/60">{page} / {total || '—'}</span>
        <button type="button" onClick={markHere} className="rounded-full bg-[#f591ac] px-3 py-1 text-sm font-bold text-[#141a32]">Mark page {page}</button>
        <button type="button" onClick={toggleHighlightMode} aria-pressed={highlightMode} className={`rounded-full px-3 py-1 text-sm font-bold ${highlightMode ? 'bg-[#f6e27a] text-[#141a32]' : 'bg-black/10 text-black'}`}>✏️ Highlight</button>
        <button
          type="button"
          onClick={() => {
            const opening = !notesOpen
            if (opening) {
              ttsAudioRef.current?.pause()
              setTtsPlaying(false)
              ttsPlayingRef.current = false
              stopFollowLoop()
              clearActiveWordHighlight()
            }
            setNotesOpen(opening)
            setNoteMsg('')
          }}
          aria-pressed={notesOpen}
          className={`rounded-full px-3 py-1 text-sm font-bold ${notesOpen ? 'bg-[#f591ac] text-[#141a32]' : 'bg-black/10 text-black'}`}
        >
          📋 Notes{visibleThoughts.length ? ` (${visibleThoughts.length})` : ''}
        </button>
        {marked > 0 && (
          <button type="button" onClick={() => void goToMark()} className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black">
            Go to mark ({marked})
          </button>
        )}
        <button type="button" onClick={togglePopOut} className={`rounded-full px-3 py-1 text-sm font-bold ${pipOpen ? 'bg-[#f591ac] text-[#141a32]' : 'bg-black/10 text-black'}`}>
          {!isPro && '🔒 '}Pop out{!isPro && ' · PRO'}
        </button>
        <button
          type="button"
          onClick={async () => {
            const allowed = await ensureTtsAvailable()
            if (!allowed) return
            setTtsPanelOpen((v: boolean) => !v)
          }}
          className={`rounded-full px-3 py-1 text-sm font-bold ${ttsPanelOpen ? 'bg-[#f591ac] text-[#141a32]' : 'bg-black/10 text-black'}`}
        >
          {!isPro && !creditChars && '🔒 '}🔊 Robot reader
        </button>
        <button type="button" onClick={() => { setCreditsOpen(true); void refreshCreditQuote(creditAmount) }} className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black">
          Buy credits
        </button>
      </div>

      <audio
        ref={ttsAudioRef}
        onTimeUpdate={onTtsTimeUpdate}
        onPlay={() => {
          setTtsPlaying(true)
          ttsPlayingRef.current = true
          setUsageNotice('')
          syncHighlight(true)
          startFollowLoop()
        }}
        onPause={() => {
          setTtsPlaying(false)
          ttsPlayingRef.current = false
          stopFollowLoop()
        }}
        onEnded={() => void continueTtsAfterAudioEnds()}
        onError={() => setTtsError('Could not play the generated audio.')}
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
      />

      {canUseTts && ttsPanelOpen && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-black/10 bg-[#efe8d8] px-3 py-2">
          <select value={ttsVoice} onChange={(e: ChangeEvent<HTMLSelectElement>) => changeVoice(e.target.value)} className="h-8 rounded-lg border border-black/15 bg-white px-2 text-sm text-black">
            {voiceOptions.map((v: TtsVoice) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
          <button type="button" onClick={() => void toggleRobotReader()} disabled={ttsBusy} className="flex h-8 items-center gap-1.5 rounded-full bg-[#f591ac] px-3 text-sm font-bold text-[#141a32] disabled:opacity-50">
            {ttsBusy ? 'Loading…' : ttsPlaying ? '⏸ Pause' : '▶ Play page'}
          </button>
          <div className="flex items-center gap-1">
            {[0.75, 1, 1.25, 1.5].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setTtsRate(r)
                  if (ttsAudioRef.current) ttsAudioRef.current.playbackRate = r
                }}
                className={`rounded-full px-2 py-1 text-xs font-bold ${ttsRate === r ? 'bg-black text-white' : 'bg-black/10 text-black'}`}
              >
                {r}×
              </button>
            ))}
          </div>
        </div>
      )}

      {highlightMode && loggedIn && draft ? (
        <div className="shrink-0 border-b border-black/10 bg-[#f6e27a] px-3 py-2">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-black">
              <span className="opacity-60">p.{draft.page} · </span>
              {draft.quote}
            </p>
            {editingNote ? (
              <button type="button" disabled={savingNote} onClick={() => void saveThought()} className="shrink-0 rounded-full bg-[#141a32] px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50">
                {savingNote ? (draft.id ? 'Updating…' : 'Saving…') : draft.id ? 'Update' : 'Save'}
              </button>
            ) : (
              <button type="button" onClick={() => setEditingNote(true)} className="shrink-0 rounded-full bg-black/10 px-3 py-1.5 text-[13px] font-bold text-black">Edit</button>
            )}
            <button type="button" disabled={savingNote} onClick={cancelEditThought} aria-label={draft.id ? 'Cancel edit' : 'Discard highlight'} className="shrink-0 rounded-full bg-black/10 px-2 py-1.5 text-[13px] font-bold text-black disabled:opacity-50">×</button>
          </div>
          {editingNote ? (
            <div className="mx-auto mt-1.5 flex max-w-2xl gap-2">
              <input
                value={draft.thought}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, thought: e.target.value })}
                placeholder="Type a thought"
                maxLength={280}
                disabled={savingNote}
                autoFocus={editingNote && !phonePip}
                className="min-w-0 flex-1 rounded-full border border-black/10 bg-white px-3 py-1.5 text-sm text-black outline-none disabled:opacity-50"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setEditingNote(true)} className="mx-auto mt-1.5 block max-w-2xl truncate text-left text-[12px] text-black/70">
              {draft.thought ? draft.thought : 'Add a thought…'}
            </button>
          )}
        </div>
      ) : null}

      {highlightMode && loggedIn && !draft ? (
        <div className="shrink-0 border-b border-black/10 bg-[#f6e27a]/60 px-3 py-1.5 text-center text-[12px] font-semibold text-black/70">
          Tap and hold a passage to highlight it
        </div>
      ) : null}

      {highlightMode && noteMsg ? (
        <p className="shrink-0 px-3 py-1.5 text-center text-[12px] font-semibold text-[#c45b78]">{noteMsg}</p>
      ) : null}

      {notesOpen ? (
        <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#efe8d8]" style={phonePip ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}>
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
            <p className="text-[12px] font-bold uppercase tracking-wider text-black/45">
              Saved highlights{visibleThoughts.length ? ` (${visibleThoughts.length})` : ''}
            </p>
            <button type="button" onClick={() => { setNotesOpen(false); window.getSelection()?.removeAllRanges() }} className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black">
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {renderThoughtsList('Tap Highlight, then tap and hold a passage.')}
          </div>
        </div>
      ) : null}

      {renderReaderNotices()}

      {canUseTts ? (
        <p className="px-4 pt-2 text-center text-[12px] text-black/55">Tap any sentence to start the robot reader from there.</p>
      ) : null}

      {previewPages ? (
        <p className="px-4 py-2 text-center text-[12px] text-black/55">Sneak peek — {previewPages} pages. Buy to unlock the rest.</p>
      ) : null}

      {obscured && <div className="pointer-events-none absolute inset-0 z-40 bg-[#f4efe4]/95 backdrop-blur-2xl" />}

      {watermark && (
        <div className="pointer-events-none absolute inset-0 z-30 select-none overflow-hidden opacity-[0.08]">
          <div className="absolute inset-[-50%] grid grid-cols-3 gap-16 rotate-[-24deg] text-[13px] font-bold uppercase tracking-widest text-black" aria-hidden>
            {Array.from({ length: 60 }, (_, i) => (
              <span key={i} className="whitespace-nowrap">{watermark}</span>
            ))}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        onContextMenu={(e: MouseEvent) => {
          if (highlightMode || copyProtected) e.preventDefault()
        }}
        // Paid books: copying text out is discouraged, not prevented — a
        // determined user can always read what is on their screen.
        onCopy={(e: ClipboardEvent) => {
          if (copyProtected) e.preventDefault()
        }}
        onCut={(e: ClipboardEvent) => {
          if (copyProtected) e.preventDefault()
        }}
        className={`min-h-0 flex-1 overflow-auto ${highlightMode ? highlightSelectClass(true) : 'select-none'}`}
        style={highlightSelectStyle(highlightMode)}
      >
        {status ? (
          <p className={`p-6 text-sm font-semibold ${accessError ? 'text-[#b4233c]' : 'text-black/50'}`} role={accessError ? 'alert' : undefined}>
            {status}
          </p>
        ) : null}
        {resumeAt > 1 ? (
          <p className="px-4 pt-4 text-center text-[13px] font-semibold text-[#c45b78]">
            Continuing from page {resumeAt}{loggedIn ? ' · synced to your account' : ''}
          </p>
        ) : null}
        {!loggedIn ? (
          <p className="px-4 pt-3 text-center text-[13px] text-black/60">
            Your place is saved on this phone only.{' '}
            <Link href={loginHref} className="font-semibold text-[#c45b78] underline">Log in</Link>
            {' · '}
            <Link href={signupHref} className="font-semibold text-[#c45b78] underline">Create account</Link>
          </p>
        ) : (
          <p className="px-4 pt-3 text-center text-[12px] text-black/55">Your page syncs to this account.</p>
        )}
        <article
          className={`mx-auto max-w-2xl px-4 py-6 ${highlightMode ? highlightSelectClass(true) : 'select-none'}`}
          style={highlightSelectStyle(highlightMode)}
        >
          {numbers.map((n) => (
            <section
              key={n}
              id={`read-page-${n}`}
              className={`mb-10 min-h-[8rem] ${highlightSelectClass(highlightMode)}`}
              style={highlightSelectStyle(highlightMode)}
            >
              <p className="mb-3 select-none text-[11px] font-bold uppercase tracking-wider text-black/40">Page {n}</p>
              {ttsPageLoaded === n && ttsSentences.length > 0
                ? renderSentences(n, 'tts-sentence')
                : renderClickablePage(n, pages[n] || '')}
            </section>
          ))}
        </article>
      </div>

      {pipWindow && createPortal(renderPipPane(), pipWindow.document.body)}

      {inAppPip && typeof document !== 'undefined' && createPortal(
        phonePip ? (
          <div className="fixed inset-x-0 bottom-0 z-[9999] flex flex-col overflow-hidden rounded-t-2xl border border-black/15 bg-[#f4efe4] shadow-2xl" style={{ height: 'min(72vh, 520px)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {renderPipPane({ floating: true })}
          </div>
        ) : (
          <div
            className="fixed z-[9999] overflow-hidden rounded-2xl border border-black/15 bg-[#f4efe4] shadow-2xl"
            style={{
              left: pipPos.x,
              top: pipPos.y,
              width: Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 16 : 360),
              height: Math.min(460, typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.62) : 420),
            }}
          >
            {renderPipPane({ floating: true })}
          </div>
        ),
        document.body,
      )}

      {creditsOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-[#f4efe4] p-4 shadow-2xl">
            <p className="text-sm font-bold text-black">Buy robot-reader credits</p>
            <p className="mt-1 text-sm font-bold text-black">
              KES {creditAmount || creditQuote?.amount || creditQuote?.min_kes || '—'} gives you{' '}
              {estimatedCreditChars != null ? estimatedCreditChars.toLocaleString() : '—'} characters
            </p>
            <p className="mt-1 text-[12px] text-black/60">
              Pay at least KES {creditQuote?.min_kes || '—'} to add robot-reader credits.
              {creditQuote?.volume_bonus_percent ? ` · ${creditQuote.volume_bonus_percent}% extra if you pay 2× the minimum` : ''}
            </p>
            <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-black/50">Amount (KES)</label>
            <input
              type="number"
              min={creditQuote?.min_kes || 0}
              value={creditAmount}
              onChange={(e: ChangeEvent<HTMLInputElement>) => { onCreditAmountChange(e.target.value) }}
              className="mt-1 h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-black"
            />
            <p className="mt-2 text-sm font-semibold text-black">Your purchased robot-reader credit balance will update automatically after payment.</p>
            {creditError ? <p className="mt-2 text-[12px] font-semibold text-red-600">{creditError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setCreditsOpen(false)} className="h-10 flex-1 rounded-full bg-black/10 text-sm font-bold text-black">Close</button>
              <button type="button" onClick={() => void startCreditCheckout()} disabled={creditBusy} className="h-10 flex-1 rounded-full bg-[#f591ac] text-sm font-bold text-[#141a32] disabled:opacity-50">
                {creditBusy ? 'Opening pay…' : 'Pay now'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProGateModal
        open={proGate !== null}
        onClose={() => setProGate(null)}
        feature={proGate === 'pip' ? 'Floating pop-out reader' : 'Robot reader'}
        benefit={
          proGate === 'pip'
            ? 'Keep this page floating above other tabs and windows while you work.'
            : 'Have any page read aloud with natural narration, auto-scroll, and sentence highlighting.'
        }
      />
    </div>
  )
}
