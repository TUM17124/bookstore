'use client'

import { useEffect, useRef, useState } from 'react'

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
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
  const blobUrlRef = useRef<string | null>(null)
  const sleepRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [status, setStatus] = useState('Downloading audio…')
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [rate, setRate] = useState(1)
  const [sleepMin, setSleepMin] = useState(0)
  const [sleepLeft, setSleepLeft] = useState(0)

  useEffect(() => {
    let cancelled = false
    const audio = new Audio()
    audioRef.current = audio

    ;(async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error('download failed')
        const blob = await res.blob()
        if (cancelled) return
        const obj = URL.createObjectURL(blob)
        blobUrlRef.current = obj
        audio.src = obj
        audio.preload = 'auto'
        setStatus('')
        setReady(true)
      } catch {
        if (!cancelled) setStatus('Could not load this audiobook.')
      }
    })()

    const onTime = () => setT(audio.currentTime)
    const onMeta = () => setDur(audio.duration || 0)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnd = () => setPlaying(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnd)

    return () => {
      cancelled = true
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnd)
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      if (sleepRef.current) clearTimeout(sleepRef.current)
    }
  }, [url])

  useEffect(() => {
    const a = audioRef.current
    if (a) a.playbackRate = rate
  }, [rate])

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
    a.currentTime = Math.max(0, Math.min((a.duration || 0), a.currentTime + sec))
  }

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

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6">
        {status ? (
          <p className="text-sm text-white/50">{status}</p>
        ) : (
          <>
            <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-[#141a32] text-4xl text-[#f591ac] ring-1 ring-white/10">
              ♪
            </div>

            <div className="w-full max-w-md">
              <input
                type="range"
                min={0}
                max={dur || 0}
                step={0.1}
                value={t}
                onChange={(e) => {
                  const a = audioRef.current
                  if (a) a.currentTime = Number(e.target.value)
                }}
                className="w-full accent-[#f591ac]"
              />
              <div className="mt-1 flex justify-between text-[12px] text-white/45">
                <span>{fmt(t)}</span>
                <span>{fmt(dur)}</span>
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