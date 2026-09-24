'use client'

import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { getToken } from '@/lib/api'
import { getPdfProgress, savePdfProgress } from '@/lib/api'
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

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string }
      getDocument: (opts: Record<string, unknown>) => { promise: Promise<any> }
    }
  }
}

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

function charsForCreditAmount(
  quote: TtsCreditQuote | null,
  amountValue: string,
): number | null {
  if (!quote) return null

  const typed = Number(amountValue)
  const quotedAmount = Number(quote.amount)
  const min = Number(quote.min_kes)
  const rate = Number(quote.chars_per_kes)
  const bonus = Number(quote.volume_bonus_percent) || 0

  if (
    Number.isFinite(typed) &&
    Number.isFinite(quotedAmount) &&
    typed === quotedAmount
  ) {
    return Math.round(Number(quote.chars) || 0)
  }

  const amount =
    Number.isFinite(typed) && typed > 0
      ? typed
      : Number.isFinite(quotedAmount)
        ? quotedAmount
        : min

  if (!Number.isFinite(amount) || amount <= 0) {
    return Number.isFinite(Number(quote.chars))
      ? Math.round(Number(quote.chars))
      : null
  }

  if (Number.isFinite(rate) && rate > 0) {
    let chars = amount * rate
    if (bonus > 0 && Number.isFinite(min) && amount >= min * 2) {
      chars *= 1 + bonus / 100
    }
    return Math.round(chars)
  }

  return Number.isFinite(Number(quote.chars))
    ? Math.round(Number(quote.chars))
    : null
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

export function PdfReader({
  url,
  bookId,
  previewPages,
  watermark,
}: {
  url: string
  bookId?: string
  previewPages?: number
  watermark?: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const pipScrollRef = useRef<HTMLDivElement>(null)
  const pdfRef = useRef<any>(null)
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

  const { pipWindow, supported: pipSupported, open: openPip, close: closePip } =
    usePictureInPicture('#f4efe4')

  const [inAppPip, setInAppPip] = useState(false)
  const [phonePip, setPhonePip] = useState(true)
  const [pipError, setPipError] = useState('')
  const [pipPos, setPipPos] = useState({ x: 8, y: 72 })

  const dragRef = useRef<{
    dx: number
    dy: number
    dragging: boolean
  }>({
    dx: 0,
    dy: 0,
    dragging: false,
  })

  const fontTouchedRef = useRef(false)

  const prefetchRef = useRef<{
    page: number
    voice: string
    chunks: string[]
    first: {
      token: string
      sentences: string[]
      timepoints: TtsTimepoint[]
    } | null
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
  const [ttsTimepoints, setTtsTimepoints] = useState<TtsTimepoint[]>([])
  const [ttsActiveSentence, setTtsActiveSentence] = useState(-1)
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

  const [usageNotice, setUsageNotice] = useState('')
  const usageNoticeIndexRef = useRef(0)
  const lowCreditTimerRef = useRef<number | null>(null)
  const lowCreditCycleRef = useRef<number | null>(null)
  const creditQuoteTimerRef = useRef<number | null>(null)

  const canUseTts = isPro || (ttsUsage?.credit_chars || 0) > 0
  const pipOpen = !!pipWindow || inAppPip
  const estimatedCreditChars = charsForCreditAmount(creditQuote, creditAmount)
  const readerMessage = ttsError || pipError || usageNotice

  const readerReturnPath = (() => {
    if (typeof window === 'undefined') {
      return bookId
        ? `/?book=${encodeURIComponent(bookId)}&view=read`
        : '/'
    }

    const params = new URLSearchParams(window.location.search)

    params.delete('tts_credits_ref')
    params.delete('pro_ref')
    params.delete('reference')
    params.delete('trxref')

    if (bookId && !params.get('book')) {
      params.set('book', String(bookId))
    }

    if (!params.get('view')) {
      params.set('view', 'read')
    }

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
      if (delay) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }

      try {
        const fresh = await getTtsUsage()

        if (fresh) {
          ingestUsage(fresh)
        }
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

    const availableChars =
      fresh?.credit_chars ??
      ttsUsageRef.current?.credit_chars ??
      0

    if (availableChars > 0) {
      return true
    }

    setProGate('tts')
    setCreditsOpen(true)
    return false
  }

  function buildUsageNotices(): string[] {
    const usage = ttsUsageRef.current
    if (!usage) return []

    const notices: string[] = []
    const warnAt = usagePercent(usage.warn_percent) ?? 85
    const dailyPct = usagePercent(usage.daily_percent)
    const weeklyPct = usagePercent(usage.weekly_percent)
    const creditPct =
      usagePercent((usage as TtsUsageSnapshot & { credit_percent?: number }).credit_percent) ??
      (() => {
        const used = Number((usage as TtsUsageSnapshot & { credit_chars_used?: number }).credit_chars_used)
        const total = Number((usage as TtsUsageSnapshot & { credit_chars_total?: number }).credit_chars_total)
        if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null
        return usagePercent((used / total) * 100)
      })()

    if (usage.credits_enabled && creditPct != null && creditPct >= warnAt) {
      notices.push(
        `You have used ${creditPct}% of your purchased robot-reader credits. Buy credits to keep listening.`,
      )
    }

    if (dailyPct != null && dailyPct >= warnAt) {
      notices.push(
        `You have used ${dailyPct}% of your daily robot-reader characters. Buy credits to keep listening.`,
      )
    }

    if (weeklyPct != null && weeklyPct >= warnAt) {
      notices.push(
        `You have used ${weeklyPct}% of your weekly robot-reader characters. Buy credits to keep listening.`,
      )
    }

    return notices
  }

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    ttsVoiceRef.current = ttsVoice
  }, [ttsVoice])

  useEffect(() => {
    ttsRateRef.current = ttsRate
  }, [ttsRate])

  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  useEffect(() => {
    totalRef.current = total
  }, [total])

  useEffect(() => {
    ttsPlayingRef.current = ttsPlaying
  }, [ttsPlaying])

  useEffect(() => {
    ttsPageLoadedRef.current = ttsPageLoaded
  }, [ttsPageLoaded])

  useEffect(() => {
    ttsSentencesRef.current = ttsSentences
  }, [ttsSentences])

  useEffect(() => {
    ttsTimepointsRef.current = ttsTimepoints
  }, [ttsTimepoints])

  useEffect(() => {
    ttsActiveSentenceRef.current = ttsActiveSentence
  }, [ttsActiveSentence])

  useEffect(() => {
    pipWindowRef.current = pipWindow
  }, [pipWindow])

  useEffect(() => {
    const apply = () => {
      const phone = preferPhonePip()

      setPhonePip(phone)

      if (phone && !fontTouchedRef.current) {
        setFontSize(10)
      }
    }

    apply()

    window.addEventListener('resize', apply)

    return () => window.removeEventListener('resize', apply)
  }, [])

  useEffect(() => {
    if (!loggedIn || !ttsPlaying) {
      setUsageNotice('')

      if (lowCreditTimerRef.current) {
        window.clearTimeout(lowCreditTimerRef.current)
        lowCreditTimerRef.current = null
      }

      if (lowCreditCycleRef.current) {
        window.clearTimeout(lowCreditCycleRef.current)
        lowCreditCycleRef.current = null
      }

      return
    }

    let cancelled = false

    const clearNoticeTimers = () => {
      if (lowCreditTimerRef.current) {
        window.clearTimeout(lowCreditTimerRef.current)
        lowCreditTimerRef.current = null
      }

      if (lowCreditCycleRef.current) {
        window.clearTimeout(lowCreditCycleRef.current)
        lowCreditCycleRef.current = null
      }
    }

    const scheduleNotice = () => {
      if (cancelled || !ttsPlayingRef.current) return

      const delay = 8000 + Math.floor(Math.random() * 22000)

      lowCreditCycleRef.current = window.setTimeout(() => {
        if (cancelled || !ttsPlayingRef.current) {
          setUsageNotice('')
          return
        }

        const notices = buildUsageNotices()
        if (!notices.length) return

        const next = notices[usageNoticeIndexRef.current % notices.length]
        usageNoticeIndexRef.current += 1
        setUsageNotice(next)

        lowCreditTimerRef.current = window.setTimeout(() => {
          if (!cancelled) setUsageNotice('')
        }, 6000)
      }, delay)
    }

    scheduleNotice()

    return () => {
      cancelled = true
      clearNoticeTimers()
    }
  }, [loggedIn, ttsPlaying])

  useEffect(() => {
    if (!loggedIn) return

    let cancelled = false

    getProStatus()
      .then((s: { is_pro: boolean }) => {
        if (!cancelled) {
          setIsPro(s.is_pro)
        }
      })
      .catch(() => {})

    getTtsVoices()
      .then((v: TtsVoice[]) => {
        if (!cancelled && v.length) {
          setTtsVoices(v)
        }
      })
      .catch(() => {})

    const pullUsage = () =>
      getTtsUsage()
        .then((u) => {
          if (cancelled || !u) return
          ingestUsage(u)
        })
        .catch(() => {})

    pullUsage()

    quoteTtsCredits()
      .then((q) => {
        if (cancelled || !q) return

        setCreditQuote(q)
        setCreditAmount(String(q.min_kes ?? q.amount ?? ''))
      })
      .catch(() => {})

    const params =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : null

    const creditsRef = (params?.get('tts_credits_ref') || '').trim()
    const proRef = (params?.get('pro_ref') || '').trim()

    if (creditsRef) {
      confirmTtsCredits(creditsRef)
        .then(async (res) => {
          if (cancelled) return

          if (res.usage) {
            ingestUsage(res.usage)
          }

          const fresh = await getTtsUsage()

          if (!cancelled) {
            ingestUsage(fresh)
          }

          if (!cancelled) {
            void refreshUsageAggressively()
          }
        })
        .catch(() => {})
        .finally(() => {
          if (typeof window !== 'undefined') {
            const clean = new URL(window.location.href)

            clean.searchParams.delete('tts_credits_ref')
            clean.searchParams.delete('reference')
            clean.searchParams.delete('trxref')

            window.history.replaceState(
              {},
              '',
              clean.pathname + clean.search + clean.hash,
            )
          }
        })
    }

    if (proRef) {
      confirmProPayment(proRef)
        .then((res) => {
          if (!cancelled && res.ok) {
            getProStatus()
              .then((s: { is_pro: boolean }) => {
                if (!cancelled) {
                  setIsPro(s.is_pro)
                }
              })
              .catch(() => {})
          }
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loggedIn) return

    const tick = () => {
      void getTtsUsage().then((u) => ingestUsage(u))
    }

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
    const onVisibility = () =>
      setObscured(document.visibilityState !== 'visible')

    const onBlur = () => setObscured(true)

    const onFocus = () =>
      setObscured(document.visibilityState !== 'visible')

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

      if (followRafRef.current) {
        cancelAnimationFrame(followRafRef.current)
      }

      if (lowCreditTimerRef.current) {
        window.clearTimeout(lowCreditTimerRef.current)
      }

      if (lowCreditCycleRef.current) {
        window.clearTimeout(lowCreditCycleRef.current)
      }

      if (creditQuoteTimerRef.current) {
        window.clearTimeout(creditQuoteTimerRef.current)
      }
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
    try {
      localStorage.setItem(markKey(url), String(n))
    } catch {
      // ignore
    }
  }

  async function saveCloud(n: number) {
    if (!loggedIn || !bookId || n < 1) return

    try {
      await savePdfProgress(bookId, n)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(markKey(url)) || 0)

      setMarked(saved)

      if (saved > 1) {
        setResumeAt(saved)
      }
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

  async function extractPage(n: number) {
    const pdf = pdfRef.current
    const max = maxPagesRef.current

    if (!pdf || !max || n < 1 || n > max) return

    if (pagesRef.current[n] || loadingPage.current.has(n)) return

    loadingPage.current.add(n)

    try {
      const pdfPage = await pdf.getPage(n)
      const content = await pdfPage.getTextContent()

      const text = content.items
        .map((item: { str?: string }) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      commitPageText(n, text || `Page ${n}`)
    } catch {
      commitPageText(n, `Page ${n} could not be read.`)
    } finally {
      loadingPage.current.delete(n)
    }
  }

  async function bufferAround(center: number, count = AHEAD) {
    const max = maxPagesRef.current

    if (!pdfRef.current || !max) return

    const start = Math.max(1, center)
    const end = Math.min(max, center + count)

    for (let i = start; i <= end; i++) {
      await extractPage(i)
    }
  }

  async function waitForPageText(n: number) {
    if (pagesRef.current[n]) {
      return pagesRef.current[n]
    }

    await extractPage(n)

    for (let i = 0; i < 25 && !pagesRef.current[n]; i++) {
      await new Promise((r) => setTimeout(r, 80))

      if (!pagesRef.current[n]) {
        await extractPage(n)
      }
    }

    return pagesRef.current[n] || ''
  }

  useEffect(() => {
    let cancelled = false

    async function loadScript() {
      if (window.pdfjsLib) return

      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')

        s.src =
          'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'

        s.onload = () => resolve()
        s.onerror = () => reject(new Error('pdf.js failed'))

        document.body.appendChild(s)
      })

      window.pdfjsLib!.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
    }

    ;(async () => {
      try {
        setStatus('Opening…')
        setPages({})
        pagesRef.current = {}
        maxPagesRef.current = 0

        await loadScript()

        if (cancelled) return

        const pdf = await window.pdfjsLib!.getDocument({
          url,
          disableStream: false,
          disableAutoFetch: true,
        }).promise

        if (cancelled) return

        pdfRef.current = pdf

        const rawTotal = pdf.numPages

        const totalPages = previewPages
          ? Math.min(rawTotal, previewPages)
          : rawTotal

        maxPagesRef.current = totalPages
        totalRef.current = totalPages

        setTotal(totalPages)

        let saved = Number(
          localStorage.getItem(markKey(url)) || 0,
        )

        if (loggedIn && bookId) {
          try {
            const cloud = await getPdfProgress(bookId)

            if (cloud.page > saved) {
              saved = cloud.page
            }
          } catch {
            // stay local
          }
        }

        const startAt =
          saved > 1 && saved <= totalPages
            ? saved
            : 1

        pageRef.current = startAt
        setPage(startAt)

        setMarked(
          saved > totalPages
            ? totalPages
            : saved,
        )

        if (startAt > 1) {
          setResumeAt(startAt)
        }

        await bufferAround(startAt, AHEAD)

        if (cancelled) return

        setStatus('')

        requestAnimationFrame(() => {
          document
            .getElementById(`read-page-${startAt}`)
            ?.scrollIntoView({ block: 'start' })
        })
      } catch {
        if (!cancelled) {
          setStatus('Could not open this book.')
        }
      }
    })()

    return () => {
      cancelled = true
      pdfRef.current = null
      maxPagesRef.current = 0
    }
  }, [url, bookId, previewPages])

  function onScroll() {
    const root = scrollRef.current
    const max = maxPagesRef.current

    if (!root || !max) return

    const mid = root.scrollTop + 80
    let current = pageRef.current

    for (let i = 1; i <= max; i++) {
      const el = document.getElementById(`read-page-${i}`)

      if (el && el.offsetTop <= mid) {
        current = i
      }
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

    window.setTimeout(() => {
      ignoreScrollPageRef.current = false
    }, ms)
  }

  function openInAppPip() {
    setPipError('')

    if (pipWindow) {
      try {
        closePip()
      } catch {
        // ignore
      }
    }

    const vw = window.visualViewport?.width || window.innerWidth
    const vh = window.visualViewport?.height || window.innerHeight

    const w = Math.min(360, Math.max(220, vw - 16))
    const h = Math.min(460, Math.round(vh * 0.58))

    setPipPos({
      x: Math.max(8, vw - w - 8),
      y: Math.max(48, vh - h - 12),
    })

    setInAppPip(true)
  }

  async function togglePopOut() {
    setPipError('')

    if (phonePip) {
      if (pipWindow) {
        try {
          closePip()
        } catch {
          // ignore
        }
      }

      setInAppPip(false)
      setPipError(
        'Pop out only works on a computer. On a phone, keep reading on this page.',
      )

      return
    }

    if (!isPro) {
      setProGate('pip')
      setPipError(
        'Pop out is a Pro feature. Upgrade to use it on a computer.',
      )
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
      await Promise.resolve(
        openPip({
          width: 380,
          height: 420,
        }),
      )
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Pop out is not available in this browser.'

      setPipError(
        `${msg} Use Chrome or Edge on a computer.`,
      )
    }
  }

  function onPipDragStart(e: PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement

    if (target.closest('button, select, a')) return

    dragRef.current = {
      dragging: true,
      dx: e.clientX - pipPos.x,
      dy: e.clientY - pipPos.y,
    }

    ;(e.currentTarget as HTMLElement).setPointerCapture(
      e.pointerId,
    )
  }

  function onPipDragMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return

    const w = Math.min(360, window.innerWidth - 16)
    const h = Math.min(
      460,
      Math.round(window.innerHeight * 0.62),
    )

    const x = Math.min(
      window.innerWidth - w - 8,
      Math.max(8, e.clientX - dragRef.current.dx),
    )

    const y = Math.min(
      window.innerHeight - 80,
      Math.max(8, e.clientY - dragRef.current.dy),
    )

    setPipPos({ x, y })
  }

  function onPipDragEnd() {
    dragRef.current.dragging = false
  }

  function findSentenceEl(
    prefix: 'tts-sentence' | 'pip-tts-sentence',
    pageNum: number,
    idx: number,
  ) {
    const id = `${prefix}-${pageNum}-${idx}`

    if (prefix === 'tts-sentence') {
      return document.getElementById(id)
    }

    const pipDoc = pipWindowRef.current?.document

    return (
      pipDoc?.getElementById(id) ||
      pipScrollRef.current?.querySelector(`#${id}`) ||
      null
    )
  }

  function scrollPipSentenceIntoView(
    pageNum: number,
    idx: number,
  ) {
    const pipRoot = pipScrollRef.current

    const el = findSentenceEl(
      'pip-tts-sentence',
      pageNum,
      idx,
    ) as HTMLElement | null

    if (!el) return false

    if (pipRoot) {
      const top =
        offsetInScrollParent(pipRoot, el) -
        Math.max(
          20,
          pipRoot.clientHeight * 0.28,
        )

      pipRoot.scrollTop = Math.max(0, top)

      return true
    }

    el.scrollIntoView({
      block: 'center',
      behavior: 'auto',
    })

    return true
  }

  function scrollToActiveSentence(
    pageNum: number,
    idx: number,
    force = false,
  ) {
    if (idx < 0) return

    const main = findSentenceEl(
      'tts-sentence',
      pageNum,
      idx,
    ) as HTMLElement | null

    const mainRoot = scrollRef.current

    if (
      main &&
      mainRoot &&
      (force || lastScrolledSentence.current !== idx)
    ) {
      const top =
        offsetInScrollParent(mainRoot, main) -
        Math.max(
          40,
          mainRoot.clientHeight * 0.3,
        )

      mainRoot.scrollTo({
        top: Math.max(0, top),
        behavior: force ? 'auto' : 'smooth',
      })
    }

    scrollPipSentenceIntoView(pageNum, idx)

    lastScrolledSentence.current = idx
  }

  function sentenceIndexFromAudio() {
    const a = ttsAudioRef.current
    const sentences = ttsSentencesRef.current

    if (!a || !sentences.length) return -1

    const t = a.currentTime || 0
    const duration = a.duration
    const points = ttsTimepointsRef.current

    let idx = -1

    if (points.length) {
      let local = -1

      for (let i = 0; i < points.length; i++) {
        if (points[i].time_seconds <= t) {
          local = i
        } else {
          break
        }
      }

      idx =
        local < 0
          ? ttsSentenceOffsetRef.current
          : ttsSentenceOffsetRef.current + local
    } else if (
      Number.isFinite(duration) &&
      duration > 0
    ) {
      const weights = sentences.map(
        (s: string) => Math.max(s.length, 1),
      )

      const totalWeight =
        weights.reduce(
          (sum: number, n: number) => sum + n,
          0,
        ) || 1

      let walked =
        (Math.max(t, 0) / duration) *
        totalWeight

      idx = sentences.length - 1

      for (let i = 0; i < weights.length; i++) {
        walked -= weights[i]

        if (walked <= 0) {
          idx = i
          break
        }
      }
    } else {
      idx = Math.max(
        0,
        ttsSentenceOffsetRef.current,
      )
    }

    return Math.min(
      Math.max(idx, 0),
      sentences.length - 1,
    )
  }

  function syncHighlight(forceScroll = false) {
    const idx = sentenceIndexFromAudio()

    if (idx < 0) return

    const pageNum =
      ttsPageLoadedRef.current ??
      pageRef.current

    if (
      idx !==
      ttsActiveSentenceRef.current
    ) {
      ttsActiveSentenceRef.current = idx
      setTtsActiveSentence(idx)
      scrollToActiveSentence(
        pageNum,
        idx,
        forceScroll,
      )
      return
    }

    if (
      forceScroll ||
      lastScrolledSentence.current !== idx
    ) {
      scrollToActiveSentence(
        pageNum,
        idx,
        forceScroll,
      )
    } else {
      const pipRoot = pipScrollRef.current

      const el = findSentenceEl(
        'pip-tts-sentence',
        pageNum,
        idx,
      ) as HTMLElement | null

      if (pipRoot && el) {
        const top = offsetInScrollParent(
          pipRoot,
          el,
        )

        const viewTop = pipRoot.scrollTop
        const viewBottom =
          viewTop + pipRoot.clientHeight

        if (
          top < viewTop + 12 ||
          top + el.offsetHeight >
            viewBottom - 12
        ) {
          scrollPipSentenceIntoView(
            pageNum,
            idx,
          )
        }
      }
    }
  }

  function startFollowLoop() {
    if (followRafRef.current) {
      cancelAnimationFrame(
        followRafRef.current,
      )
    }

    const tick = () => {
      if (ttsPlayingRef.current) {
        syncHighlight(false)
      }

      followRafRef.current =
        requestAnimationFrame(tick)
    }

    followRafRef.current =
      requestAnimationFrame(tick)
  }

  function stopFollowLoop() {
    if (followRafRef.current) {
      cancelAnimationFrame(
        followRafRef.current,
      )

      followRafRef.current = 0
    }
  }

  async function gotoPage(n: number) {
    const last =
      totalRef.current ||
      maxPagesRef.current ||
      n

    const target = Math.max(
      1,
      Math.min(last, n),
    )

    lockPageFromScroll(1200)

    pageRef.current = target
    setPage(target)

    saveLocal(target)
    setMarked(target)

    await bufferAround(target, AHEAD)

    requestAnimationFrame(() => {
      document
        .getElementById(
          `read-page-${target}`,
        )
        ?.scrollIntoView({
          block: 'start',
        })

      if (pipScrollRef.current) {
        pipScrollRef.current.scrollTop = 0
      }
    })

    return target
  }

  function resetTtsVisuals() {
    setTtsSentences([])
    ttsSentencesRef.current = []

    setTtsTimepoints([])
    ttsTimepointsRef.current = []

    setTtsActiveSentence(-1)
    ttsActiveSentenceRef.current = -1

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
    setUsageNotice('')

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

    await playRobotReader(
      target,
      { force: true },
    )
  }

  function withPageCue(
    pageNum: number,
    body: string,
  ) {
    const cue = `Page ${pageNum}. `
    const clean = (body || '').trim()

    if (!clean) {
      return cue.trim()
    }

    if (/^page\s+\d+/i.test(clean)) {
      return clean
    }

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
    result: {
      token: string
      sentences?: string[]
      timepoints?: TtsTimepoint[]
    },
    resetHighlight: boolean,
    gen: number,
  ) {
    const a = ttsAudioRef.current

    const incoming =
      result.sentences?.length
        ? result.sentences
        : splitSentences(chunk)

    if (resetHighlight) {
      ttsSentencesRef.current = incoming
      setTtsSentences(incoming)
      ttsSentenceOffsetRef.current = 0
    } else {
      const next = [
        ...ttsSentencesRef.current,
        ...incoming,
      ]

      ttsSentenceOffsetRef.current =
        ttsSentencesRef.current.length

      ttsSentencesRef.current = next
      setTtsSentences(next)
    }

    ttsTimepointsRef.current =
      result.timepoints || []

    setTtsTimepoints(
      result.timepoints || [],
    )

    setTtsPageLoaded(p)
    ttsPageLoadedRef.current = p

    setTtsSynthVoice(voice)

    const startIdx = resetHighlight
      ? 0
      : ttsSentenceOffsetRef.current

    ttsActiveSentenceRef.current =
      startIdx

    setTtsActiveSentence(startIdx)

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
        scrollToActiveSentence(
          p,
          startIdx,
          true,
        )

        requestAnimationFrame(() =>
          scrollToActiveSentence(
            p,
            startIdx,
            true,
          ),
        )
      })
    }
  }

  async function playChunk(
    p: number,
    voice: string,
    chunk: string,
    resetHighlight: boolean,
    gen: number,
  ) {
    const result =
      await synthesizePage(
        bookId || '',
        p,
        voice,
        chunk,
      )

    if (gen !== ttsGenRef.current) return

    if (
      (result as TtsResultLike).usage
    ) {
      ingestUsage(
        (result as TtsResultLike).usage,
      )
    }

    void refreshUsageAggressively()

    prefetchArmedRef.current = false

    await applyAudioResult(
      p,
      voice,
      chunk,
      result,
      resetHighlight,
      gen,
    )
  }

  async function prefetchNextPage(
    fromPage: number,
    voice: string,
    gen: number,
  ) {
    const last =
      totalRef.current ||
      maxPagesRef.current

    const nextPage = fromPage + 1

    if (!nextPage || nextPage > last) return

    const raw =
      (await waitForPageText(nextPage)) ||
      pagesRef.current[nextPage] ||
      ''

    if (
      !raw ||
      gen !== ttsGenRef.current
    ) {
      return
    }

    const chunks =
      splitForTts(
        withPageCue(
          nextPage,
          raw,
        ),
      )

    if (!chunks.length) return

    try {
      const result =
        await synthesizePage(
          bookId || '',
          nextPage,
          voice,
          chunks[0],
        )

      if (
        gen !== ttsGenRef.current
      ) {
        return
      }

      prefetchRef.current = {
        page: nextPage,
        voice,
        chunks,
        first: {
          token: result.token,
          sentences:
            result.sentences ||
            splitSentences(chunks[0]),
          timepoints:
            result.timepoints || [],
        },
      }
    } catch {
      // next page will synthesize live
    }
  }

  async function playRobotReader(
    targetPage?: number,
    opts?: {
      force?: boolean
      voice?: string
      text?: string
      silentBusy?: boolean
    },
  ) {
    if (
      ttsBusyRef.current &&
      !opts?.force
    ) {
      return
    }

    const allowed = await ensureTtsAvailable()

    if (!allowed) return

    const p =
      targetPage ??
      pageRef.current

    const voice =
      opts?.voice ??
      ttsVoiceRef.current

    const rawText =
      opts?.text ||
      (await waitForPageText(p)) ||
      pagesRef.current[p]

    if (!rawText) {
      setTtsError(
        'This page has not finished loading yet.',
      )
      return
    }

    const text =
      withPageCue(
        p,
        rawText,
      )

    setTtsError('')

    const a =
      ttsAudioRef.current

    const canResume =
      !opts?.force &&
      !opts?.text &&
      ttsPageLoadedRef.current === p &&
      ttsSynthVoice === voice &&
      !!a?.src

    if (canResume && a) {
      a.playbackRate =
        ttsRateRef.current

      void a.play()

      ttsPlayingRef.current = true
      setTtsPlaying(true)

      startFollowLoop()

      return
    }

    const cached =
      prefetchRef.current

    const useCache =
      cached &&
      cached.page === p &&
      cached.voice === voice &&
      cached.first &&
      !opts?.text

    const chunks =
      useCache
        ? cached.chunks
        : splitForTts(text)

    if (!chunks.length) {
      setTtsError(
        'This page has no readable text.',
      )
      return
    }

    const gen =
      ++ttsGenRef.current

    ttsChunksRef.current = chunks
    ttsChunkIndexRef.current = 0
    ttsSentenceOffsetRef.current = 0

    if (
      !opts?.silentBusy &&
      !useCache
    ) {
      ttsBusyRef.current = true
      setTtsBusy(true)
    }

    try {
      if (
        useCache &&
        cached.first
      ) {
        prefetchRef.current = null

        await applyAudioResult(
          p,
          voice,
          chunks[0],
          cached.first,
          true,
          gen,
        )
      } else {
        await playChunk(
          p,
          voice,
          chunks[0],
          true,
          gen,
        )
      }

      if (
        gen ===
        ttsGenRef.current
      ) {
        lockPageFromScroll(1200)

        requestAnimationFrame(() => {
          document
            .getElementById(
              `read-page-${p}`,
            )
            ?.scrollIntoView({
              block: 'start',
            })
        })

        void prefetchNextPage(
          p,
          voice,
          gen,
        )
      }
    } catch (err: unknown) {
      if (
        gen !==
        ttsGenRef.current
      ) {
        return
      }

      if (err instanceof TtsError) {
        ingestUsage(err.usage)

        if (
          err.creditsRequired ||
          err.proRequired
        ) {
          setCreditsOpen(true)
        }
      }

      const msg =
        err instanceof TtsError
          ? err.message
          : 'Could not read this page aloud. Try again.'

      const tooBig =
        /too large|too long|limit|exceed/i.test(
          msg,
        )

      if (
        tooBig &&
        chunks[0].length > 800
      ) {
        const smaller =
          splitForTts(
            chunks[0],
            Math.max(
              800,
              Math.floor(
                chunks[0].length / 2,
              ),
            ),
          )

        ttsChunksRef.current = [
          ...smaller.slice(1),
          ...chunks.slice(1),
        ]

        ttsChunkIndexRef.current = 0

        try {
          await playChunk(
            p,
            voice,
            smaller[0],
            true,
            gen,
          )
        } catch (
          err2: unknown
        ) {
          setTtsError(
            err2 instanceof TtsError
              ? err2.message
              : 'Could not read this page aloud. Try again.',
          )
        }
      } else {
        setTtsError(msg)
      }
    }

    if (
      gen ===
      ttsGenRef.current
    ) {
      ttsBusyRef.current = false
      setTtsBusy(false)
    }
  }

  async function startFromSentence(
    pageNum: number,
    sentenceIndex: number,
  ) {
    const allowed =
      await ensureTtsAvailable()

    if (!allowed) return

    const raw =
      (await waitForPageText(
        pageNum,
      )) ||
      pagesRef.current[pageNum] ||
      ''

    const sentences =
      ttsPageLoadedRef.current ===
        pageNum &&
      ttsSentencesRef.current.length
        ? ttsSentencesRef.current
        : splitSentences(raw)

    if (!sentences.length) {
      setTtsError(
        'This page has no readable text.',
      )
      return
    }

    const from = Math.max(
      0,
      Math.min(
        sentences.length - 1,
        sentenceIndex,
      ),
    )

    const remaining =
      sentences
        .slice(from)
        .join(' ')

    ttsGenRef.current += 1

    stopAudio()

    ttsBusyRef.current = false
    setTtsBusy(false)

    setTtsError('')

    await gotoPage(pageNum)

    setTtsPanelOpen(true)

    await playRobotReader(
      pageNum,
      {
        force: true,
        text: remaining,
      },
    )
  }

  async function continueTtsAfterAudioEnds() {
    const gen =
      ttsGenRef.current

    const chunks =
      ttsChunksRef.current

    const nextChunk =
      ttsChunkIndexRef.current + 1

    const current =
      ttsPageLoadedRef.current ??
      pageRef.current

    const voice =
      ttsVoiceRef.current

    if (
      nextChunk <
      chunks.length
    ) {
      ttsChunkIndexRef.current =
        nextChunk

      ttsBusyRef.current = true
      setTtsBusy(true)

      try {
        await playChunk(
          current,
          voice,
          chunks[nextChunk],
          false,
          gen,
        )
      } catch (err: unknown) {
        if (
          gen ===
          ttsGenRef.current
        ) {
          setTtsError(
            err instanceof TtsError
              ? err.message
              : 'Could not continue reading this page.',
          )

          setTtsPlaying(false)
          stopFollowLoop()
        }
      }

      if (
        gen ===
        ttsGenRef.current
      ) {
        ttsBusyRef.current = false
        setTtsBusy(false)
      }

      return
    }

    const last =
      totalRef.current ||
      maxPagesRef.current

    if (current < last) {
      const nextPage =
        current + 1

      void gotoPage(nextPage)

      await playRobotReader(
        nextPage,
        {
          force: true,
          silentBusy: true,
        },
      )
    } else {
      setTtsPlaying(false)
      ttsPlayingRef.current = false
      setUsageNotice('')

      stopFollowLoop()

      setTtsActiveSentence(-1)
      ttsActiveSentenceRef.current = -1

      lastScrolledSentence.current = -1

      ttsChunksRef.current = []
      ttsChunkIndexRef.current = 0
    }
  }

  async function toggleRobotReader() {
    const a =
      ttsAudioRef.current

    if (
      ttsPlayingRef.current &&
      a
    ) {
      a.pause()

      setTtsPlaying(false)
      ttsPlayingRef.current = false
      setUsageNotice('')

      stopFollowLoop()

      return
    }

    const allowed =
      await ensureTtsAvailable()

    if (!allowed) return

    await playRobotReader()
  }

  function changeVoice(
    newVoice: string,
  ) {
    if (
      newVoice ===
      ttsVoiceRef.current
    ) {
      return
    }

    setTtsVoice(newVoice)
    ttsVoiceRef.current =
      newVoice

    if (
      ttsPlayingRef.current ||
      ttsAudioRef.current?.src
    ) {
      ttsAudioRef.current?.pause()

      setTimeout(() => {
        void playRobotReader(
          pageRef.current,
          {
            force: true,
            voice: newVoice,
          },
        )
      }, 80)
    }
  }

  function onTtsTimeUpdate() {
    syncHighlight(false)

    const a =
      ttsAudioRef.current

    if (
      !a ||
      prefetchArmedRef.current
    ) {
      return
    }

    const dur = a.duration

    if (
      !Number.isFinite(dur) ||
      dur <= 0
    ) {
      return
    }

    if (
      a.currentTime / dur >=
      0.28
    ) {
      prefetchArmedRef.current =
        true

      const p =
        ttsPageLoadedRef.current ??
        pageRef.current

      void prefetchNextPage(
        p,
        ttsVoiceRef.current,
        ttsGenRef.current,
      )
    }
  }

  async function refreshCreditQuote(
    amount: string,
  ) {
    const q =
      await quoteTtsCredits(
        amount,
      )

    if (q) {
      setCreditQuote(q)

      if (!amount) {
        setCreditAmount(
          String(q.min_kes ?? q.amount ?? ''),
        )
      }
    }
  }

  function onCreditAmountChange(
    value: string,
  ) {
    setCreditAmount(value)

    if (creditQuoteTimerRef.current) {
      window.clearTimeout(creditQuoteTimerRef.current)
    }

    creditQuoteTimerRef.current = window.setTimeout(() => {
      void refreshCreditQuote(value)
    }, 250)
  }

  async function startCreditCheckout() {
    setCreditError('')

    if (!loggedIn) {
      setCreditError(
        'Log in to buy credits.',
      )
      return
    }

    const amount =
      creditAmount ||
      creditQuote?.amount ||
      creditQuote?.min_kes ||
      ''

    if (!amount) {
      setCreditError(
        'Enter an amount.',
      )
      return
    }

    setCreditBusy(true)

    try {
      const q =
        await quoteTtsCredits(
          amount,
        )

      if (q) {
        setCreditQuote(q)
      }

      try {
        sessionStorage.setItem(
          'plugyard-return',
          nextPath,
        )
      } catch {
        // ignore
      }

      const res =
        await buyTtsCredits(
          amount,
          nextPath,
        )

      window.location.href =
        res.checkout_url
    } catch (err: unknown) {
      setCreditError(
        err instanceof Error
          ? err.message
          : 'Could not start checkout.',
      )

      setCreditBusy(false)
    }
  }

  function renderClickablePage(
    pageNum: number,
    text: string,
  ) {
    const sentences =
      splitSentences(text)

    if (!sentences.length) {
      return (
        <p
          className="font-semibold leading-relaxed text-black"
          style={{
            fontSize: `${fontSize}px`,
          }}
        >
          {text ||
            (pageNum <= page + AHEAD
              ? 'Loading page…'
              : '')}
        </p>
      )
    }

    return (
      <p
        className="font-semibold leading-relaxed text-black"
        style={{
          fontSize: `${fontSize}px`,
        }}
      >
        {sentences.map(
          (s: string, i: number) => (
            <span
              key={i}
              role="button"
              tabIndex={0}
              title="Start robot reader from here"
              onClick={() =>
                void startFromSentence(
                  pageNum,
                  i,
                )
              }
              onKeyDown={(
                e: KeyboardEvent<HTMLSpanElement>,
              ) => {
                if (
                  e.key === 'Enter' ||
                  e.key === ' '
                ) {
                  e.preventDefault()

                  void startFromSentence(
                    pageNum,
                    i,
                  )
                }
              }}
              className="cursor-pointer rounded px-0.5 hover:bg-[#f591ac]/25"
            >
              {s}{' '}
            </span>
          ),
        )}
      </p>
    )
  }

  function renderSentences(
    pageNum: number,
    idPrefix:
      | 'tts-sentence'
      | 'pip-tts-sentence',
  ) {
    return (
      <p
        className="font-semibold leading-relaxed text-black"
        style={{
          fontSize: `${fontSize}px`,
        }}
      >
        {ttsSentences.map(
          (s: string, i: number) => (
            <span
              key={i}
              id={`${idPrefix}-${pageNum}-${i}`}
              role="button"
              tabIndex={0}
              title="Start robot reader from here"
              onClick={() =>
                void startFromSentence(
                  pageNum,
                  i,
                )
              }
              onKeyDown={(
                e: KeyboardEvent<HTMLSpanElement>,
              ) => {
                if (
                  e.key === 'Enter' ||
                  e.key === ' '
                ) {
                  e.preventDefault()

                  void startFromSentence(
                    pageNum,
                    i,
                  )
                }
              }}
              className={
                i ===
                ttsActiveSentence
                  ? 'cursor-pointer rounded bg-[#f591ac]/50 px-0.5 transition-colors'
                  : 'cursor-pointer rounded px-0.5 transition-colors hover:bg-[#f591ac]/20'
              }
            >
              {s}{' '}
            </span>
          ),
        )}
      </p>
    )
  }

  function renderPipPane(
    opts?: { floating?: boolean },
  ) {
    const voiceOptions =
      ttsVoices.length
        ? ttsVoices
        : FALLBACK_VOICES

    const maxPages =
      total ||
      maxPagesRef.current

    const visiblePipPage =
      ttsPageLoaded ?? page

    const pipPageText =
      pages[visiblePipPage] ||
      pagesRef.current[
        visiblePipPage
      ] ||
      'Loading page…'

    return (
      <div
        className="flex h-full min-h-0 w-full flex-col bg-[#f4efe4] text-black"
        style={{
          fontFamily: 'inherit',
          height: '100%',
          minHeight: 0,
        }}
      >
        <div
          className={`shrink-0 border-b border-black/10 px-3 py-2 ${
            opts?.floating
              ? 'cursor-grab active:cursor-grabbing touch-none'
              : ''
          }`}
          onPointerDown={
            opts?.floating
              ? onPipDragStart
              : undefined
          }
          onPointerMove={
            opts?.floating
              ? onPipDragMove
              : undefined
          }
          onPointerUp={
            opts?.floating
              ? onPipDragEnd
              : undefined
          }
          onPointerCancel={
            opts?.floating
              ? onPipDragEnd
              : undefined
          }
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-black/60">
              Page {visiblePipPage} /{' '}
              {total || '—'}
            </span>

            {opts?.floating ? (
              <button
                type="button"
                onClick={() =>
                  setInAppPip(false)
                }
                className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-bold text-black"
              >
                Close
              </button>
            ) : null}
          </div>

          {opts?.floating ? (
            <p className="mt-0.5 text-[10px] font-semibold text-black/40">
              {phonePip
                ? 'Phone pop-out stays on this page'
                : 'Drag this bar to move'}
            </p>
          ) : null}
        </div>

        {readerMessage ? (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-2">
            <p className="text-[11px] font-semibold leading-snug text-red-700">
              {readerMessage}
            </p>
          </div>
        ) : null}

        <div
          ref={(
            node: HTMLDivElement | null,
          ) => {
            pipScrollRef.current =
              node
          }}
          className="min-h-0 flex-1 overflow-auto px-4 py-3"
        >
          <div className="pb-24">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-black/40">
              Current: Page{' '}
              {visiblePipPage}
            </p>

            {ttsPageLoaded ===
              visiblePipPage &&
            ttsSentences.length > 0 ? (
              renderSentences(
                visiblePipPage,
                'pip-tts-sentence',
              )
            ) : (
              <p
                className="font-semibold leading-relaxed text-black"
                style={{
                  fontSize: `${fontSize}px`,
                }}
              >
                {pipPageText}
              </p>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 shrink-0 space-y-2 border-t border-black/10 bg-[#efe8d8] p-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-black/10 px-1 py-0.5">
              <button
                type="button"
                onClick={() => {
                  fontTouchedRef.current =
                    true

                  setFontSize(
                    (n: number) =>
                      Math.max(
                        6,
                        n - 2,
                      ),
                  )
                }}
                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-black"
                aria-label="Decrease text size"
              >
                A−
              </button>

              <span className="min-w-[2.5rem] text-center text-[10px] font-bold text-black/60">
                {fontSize}px
              </span>

              <button
                type="button"
                onClick={() => {
                  fontTouchedRef.current =
                    true

                  setFontSize(
                    (n: number) =>
                      Math.min(
                        40,
                        n + 2,
                      ),
                  )
                }}
                className="rounded-full px-2 py-0.5 text-[10px] font-bold text-black"
                aria-label="Increase text size"
              >
                A+
              </button>
            </div>

            <select
              value={ttsVoice}
              onChange={(
                e: ChangeEvent<HTMLSelectElement>,
              ) =>
                changeVoice(
                  e.target.value,
                )
              }
              className="h-7 min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2 text-xs text-black"
            >
              {voiceOptions.map(
                (v: TtsVoice) => (
                  <option
                    key={v.id}
                    value={v.id}
                  >
                    {v.label}
                  </option>
                ),
              )}
            </select>

            <button
              type="button"
              onClick={() =>
                void toggleRobotReader()
              }
              disabled={ttsBusy}
              className="flex h-7 items-center gap-1 rounded-full bg-[#f591ac] px-2.5 text-xs font-bold text-[#141a32] disabled:opacity-50"
            >
              {ttsBusy
                ? 'Loading…'
                : ttsPlaying
                  ? '⏸ Pause'
                  : '▶ Play'}
            </button>

            <div className="flex items-center gap-1">
              {[0.75, 1, 1.25, 1.5].map(
                (r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setTtsRate(r)

                      if (
                        ttsAudioRef.current
                      ) {
                        ttsAudioRef.current.playbackRate =
                          r
                      }
                    }}
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      ttsRate === r
                        ? 'bg-black text-white'
                        : 'bg-black/10 text-black'
                    }`}
                  >
                    {r}×
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                void gotoPageAndRead(
                  page - 1,
                )
              }
              disabled={
                page <= 1 ||
                ttsBusy
              }
              className="h-8 flex-1 rounded-full bg-black/10 px-2.5 text-xs font-bold text-black disabled:opacity-40"
            >
              ← Prev
            </button>

            <button
              type="button"
              onClick={() =>
                void gotoPageAndRead(
                  page + 1,
                )
              }
              disabled={
                (maxPages > 0 &&
                  page >=
                    maxPages) ||
                ttsBusy
              }
              className="h-8 flex-1 rounded-full bg-black/10 px-2.5 text-xs font-bold text-black disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    )
  }

  const voiceOptions =
    ttsVoices.length
      ? ttsVoices
      : FALLBACK_VOICES

  const numbers = Array.from(
    { length: total },
    (_, i) => i + 1,
  )

  const creditChars =
    ttsUsage?.credit_chars ?? 0

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-[#f4efe4]"
      onContextMenu={(
        e: MouseEvent,
      ) => e.preventDefault()}
      onCopy={(
        e: ClipboardEvent,
      ) => e.preventDefault()}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-black/10 bg-[#efe8d8] px-2 py-2">
        <button
          type="button"
          onClick={() => {
            fontTouchedRef.current =
              true

            setFontSize(
              (n: number) =>
                Math.max(6, n - 2),
            )
          }}
          className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black"
        >
          A−
        </button>

        <span className="min-w-[3.5rem] text-center text-xs font-semibold text-black/60">
          {fontSize}px
        </span>

        <button
          type="button"
          onClick={() => {
            fontTouchedRef.current =
              true

            setFontSize(
              (n: number) =>
                Math.min(40, n + 2),
            )
          }}
          className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black"
        >
          A+
        </button>

        <span className="text-xs font-semibold text-black/60">
          {page} / {total || '—'}
        </span>

        <button
          type="button"
          onClick={markHere}
          className="rounded-full bg-[#f591ac] px-3 py-1 text-sm font-bold text-[#141a32]"
        >
          Mark page {page}
        </button>

        {marked > 0 && (
          <button
            type="button"
            onClick={() =>
              void goToMark()
            }
            className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black"
          >
            Go to mark ({marked})
          </button>
        )}

        <button
          type="button"
          onClick={togglePopOut}
          className={`rounded-full px-3 py-1 text-sm font-bold ${
            pipOpen
              ? 'bg-[#f591ac] text-[#141a32]'
              : 'bg-black/10 text-black'
          }`}
        >
          {!isPro && '🔒 '}
          Pop out
          {!isPro && ' · PRO'}
        </button>

        <button
          type="button"
          onClick={async () => {
            const allowed =
              await ensureTtsAvailable()

            if (!allowed) return

            setTtsPanelOpen(
              (v: boolean) => !v,
            )
          }}
          className={`rounded-full px-3 py-1 text-sm font-bold ${
            ttsPanelOpen
              ? 'bg-[#f591ac] text-[#141a32]'
              : 'bg-black/10 text-black'
          }`}
        >
          {!isPro &&
            !creditChars &&
            '🔒 '}

          🔊 Robot reader
        </button>

        <button
          type="button"
          onClick={() => {
            setCreditsOpen(true)
            void refreshCreditQuote(
              creditAmount,
            )
          }}
          className="rounded-full bg-black/10 px-3 py-1 text-sm font-bold text-black"
        >
          Buy credits
        </button>
      </div>

      <audio
        ref={ttsAudioRef}
        onTimeUpdate={
          onTtsTimeUpdate
        }
        onPlay={() => {
          setTtsPlaying(true)
          ttsPlayingRef.current = true
          startFollowLoop()
        }}
        onPause={() => {
          setTtsPlaying(false)
          ttsPlayingRef.current = false
          setUsageNotice('')
          stopFollowLoop()
        }}
        onEnded={() =>
          void continueTtsAfterAudioEnds()
        }
        onError={() =>
          setTtsError(
            'Could not play the generated audio.',
          )
        }
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
      />

      {canUseTts &&
      ttsPanelOpen && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-black/10 bg-[#efe8d8] px-3 py-2">
          <select
            value={ttsVoice}
            onChange={(
              e: ChangeEvent<HTMLSelectElement>,
            ) =>
              changeVoice(
                e.target.value,
              )
            }
            className="h-8 rounded-lg border border-black/15 bg-white px-2 text-sm text-black"
          >
            {voiceOptions.map(
              (v: TtsVoice) => (
                <option
                  key={v.id}
                  value={v.id}
                >
                  {v.label}
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            onClick={() =>
              void toggleRobotReader()
            }
            disabled={ttsBusy}
            className="flex h-8 items-center gap-1.5 rounded-full bg-[#f591ac] px-3 text-sm font-bold text-[#141a32] disabled:opacity-50"
          >
            {ttsBusy
              ? 'Loading…'
              : ttsPlaying
                ? '⏸ Pause'
                : '▶ Play page'}
          </button>

          <div className="flex items-center gap-1">
            {[0.75, 1, 1.25, 1.5].map(
              (r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setTtsRate(r)

                    if (
                      ttsAudioRef.current
                    ) {
                      ttsAudioRef.current.playbackRate =
                        r
                    }
                  }}
                  className={`rounded-full px-2 py-1 text-xs font-bold ${
                    ttsRate === r
                      ? 'bg-black text-white'
                      : 'bg-black/10 text-black'
                  }`}
                >
                  {r}×
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {readerMessage ? (
        <p className="px-4 pt-2 text-center text-[12px] font-semibold text-red-600">
          {readerMessage}
        </p>
      ) : null}

      {canUseTts ? (
        <p className="px-4 pt-2 text-center text-[12px] text-black/55">
          Tap any sentence to start
          the robot reader from there.
        </p>
      ) : null}

      {previewPages ? (
        <p className="px-4 py-2 text-center text-[12px] text-black/55">
          Sneak peek — {previewPages}{' '}
          pages. Buy to unlock the rest.
        </p>
      ) : null}

      {obscured && (
        <div className="pointer-events-none absolute inset-0 z-40 bg-[#f4efe4]/95 backdrop-blur-2xl" />
      )}

      {watermark && (
        <div className="pointer-events-none absolute inset-0 z-30 select-none overflow-hidden opacity-[0.08]">
          <div
            className="absolute inset-[-50%] grid grid-cols-3 gap-16 rotate-[-24deg] text-[13px] font-bold uppercase tracking-widest text-black"
            aria-hidden
          >
            {Array.from(
              { length: 60 },
              (_, i) => (
                <span
                  key={i}
                  className="whitespace-nowrap"
                >
                  {watermark}
                </span>
              ),
            )}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 select-none overflow-auto"
      >
        {status ? (
          <p className="p-6 text-sm font-semibold text-black/50">
            {status}
          </p>
        ) : null}

        {resumeAt > 1 ? (
          <p className="px-4 pt-4 text-center text-[13px] font-semibold text-[#c45b78]">
            Continuing from page{' '}
            {resumeAt}
            {loggedIn
              ? ' · synced to your account'
              : ''}
          </p>
        ) : null}

        {!loggedIn ? (
          <p className="px-4 pt-3 text-center text-[13px] text-black/60">
            Your place is saved on
            this phone only.{' '}
            <Link
              href={loginHref}
              className="font-semibold text-[#c45b78] underline"
            >
              Log in
            </Link>
            {' · '}
            <Link
              href={signupHref}
              className="font-semibold text-[#c45b78] underline"
            >
              Create account
            </Link>
          </p>
        ) : (
          <p className="px-4 pt-3 text-center text-[12px] text-black/55">
            Your page syncs to this
            account.
          </p>
        )}

        <article className="mx-auto max-w-2xl px-4 py-6">
          {numbers.map((n) => (
            <section
              key={n}
              id={`read-page-${n}`}
              className="mb-10 min-h-[8rem]"
            >
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-black/40">
                Page {n}
              </p>

              {ttsPageLoaded === n &&
              ttsSentences.length > 0
                ? renderSentences(
                    n,
                    'tts-sentence',
                  )
                : renderClickablePage(
                    n,
                    pages[n] || '',
                  )}
            </section>
          ))}
        </article>
      </div>

      {pipWindow &&
        createPortal(
          renderPipPane(),
          pipWindow.document.body,
        )}

      {inAppPip &&
        typeof document !==
          'undefined' &&
        createPortal(
          phonePip ? (
            <div
              className="fixed inset-x-0 bottom-0 z-[9999] flex flex-col overflow-hidden rounded-t-2xl border border-black/15 bg-[#f4efe4] shadow-2xl"
              style={{
                height:
                  'min(72vh, 520px)',
                paddingBottom:
                  'env(safe-area-inset-bottom)',
              }}
            >
              {renderPipPane({
                floating: true,
              })}
            </div>
          ) : (
            <div
              className="fixed z-[9999] overflow-hidden rounded-2xl border border-black/15 bg-[#f4efe4] shadow-2xl"
              style={{
                left: pipPos.x,
                top: pipPos.y,
                width: Math.min(
                  360,
                  typeof window !==
                    'undefined'
                    ? window.innerWidth -
                        16
                    : 360,
                ),
                height: Math.min(
                  460,
                  typeof window !==
                    'undefined'
                    ? Math.round(
                        window.innerHeight *
                          0.62,
                      )
                    : 420,
                ),
              }}
            >
              {renderPipPane({
                floating: true,
              })}
            </div>
          ),
          document.body,
        )}

      {creditsOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-[#f4efe4] p-4 shadow-2xl">
            <p className="text-sm font-bold text-black">
              Buy robot-reader credits
            </p>

            <p className="mt-1 text-sm font-bold text-black">
              KES{' '}
              {creditAmount ||
                creditQuote?.amount ||
                creditQuote?.min_kes ||
                '—'}{' '}
              gives you{' '}
              {estimatedCreditChars != null
                ? estimatedCreditChars.toLocaleString()
                : '—'}{' '}
              characters
            </p>

            <p className="mt-1 text-[12px] text-black/60">
              Pay at least KES{' '}
              {creditQuote?.min_kes ||
                '—'}{' '}
              to add robot-reader
              credits.
              {creditQuote?.volume_bonus_percent
                ? ` · ${creditQuote.volume_bonus_percent}% extra if you pay 2× the minimum`
                : ''}
            </p>

            <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-black/50">
              Amount (KES)
            </label>

            <input
              type="number"
              min={
                creditQuote?.min_kes ||
                0
              }
              value={creditAmount}
              onChange={(
                e: ChangeEvent<HTMLInputElement>,
              ) => {
                onCreditAmountChange(
                  e.target.value,
                )
              }}
              className="mt-1 h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm text-black"
            />

            <p className="mt-2 text-sm font-semibold text-black">
              Your purchased robot-reader
              credit balance will update
              automatically after payment.
            </p>

            {creditError ? (
              <p className="mt-2 text-[12px] font-semibold text-red-600">
                {creditError}
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setCreditsOpen(false)
                }
                className="h-10 flex-1 rounded-full bg-black/10 text-sm font-bold text-black"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() =>
                  void startCreditCheckout()
                }
                disabled={creditBusy}
                className="h-10 flex-1 rounded-full bg-[#f591ac] text-sm font-bold text-[#141a32] disabled:opacity-50"
              >
                {creditBusy
                  ? 'Opening pay…'
                  : 'Pay now'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ProGateModal
        open={proGate !== null}
        onClose={() =>
          setProGate(null)
        }
        feature={
          proGate === 'pip'
            ? 'Floating pop-out reader'
            : 'Robot reader'
        }
        benefit={
          proGate === 'pip'
            ? 'Keep this page floating above other tabs and windows while you work.'
            : 'Have any page read aloud with natural narration, auto-scroll, and sentence highlighting.'
        }
      />
    </div>
  )
}