"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { getBanners, peekBanners, sendBannerEvent, type BannerData, type BannerPlacement, type BannersPage } from "@/lib/api"
import { Countdown, noteServerTime } from "./countdown"

/**
 * Admin banners (Django admin → Banners): targeted to audiences, rotated by
 * weight, with countdowns. The server decides which banners THIS visitor
 * sees and in what order (shop/banner_rotation.py); this draws them.
 *
 * - Title, subtitle, button and countdown are live text over the image.
 * - No layout jump: the space is reserved from the image's real size, and
 *   remembered per page so the next visit reserves it before the answer
 *   arrives (like the section skeletons). On a first visit a banner shows
 *   only if its answer is already in when the page first draws.
 * - Several banners = a carousel (dots, optional autoplay that pauses on
 *   hover/focus/touch and for reduced motion).
 * - Counts one view per banner when half on screen; clicks and closes.
 */

type Shape = { m: string; d: string } | null
const pages = new Map<string, Promise<BannersPage>>()
// Answers that have arrived, so a component drawn after the early load
// (useBannerData) can use one in its very first render.
const resolved = new Map<string, BannersPage>()

function load(placement: BannerPlacement, category: string) {
  const key = `${placement}|${category}`
  let p = pages.get(key)
  if (!p) {
    p = getBanners(placement, category).then((page) => {
      noteServerTime(page.server_now)
      resolved.set(key, page)
      return page
    })
    pages.set(key, p)
  }
  return p
}

function ready(placement: BannerPlacement, category: string): BannersPage | undefined {
  const key = `${placement}|${category}`
  const done = resolved.get(key)
  if (done) return done
  const pre = peekBanners(placement, category)
  if (pre) {
    noteServerTime(pre.server_now)
    resolved.set(key, pre)
    pages.set(key, Promise.resolve(pre))
  }
  return pre
}

/** Start loading a page's banners early (e.g. with the page's other data). */
export function useBannerData(category = "", placement: BannerPlacement = category ? "category" : "home") {
  useEffect(() => {
    void load(placement, category).catch(() => {})
  }, [placement, category])
}

function shapeKey(placement: string, category: string) {
  return `plugyard_banner_shape_v2:${placement}:${category || "-"}`
}

function readShape(placement: string, category: string): Shape {
  try {
    const raw = localStorage.getItem(shapeKey(placement, category))
    return raw ? (JSON.parse(raw) as Shape) : null
  } catch {
    return null
  }
}

function ratio(img: { width: number | null; height: number | null }, fallback: string) {
  return img.width && img.height ? `${img.width} / ${img.height}` : fallback
}

// On phones the text sits over the image: a very wide shape (e.g. a banner
// with only its 4:1 desktop image) would cut it off, so it gets 16:10.
const PHONE_MAX_RATIO = 1.6

function shapeOf(b: BannerData): { m: string; d: string } {
  const { width: w, height: h } = b.image_mobile
  const m = w && h && w / h > PHONE_MAX_RATIO ? "16 / 10" : ratio(b.image_mobile, "1 / 1")
  return { m, d: ratio(b.image_desktop, "4 / 1") }
}

function overlayStyle(b: BannerData): React.CSSProperties {
  if (b.overlay === "none") return {}
  const a = Math.min(90, Math.max(0, b.overlay_strength)) / 100
  const rgb = b.overlay === "dark" ? "0,0,0" : "255,255,255"
  // Phones: text sits at the bottom, so the shade rises from there.
  // Desktop: text sits on the left, so the shade runs left to right.
  return {
    "--ov-m": `linear-gradient(0deg, rgba(${rgb},${Math.min(0.92, a + 0.2)}) 0%, rgba(${rgb},${a * 0.7}) 50%, rgba(${rgb},${a * 0.1}) 100%)`,
    "--ov-d": `linear-gradient(90deg, rgba(${rgb},${a}) 0%, rgba(${rgb},${a * 0.6}) 45%, rgba(${rgb},${a * 0.15}) 100%)`,
  } as React.CSSProperties
}

const BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-bold shadow-md outline-none focus-visible:ring-2 focus-visible:ring-white/80"

function BannerSlide({
  b,
  index,
  count,
  eager,
  placement,
  ended,
  onCountdownEnd,
  onDismiss,
}: {
  b: BannerData
  index: number
  count: number
  eager: boolean
  placement: BannerPlacement
  ended: boolean
  onCountdownEnd: () => void
  onDismiss: () => void
}) {
  const ref = useRef<HTMLElement>(null)
  const seen = useRef(false)
  const where = { placement, position: index }

  useEffect(() => {
    const el = ref.current
    if (!el || seen.current || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !seen.current) {
          seen.current = true
          sendBannerEvent(b.id, "view", { placement, position: index })
          io.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [b.id, placement, index])

  const click = () => sendBannerEvent(b.id, "click", where)
  const external = /^https?:\/\//i.test(b.button_link)
  const style = { background: b.button_color, color: b.button_text_color }
  const button =
    b.button_text && b.button_link ? (
      external ? (
        <a href={b.button_link} target="_blank" rel="noopener noreferrer" onClick={click} className={BUTTON_CLASS} style={style}>
          {b.button_text}
        </a>
      ) : (
        <Link href={b.button_link} onClick={click} className={BUTTON_CLASS} style={style}>
          {b.button_text}
        </Link>
      )
    ) : null

  const m = b.image_mobile
  const d = b.image_desktop
  const showEnded = ended || !!b.ended
  return (
    <section
      ref={ref}
      aria-roledescription={count > 1 ? "slide" : undefined}
      aria-label={count > 1 ? `${b.title} (${index + 1} of ${count})` : b.title}
      data-banner-id={b.id}
      className="relative h-full w-full shrink-0 snap-center overflow-hidden rounded-3xl bg-foreground/10"
    >
      {d.url && (
        <picture>
          {m.url && <source media="(max-width: 767px)" srcSet={m.url} width={m.width ?? undefined} height={m.height ?? undefined} />}
          <img
            src={d.url}
            alt={b.image_alt}
            width={d.width ?? undefined}
            height={d.height ?? undefined}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </picture>
      )}
      <div className="absolute inset-0 [background:var(--ov-m)] md:[background:var(--ov-d)]" style={overlayStyle(b)} aria-hidden />
      <div
        className="absolute inset-0 flex flex-col justify-end gap-2 p-5 md:max-w-[60%] md:justify-center md:p-10"
        style={{ color: b.text_color }}
      >
        {showEnded && b.ended_message ? (
          <p className="w-fit rounded-full bg-black/45 px-3 py-1 text-[13px] font-bold text-white backdrop-blur-sm" role="status">
            {b.ended_message}
          </p>
        ) : b.countdown ? (
          <Countdown
            target={b.countdown.target}
            label={b.countdown.label}
            onExpire={onCountdownEnd}
            className="w-fit rounded-full bg-black/45 px-3 py-1 text-[13px] font-bold text-white backdrop-blur-sm"
          />
        ) : null}
        <h2 className="text-[clamp(22px,4.2vw,44px)] font-extrabold leading-[1.08] tracking-[-0.01em] [text-wrap:balance] [text-shadow:0_1px_12px_rgba(0,0,0,0.25)]">
          {b.title}
        </h2>
        {b.subtitle && <p className="max-w-[48ch] text-[clamp(14px,1.6vw,18px)] leading-snug opacity-90">{b.subtitle}</p>}
        {button && <div className="pt-1">{button}</div>}
      </div>
      {b.dismissible && (
        <button
          type="button"
          onClick={() => {
            sendBannerEvent(b.id, "dismiss", where)
            onDismiss()
          }}
          aria-label={`Close banner: ${b.title}`}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm outline-none hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </section>
  )
}

export function Banners({
  category = "",
  placement,
  className = "mb-6",
}: {
  category?: string
  placement?: BannerPlacement
  /** Outer spacing (default: space below). */
  className?: string
}) {
  const where: BannerPlacement = placement ?? (category ? "category" : "home")
  // First render: the preloaded answer if it is already in; otherwise the
  // space this page needed last time (or nothing on a first visit).
  const [page, setPage] = useState<BannersPage | null>(() => ready(where, category) ?? null)
  const [shape] = useState<Shape>(() => (page ? null : readShape(where, category)))
  const [show] = useState(() => !!page?.banners.length || !!shape)
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [ended, setEnded] = useState<Set<number>>(new Set())
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (page) return
    let live = true
    load(where, category)
      .then((p) => live && setPage(p))
      .catch(() => live && setPage({ banners: [] }))
    return () => {
      live = false
    }
  }, [where, category, page])

  // Remember the space for the next visit (or that there was none).
  useEffect(() => {
    if (!page) return
    try {
      const first = page.banners[0]
      if (first) localStorage.setItem(shapeKey(where, category), JSON.stringify(shapeOf(first)))
      else localStorage.removeItem(shapeKey(where, category))
    } catch {
      // private mode
    }
  }, [page, where, category])

  const banners = (page?.banners ?? []).filter((b) => !hidden.has(b.id))
  const autoplay = (page?.settings?.autoplay_seconds ?? 0) * 1000

  const goTo = useCallback((i: number) => {
    const row = rowRef.current
    if (!row) return
    row.scrollTo({ left: i * row.clientWidth, behavior: "smooth" })
  }, [])

  // Which slide is showing (swipe, dots or autoplay).
  useEffect(() => {
    const row = rowRef.current
    if (!row || banners.length < 2) return
    const onScroll = () => setActive(Math.round(row.scrollLeft / Math.max(1, row.clientWidth)))
    row.addEventListener("scroll", onScroll, { passive: true })
    return () => row.removeEventListener("scroll", onScroll)
  }, [banners.length])

  useEffect(() => {
    if (banners.length < 2 || !autoplay || paused) return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const t = setInterval(() => {
      if (document.hidden) return
      goTo((active + 1) % banners.length)
    }, autoplay)
    return () => clearInterval(t)
  }, [banners.length, autoplay, paused, active, goTo])

  if (!show) return null

  // Reserved space while the answer is on its way.
  if (!page) {
    if (!shape) return null
    return (
      <div className={className} aria-hidden>
        <div
          className="w-full animate-pulse rounded-3xl bg-foreground/10 [aspect-ratio:var(--ar-m)] md:[aspect-ratio:var(--ar-d)]"
          style={{ "--ar-m": shape.m, "--ar-d": shape.d } as React.CSSProperties}
        />
      </div>
    )
  }
  if (!banners.length) return null

  // A "Starts in" countdown reaching zero turns into "Ends in" on the
  // server: ask again. One that ends: hide the banner or show its message.
  const countdownEnd = (b: BannerData) => {
    if (b.countdown?.label === "Starts in") {
      pages.delete(`${where}|${category}`)
      resolved.delete(`${where}|${category}`)
      load(where, category).then(setPage).catch(() => {})
    } else if (b.hide_when_ended === false && b.ended_message) {
      setEnded((s) => new Set(s).add(b.id))
    } else {
      setHidden((s) => new Set(s).add(b.id))
    }
  }

  const first = shape ?? shapeOf(banners[0])
  return (
    <div
      className={className}
      role={banners.length > 1 ? "region" : undefined}
      aria-roledescription={banners.length > 1 ? "carousel" : undefined}
      aria-label={banners.length > 1 ? "Announcements" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div
        ref={rowRef}
        className="flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [aspect-ratio:var(--ar-m)] md:[aspect-ratio:var(--ar-d)]"
        style={{ "--ar-m": first.m, "--ar-d": first.d } as React.CSSProperties}
      >
        {banners.map((b, i) => (
          <BannerSlide
            key={b.id}
            b={b}
            index={i}
            count={banners.length}
            eager={i === 0}
            placement={where}
            ended={ended.has(b.id)}
            onCountdownEnd={() => countdownEnd(b)}
            onDismiss={() => setHidden((s) => new Set(s).add(b.id))}
          />
        ))}
      </div>
      {banners.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show banner ${i + 1} of ${banners.length}`}
              aria-current={i === active ? "true" : undefined}
              className="flex h-6 w-6 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 rounded-full"
            >
              <span className={`block h-2 rounded-full transition-all ${i === active ? "w-5 bg-foreground/70" : "w-2 bg-foreground/25"}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
