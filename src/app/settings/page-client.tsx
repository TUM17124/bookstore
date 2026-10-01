"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import {
  cancelProSubscription,
  changeName,
  changeUsername,
  confirmEmailChange,
  deleteAccount,
  getNotificationPrefs,
  getProStatus,
  getSettings,
  requestAffiliateWithdrawal,
  startEmailChange,
  updateNotificationPrefs,
  type NotificationPrefs,
  type ProStatus,
} from "@/lib/api"
import { clientLogout, isLoggedIn } from "@/lib/auth-client"
import { splitName } from "@/lib/name"
import { AffiliateInvite } from "@/components/affiliate-invite"
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushSubscription,
} from "@/lib/push"
import { useAsyncAction, type ActionContext } from "@/hooks/use-async-action"
import { ActionButton, ActionStatus } from "@/components/ui/action-button"

/**
 * A settings form whose submit button runs one request with the shared
 * button states (Part A): "Saving…", retry countdown, "Saved", or the
 * error + "Try again" right under the form. Writes are retried with one
 * idempotency key (the endpoints are idempotent server-side).
 */
function ActionForm({
  run,
  onDone,
  label,
  loadingLabel = "Saving…",
  successLabel = "Saved",
  buttonClassName,
  className,
  disabled,
  confirmText,
  children,
}: {
  run: (ctx: ActionContext, form: FormData) => Promise<unknown>
  onDone?: () => void
  label: ReactNode
  loadingLabel?: string
  successLabel?: string
  buttonClassName: string
  className: string
  disabled?: boolean
  /** Ask before sending (destructive actions). */
  confirmText?: string
  children: ReactNode
}) {
  const action = useAsyncAction(run, { onSuccess: onDone })
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (confirmText && !confirm(confirmText)) return
          void action.run(new FormData(e.currentTarget))
        }}
        className={className}
      >
        {children}
        <ActionButton
          type="submit"
          action={action}
          disabled={disabled}
          loadingLabel={loadingLabel}
          successLabel={successLabel}
          errorPlacement="none"
          retryPlacement="none"
          className={`${buttonClassName} aria-busy:opacity-80`}
        >
          {label}
        </ActionButton>
      </form>
      <ActionStatus action={action} className="mt-2 text-sm text-foreground/60" />
      {action.errorText ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {action.errorText}
        </p>
      ) : null}
    </div>
  )
}

/** A notification-preference checkbox that saves on change: busy while
 * saving, reverts and explains if saving fails. */
function PrefToggle({
  checked,
  disabled,
  save,
}: {
  checked: boolean
  disabled: boolean
  save: (ctx: ActionContext, next: boolean) => Promise<unknown>
}) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const action = useAsyncAction(save, {
    successMs: 0,
    onSuccess: () => setOptimistic(null),
    onError: () => setOptimistic(null),
  })
  return (
    <span className="flex shrink-0 flex-col items-end">
      <input
        type="checkbox"
        className="h-5 w-5 shrink-0"
        checked={optimistic ?? checked}
        disabled={disabled}
        aria-busy={action.busy || undefined}
        onChange={(e) => {
          if (action.busy) return
          setOptimistic(e.target.checked)
          void action.run(e.target.checked)
        }}
      />
      {action.busy ? <span className="mt-1 text-xs text-foreground/50" role="status">Saving…</span> : null}
      {action.errorText ? (
        <span className="mt-1 max-w-[12rem] text-right text-xs text-red-600" role="alert">
          {action.errorText}
        </span>
      ) : null}
    </span>
  )
}

function ProSection({
  proStatus,
  onCancelled,
}: {
  proStatus: ProStatus | null
  onCancelled: (updated: ProStatus) => void
}) {
  const [confirmed, setConfirmed] = useState(false)

  const cancel = useAsyncAction(
    (ctx, subscriptionId: number) => cancelProSubscription(subscriptionId, ctx),
    {
      errorFallback: "Could not cancel. Please try again.",
      onSuccess: () => {
        setConfirmed(false)
        if (proStatus?.subscription) {
          onCancelled({ is_pro: false, subscription: { ...proStatus.subscription, status: "cancelled" } })
        }
      },
    },
  )

  function handleCancel() {
    if (!proStatus?.subscription?.id) return
    if (!confirmed) {
      setConfirmed(true)
      return
    }
    void cancel.run(proStatus.subscription.id)
  }

  return (
    <section className="min-w-0 space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Pro</h2>
      {proStatus?.is_pro ? (
        <>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#d4af37]/15 px-3 py-1 text-sm font-bold text-[#a3811f]">
            ★ PlugYard Pro
          </p>
          <p className="text-sm text-foreground/60">
            {proStatus.subscription?.expires_at
              ? `Renews or expires on ${new Date(
                  proStatus.subscription.expires_at,
                ).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}.`
              : "Your subscription is active."}
          </p>
          <ActionButton
            action={cancel}
            onClick={handleCancel}
            loadingLabel="Cancelling…"
            successLabel="Cancelled"
            errorClassName="text-sm text-red-600"
            className="rounded-lg border border-red-400 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {confirmed ? "Tap again to confirm cancel" : "Cancel subscription"}
          </ActionButton>
          {confirmed && (
            <p className="text-xs text-foreground/50">
              Your Pro access continues until {proStatus.subscription?.expires_at
                ? new Date(proStatus.subscription.expires_at).toLocaleDateString()
                : "the end of the billing period"}.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-foreground/80">Free plan</p>
          <p className="text-sm text-foreground/60">
            Upgrade for the floating pop-out reader/player, AI narration with
            multiple voices, auto-scroll, and sentence highlighting.
          </p>
          <Link
            href="/pro"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#d4af37] px-4 py-2 text-sm font-bold text-[#3a2e08]"
          >
            ★ Upgrade to Pro
          </Link>
        </>
      )}
    </section>
  )
}

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "email", label: "Email" },
  { id: "notifications", label: "Notifications" },
  { id: "pro", label: "Pro" },
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
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [deviceSubscribed, setDeviceSubscribed] = useState(false)
  const [proStatus, setProStatus] = useState<ProStatus | null>(null)

  const reload = () => getSettings().then(setData).catch((e) => setError(e.message))

  const reloadNotificationPrefs = () => {
    getNotificationPrefs().then(setPrefs).catch(() => {})
    getPushSubscription()
      .then((sub) => setDeviceSubscribed(!!sub))
      .catch(() => setDeviceSubscribed(false))
  }

  useEffect(() => {
    const ok = isLoggedIn()
    setLoggedIn(ok)
    setReady(true)
    if (ok) {
      reload()
      reloadNotificationPrefs()
      getProStatus().then(setProStatus).catch(() => {})
    }
  }, [])

  const pushToggle = useAsyncAction(
    // Browser permission + subscription; not an API retry candidate.
    async (_ctx, subscribed: boolean) => {
      if (subscribed) await disablePushNotifications()
      else await enablePushNotifications()
      return !subscribed
    },
    {
      errorFallback: "Couldn't change push notifications on this device. Please try again.",
      onSuccess: (next) => {
        setDeviceSubscribed(!!next)
        setNotice(next ? "Push notifications enabled on this device." : "Push notifications turned off on this device.")
      },
    },
  )

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
                <ActionForm
                  run={(ctx, f) => {
                    const [first, last] = splitName(String(f.get("name")))
                    return changeName(first, last, ctx)
                  }}
                  onDone={reload}
                  label="Save name"
                  className="flex flex-col gap-2 sm:flex-row"
                  buttonClassName="w-full rounded bg-black px-4 py-2 text-white sm:w-auto"
                >
                  <input
                    name="name"
                    defaultValue={[data.user.first_name, data.user.last_name].filter(Boolean).join(" ") || data.user.name || ""}
                    placeholder="Full name"
                    autoComplete="name"
                    className="min-w-0 w-full rounded border p-2 sm:flex-1"
                  />
                </ActionForm>
                <ActionForm
                  run={(ctx, f) => changeUsername(String(f.get("username")), ctx)}
                  onDone={reload}
                  label="Change username"
                  className="flex flex-col gap-2 sm:flex-row"
                  buttonClassName="w-full rounded bg-black px-4 py-2 text-white sm:w-auto"
                >
                  <input name="username" defaultValue={data.user.username} className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                </ActionForm>
              </section>
            )}

            {active === "email" && (
              <section className="min-w-0 space-y-3 rounded-xl border p-5">
                <h2 className="text-xl font-semibold">Email</h2>
                <ActionForm
                  run={(ctx, f) => startEmailChange(String(f.get("email")), String(f.get("password")), ctx)}
                  label="Verify new email"
                  loadingLabel="Sending code…"
                  successLabel="Code sent"
                  className="flex flex-col gap-2 sm:flex-row"
                  buttonClassName="w-full rounded bg-black px-4 py-2 text-white sm:w-auto"
                >
                  <input name="email" type="email" placeholder="New email" className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                  <input name="password" type="password" placeholder="Current password" className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                </ActionForm>
                <ActionForm
                  run={(ctx, f) => confirmEmailChange(String(f.get("code")), ctx)}
                  onDone={reload}
                  label="Confirm"
                  loadingLabel="Confirming…"
                  successLabel="Email changed"
                  className="flex flex-col gap-2 sm:flex-row"
                  buttonClassName="w-full rounded border px-4 py-2 sm:w-auto"
                >
                  <input name="code" placeholder="Verification code" className="min-w-0 w-full rounded border p-2 sm:flex-1" />
                </ActionForm>
              </section>
            )}

            {active === "notifications" && (
              <section className="min-w-0 space-y-4 rounded-xl border p-5">
                <h2 className="text-xl font-semibold">Notifications</h2>
                <p className="text-sm text-foreground/60">
                  Control the notes PlugYard sends you — unfinished pages, new titles, and invite
                  rewards. Turning a channel off does not clear your inbox above, just stops new
                  alerts through that channel.
                </p>

                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">Email notifications</span>
                      <span className="block break-words text-xs text-foreground/60">
                        Reminders and alerts sent to {data.user.email}
                      </span>
                    </span>
                    <PrefToggle
                      checked={prefs?.email_enabled ?? true}
                      disabled={!prefs}
                      save={async (ctx, email_enabled) => setPrefs(await updateNotificationPrefs({ email_enabled }, ctx))}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">Push notifications</span>
                      <span className="block break-words text-xs text-foreground/60">
                        Alerts sent to devices where you allowed push
                        {prefs ? ` · ${prefs.active_devices} device(s) active` : ""}
                      </span>
                    </span>
                    <PrefToggle
                      checked={prefs?.push_enabled ?? true}
                      disabled={!prefs}
                      save={async (ctx, push_enabled) => setPrefs(await updateNotificationPrefs({ push_enabled }, ctx))}
                    />
                  </label>
                </div>

                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">This device</p>
                  <p className="mt-1 text-xs text-foreground/60">
                    {deviceSubscribed
                      ? "This browser is subscribed to push notifications."
                      : "This browser is not currently subscribed to push notifications."}
                  </p>
                  <ActionButton
                    action={pushToggle}
                    onClick={() => {
                      setNotice("")
                      void pushToggle.run(deviceSubscribed)
                    }}
                    loadingLabel={deviceSubscribed ? "Turning off…" : "Turning on…"}
                    successLabel="Done"
                    errorClassName="mt-2 text-sm text-red-600"
                    className="mt-3 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    {deviceSubscribed ? "Turn off push on this device" : "Turn on push on this device"}
                  </ActionButton>
                </div>
              </section>
            )}

            {active === "pro" && (
              <ProSection
                proStatus={proStatus}
                onCancelled={(updated) => setProStatus(updated)}
              />
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
                <ActionForm
                  run={(ctx, f) => requestAffiliateWithdrawal(String(f.get("amount")), ctx)}
                  onDone={reload}
                  disabled={!payoutReady}
                  label="Request withdrawal"
                  loadingLabel="Requesting…"
                  successLabel="Requested"
                  className="flex flex-col gap-2 sm:flex-row"
                  buttonClassName="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50 sm:w-auto"
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
                </ActionForm>
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
                <ActionForm
                  confirmText="Permanently delete your account?"
                  run={(ctx, f) =>
                    deleteAccount(
                      {
                        current_password: String(f.get("password")),
                        reason: String(f.get("reason")),
                      },
                      ctx,
                    )
                  }
                  onDone={() => {
                    clientLogout()
                    // Full reload on purpose: drop every bit of signed-in state.
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                    location.href = "/"
                  }}
                  label="Delete my account"
                  loadingLabel="Deleting…"
                  successLabel="Deleted"
                  className="flex flex-col gap-2"
                  buttonClassName="w-fit rounded bg-red-700 px-4 py-2 text-white"
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
                </ActionForm>
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
