'use client'

import { useEffect, useRef, useState } from 'react'

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function posKey(title: string) {
  return `plugyard-audio-pos:${title.trim().toLowerCase()}`
}

const SLEEP_OPTS = [
  { label: 'Off', min: 0 },
  { label: '5 min', min: 5 },
  { label: '15 min', min: 15 },
  { label: '30 min', min: 30 },
  { label: '45 min', min: 45 },
  { label: '60 min', min: 60 },
]

export function AudioPlayer({
  title,
  url,
  onClose,
}: {
  title: string
  url: string
  onClose: () => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sleepRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSave = useRef(0)
  const restored = useRef(false)
  const tries = useRef(0)

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

  function savePos(sec: number, length: number) {
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

  function applySavedPosition(audio: HTMLAudioElement) {
    if (restored.current) return
    const saved = Number(localStorage.getItem(posKey(title)) || 0)
    if (!Number.isFinite(saved) || saved < 3) {
      restored.current = true
      return
    }
    const length = audio.duration
    if (Number.isFinite(length) && length > 0 && saved >= length - 3) {
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

    const onProgress = () => readBuffer(audio)
    const onWaiting = () => {
      if (!cancelled) setStatus('Buffering…')
    }
    const onCanPlay = () => {
      if (cancelled) return
      applySavedPosition(audio)
      setStatus('')
      setReady(true)
    }
    const onTime = () => {
      setT(audio.currentTime)
      setDur(Number.isFinite(audio.duration) ? audio.duration : 0)
      readBuffer(audio)
      const now = Date.now()
      if (now - lastSave.current > 1500) {
        lastSave.current = now
        savePos(audio.currentTime, audio.duration || 0)
      }
    }
    const onMeta = () => {
      setDur(Number.isFinite(audio.duration) ? audio.duration : 0)
      applySavedPosition(audio)
    }
    const onPlay = () => {
      setPlaying(true)
      setStatus('')
    }
    const onPause = () => {
      setPlaying(false)
      savePos(audio.currentTime, audio.duration || 0)
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

    const onHide = () => savePos(audio.currentTime, audio.duration || 0)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)

    return () => {
      cancelled = true
      savePos(audio.currentTime, audio.duration || 0)
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
  }, [url, title])

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
    const cap =
      Number.isFinite(a.duration) && a.duration > 0 ? a.duration : next
    try {
      a.currentTime = Math.min(cap, next)
      setT(a.currentTime)
    } catch {
      setStatus('Buffering…')
    }
  }

  const bufPct = dur > 0 ? Math.min(100, (buffered / dur) * 100) : 0

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

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 px-6">
        {status && !ready ? (
          <p className="text-sm text-white/50">{status}</p>
        ) : (
          <>
            {status && ready ? (
              <p className="text-[13px] text-[#f591ac]">{status}</p>
            ) : null}

            <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-[#141a32] text-4xl text-[#f591ac] ring-1 ring-white/10">
              ♪
            </div>

            {resumeAt > 0 ? (
              <p className="max-w-md text-center text-[13px] text-[#f591ac]">
                Continuing from {fmt(resumeAt)}
              </p>
            ) : null}

            <p className="max-w-md text-center text-[12px] leading-relaxed text-white/45">
              Your place is saved on this device. When you open this title again,
              playback jumps to where you stopped.
            </p>

            <div className="w-full max-w-md">
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 bg-white/25"
                  style={{ width: `${bufPct}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={dur || Math.max(t + 30, 30)}
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
                className="mt-2 w-full accent-[#f591ac]"
              />
              <div className="mt-1 flex justify-between text-[12px] text-white/45">
                <span>{fmt(t)}</span>
                <span>{dur ? fmt(dur) : '—'}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => skip(-15)}
                className="rounded-full bg-white/10 px-3 py-2 text-sm font-semibold"
              >
                −15
              </button>
              <button
                type="button"
                onClick={toggle}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f591ac] text-lg font-bold text-[#141a32]"
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={() => skip(15)}
                className="rounded-full bg-white/10 px-3 py-2 text-sm font-semibold"
              >
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
                    rate === r
                      ? 'bg-[#f591ac] text-[#141a32]'
                      : 'bg-white/10 text-white'
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
              <div className="flex flex-wrap justify-center gap-2">
                {SLEEP_OPTS.map((o) => (
                  <button
                    key={o.min}
                    type="button"
                    onClick={() => setSleepMin(o.min)}
                    className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                      sleepMin === o.min
                        ? 'bg-[#f591ac] text-[#141a32]'
                        : 'bg-white/10 text-white'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}