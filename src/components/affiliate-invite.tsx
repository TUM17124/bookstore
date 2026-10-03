"use client"

import { useMoney } from "@/lib/money"
import { useState } from "react"
import { useFeature, useOffMessage } from "@/lib/site-config"

export function AffiliateInvite({
  code,
  referralReward,
}: {
  code: string
  referralReward?: string
}) {
  const money = useMoney()
  const [copied, setCopied] = useState<"link" | "code" | "">("")
  // Site: Features → invite rewards. Earned balances stay withdrawable.
  const invitesOn = useFeature("affiliate")
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
      <p className="text-sm text-foreground/70">
        Share your invite link or code. When someone creates an account with it,
        they are tied to you. You earn{" "}
        <strong>{money(referralReward || 0)}</strong> when a referred author is
        published.
      </p>

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/50">
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
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground/50">
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
