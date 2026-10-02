"use client"

import { useState } from "react"
import type { ApiOffer } from "@/lib/api"
import { useMoney } from "@/lib/money"
import { Countdown } from "./countdown"

/**
 * Part C: one way to show a price everywhere. With a live offer: the honest
 * struck-through "was" price, the offer price, the saving and a countdown
 * to the campaign's real end. When the countdown reaches zero the offer
 * disappears and the normal price (already from the server) shows; pages
 * that charge (book detail, checkout) also re-ask the server via onExpire.
 */
export function PriceTag({
  label,
  listPrice,
  offer,
  size = "card",
  onExpire,
  className = "",
}: {
  label?: string
  listPrice: number
  offer?: ApiOffer | null
  size?: "card" | "detail"
  onExpire?: () => void
  className?: string
}) {
  const money = useMoney()
  const [ended, setEnded] = useState(false)
  const live = offer && !ended ? offer : null

  const labelEl = label ? (
    <span className={size === "card" ? "mr-0.5 text-[9px] uppercase opacity-70" : "mr-1 text-[11px] font-semibold uppercase tracking-wide opacity-50"}>
      {label}
    </span>
  ) : null

  if (!live) {
    return (
      <span className={className}>
        {labelEl}
        <span className="tabular-nums">{money(listPrice)}</span>
      </span>
    )
  }

  const expire = () => {
    setEnded(true)
    onExpire?.()
  }

  if (size === "card") {
    return (
      <span className={`inline-flex flex-col ${className}`}>
        <span>
          {labelEl}
          <s className="mr-1 font-normal opacity-55 tabular-nums" aria-label={`was ${money(live.original_price)}`}>
            {money(live.original_price)}
          </s>
          <span className="tabular-nums">{money(live.price)}</span>
          <span className="ml-1 rounded bg-[var(--bs-pink,#f591ac)] px-1 text-[9px] font-bold text-[#141a32]">
            −{live.saving_percent}%
          </span>
        </span>
        <Countdown target={live.ends_at} onExpire={expire} className="text-[10px] font-semibold opacity-70" />
      </span>
    )
  }

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <span>
        {labelEl}
        <s className="mr-1.5 font-semibold opacity-50 tabular-nums" aria-label={`was ${money(live.original_price)}`}>
          {money(live.original_price)}
        </s>
        <span className="font-extrabold tabular-nums">{money(live.price)}</span>
      </span>
      <span className="text-[12px] font-semibold">
        Save {money(live.saving)} ({live.saving_percent}%) · {live.campaign.name}
      </span>
      <Countdown target={live.ends_at} onExpire={expire} className="text-[12px] font-bold" />
    </span>
  )
}
