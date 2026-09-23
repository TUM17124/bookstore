'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { getToken } from '@/lib/api'
import {
  getAudioProgress,
  saveAudioProgress,
  getAudioNotes,
  addAudioNote,
  deleteAudioNote,
  getProStatus,
} from '@/lib/api'
import { usePictureInPicture } from '@/lib/pip'
import { ProGateModal } from '@/components/pro-gate-modal'

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function posKey(title: string) {
  return `plugyard-audio-pos:${title.trim().toLowerCase()}`
}

function pauseKey(title: string) {
  return `plugyard-audio-paused-at:${title.trim().toLowerCase()}`
}

function offlineKey(bookId: string) {
  return `plugyard-audio-offline:${bookId}`
}

const SLEEP_OPTS = [
  { label: 'Off', min: 0 },
  { label: '5 min', min: 5 },
  { label: '15 min', min: 15 },
  { label: '30 min', min: 30 },
  { label: '45 min', min: 45 },
  { label: '60 min', min: 60 },
]

const ROLLBACK_AFTER_MS = 2 * 60 * 1000
const ROLLBACK_SEC = 15

// How long audio can keep playing in a backgrounded/hidden tab before we
// auto-pause it as a data-saving safety net. There's no Media Session /
// lock-screen integration in this app today (confirmed: no `mediaSession`
// usage anywhere in the codebase), so background playback that happens is
// just default <audio> behavior, not a deliberate feature — this timeout
// exists purely to stop someone leaving it running for hours by accident.
const IDLE_BACKGROUND_TIMEOUT_MS = 45 * 60 * 1000

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
      <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
    </svg>
  )
}

function IconBack15() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8" aria-hidden>
      <path d="M11 5L5 12l6 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 5L13 12l6 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconFwd15() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.8" aria-hidden>
      <path d="M5 5l6 7-6 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 5l6 7-6 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('plugyard-audio', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function AudioPlayer({
  title,
  url,
  bookId,
  onClose,
  downloadable = true,
  watermark,
}: {
  title: string
  url: string
  bookId: string
  onClose: () => void
  downloadable?: boolean
  watermark?: string
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [obscured, setObscured] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [proGate, setProGate] = useState(false)
  const { pipWindow, supported: pipSupported, open: openPip, close: closePip } = usePictureInPicture('#0b1020')

  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    getProStatus()
      .then((s) => {
        if (!cancelled) setIsPro(s.is_pro)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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
    // pagehide fires reliably when the tab is closed or navigated away
    // from — including mobile Safari, where beforeunload is notoriously
    // unreliable — so this is the correct event to stop audio (and the
    // network activity that comes with it) the moment the page is gone,
    // rather than relying on component unmount alone.
    const onPageHide = () => {
      audioRef.current?.pause()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  const hiddenSinceRef = useRef<number | null>(null)

  useEffect(() => {
    // Safety net for background/lock-screen playback left running for
    // hours by accident. This is NOT "pause the instant the tab loses
    // focus" — that would break normal background listening, which is
    // expected behavior for an audio app. It only kicks in after a long,
    // continuous stretch in the background while audio is still playing.
    const onVisibility = () => {
      hiddenSinceRef.current = document.visibilityState === 'hidden' ? Date.now() : null
    }
    document.addEventListener('visibilitychange', onVisibility)

    const interval = window.setInterval(() => {
      const since = hiddenSinceRef.current
      const a = audioRef.current
      if (since && a && !a.paused && Date.now() - since > IDLE_BACKGROUND_TIMEOUT_MS) {
        a.pause()
        hiddenSinceRef.current = null
      }
    }, 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
    }
  }, [])
  const sleepEndRef = useRef(0)
  const sleepMinRef = useRef(0)
  const lastSleepMinRef = useRef(0)
  const lastSave = useRef(0)
  const restored = useRef(false)
  const seekingRef = useRef(false)
  const seekTarget = useRef(0)
  const lastShake = useRef(0)
  const lastMag = useRef(0)
  const loggedIn = !!getToken()

  const [status, setStatus] = useState('Buffering…')
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [rate, setRate] = useState(1)
  const [vol, setVol] = useState(1)
  const [sleepMin, setSleepMin] = useState(0)
  const [sleepLeft, setSleepLeft] = useState(0)
  const [sleepTick, setSleepTick] = useState(0)
  const [resumeAt, setResumeAt] = useState(0)
  const [noteText, setNoteText] = useState('')
  const [notes, setNotes] = useState<Array<{ id: number; position: number; note: string }>>([])
  const [savingNote, setSavingNote] = useState(false)
  const [offlineBusy, setOfflineBusy] = useState(false)
  const [offlineMsg, setOfflineMsg] = useState('')
  const [shakeMsg, setShakeMsg] = useState('')

  const nextPath =
    typeof window !== 'undefined'
      ? `/?book=${encodeURIComponent(bookId || '')}&view=listen`
      : '/'
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`
  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`

  function startSleep(minutes: number) {
    sleepMinRef.current = minutes
    setSleepMin(minutes)
    if (minutes <= 0) {
      lastSleepMinRef.current = 0
      sleepEndRef.current = 0
      setSleepLeft(0)
      setShakeMsg('Timer off. Shake will not start it.')
      return
    }
    lastSleepMinRef.current = minutes
    sleepEndRef.current = Date.now() + minutes * 60 * 1000
    setSleepTick((n) => n + 1)
    setShakeMsg('')
  }

  function restartSleep() {
    const minutes = sleepMinRef.current || lastSleepMinRef.current
    if (!minutes) {
      setShakeMsg('Timer is off. Pick a sleep time first.')
      return
    }
    startSleep(minutes)
    const a = audioRef.current
    if (a) void a.play()
    setShakeMsg(`Timer reset · ${minutes} min`)
  }

  function saveLocal(sec: number, length: number) {
    try {
      if (length > 0 && sec >= length - 3) {
        localStorage.removeItem(posKey(title))
        return
      }
      if (sec < 2) return
      localStorage.setItem(posKey(title), String(Math.floor(sec)))
    } catch {
      // ignore
    }
  }

  async function saveCloud(sec: number, length: number) {
    if (!loggedIn || !bookId) return
    try {
      await saveAudioProgress(bookId, sec, length)
    } catch {
      // ignore
    }
  }

  function readBuffer(audio: HTMLAudioElement) {
    try {
      if (audio.buffered.length) {
        setBuffered(audio.buffered.end(audio.buffered.length - 1))
      }
    } catch {
      // ignore
    }
  }

  function seek(sec: number) {
    const a = audioRef.current
    if (!a) return

    const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : dur
    let next = sec
    if (next < 0) next = 0
    if (d && next > d) next = Math.max(0, d - 0.25)

    seekingRef.current = true
    seekTarget.current = next
    restored.current = true
    setT(next)
    setStatus('')

    try {
      a.currentTime = next
    } catch {
      // ignore
    }

    saveLocal(next, d)
    window.setTimeout(() => {
      seekingRef.current = false
    }, 250)
  }

  useEffect(() => {
    restored.current = false
    seekingRef.current = false
    setReady(false)
    setStatus('Buffering…')
    setT(0)
    setDur(0)
    setBuffered(0)
  }, [url, title, bookId])

  useEffect(() => {
    if (!loggedIn || !bookId) return
    let cancelled = false
    getAudioNotes(bookId)
      .then((rows) => {
        if (!cancelled) setNotes(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [loggedIn, bookId])

  useEffect(() => {
    const a = audioRef.current
    if (a) a.playbackRate = rate
  }, [rate])

  useEffect(() => {
    const a = audioRef.current
    if (a) a.volume = vol
  }, [vol])

  useEffect(() => {
    if (!sleepMin || !sleepEndRef.current) {
      setSleepLeft(0)
      return
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((sleepEndRef.current - Date.now()) / 1000))
      setSleepLeft(left)
      if (left <= 0) {
        audioRef.current?.pause()
        sleepMinRef.current = 0
        setSleepMin(0)
        setShakeMsg('Timer ended. Shake or Reset to play and start it again.')
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [sleepMin, sleepTick])

  useEffect(() => {
    const onMotion = (e: DeviceMotionEvent) => {
      const minutes = sleepMinRef.current || lastSleepMinRef.current
      if (!minutes) return
      const g = e.accelerationIncludingGravity
      const acc = e.acceleration
      const x = acc?.x ?? g?.x ?? 0
      const y = acc?.y ?? g?.y ?? 0
      const z = acc?.z ?? g?.z ?? 0
      const mag = Math.sqrt(x * x + y * y + z * z)
      if (!lastMag.current) {
        lastMag.current = mag
        return
      }
      const delta = Math.abs(mag - lastMag.current)
      lastMag.current = mag
      if (delta < 8) return
      const now = Date.now()
      if (now - lastShake.current < 1500) return
      lastShake.current = now
      restartSleep()
      try {
        navigator.vibrate?.(80)
      } catch {
        // ignore
      }
    }
    window.addEventListener('devicemotion', onMotion, { passive: true })
    return () => window.removeEventListener('devicemotion', onMotion)
  }, [])

  async function enableShake() {
    try {
      const DM = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<string>
      }
      if (typeof DM.requestPermission === 'function') {
        const res = await DM.requestPermission()
        if (res !== 'granted') {
          setShakeMsg('Allow Motion & Orientation for this site, then try again.')
          return
        }
      }
      if (!(sleepMinRef.current || lastSleepMinRef.current)) {
        setShakeMsg('Shake is ready, but pick a sleep time first.')
        return
      }
      setShakeMsg('Shake is armed. Off turns shake off too.')
    } catch {
      setShakeMsg('This browser cannot read a shake. Use Reset timer.')
    }
  }

  async function onLoadedMetadata() {
    const a = audioRef.current
    if (!a) return
    setDur(Number.isFinite(a.duration) ? a.duration : 0)
    setReady(true)
    setStatus('')
    if (restored.current) return

    let saved = Number(localStorage.getItem(posKey(title)) || 0)
    if (loggedIn && bookId) {
      try {
        const cloud = await getAudioProgress(bookId)
        if (cloud.position > saved) saved = cloud.position
      } catch {
        // stay local
      }
    }
    const pausedAt = Number(localStorage.getItem(pauseKey(title)) || 0)
    if (pausedAt && Date.now() - pausedAt > ROLLBACK_AFTER_MS) {
      saved = Math.max(0, saved - ROLLBACK_SEC)
    }
    restored.current = true
    if (saved >= 3) {
      seekingRef.current = true
      a.currentTime = saved
      setT(saved)
      setResumeAt(saved)
      window.setTimeout(() => {
        seekingRef.current = false
      }, 250)
    }
  }

  function onTimeUpdate() {
    const a = audioRef.current
    if (!a) return
    if (seekingRef.current) {
      setT(seekTarget.current)
      return
    }
    setT(a.currentTime)
    setDur(Number.isFinite(a.duration) ? a.duration : 0)
    readBuffer(a)
    const now = Date.now()
    if (now - lastSave.current > 2500) {
      lastSave.current = now
      saveLocal(a.currentTime, a.duration || 0)
      void saveCloud(a.currentTime, a.duration || 0)
    }
  }

  function onSeeked() {
    const a = audioRef.current
    seekingRef.current = false
    if (!a) return
    setT(a.currentTime)
    setStatus('')
  }

  function onPause() {
    const a = audioRef.current
    setPlaying(false)
    try {
      localStorage.setItem(pauseKey(title), String(Date.now()))
    } catch {
      // ignore
    }
    if (a) {
      saveLocal(a.currentTime, a.duration || 0)
      void saveCloud(a.currentTime, a.duration || 0)
    }
  }

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }

  async function markMoment() {
    const a = audioRef.current
    if (!a || !loggedIn || savingNote) return
    setSavingNote(true)
    try {
      const row = await addAudioNote(bookId, a.currentTime, noteText.trim())
      setNotes((prev) => [...prev, row as { id: number; position: number; note: string }])
      setNoteText('')
    } catch {
      setShakeMsg('Could not save note. Try again.')
    }
    setSavingNote(false)
  }

  async function saveOffline() {
    if (offlineBusy) return
    setOfflineBusy(true)
    setOfflineMsg('Saving offline…')
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      const db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite')
        const req = tx.objectStore('files').put(buf, offlineKey(bookId))
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
      setOfflineMsg('Saved on this device.')
    } catch (err) {
      setOfflineMsg(
        err instanceof Error
          ? `Could not save offline (${err.message}).`
          : 'Could not save offline.',
      )
    }
    setOfflineBusy(false)
  }

  const span = dur || Math.max(t + 30, 30)
  const bufPct = Math.min(100, (buffered / span) * 100)
  const playPct = Math.min(100, (t / span) * 100)
  const hasSleepChoice = sleepMin > 0 || lastSleepMinRef.current > 0

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-[#0b1020] text-[#fdfbf4]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {obscured && (
        <div className="pointer-events-none absolute inset-0 z-40 bg-[#0b1020]/95 backdrop-blur-2xl" />
      )}
      {watermark && (
        <div className="pointer-events-none absolute inset-0 z-30 select-none overflow-hidden opacity-[0.06]">
          <div
            className="absolute inset-[-50%] grid grid-cols-2 gap-16 rotate-[-24deg] text-[13px] font-bold uppercase tracking-widest text-white"
            aria-hidden
          >
            {Array.from({ length: 40 }, (_, i) => (
              <span key={i} className="whitespace-nowrap">{watermark}</span>
            ))}
          </div>
        </div>
      )}
      <audio
        ref={audioRef}
        src={url.split('#')[0]}
        preload="metadata"
        onLoadedMetadata={() => void onLoadedMetadata()}
        onCanPlay={() => {
          setReady(true)
          setStatus('')
        }}
        onTimeUpdate={onTimeUpdate}
        onSeeked={onSeeked}
        onSeeking={() => {
          seekingRef.current = true
        }}
        onProgress={() => {
          if (audioRef.current) readBuffer(audioRef.current)
        }}
        onWaiting={() => {
          if (!seekingRef.current) setStatus('Buffering…')
        }}
        onPlaying={() => {
          setPlaying(true)
          setStatus('')
        }}
        onPlay={() => {
          setPlaying(true)
          setStatus('')
        }}
        onPause={onPause}
        onEnded={() => {
          setPlaying(false)
          try {
            localStorage.removeItem(posKey(title))
          } catch {
            // ignore
          }
        }}
        onError={() => setStatus('Could not load this audiobook.')}
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
      />

      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
          aria-label="Close player"
        >
          ×
        </button>
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold">{title}</h2>
        {pipSupported && (
          <button
            type="button"
            onClick={() => {
              if (!isPro) {
                setProGate(true)
                return
              }
              if (pipWindow) closePip()
              else void openPip({ width: 340, height: 200 })
            }}
            aria-label={pipWindow ? 'Close floating player' : 'Pop out as a floating player'}
            title={
              !isPro
                ? 'Pro feature — pop out as a floating player'
                : pipWindow
                  ? 'Close floating player'
                  : 'Keep playback controls floating above other windows'
            }
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              pipWindow ? 'bg-[#f591ac] text-[#141a32]' : 'text-white hover:bg-white/10'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8" aria-hidden>
              <rect x="3" y="5" width="14" height="11" rx="1.5" />
              <path d="M13 12.5h6v6h-6z" fill="currentColor" stroke="none" />
            </svg>
            {!isPro && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#d4af37] px-0.5 text-[8px] font-bold text-[#3a2e08]">
                🔒
              </span>
            )}
          </button>
        )}
      </header>

      {pipWindow &&
        createPortal(
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-[#fdfbf4]" style={{ fontFamily: 'inherit' }}>
            <p className="w-full truncate text-center text-[13px] font-bold">{title}</p>
            <div className="flex w-full items-center gap-3">
              <span className="w-10 shrink-0 text-right text-[11px] text-white/50">{fmt(t)}</span>
              <div className="relative h-1.5 flex-1">
                <div className="absolute inset-0 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="absolute inset-y-0 left-0 bg-[#f591ac]"
                    style={{ width: `${Math.min(100, (t / (dur || Math.max(t + 30, 30))) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="w-10 shrink-0 text-[11px] text-white/50">{dur ? fmt(dur) : '—'}</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => seek((audioRef.current?.currentTime || t) - 15)}
                aria-label="Back 15 seconds"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <IconBack15 />
              </button>
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? 'Pause' : 'Play'}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f591ac] text-[#141a32]"
              >
                {playing ? <IconPause /> : <IconPlay />}
              </button>
              <button
                type="button"
                onClick={() => seek((audioRef.current?.currentTime || t) + 15)}
                aria-label="Forward 15 seconds"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <IconFwd15 />
              </button>
            </div>
          </div>,
          pipWindow.document.body,
        )}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-6 overflow-y-auto px-6 py-6">
        {status && !ready ? (
          <p className="text-sm text-white/50">{status}</p>
        ) : (
          <>
            <div className="flex h-72 w-72 items-center justify-center rounded-[2.5rem] bg-[#141a32] text-[7.5rem] leading-none text-[#f591ac] ring-1 ring-white/10">
              ♪
            </div>

            {resumeAt > 0 ? (
              <p className="text-center text-[13px] text-[#f591ac]">
                Continuing from {fmt(resumeAt)}
                {loggedIn ? ' · synced to your account' : ''}
              </p>
            ) : null}

            {!loggedIn ? (
              <p className="max-w-md text-center text-[13px] text-white/60">
                Without an account this timestamp dies with the tab. Register
                so you can pause here and finish on another phone.{' '}
                <Link href={loginHref} className="font-semibold text-[#f591ac] underline">
                  Log in
                </Link>
                {' · '}
                <Link href={signupHref} className="font-semibold text-[#f591ac] underline">
                  Create account
                </Link>
              </p>
            ) : (
              <p className="max-w-md text-center text-[12px] text-white/45">
                Your place syncs to this account. Pause here, continue on another phone.
              </p>
            )}

            <div className="w-full max-w-md">
              <div className="relative h-2 w-full">
                <div className="absolute inset-0 overflow-hidden rounded-full bg-white/10">
                  <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${bufPct}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-[#f591ac]" style={{ width: `${playPct}%` }} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={span}
                  step={0.1}
                  value={t}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="absolute inset-0 z-10 m-0 h-2 w-full cursor-pointer appearance-none bg-transparent accent-[#f591ac]"
                />
              </div>
              <div className="mt-2 flex justify-between text-[12px] text-white/45">
                <span>{fmt(t)}</span>
                <span>{dur ? fmt(dur) : '—'}</span>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => seek((audioRef.current?.currentTime || t) - 15)}
                aria-label="Back 15 seconds"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <IconBack15 />
              </button>
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? 'Pause' : 'Play'}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f591ac] text-[#141a32]"
              >
                {playing ? <IconPause /> : <IconPlay />}
              </button>
              <button
                type="button"
                onClick={() => seek((audioRef.current?.currentTime || t) + 15)}
                aria-label="Forward 15 seconds"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <IconFwd15 />
              </button>
            </div>
            <p className="text-[11px] text-white/35">−15s · play/pause · +15s</p>

            <div className="w-full max-w-md">
              <p className="mb-1 text-center text-[12px] uppercase tracking-wider text-white/40">
                Volume {Math.round(vol * 100)}%
              </p>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={vol}
                onChange={(e) => setVol(Number(e.target.value))}
                className="w-full accent-[#f591ac]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRate(r)}
                  className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                    rate === r ? 'bg-[#f591ac] text-[#141a32]' : 'bg-white/10 text-white'
                  }`}
                >
                  {r}×
                </button>
              ))}
            </div>

            <div className="w-full max-w-md">
              <p className="mb-2 text-center text-[12px] uppercase tracking-wider text-white/40">
                Sleep timer
                {sleepLeft > 0 ? ` · ${fmt(sleepLeft)}` : ''}
              </p>

              <div className="mb-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void enableShake()}
                  className="rounded-full bg-white/10 px-3 py-2 text-[12px] font-semibold"
                >
                  Enable shake
                </button>
                <button
                  type="button"
                  onClick={restartSleep}
                  disabled={!hasSleepChoice}
                  className="rounded-full bg-[#f591ac] px-3 py-2 text-[12px] font-bold text-[#141a32] disabled:opacity-40"
                >
                  Reset timer
                </button>
              </div>

              {shakeMsg ? (
                <p className="mb-2 text-center text-[12px] text-[#f591ac]">{shakeMsg}</p>
              ) : (
                <p className="mb-2 text-center text-[11px] text-white/35">
                  Shake only works while a timer is on. Off disables shake.
                </p>
              )}

              <div className="flex flex-wrap justify-center gap-2">
                {SLEEP_OPTS.map((o) => (
                  <button
                    key={o.min}
                    type="button"
                    onClick={() => startSleep(o.min)}
                    className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                      sleepMin === o.min ? 'bg-[#f591ac] text-[#141a32]' : 'bg-white/10 text-white'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full max-w-md rounded-2xl border border-white/10 p-3">
              <p className="mb-2 text-[12px] uppercase tracking-wider text-white/40">
                Bookmark this moment
              </p>
              {loggedIn ? (
                <>
                  <div className="flex gap-2">
                    <input
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Optional note"
                      maxLength={280}
                      disabled={savingNote}
                      className="min-w-0 flex-1 rounded-full bg-white/10 px-3 py-2 text-sm outline-none disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={savingNote}
                      onClick={() => void markMoment()}
                      className="rounded-full bg-[#f591ac] px-3 py-2 text-sm font-bold text-[#141a32] disabled:opacity-60"
                    >
                      {savingNote ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {notes.map((n) => (
                      <li key={n.id} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          onClick={() => seek(n.position)}
                          className="text-[#f591ac]"
                        >
                          {fmt(n.position)}
                        </button>
                        <span className="min-w-0 flex-1 truncate text-white/70">{n.note}</span>
                        <button
                          type="button"
                          onClick={() => {
                            void deleteAudioNote(n.id)
                            setNotes((prev) => prev.filter((x) => x.id !== n.id))
                          }}
                          className="text-white/40"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[13px] text-white/50">
                  <Link href={loginHref} className="underline text-[#f591ac]">
                    Log in
                  </Link>
                  {' · '}
                  <Link href={signupHref} className="underline text-[#f591ac]">
                    Sign up
                  </Link>{' '}
                  to save notes across devices.
                </p>
              )}
            </div>

            {downloadable ? (
              <button
                type="button"
                disabled={offlineBusy}
                onClick={() => void saveOffline()}
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {offlineBusy ? 'Saving offline…' : 'Save offline on this device'}
              </button>
            ) : (
              <p className="text-center text-[12px] text-white/40">
                Offline saving is off for this audiobook.
              </p>
            )}
            {offlineMsg ? (
              <p className="text-center text-[12px] text-white/50">{offlineMsg}</p>
            ) : null}
          </>
        )}
      </div>
      <ProGateModal
        open={proGate}
        onClose={() => setProGate(false)}
        feature="Floating pop-out player"
        benefit="Keep playback controls floating above other tabs and windows while you listen."
      />
    </div>
  )
}