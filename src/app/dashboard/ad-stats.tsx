"use client"

import { useEffect, useState } from "react"
import { getAdStats, type AdStats, type AdTotals } from "@/lib/api"
import { useMoney } from "@/lib/money"

/**
 * Part E (PR 3): one ad's results - totals and a daily chart for the last
 * 7 or 30 days. Impressions count only cards that were really seen (half
 * visible for a second); clicks are the charged (valid) ones.
 */

type Metric = "impressions" | "clicks" | "spend" | "sales"
const METRICS: { key: Metric; label: string }[] = [
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Clicks" },
  { key: "spend", label: "Spend" },
  { key: "sales", label: "Sales" },
]

export function AdTotalsLine({ totals }: { totals: AdTotals | null | undefined }) {
  const money = useMoney()
  if (!totals || (totals.impressions === 0 && totals.clicks === 0)) {
    return <p className="text-sm text-foreground/60">No results yet: your ad hasn&apos;t been seen.</p>
  }
  return (
    <p className="text-sm text-foreground/70 tabular-nums">
      {totals.impressions.toLocaleString()} impressions · {totals.clicks.toLocaleString()} clicks ({totals.click_rate}%)
      · {money(totals.spend)} spent · {totals.sales} sales
      {totals.cost_per_sale ? ` · ${money(totals.cost_per_sale)} per sale` : ""}
    </p>
  )
}

export function AdStatsPanel({ adId }: { adId: number }) {
  const money = useMoney()
  const [days, setDays] = useState<7 | 30>(7)
  const [metric, setMetric] = useState<Metric>("clicks")
  const [stats, setStats] = useState<{ days: 7 | 30; data: AdStats | null } | null>(null)

  useEffect(() => {
    let live = true
    getAdStats(adId, days).then((data) => {
      if (live) setStats({ days, data })
    })
    return () => {
      live = false
    }
  }, [adId, days])

  const loading = !stats || stats.days !== days
  const data = stats?.data
  const t = data?.totals
  const values = (data?.series ?? []).map((d) => Number(d[metric]))
  const isMoney = metric === "spend"

  return (
    <div className="space-y-3 rounded-xl bg-foreground/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Period" className="inline-flex rounded-full border p-0.5 text-sm">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1 ${days === d ? "bg-foreground text-background" : ""}`}
            >
              {d} days
            </button>
          ))}
        </div>
        <div role="group" aria-label="Chart" className="flex flex-wrap gap-1 text-[13px]">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-full border px-2.5 py-0.5 ${metric === m.key ? "border-foreground font-semibold" : "border-foreground/15 text-foreground/70"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-foreground/60">Loading results…</p>
      ) : !data || !t ? (
        <p className="py-8 text-center text-sm text-foreground/60">Couldn&apos;t load the results. Try again later.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Impressions" value={t.impressions.toLocaleString()} />
            <Stat label="Clicks" value={t.clicks.toLocaleString()} hint={`${t.click_rate}% click rate`} />
            <Stat label="Spent" value={money(t.spend)} />
            <Stat label="Sales" value={String(t.sales)} hint={`${money(t.revenue)} revenue`} />
            <Stat label="Cost per sale" value={t.cost_per_sale ? money(t.cost_per_sale) : "–"} />
            {t.invalid_clicks ? (
              <Stat label="Invalid clicks" value={String(t.invalid_clicks)} hint="Not charged (repeats, bots…)" />
            ) : null}
          </dl>
          {values.every((v) => v === 0) ? (
            <p className="py-6 text-center text-sm text-foreground/60">Nothing in this period yet.</p>
          ) : (
            <BarChart
              values={values}
              days={data.series.map((d) => d.day)}
              label={`${METRICS.find((m) => m.key === metric)?.label} per day, last ${days} days`}
              format={(v) => (isMoney ? money(String(v)) : v.toLocaleString())}
            />
          )}
          <p className="text-[12px] text-foreground/55">
            A sale counts when a reader buys the book within a week of a charged click on your ad.
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-foreground/10 bg-background p-2">
      <dt className="text-[12px] text-foreground/60">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-[11px] text-foreground/55">{hint}</dd>}
    </div>
  )
}

/** A small accessible bar chart (no chart library): one bar per day. */
function BarChart({
  values,
  days,
  label,
  format,
}: {
  values: number[]
  days: string[]
  label: string
  format: (v: number) => string
}) {
  const W = 600
  const H = 140
  const pad = 18
  const max = Math.max(1, ...values)
  const step = (W - pad * 2) / Math.max(1, values.length)
  const bw = Math.max(2, step * 0.7)
  const total = values.reduce((a, b) => a + b, 0)
  const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={`${label}. Total ${format(total)}.`} className="h-auto w-full">
        <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="currentColor" strokeOpacity="0.2" />
        {values.map((v, i) => {
          const h = (v / max) * (H - 16)
          return (
            <rect
              key={days[i]}
              x={pad + i * step + (step - bw) / 2}
              y={H - h}
              width={bw}
              height={Math.max(v > 0 ? 1.5 : 0, h)}
              rx="2"
              className="fill-[var(--brand-pink-text)]"
            >
              <title>{`${fmtDay(days[i])}: ${format(v)}`}</title>
            </rect>
          )
        })}
        <text x={pad} y={H + 16} fontSize="11" fill="currentColor" fillOpacity="0.6">{fmtDay(days[0])}</text>
        <text x={W - pad} y={H + 16} fontSize="11" textAnchor="end" fill="currentColor" fillOpacity="0.6">
          {fmtDay(days[days.length - 1])}
        </text>
        <text x={pad} y={10} fontSize="11" fill="currentColor" fillOpacity="0.6">{format(max)}</text>
      </svg>
      <figcaption className="text-[12px] text-foreground/60">{label}</figcaption>
    </figure>
  )
}
