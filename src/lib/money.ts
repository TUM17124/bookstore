"use client"

import { cachedResource } from "@/lib/cached-resource"

/**
 * Part C: one currency setting for the whole site (Django admin → Site
 * settings → Currency). Every price on the page goes through formatMoney /
 * useMoney, so changing the setting changes them all.
 */
export type CurrencyConfig = {
  code: string
  symbol: string
  position: "before" | "after"
  space: boolean
  decimals: number
  thousands: string
  /** Admin's approximate rate for the "≈ $x" hint; 0/empty hides it. */
  approx_usd_rate?: string | number
}

export type SiteConfig = { currency: CurrencyConfig; server_now: string }

/** Used until the setting loads (and if it can't): today's KES format. */
export const DEFAULT_CURRENCY: CurrencyConfig = {
  code: "KES",
  symbol: "KES",
  position: "before",
  space: true,
  decimals: 0,
  thousands: ",",
  approx_usd_rate: 130,
}

export function formatMoney(amount: number | string | null | undefined, cfg: CurrencyConfig = DEFAULT_CURRENCY): string {
  const n = Number(amount ?? 0)
  const value = Number.isFinite(n) ? n : 0
  const places = Math.max(0, Math.min(4, Number(cfg.decimals) || 0))
  const fixed = Math.abs(value).toFixed(places)
  const [whole, frac] = fixed.split(".")
  const grouped = cfg.thousands ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.thousands) : whole
  const number = (value < 0 ? "-" : "") + grouped + (places ? `.${frac}` : "")
  const gap = cfg.space ? " " : ""
  return cfg.position === "after" ? `${number}${gap}${cfg.symbol}` : `${cfg.symbol}${gap}${number}`
}

async function loadSiteConfig(): Promise<SiteConfig | null> {
  const base = process.env.NEXT_PUBLIC_API_URL
  if (!base) return null
  const res = await fetch(`${base}/site/config/`, { cache: "no-store" })
  if (!res.ok) return null
  const data = (await res.json()) as SiteConfig
  return data?.currency ? data : null
}

const useSiteConfigResource = cachedResource<SiteConfig | null>("plugyard_site_config_v1", loadSiteConfig, null, 5 * 60_000)

export function useCurrency(): CurrencyConfig {
  const [cfg] = useSiteConfigResource()
  return cfg?.currency ?? DEFAULT_CURRENCY
}

/** `money(500)` → "KES 500" (or whatever the site setting says). */
export function useMoney(): (amount: number | string | null | undefined) => string {
  const cfg = useCurrency()
  return (amount) => formatMoney(amount, cfg)
}
