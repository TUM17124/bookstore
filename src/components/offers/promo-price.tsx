"use client"

import type { PromoQuote } from "@/lib/api"
import { useMoney } from "@/lib/money"
import { Countdown } from "./countdown"

/**
 * The price of one of PlugYard's own products (Pro, credit packs, boosts)
 * as the server quoted it: with a promotion, the list price struck
 * through, the price to pay, the saving and an "Ends in" countdown (server
 * time). At zero `onExpire` should ask for the price again: it goes back to
 * normal on its own.
 */
export function PromoPrice({
  quote,
  fallback,
  suffix = "",
  onExpire,
  size = "md",
  className = "",
}: {
  quote: PromoQuote | null | undefined
  /** Shown while there is no quote yet (the list price). */
  fallback?: string | number | null
  /** e.g. " / month". */
  suffix?: string
  onExpire?: () => void
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const money = useMoney()
  const big = size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-base"
  const promo = quote?.promotion && Number(quote.discount) > 0 ? quote.promotion : null
  const final = quote ? quote.final_amount : fallback
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`${big} font-extrabold tabular-nums`}>
          {money(final)}
          {suffix && <span className="text-sm font-semibold text-foreground/60">{suffix}</span>}
        </span>
        {promo && (
          <span className="text-sm text-foreground/55 line-through tabular-nums" aria-label={`Was ${money(quote!.list_amount)}`}>
            {money(quote!.list_amount)}
          </span>
        )}
      </div>
      {promo && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="rounded-full bg-[var(--brand-pink)] px-2 py-0.5 font-bold text-[var(--on-brand)]">
            {promo.label}: save {money(quote!.discount)}
            {quote!.saving_percent ? ` (${quote!.saving_percent}%)` : ""}
          </span>
          <Countdown target={promo.ends_at} label="Ends in" onExpire={onExpire} className="font-semibold text-[var(--brand-pink-text)]" />
        </div>
      )}
    </div>
  )
}
