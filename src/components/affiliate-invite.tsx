"use client"

import { useMoney } from "@/lib/money"
import { useState } from "react"
import { useFeature, useOffMessage } from "@/lib/site-config"

export function AffiliateInvite({
  code,
  referralReward,
  bookReward,
}: {
  code: string
  referralReward?: string
  bookReward?: string
}) {
  const money = useMoney()
  const [copied, setCopied] = useState<"link" | "code" | "">("")
  // Site: Features → invite rewards. Earned balances stay withdrawable.
  const invitesOn = useFeature("affiliate")
  const invitationRewardOn = useFeature("affiliate_invitation_rewards")
  const referredBookRewardOn = useFeature("affiliate_referred_book_rewards")
  const invitesOff = useOffMessage("affiliate")
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://plugyard.com"
  const link = `${origin}/signup?ref=${encodeURIComponent(code || "")}`

  async function copy(value: string, kind: "link" | "code") {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(""), 1800)
    } catch {
      setCopied("")
    }
  }

  if (!invitesOn) {
    return (
      <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm text-foreground/75">
        {invitesOff}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1 text-sm text-foreground/70">
        <p>Share your invite link or code. When a referred author publishes their first eligible book, they qualify for an invitation reward.</p>
        {invitationRewardOn
          ? <p>Invitation reward: <strong>{money(referralReward || 0)}</strong>, once per eligible invite.</p>
          : <p role="status">Invitation rewards are paused. Existing rewards remain available.</p>}
        {referredBookRewardOn
          ? <p>Referred book publishing reward: <strong>{money(bookReward || 0)}</strong> for each eligible book.</p>
          : <p role="status">Referred book publishing rewards are paused. Existing rewards remain available.</p>}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Invite link
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="min-w-0 flex-1 break-all rounded border bg-foreground/5 px-3 py-2 text-sm">
            {link}
          </code>
          <button
            type="button"
            onClick={() => copy(link, "link")}
            className="w-full rounded bg-foreground px-4 py-2 text-sm text-background sm:w-auto"
          >
            {copied === "link" ? "Copied" : "Copy link"}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Referral code
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <code className="min-w-0 flex-1 rounded border bg-foreground/5 px-3 py-2 text-sm tracking-widest">
            {code || "—"}
          </code>
          <button
            type="button"
            onClick={() => copy(code, "code")}
            disabled={!code}
            className="w-full rounded border px-4 py-2 text-sm sm:w-auto disabled:opacity-50"
          >
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
        </div>
      </div>
    </div>
  )
}
