"use client"

import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"
import {
  changeName,
  changeUsername,
  confirmEmailChange,
  deleteAccount,
  getSettings,
  requestAffiliateWithdrawal,
  startEmailChange,
} from "@/lib/api"
import { clientLogout, isLoggedIn } from "@/lib/auth-client"
import { AffiliateInvite } from "@/components/affiliate-invite"

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "email", label: "Email" },
  { id: "affiliate", label: "Affiliate & rewards" },
  { id: "history", label: "History" },
  { id: "delete", label: "Delete account" },
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

export default function SettingsPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loggedIn, setLoggedIn] = useState(false)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState<SectionId>("profile")

  const reload = () => getSettings().then(setData).catch((e) => setError(e.message))

  useEffect(() => {
    const ok = isLoggedIn()
    setLoggedIn(ok)
    setReady(true)
    if (ok) reload()
  }, [])

  if (!ready) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <p className="text-sm text-foreground/60">Loading…</p>
      </main>
    )
  }

  if (!loggedIn) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-3 text-sm text-foreground/60">
          Sign in to manage your profile, affiliate rewards, and account.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/login?next=/settings" className="underline">
            Log in
          </Link>
          {" · "}
          <Link href="/signup?next=/settings" className="underline">
            Sign up
          </Link>
        </p>
      </main>
    )
  }

  const submit = async (fn: () => Promise<any>) => {
    setError("")
    setNotice("")
    try {
      await fn()
      setNotice("Saved.")
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed")
    }
  }

  const a = data?.affiliate
  const payoutReady = Boolean(data?.payout_account?.ready)

  return (
    <main className="mx-auto max-w-6xl overflow-x-hidden px-4 py-10 sm:py-16">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-sm text-foreground/60">
          Manage your profile, affiliate rewards, and account.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded border border-red-400 p-3 text-red-700">{error}</p>
      )}
      {notice && (
        <p className="mb-4 rounded border border-emerald-400 p-3 text-emerald-700">
          {notice}
        </p>
      )}

      {!data ? (
        <p>Loading…</p>
      ) : (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:hidden">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active === s.id
                    ? "border-black bg-black text-white"
                    : "border-foreground/15 text-foreground/70"
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <nav className="hidden w-52 shrink-0 sm:block">
            <ul className="space-y-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActive(s.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      active === s.id
                        ? "bg-black text-white"
                        : "text-foreground/70 hover:bg-foreground/5"
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 w-full flex-1 space-y-8">
            {active === "profile" && (
              <section className="min-w-0 space-y-3 rounded-xl border p-5">
                <h2 className="text-xl font-semibold">Profile</h2>
                <p className="break-words">
                  {data.user.name || data.user.username} · {data.user.email}
                </p>
                <form
                  onSubmit={(e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    submit(() =>
                      changeName(String(f.get("first_name")), String(f.get("last_name"))),
                    )
                  }}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input name="first_name" defaultValue={data.user.first_name || ""} placeholder="First name" className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                  <input name="last_name" defaultValue={data.user.last_name || ""} placeholder="Last name" className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                  <button className="w-full rounded bg-black px-4 py-2 text-white sm:w-auto">Save name</button>
                </form>
                <form
                  onSubmit={(e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    submit(() => changeUsername(String(f.get("username"))))
                  }}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input name="username" defaultValue={data.user.username} className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                  <button className="w-full rounded bg-black px-4 py-2 text-white sm:w-auto">Change username</button>
                </form>
              </section>
            )}

            {active === "email" && (
              <section className="min-w-0 space-y-3 rounded-xl border p-5">
                <h2 className="text-xl font-semibold">Email</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    submit(() =>
                      startEmailChange(String(f.get("email")), String(f.get("password"))),
                    )
                  }}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input name="email" type="email" placeholder="New email" className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                  <input name="password" type="password" placeholder="Current password" className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                  <button className="w-full rounded bg-black px-4 py-2 text-white sm:w-auto">Verify new email</button>
                </form>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    submit(() => confirmEmailChange(String(f.get("code"))))
                  }}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input name="code" placeholder="Verification code" className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                  <button className="w-full rounded border px-4 py-2 sm:w-auto">Confirm</button>
                </form>
              </section>
            )}

            {active === "affiliate" && (
              <section className="min-w-0 space-y-4 rounded-xl border p-5">
                <h2 className="text-xl font-semibold">Affiliate & rewards</h2>
                <AffiliateInvite code={a.code} referralReward={a.referral_reward} />
                <p className="text-sm text-foreground/60">
                  Payout account:{" "}
                  {payoutReady
                    ? `${data.payout_account.method} · ${data.payout_account.account_name} · ${data.payout_account.account_number}`
                    : "Not set. Add one in Dashboard before withdrawing."}
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Stat label="Invited" value={a.referrals} />
                  <Stat label="Eligible" value={a.eligible_referrals} />
                  <Stat label="Accepted books" value={a.accepted_books} />
                  <Stat label="Available" value={`KES ${a.available_balance}`} />
                  <Stat label="Earned" value={`KES ${a.earned}`} />
                  <Stat label="Withdrawn" value={`KES ${a.withdrawn}`} />
                  <Stat label="Invite reward" value={`KES ${a.referral_reward}`} />
                  <Stat label="Book reward" value={`KES ${a.book_reward}`} />
                  <Stat label="Minimum withdrawal" value={`KES ${a.minimum_withdrawal}`} />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    submit(() => requestAffiliateWithdrawal(String(f.get("amount"))))
                  }}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    required
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Withdrawal amount"
                    className="min-w-0 w-full rounded border p-2 sm:flex-1"
                  />
                  <button className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50 sm:w-auto" disabled={!payoutReady}>
                    Request withdrawal
                  </button>
                </form>
              </section>
            )}

            {active === "history" && (
              <section className="min-w-0 space-y-4 rounded-xl border p-5">
                <h2 className="text-xl font-semibold">History</h2>

                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">
                    Withdrawals
                  </h3>
                  {data.withdrawals?.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b text-foreground/50">
                            <th className="py-2 pr-3">Date</th>
                            <th className="py-2 pr-3">Amount</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.withdrawals.map((w: any) => (
                            <tr key={w.id} className="border-b border-foreground/10">
                              <td className="py-2 pr-3 whitespace-nowrap">
                                {w.created_at ? new Date(w.created_at).toLocaleString() : "—"}
                              </td>
                              <td className="py-2 pr-3">KES {w.amount}</td>
                              <td className="py-2 pr-3 capitalize">{w.status}</td>
                              <td className="py-2 break-all text-foreground/60">{w.note || w.paystack_reference || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/60">No withdrawals yet.</p>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground/50">
                    Reward ledger
                  </h3>
                  {data.ledger?.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b text-foreground/50">
                            <th className="py-2 pr-3">Date</th>
                            <th className="py-2 pr-3">Type</th>
                            <th className="py-2 pr-3">Amount</th>
                            <th className="py-2">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.ledger.map((x: any) => (
                            <tr key={x.id} className="border-b border-foreground/10">
                              <td className="py-2 pr-3 whitespace-nowrap">
                                {x.created_at ? new Date(x.created_at).toLocaleString() : "—"}
                              </td>
                              <td className="py-2 pr-3">{x.kind}</td>
                              <td className="py-2 pr-3">KES {x.amount}</td>
                              <td className="py-2 text-foreground/60">{x.description || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/60">No ledger entries yet.</p>
                  )}
                </div>
              </section>
            )}

            {active === "delete" && (
              <section className="min-w-0 space-y-3 rounded-xl border border-red-300 p-5">
                <h2 className="text-xl font-semibold text-red-700">Delete account</h2>
                <p className="text-sm">
                  This is consequential. Your public books remain in the library without ownership;
                  financial audit records are retained.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!confirm("Permanently delete your account?")) return
                    const f = new FormData(e.currentTarget)
                    submit(async () => {
                      const r = await deleteAccount({
                        current_password: String(f.get("password")),
                        reason: String(f.get("reason")),
                      })
                      clientLogout()
                      location.href = "/"
                      return r
                    })
                  }}
                  className="flex flex-col gap-2"
                >
                  <input
                    name="password"
                    type="password"
                    placeholder={
                      data.user.password_auth
                        ? "Current password"
                        : "Google re-authentication is required by the backend"
                    }
                    className="min-w-0 w-full rounded border p-2"
                  />
                  <textarea name="reason" placeholder="Reason (optional)" className="min-w-0 w-full rounded border p-2" />
                  <button className="w-fit rounded bg-red-700 px-4 py-2 text-white">Delete my account</button>
                </form>
              </section>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="min-w-0 rounded bg-foreground/5 p-3">
      <div className="text-foreground/60">{label}</div>
      <strong className="break-all">{value}</strong>
    </div>
  )
}
