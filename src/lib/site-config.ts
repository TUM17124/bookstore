"use client"

import { cachedResource } from "@/lib/cached-resource"
import defaults from "@/lib/site-defaults.json"

/**
 * Part D: the site's admin-editable texts, feature switches, limits and
 * prices (Django admin → Site: General / Footer / Limits / Pricing /
 * Features), from /api/site/config/. Paints from this browser's last copy,
 * then refreshes; until anything loads, the built-in texts below are used.
 *
 * site-defaults.json is generated from the backend's registry
 * (python manage.py export_site_texts ../bookstore/src/lib/site-defaults.json)
 * so both sides start from the same wording.
 */

export type LinkPair = { label: string; value: string }
export type TextValue = string | string[] | LinkPair[]

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

export type FeatureName =
  | "publishing"
  | "boosts"
  | "affiliate"
  | "guest_checkout"
  | "reviews"
  | "pro_signups"
  | "ads"
  | "install_prompt"
  | "push_prompt"
  | "personalised_default"

export type ProPlan = { code: string; name: string; price: string; billing_days: number; description: string }

export type SiteConfig = {
  currency: CurrencyConfig
  server_now: string
  texts?: Record<string, TextValue>
  features?: Partial<Record<FeatureName, boolean>>
  limits?: {
    default_preview_pages: number
    payout_every_days: number
    editor_trash_days: number
    editor_upload_max_mb: number
  }
  boost?: { price: string; days: number }
  pro_plans?: ProPlan[]
  support_email?: string
  legal?: { slug: string; title: string }[]
}

export const DEFAULT_TEXTS = defaults.texts as Record<string, TextValue>
export const DEFAULT_LIMITS = {
  default_preview_pages: 4,
  payout_every_days: 30,
  editor_trash_days: 30,
  editor_upload_max_mb: 80,
}

async function loadSiteConfig(): Promise<SiteConfig | null> {
  const base = process.env.NEXT_PUBLIC_API_URL
  if (!base) return null
  const res = await fetch(`${base}/site/config/`, { cache: "no-store" })
  if (!res.ok) return null
  const data = (await res.json()) as SiteConfig
  return data?.currency ? data : null
}

const useSiteConfigResource = cachedResource<SiteConfig | null>("plugyard_site_config_v2", loadSiteConfig, null, 60_000)

/** `[config or null, ready]`. */
export function useSiteConfig(): [SiteConfig | null, boolean] {
  return useSiteConfigResource()
}

function rawText(cfg: SiteConfig | null, key: string): TextValue {
  const live = cfg?.texts?.[key]
  if (live !== undefined && live !== null && !(typeof live === "string" && !live.trim())) return live
  return DEFAULT_TEXTS[key] ?? ""
}

/** Fill `{name}` style variables. Unknown ones are left as typed. */
export function fill(text: string, vars: Record<string, string | number | null | undefined> = {}): string {
  return text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (m, name: string) =>
    vars[name] === undefined || vars[name] === null ? m : String(vars[name]),
  )
}

/** One editable text (a single line or a paragraph). */
export function useText(key: string, vars?: Record<string, string | number | null | undefined>): string {
  const [cfg] = useSiteConfig()
  const v = rawText(cfg, key)
  const text = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : x.label)).join("\n") : v
  return vars ? fill(text, vars) : text
}

/** An editable list (one item per line in the admin). */
export function useList(key: string): string[] {
  const [cfg] = useSiteConfig()
  const v = rawText(cfg, key)
  if (typeof v === "string") return v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return v.map((x) => (typeof x === "string" ? x : x.label))
}

/** Editable "Title | Text" or "Label | link" lines. */
export function usePairs(key: string): LinkPair[] {
  const [cfg] = useSiteConfig()
  const v = rawText(cfg, key)
  if (typeof v === "string") {
    return v
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [label, ...rest] = l.split("|")
        return { label: label.trim(), value: rest.join("|").trim() }
      })
  }
  return v.map((x) => (typeof x === "string" ? { label: x, value: "" } : x))
}

/** A feature switch (Site: Features). On unless the admin turned it off. */
export function useFeature(name: FeatureName): boolean {
  const [cfg] = useSiteConfig()
  return cfg?.features?.[name] !== false
}

/** The message shown while a switch is off (also what the server returns). */
export function useOffMessage(name: FeatureName): string {
  return useText(`off.${name}`)
}

export function useLimits() {
  const [cfg] = useSiteConfig()
  return { ...DEFAULT_LIMITS, ...(cfg?.limits || {}) }
}

export function useSupportEmail(): string {
  const [cfg] = useSiteConfig()
  return cfg?.support_email || "contact@plugyard.com"
}

/** A server refusal because a switch is off: `{code: "feature_off"}`. */
export function isFeatureOff(body: unknown): body is { code: "feature_off"; error: string; feature: FeatureName } {
  return !!body && typeof body === "object" && (body as { code?: string }).code === "feature_off"
}
