"use client"

import { useSiteConfig, type CurrencyConfig } from "@/lib/site-config"

/**
 * Part C: one currency setting for the whole site (Django admin → Site:
 * Pricing → Currency). Every price on the page goes through formatMoney /
 * useMoney, so changing the setting changes them all.
 */
export type { CurrencyConfig, SiteConfig } from "@/lib/site-config"

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
  // Same rule as the server (shop/pricing.py round_price): DOWN to the
  // currency's precision, never rounded up, so the price shown is the price
  // charged (KES 139.30 shows as KES 139, which is what is charged).
  const factor = 10 ** places
  const truncated = Math.trunc(Math.abs(value) * factor + 1e-6) / factor
  const fixed = truncated.toFixed(places)
  const [whole, frac] = fixed.split(".")
  const grouped = cfg.thousands ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.thousands) : whole
  const number = (value < 0 ? "-" : "") + grouped + (places ? `.${frac}` : "")
  const gap = cfg.space ? " " : ""
  return cfg.position === "after" ? `${number}${gap}${cfg.symbol}` : `${cfg.symbol}${gap}${number}`
}

export function useCurrency(): CurrencyConfig {
  const [cfg] = useSiteConfig()
  return cfg?.currency ?? DEFAULT_CURRENCY
}

/** `money(500)` → "KES 500" (or whatever the site setting says). */
export function useMoney(): (amount: number | string | null | undefined) => string {
  const cfg = useCurrency()
  return (amount) => formatMoney(amount, cfg)
}
