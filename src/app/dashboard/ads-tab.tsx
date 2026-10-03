"use client"

import { useCallback, useEffect, useState } from "react"
import {
  confirmAdTopUp,
  createAd,
  getAdAccount,
  getMyAds,
  ProductPriceChangedError,
  startAdTopUp,
  updateAd,
  type AdAccount,
  type AdData,
  type AdInput,
  type PromoQuote,
} from "@/lib/api"
import { useAsyncAction } from "@/hooks/use-async-action"
import { ActionButton } from "@/components/ui/action-button"
import { useMoney } from "@/lib/money"
import { errorMessage } from "@/lib/auth-fetch"

/**
 * Part E: the author's Ads tab - ad balance and top-ups (Paystack), and
 * ads (one per book) charged per valid click: you pay exactly your bid,
 * never more than your balance or your daily budget.
 */

const STATUS: Record<AdData["status"], { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  paused: { label: "Paused", cls: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" },
  stopped: { label: "Stopped", cls: "bg-foreground/10 text-foreground/80" },
  ended: { label: "Ended", cls: "bg-foreground/10 text-foreground/80" },
}

const input =
  "w-full rounded-lg border border-foreground/15 bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"

function fieldErrors(err: unknown): Record<string, string> {
  const body = (err as { body?: { fields?: Record<string, string[] | string> } }).body
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(body?.fields || {})) out[k] = Array.isArray(v) ? v.join(" ") : String(v)
  return out
}

export function AdsTab() {
  const money = useMoney()
  const [account, setAccount] = useState<AdAccount | null>(null)
  const [ads, setAds] = useState<AdData[]>([])
  const [books, setBooks] = useState<{ id: string; title: string; has_ad: boolean }[]>([])
  const [amount, setAmount] = useState("")
  const [quote, setQuote] = useState<PromoQuote | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let live = true
    Promise.all([getAdAccount(), getMyAds()]).then(([acc, mine]) => {
      if (!live) return
      if (acc) {
        setAccount(acc)
        setAmount((a) => a || String(Math.round(Number(acc.min_topup))))
        setQuote((q) => q || acc.quote)
      }
      setAds(mine.ads)
      setBooks(mine.books)
    })
    return () => {
      live = false
    }
  }, [nonce])

  // Back from Paystack: confirm the top-up once, then tidy the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get("ad_topup_ref")
    if (!ref) return
    confirmAdTopUp(ref)
      .then((r) => {
        setNotice(
          r.paid
            ? { ok: true, text: `Payment received: ${money(r.credited || "0")} added to your ad balance.` }
            : { ok: false, text: r.error || "The payment is not complete. Nothing was added." },
        )
        reload()
      })
      .catch((err) => setNotice({ ok: false, text: errorMessage(err, "Couldn't check the payment. Reload to try again.") }))
    params.delete("ad_topup_ref")
    const q = params.toString()
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`)
  }, [money, reload])

  // The price for the amount typed (a promotion may lower it).
  useEffect(() => {
    if (!account || !amount || Number(amount) <= 0) return
    const t = window.setTimeout(() => {
      getAdAccount(amount).then((acc) => acc && setQuote(acc.quote))
    }, 350)
    return () => window.clearTimeout(t)
  }, [amount, account])

  const topUp = useAsyncAction(
    (ctx) => startAdTopUp(amount, quote?.final_amount, ctx),
    {
      successMs: 60_000,
      errorFallback: "Could not start the payment. Please try again.",
      onSuccess: (r) => {
        if (r?.checkout_url) window.location.href = r.checkout_url
      },
      onError: (err) => {
        if (err instanceof ProductPriceChangedError) setQuote(err.quote)
      },
    },
  )

  if (!account) return <p className="text-sm text-foreground/60">Loading your ads…</p>

  const belowMin = Number(amount || 0) < Number(account.min_topup)
  const discounted = quote && Number(quote.discount) > 0

  return (
    <div className="space-y-6">
      {notice && (
        <p role="status" className={`rounded-xl border p-3 text-sm ${notice.ok ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5"}`}>
          {notice.text}
        </p>
      )}
      {!account.enabled && (
        <div role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <p className="text-sm font-semibold">Ads are turned off</p>
          <p className="mt-1 text-sm text-foreground/70">{account.off_message}</p>
        </div>
      )}

      <section className="space-y-3 rounded-2xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Ad balance</h2>
          <p className="text-2xl font-bold tabular-nums">{money(account.balance)}</p>
        </div>
        {account.low_balance && Number(account.balance) > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-300">Your balance is low. Top up so your ads keep running.</p>
        )}
        <p className="text-sm text-foreground/70">
          You pay only when a reader clicks your ad, exactly your price per click, and never more than your balance or
          an ad&apos;s daily budget.
        </p>
        {account.enabled && (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="text-sm font-medium" htmlFor="ad-topup-amount">
              Top-up amount (minimum {money(account.min_topup)})
              <input
                id="ad-topup-amount"
                type="number"
                inputMode="numeric"
                min={account.min_topup}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`${input} mt-1`}
              />
            </label>
            <ActionButton
              action={topUp}
              onClick={() => void topUp.run()}
              disabled={belowMin || !quote}
              loadingLabel="Starting payment…"
              successLabel="Redirecting…"
              errorClassName="text-sm text-red-600"
              className="min-h-[44px] rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50"
            >
              {quote ? `Pay ${money(quote.final_amount)}` : "Top up"}
            </ActionButton>
          </div>
        )}
        {account.enabled && discounted && quote && (
          <p className="text-sm">
            <span className="line-through text-foreground/50">{money(quote.list_amount)}</span>{" "}
            <b>{money(quote.final_amount)}</b>
            {quote.promotion ? ` · ${quote.promotion.label}` : ""} · you get {money(quote.list_amount)} of ad balance
          </p>
        )}
        <details className="rounded-xl bg-foreground/[0.03] p-3 text-sm">
          <summary className="cursor-pointer font-medium">Refund policy</summary>
          <p className="mt-2 text-foreground/70">{account.refund_policy}</p>
        </details>
      </section>

      {account.enabled && <NewAd account={account} books={books.filter((b) => !b.has_ad)} onCreated={reload} />}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Your ads</h2>
        {ads.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-foreground/20 p-6 text-center text-sm text-foreground/60">
            No ads yet. Pick a book above to promote it.
          </p>
        ) : (
          ads.map((ad) => <AdRow key={ad.id} ad={ad} account={account} onChanged={reload} />)
        )}
      </section>
    </div>
  )
}

function NewAd({
  account,
  books,
  onCreated,
}: {
  account: AdAccount
  books: { id: string; title: string }[]
  onCreated: () => void
}) {
  const money = useMoney()
  const [bookId, setBookId] = useState("")
  const [bid, setBid] = useState(String(Math.round(Number(account.min_cpc))))
  const [budget, setBudget] = useState(String(Math.round(Number(account.min_daily_budget))))
  const [endsOn, setEndsOn] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const create = useAsyncAction(
    (ctx) =>
      createAd({ book_id: bookId || books[0]?.id, bid, daily_budget: budget, ends_on: endsOn || null } as AdInput, ctx),
    {
      errorFallback: "Could not create the ad. Please check the fields.",
      onSuccess: () => {
        setErrors({})
        setEndsOn("")
        onCreated()
      },
      onError: (err) => setErrors(fieldErrors(err)),
    },
  )
  if (!books.length) return null
  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <h2 className="text-lg font-bold">Promote a book</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2" htmlFor="ad-book">
          Book
          <select id="ad-book" value={bookId || books[0].id} onChange={(e) => setBookId(e.target.value)} className={`${input} mt-1`}>
            {books.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium" htmlFor="ad-bid">
          Price per click (min {money(account.min_cpc)})
          <input id="ad-bid" type="number" min={account.min_cpc} step="1" value={bid} onChange={(e) => setBid(e.target.value)} className={`${input} mt-1`} />
          {errors.bid && <span className="mt-1 block text-[12px] text-red-600">{errors.bid}</span>}
        </label>
        <label className="text-sm font-medium" htmlFor="ad-budget">
          Daily budget (min {money(account.min_daily_budget)})
          <input id="ad-budget" type="number" min={account.min_daily_budget} step="1" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${input} mt-1`} />
          {errors.daily_budget && <span className="mt-1 block text-[12px] text-red-600">{errors.daily_budget}</span>}
        </label>
        <label className="text-sm font-medium" htmlFor="ad-ends">
          Last day (optional)
          <input id="ad-ends" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={`${input} mt-1`} />
          {errors.ends_on && <span className="mt-1 block text-[12px] text-red-600">{errors.ends_on}</span>}
        </label>
      </div>
      <p className="text-[12px] text-foreground/60">
        At most {Math.max(1, Math.floor(Number(budget || 0) / Math.max(1, Number(bid || 1))))} paid clicks a day with these numbers.
      </p>
      <ActionButton
        action={create}
        onClick={() => void create.run()}
        loadingLabel="Creating…"
        successLabel="Created"
        errorClassName="text-sm text-red-600"
        className="min-h-[44px] rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50"
      >
        Start ad
      </ActionButton>
    </section>
  )
}

function AdRow({ ad, account, onChanged }: { ad: AdData; account: AdAccount; onChanged: () => void }) {
  const money = useMoney()
  const [editing, setEditing] = useState(false)
  const [bid, setBid] = useState(ad.bid)
  const [budget, setBudget] = useState(ad.daily_budget)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmStop, setConfirmStop] = useState(false)
  const run = useAsyncAction((ctx, input: AdInput) => updateAd(ad.id, input, ctx), {
    errorFallback: "Could not update the ad. Please try again.",
    onSuccess: () => {
      setEditing(false)
      setErrors({})
      onChanged()
    },
    onError: (err) => setErrors(fieldErrors(err)),
  })
  const st = STATUS[ad.status]
  const open = ad.status === "active" || ad.status === "paused"
  return (
    <article className="space-y-2 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{ad.book.title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${st.cls}`}>{st.label}</span>
        {ad.paused_by_admin && <span className="text-[12px] text-foreground/60">Paused by PlugYard</span>}
      </div>
      <p className="text-sm text-foreground/70 tabular-nums">
        {money(ad.bid)} per click · {money(ad.daily_budget)} a day{ad.ends_on ? ` · until ${ad.ends_on}` : ""}
      </p>
      {editing && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor={`bid-${ad.id}`}>
            Price per click (min {money(account.min_cpc)})
            <input id={`bid-${ad.id}`} type="number" value={bid} onChange={(e) => setBid(e.target.value)} className={`${input} mt-1`} />
            {errors.bid && <span className="mt-1 block text-[12px] text-red-600">{errors.bid}</span>}
          </label>
          <label className="text-sm font-medium" htmlFor={`budget-${ad.id}`}>
            Daily budget (min {money(account.min_daily_budget)})
            <input id={`budget-${ad.id}`} type="number" value={budget} onChange={(e) => setBudget(e.target.value)} className={`${input} mt-1`} />
            {errors.daily_budget && <span className="mt-1 block text-[12px] text-red-600">{errors.daily_budget}</span>}
          </label>
        </div>
      )}
      {open && (
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <ActionButton action={run} onClick={() => void run.run({ bid, daily_budget: budget })} loadingLabel="Saving…"
              errorClassName="text-sm text-red-600" className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">
              Save
            </ActionButton>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="rounded-full border px-4 py-2 text-sm">Edit</button>
          )}
          {ad.status === "active" ? (
            <button type="button" onClick={() => void run.run({ action: "pause" })} className="rounded-full border px-4 py-2 text-sm">Pause</button>
          ) : (
            !ad.paused_by_admin && account.enabled && (
              <button type="button" onClick={() => void run.run({ action: "resume" })} className="rounded-full border px-4 py-2 text-sm">Resume</button>
            )
          )}
          <button
            type="button"
            onClick={() => (confirmStop ? void run.run({ action: "stop" }) : setConfirmStop(true))}
            className="rounded-full border border-red-400 px-4 py-2 text-sm text-red-600"
          >
            {confirmStop ? "Tap again to stop for good" : "Stop"}
          </button>
        </div>
      )}
    </article>
  )
}
