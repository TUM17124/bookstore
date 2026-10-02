"use client"

import { useEffect, useMemo, useState } from "react"
import {
  declineCampaignEntry,
  getMyCampaigns,
  joinCampaign,
  updateCampaignEntry,
  withdrawCampaignEntry,
  type CampaignData,
  type CampaignEntryData,
  type CampaignProductLimits,
} from "@/lib/api"
import { useAsyncAction } from "@/hooks/use-async-action"
import { ActionButton } from "@/components/ui/action-button"
import { Countdown, formatLocalTime, noteServerTime } from "@/components/offers/countdown"
import { useCurrency, useMoney } from "@/lib/money"
import { errorMessage } from "@/lib/auth-fetch"

/**
 * Part C: the author's Campaigns tab. Join a campaign with your books and
 * offer prices (inside the campaign's discount range), edit or withdraw
 * before the join deadline, and decline books PlugYard added for you.
 */

const PHASE: Record<string, { label: string; cls: string }> = {
  upcoming: { label: "Upcoming", cls: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" },
  running: { label: "Running now", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  ended: { label: "Ended", cls: "bg-neutral-200 text-neutral-700" },
  off: { label: "Off", cls: "bg-neutral-200 text-neutral-700" },
}

const STATUS_CLS: Record<CampaignEntryData["status"], string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  withdrawn: "bg-neutral-200 text-neutral-700",
  declined: "bg-neutral-200 text-neutral-700",
}

function PriceField({
  id,
  label,
  limits,
  value,
  onChange,
}: {
  id: string
  label: string
  limits: CampaignProductLimits
  value: string
  onChange: (v: string) => void
}) {
  const money = useMoney()
  const currency = useCurrency()
  if (!limits) return null
  const ref = Number(limits.reference_price)
  const v = Number(value)
  const pct = value && ref ? Math.round(((ref - v) / ref) * 100) : null
  const inRange = value !== "" && v >= Number(limits.min_offer) && v <= Number(limits.max_offer)
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="font-medium">
        {label} offer price ({currency.code})
      </span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={limits.min_offer}
        max={limits.max_offer}
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${Number(limits.min_offer)}–${Number(limits.max_offer)}`}
        className="mt-1 block w-full rounded-lg border border-foreground/20 bg-background p-2"
      />
      <span className="mt-1 block text-[12px] text-foreground/60">
        Allowed {money(limits.min_offer)}–{money(limits.max_offer)}. Readers see it against {money(ref)}, the
        lowest price this book had recently.
        {value !== "" && (
          <span className={inRange ? " text-emerald-700 dark:text-emerald-400" : " text-red-600"}>
            {" "}
            {inRange ? (
              <>
                Readers will see <s>{money(ref)}</s> {money(v)} ({pct}% off).
              </>
            ) : (
              "Outside the allowed range."
            )}
          </span>
        )}
      </span>
    </label>
  )
}

function EntryRow({ c, e, onChanged }: { c: CampaignData; e: CampaignEntryData; onChanged: () => void }) {
  const money = useMoney()
  const [editing, setEditing] = useState(false)
  const [ebook, setEbook] = useState(e.ebook_offer_price ? String(Number(e.ebook_offer_price)) : "")
  const [audio, setAudio] = useState(e.audiobook_offer_price ? String(Number(e.audiobook_offer_price)) : "")
  const [reason, setReason] = useState("")
  const book = c.eligible_books.find((b) => b.id === e.book_id)
  const active = e.status === "pending" || e.status === "approved"

  const save = useAsyncAction(
    (ctx) => updateCampaignEntry(e.id, { ebook_offer_price: ebook || null, audiobook_offer_price: audio || null }, ctx),
    { errorFallback: "Couldn't save the prices.", onSuccess: () => { setEditing(false); onChanged() } },
  )
  const withdraw = useAsyncAction((ctx) => withdrawCampaignEntry(e.id, ctx), {
    errorFallback: "Couldn't withdraw it.",
    onSuccess: onChanged,
  })
  const decline = useAsyncAction((ctx) => declineCampaignEntry(e.id, reason, ctx), {
    errorFallback: "Couldn't decline it.",
    onSuccess: onChanged,
  })

  return (
    <li className="rounded-xl border border-foreground/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{e.book_title}</span>
        <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${STATUS_CLS[e.status]}`}>{e.status_label}</span>
        {e.added_by_admin && <span className="text-[12px] text-foreground/60">Added by PlugYard</span>}
      </div>
      <p className="mt-1 text-sm text-foreground/70">
        {e.ebook_offer_price && <>eBook {money(e.ebook_offer_price)}</>}
        {e.ebook_offer_price && e.audiobook_offer_price && " · "}
        {e.audiobook_offer_price && <>Audiobook {money(e.audiobook_offer_price)}</>}
      </p>
      {e.status === "rejected" && e.reject_reason && (
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">Reason: {e.reject_reason}</p>
      )}

      {editing && book ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(ev) => {
            ev.preventDefault()
            void save.run()
          }}
        >
          <PriceField id={`e-eb-${e.id}`} label="eBook" limits={book.ebook} value={ebook} onChange={setEbook} />
          <PriceField id={`e-au-${e.id}`} label="Audiobook" limits={book.audiobook} value={audio} onChange={setAudio} />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <ActionButton type="submit" action={save} loadingLabel="Saving…" successLabel="Saved"
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background">
              Save prices
            </ActionButton>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-sm text-foreground/60">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {c.can_join && active && !e.added_by_admin && book && (
            <button type="button" onClick={() => setEditing(true)}
              className="min-h-[40px] rounded-lg border border-foreground/20 px-3 text-sm font-medium">
              Edit prices
            </button>
          )}
          {c.can_join && active && !e.added_by_admin && (
            <ActionButton onClick={() => void withdraw.run()} action={withdraw} loadingLabel="Withdrawing…"
              className="min-h-[40px] rounded-lg border border-red-500/40 px-3 text-sm font-medium text-red-700 dark:text-red-300">
              Withdraw
            </ActionButton>
          )}
          {e.added_by_admin && c.can_decline && active && (
            <form className="flex flex-wrap items-center gap-2"
              onSubmit={(ev) => { ev.preventDefault(); void decline.run() }}>
              <label htmlFor={`decline-${e.id}`} className="sr-only">Reason (optional)</label>
              <input id={`decline-${e.id}`} value={reason} onChange={(ev) => setReason(ev.target.value)}
                placeholder="Reason (optional)" className="min-h-[40px] rounded-lg border border-foreground/20 bg-background px-2 text-sm" />
              <ActionButton type="submit" action={decline} loadingLabel="Declining…"
                className="min-h-[40px] rounded-lg border border-red-500/40 px-3 text-sm font-medium text-red-700 dark:text-red-300">
                Decline
              </ActionButton>
            </form>
          )}
        </div>
      )}
    </li>
  )
}

function JoinForm({ c, onJoined }: { c: CampaignData; onJoined: () => void }) {
  const taken = new Set(c.entries.filter((e) => e.status === "pending" || e.status === "approved").map((e) => e.book_id))
  const books = c.eligible_books.filter((b) => !taken.has(b.id))
  const [bookId, setBookId] = useState<number | "">("")
  const [ebook, setEbook] = useState("")
  const [audio, setAudio] = useState("")
  const book = books.find((b) => b.id === bookId)
  const full = taken.size >= c.max_books_per_author

  const join = useAsyncAction(
    (ctx) =>
      joinCampaign(c.id, { book_id: Number(bookId), ebook_offer_price: ebook || null, audiobook_offer_price: audio || null }, ctx),
    {
      errorFallback: "Couldn't join. Check the prices.",
      onSuccess: () => {
        setBookId("")
        setEbook("")
        setAudio("")
        onJoined()
      },
    },
  )

  if (full) return <p className="text-sm text-foreground/60">You&apos;ve added the most books allowed ({c.max_books_per_author}).</p>
  if (!books.length) return <p className="text-sm text-foreground/60">None of your published books can join this one.</p>

  return (
    <form
      className="grid gap-3 rounded-xl bg-foreground/[0.03] p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        void join.run()
      }}
    >
      <label htmlFor={`join-book-${c.id}`} className="block text-sm sm:col-span-2">
        <span className="font-medium">Book</span>
        <select
          id={`join-book-${c.id}`}
          value={bookId}
          onChange={(e) => {
            setBookId(e.target.value ? Number(e.target.value) : "")
            setEbook("")
            setAudio("")
          }}
          className="mt-1 block w-full rounded-lg border border-foreground/20 bg-background p-2"
        >
          <option value="">Choose one of your books</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      {book && (
        <>
          <PriceField id={`j-eb-${c.id}`} label="eBook" limits={book.ebook} value={ebook} onChange={setEbook} />
          <PriceField id={`j-au-${c.id}`} label="Audiobook" limits={book.audiobook} value={audio} onChange={setAudio} />
          <p className="text-[12px] text-foreground/60 sm:col-span-2">
            Set one or both. You earn your usual share of the offer price.
            {c.approval_required ? " PlugYard reviews each book before the campaign starts." : ""}
          </p>
          <div className="sm:col-span-2">
            <ActionButton type="submit" action={join} disabled={!ebook && !audio} loadingLabel="Joining…" successLabel="Joined"
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
              Join with this book
            </ActionButton>
          </div>
        </>
      )}
    </form>
  )
}

function CampaignCard({ c, onChanged }: { c: CampaignData; onChanged: () => void }) {
  const phase = PHASE[c.phase] ?? PHASE.off
  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">{c.name}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${phase.cls}`}>{phase.label}</span>
        {c.admin_only && <span className="text-[12px] text-foreground/60">Books added by PlugYard</span>}
      </div>
      {c.description && <p className="text-sm text-foreground/75">{c.description}</p>}
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-foreground/55">Runs: </dt><dd className="inline">{formatLocalTime(c.starts_at)} – {formatLocalTime(c.ends_at)}</dd></div>
        <div><dt className="inline text-foreground/55">Discount: </dt><dd className="inline">{c.min_discount_percent}–{c.max_discount_percent}% off</dd></div>
        <div><dt className="inline text-foreground/55">Books per author: </dt><dd className="inline">up to {c.max_books_per_author}</dd></div>
        <div><dt className="inline text-foreground/55">Categories: </dt><dd className="inline">{c.categories.length ? c.categories.map((x) => x.label).join(", ") : "All"}</dd></div>
        {!c.admin_only && (
          <div className="sm:col-span-2">
            <dt className="inline text-foreground/55">Join, edit or withdraw until: </dt>
            <dd className="inline">
              {formatLocalTime(c.join_deadline)}{" "}
              {c.can_join && <Countdown target={c.join_deadline} label="Closes in" onExpire={onChanged} className="font-semibold" />}
            </dd>
          </div>
        )}
      </dl>

      {c.entries.length > 0 && (
        <ul className="space-y-2">
          {c.entries.map((e) => (
            <EntryRow key={`${e.id}-${e.status}-${e.ebook_offer_price}-${e.audiobook_offer_price}`} c={c} e={e} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {c.can_join && <JoinForm c={c} onJoined={onChanged} />}
    </section>
  )
}

export function CampaignsTab() {
  const [data, setData] = useState<CampaignData[] | null>(null)
  const [error, setError] = useState("")
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    getMyCampaigns()
      .then((res) => {
        if (cancelled) return
        noteServerTime(res.server_now)
        setData(res.campaigns)
        setError("")
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Couldn't load campaigns."))
      })
    return () => {
      cancelled = true
    }
  }, [nonce])

  const reload = () => setNonce((n) => n + 1)
  const sorted = useMemo(() => data ?? [], [data])

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border p-4">
        <h2 className="text-xl font-bold">Campaigns</h2>
        <p className="mt-1 text-sm text-foreground/70">
          Put your books on offer during PlugYard sales. You choose the books and the offer price within each
          campaign&apos;s rules. Offers start and end on their own, and readers see the real saving and when it ends.
        </p>
      </section>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}{" "}
          <button type="button" onClick={reload} className="font-semibold underline">Try again</button>
        </p>
      )}
      {!data && !error && <p className="text-sm text-foreground/60">Loading campaigns…</p>}
      {data && sorted.length === 0 && (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-foreground/60">
          No campaigns are open right now. We&apos;ll let you know when one opens.
        </p>
      )}
      {sorted.map((c) => (
        <CampaignCard key={c.id} c={c} onChanged={reload} />
      ))}
    </div>
  )
}
