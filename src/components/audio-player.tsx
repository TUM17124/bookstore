'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getToken } from '@/lib/api'
import {
  getAudioProgress,
  saveAudioProgress,
  getAudioNotes,
  addAudioNote,
  deleteAudioNote,
} from '@/lib/api'

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

export function AudioPlayer({
  title,
  url,
  bookId,
  onClose,
}: {
  title: string
  url: string
  bookId: string
  onClose: () => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sleepRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSave = useRef(0)
  const restored = useRef(false)
  const tries = useRef(0)
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
  const [resumeAt, setResumeAt] = useState(0)
  const [noteText, setNoteText] = useState('')
  const [notes, setNotes] = useState<Array<{ id: number; position: number; note: string }>>([])
  const [offlineMsg, setOfflineMsg] = useState('')

  const nextPath =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/'
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`
  const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`

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

  function applyPosition(audio: HTMLAudioElement, saved: number) {
    if (restored.current || saved < 3) {
      restored.current = true
      return
    }
    const attempt = () => {
      if (restored.current || tries.current > 24) return
      tries.current += 1
      try {
        audio.currentTime = saved
      } catch {
        // not seekable yet
      }
      if (Math.abs(audio.currentTime - saved) <= 1.5) {
        restored.current = true
        setT(audio.currentTime)
        setResumeAt(saved)
        return
      }
      window.setTimeout(attempt, 300)
    }
    setResumeAt(saved)
    attempt()
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

  useEffect(() => {
    let cancelled = false
    restored.current = false
    tries.current = 0
    const audio = new Audio()
    audioRef.current = audio
    audio.preload = 'auto'
    audio.volume = vol
    audio.src = url

    const startRestore = async () => {
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
      if (!cancelled) applyPosition(audio, saved)
    }

    const onProgress = () => readBuffer(audio)
    const onWaiting = () => {
      if (!cancelled) setStatus('Buffering…')
    }
    const onCanPlay = () => {
      if (cancelled) return
      void startRestore()
      setStatus('')
      setReady(true)
    }
    const onTime = () => {
      setT(audio.currentTime)
      setDur(Number.isFinite(audio.duration) ? audio.duration : 0)
      readBuffer(audio)
      const now = Date.now()
      if (now - lastSave.current > 2500) {
        lastSave.current = now
        saveLocal(audio.currentTime, audio.duration || 0)
        void saveCloud(audio.currentTime, audio.duration || 0)
      }
    }
    const onMeta = () => {
      setDur(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    const onPlay = () => {
      setPlaying(true)
      setStatus('')
    }
    const onPause = () => {
      setPlaying(false)
      try {
        localStorage.setItem(pauseKey(title), String(Date.now()))
      } catch {
        // ignore
      }
      saveLocal(audio.currentTime, audio.duration || 0)
      void saveCloud(audio.currentTime, audio.duration || 0)
    }
    const onEnd = () => {
      setPlaying(false)
      try {
        localStorage.removeItem(posKey(title))
      } catch {
        // ignore
      }
    }
    const onErr = () => {
      if (!cancelled) setStatus('Could not load this audiobook.')
    }

    audio.addEventListener('progress', onProgress)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('loadeddata', onCanPlay)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('error', onErr)

    const onHide = () => {
      saveLocal(audio.currentTime, audio.duration || 0)
      void saveCloud(audio.currentTime, audio.duration || 0)
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)

    if (loggedIn && bookId) {
      getAudioNotes(bookId)
        .then((rows) => {
          if (!cancelled) setNotes(rows)
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
      saveLocal(audio.currentTime, audio.duration || 0)
      void saveCloud(audio.currentTime, audio.duration || 0)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.removeEventListener('progress', onProgress)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('loadeddata', onCanPlay)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('error', onErr)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      if (sleepRef.current) clearTimeout(sleepRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, title, bookId])

  useEffect(() => {
    const a = audioRef.current
    if (a) a.playbackRate = rate
  }, [rate])

  useEffect(() => {
    const a = audioRef.current
    if (a) a.volume = vol
  }, [vol])

  useEffect(() => {
    if (sleepRef.current) clearTimeout(sleepRef.current)
    if (!sleepMin) {
      setSleepLeft(0)
      return
    }
    const end = Date.now() + sleepMin * 60 * 1000
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000))
      setSleepLeft(left)
      if (left <= 0) {
        audioRef.current?.pause()
        setSleepMin(0)
        return
      }
      sleepRef.current = setTimeout(tick, 1000)
    }
    tick()
    return () => {
      if (sleepRef.current) clearTimeout(sleepRef.current)
    }
  }, [sleepMin])

  useEffect(() => {
    const onShake = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity
      if (!acc) return
      const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2)
      if (mag > 22 && sleepMin > 0) setSleepMin(sleepMin)
    }
    window.addEventListener('devicemotion', onShake)
    return () => window.removeEventListener('devicemotion', onShake)
  }, [sleepMin])

  function toggle() {
    const a = audioRef.current
    if (!a || !ready) return
    if (a.paused) void a.play()
    else a.pause()
  }

  function skip(sec: number) {
    const a = audioRef.current
    if (!a) return
    const next = Math.max(0, a.currentTime + sec)
    const cap = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : next
    try {
      a.currentTime = Math.min(cap, next)
      setT(a.currentTime)
    } catch {
      setStatus('Buffering…')
    }
  }

  async function markMoment() {
    const a = audioRef.current
    if (!a || !loggedIn) return
    const row = await addAudioNote(bookId, a.currentTime, noteText.trim())
    setNotes((prev) => [...prev, row as { id: number; position: number; note: string }])
    setNoteText('')
  }

  async function saveOffline() {
    try {
      const res = await fetch(url)
      const buf = await res.arrayBuffer()
      const raw = new Uint8Array(buf)
      const key = new TextEncoder().encode((getToken() || title).slice(0, 16).padEnd(16, '0'))
      const out = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ key[i % key.length]
      const dbReq = indexedDB.open('plugyard-audio', 1)
      dbReq.onupgradeneeded = () => {
        dbReq.result.createObjectStore('files')
      }
      dbReq.onsuccess = () => {
        const tx = dbReq.result.transaction('files', 'readwrite')
        tx.objectStore('files').put(out.buffer, `audio:${bookId}`)
        setOfflineMsg('Saved on this device. Play needs the same login.')
      }
    } catch {
      setOfflineMsg('Could not save offline.')
    }
  }

  const span = dur || Math.max(t + 30, 30)
  const bufPct = Math.min(100, (buffered / span) * 100)
  const playPct = Math.min(100, (t / span) * 100)

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0b1020] text-[#fdfbf4]">
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
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-6 overflow-y-auto px-6 py-6">
        {status && !ready ? (
          <p className="text-sm text-white/50">{status}</p>
        ) : (
          <>
            {resumeAt > 0 ? (
              <p className="text-center text-[13px] text-[#f591ac]">
                Continuing from {fmt(resumeAt)}
                {loggedIn ? ' · synced to your account' : ''}
              </p>
            ) : null}

            {!loggedIn ? (
              <p className="max-w-md text-center text-[13px] text-white/60">
                Log in to resume on another device.{' '}
                <Link href={loginHref} className="font-semibold text-[#f591ac] underline">
                  Log in
                </Link>
                {' · '}
                <Link href={signupHref} className="font-semibold text-[#f591ac] underline">
                  Sign up
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
                  <div
                    className="absolute inset-y-0 left-0 bg-white/30"
                    style={{ width: `${bufPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-[#f591ac]"
                    style={{ width: `${playPct}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={span}
                  step={0.1}
                  value={t}
                  onChange={(e) => {
                    const a = audioRef.current
                    if (!a) return
                    try {
                      a.currentTime = Number(e.target.value)
                      setT(a.currentTime)
                    } catch {
                      setStatus('Buffering…')
                    }
                  }}
                  className="absolute inset-0 z-10 m-0 h-2 w-full cursor-pointer appearance-none bg-transparent accent-[#f591ac]"
                />
              </div>
              <div className="mt-2 flex justify-between text-[12px] text-white/45">
                <span>{fmt(t)}</span>
                <span>{dur ? fmt(dur) : '—'}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button type="button" onClick={() => skip(-15)} className="rounded-full bg-white/10 px-3 py-2 text-sm font-semibold">
                −15
              </button>
              <button
                type="button"
                onClick={toggle}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f591ac] text-lg font-bold text-[#141a32]"
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <button type="button" onClick={() => skip(15)} className="rounded-full bg-white/10 px-3 py-2 text-sm font-semibold">
                +15
              </button>
            </div>

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
              <p className="mb-2 text-center text-[11px] text-white/35">
                Shake the phone to restart the timer.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SLEEP_OPTS.map((o) => (
                  <button
                    key={o.min}
                    type="button"
                    onClick={() => setSleepMin(o.min)}
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
                      className="min-w-0 flex-1 rounded-full bg-white/10 px-3 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void markMoment()}
                      className="rounded-full bg-[#f591ac] px-3 py-2 text-sm font-bold text-[#141a32]"
                    >
                      Save
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {notes.map((n) => (
                      <li key={n.id} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          onClick={() => skip(n.position - t)}
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
                  </Link>{' '}
                  to save notes across devices.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void saveOffline()}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold"
            >
              Save offline on this device
            </button>
            {offlineMsg ? <p className="text-center text-[12px] text-white/50">{offlineMsg}</p> : null}
          </>
        )}
      </div>
    </div>
  )
}