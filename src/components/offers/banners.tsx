"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { getBanners, sendBannerEvent, type BannerData } from "@/lib/api"
import { cachedResource } from "@/lib/cached-resource"
import { Countdown, noteServerTime } from "./countdown"

/**
 * Part C: admin-managed banners (Django admin → Banners). The title,
 * subtitle, button and countdown are live text over the image - never
 * baked into it - so they stay sharp and readable at every size. Space is
 * reserved from the image's real size (no layout jump); the phone image is
 * used under 768px. Each banner counts one view when it is half on screen
 * and one click per button press.
 */

type BannerPayload = { banners: BannerData[]; server_now?: string }

const resources = new Map<string, ReturnType<typeof cachedResource<BannerPayload>>>()

function resourceFor(category: string) {
  let r = resources.get(category)
  if (!r) {
    r = cachedResource<BannerPayload>(
      `plugyard_banners_v1:${category || "home"}`,
      async () => {
        const data = await getBanners(category || undefined)
        noteServerTime(data.server_now)
        return data
      },
      { banners: [] },
      60_000,
    )
    resources.set(category, r)
  }
  return r
}

function ratio(img: { width: number | null; height: number | null }, fallback: string) {
  return img.width && img.height ? `${img.width} / ${img.height}` : fallback
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

function BannerSlide({ b, eager, onCountdownEnd }: { b: BannerData; eager: boolean; onCountdownEnd: () => void }) {
  const ref = useRef<HTMLElement>(null)
  const seen = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || seen.current || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !seen.current) {
          seen.current = true
          sendBannerEvent(b.id, "view")
          io.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [b.id])

  const external = /^https?:\/\//i.test(b.button_link)
  const button = b.button_text && b.button_link ? (
    external ? (
      <a
        href={b.button_link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => sendBannerEvent(b.id, "click")}
        className="inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-bold shadow-md outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        style={{ background: b.button_color, color: b.button_text_color }}
      >
        {b.button_text}
      </a>
    ) : (
      <Link
        href={b.button_link}
        onClick={() => sendBannerEvent(b.id, "click")}
        className="inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-bold shadow-md outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        style={{ background: b.button_color, color: b.button_text_color }}
      >
        {b.button_text}
      </Link>
    )
  ) : null

  const m = b.image_mobile
  const d = b.image_desktop
  return (
    <section
      ref={ref}
      aria-label={b.title}
      className="relative w-full shrink-0 snap-center overflow-hidden rounded-3xl bg-foreground/10 [aspect-ratio:var(--ar-m)] md:[aspect-ratio:var(--ar-d)]"
      style={{ "--ar-m": ratio(m, "1 / 1"), "--ar-d": ratio(d, "4 / 1") } as React.CSSProperties}
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
        {b.countdown && (
          <Countdown
            target={b.countdown.target}
            label={b.countdown.label}
            onExpire={onCountdownEnd}
            className="w-fit rounded-full bg-black/35 px-3 py-1 text-[13px] font-bold text-white backdrop-blur-sm"
          />
        )}
        <h2 className="text-[clamp(22px,4.2vw,44px)] font-extrabold leading-[1.08] tracking-[-0.01em] [text-wrap:balance] [text-shadow:0_1px_12px_rgba(0,0,0,0.25)]">
          {b.title}
        </h2>
        {b.subtitle && <p className="max-w-[48ch] text-[clamp(14px,1.6vw,18px)] leading-snug opacity-90">{b.subtitle}</p>}
        {button && <div className="pt-1">{button}</div>}
      </div>
    </section>
  )
}

/** Start loading a page's banners early; true once they're known. */
export function useBannerData(category = ""): boolean {
  return resourceFor(category)()[1]
}

export function Banners({ category = "" }: { category?: string }) {
  const [data, ready] = resourceFor(category)()
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [nonce, setNonce] = useState(0)
  // Decided once, when the shelf first appears: banners known by then
  // (from the server or this browser's last visit) are drawn; ones that
  // arrive later wait for the next visit instead of pushing the page down.
  const [show] = useState(() => ready && data.banners.length > 0)
  const banners = data.banners.filter((b) => !hidden.has(b.id))

  if (!show || !banners.length) return null

  // A "Starts in" countdown reaching zero turns into "Ends in" on the
  // server - reload; an "Ends in" one means the campaign is over - hide it.
  const ended = (b: BannerData) => {
    if (b.countdown?.label === "Starts in") {
      resources.delete(category)
      setNonce((n) => n + 1)
    } else {
      setHidden((s) => new Set(s).add(b.id))
    }
  }

  return (
    <div className="mb-6" key={nonce}>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {banners.map((b, i) => (
          <BannerSlide key={b.id} b={b} eager={i === 0} onCountdownEnd={() => ended(b)} />
        ))}
      </div>
    </div>
  )
}
