"use client"

import { useState } from "react"
import { updateNotificationPrefs, type NotificationPrefs } from "@/lib/api"

type EditableKey = Exclude<keyof NotificationPrefs,
  "active_devices" | "marketing_consent_at" | "quiet_hours_start" | "quiet_hours_end" | "push_enabled" | "email_enabled">

const ROWS: { label: string; description: string; fields: Partial<Record<"in_app" | "push" | "email", EditableKey>> }[] = [
  { label: "Order updates", description: "Payments, delivery, refunds, and disputes", fields: { push: "order_push", email: "order_email" } },
  { label: "Messages and offers", description: "Private marketplace conversations and negotiations", fields: { push: "messages_push", email: "messages_email" } },
  { label: "Seller activity", description: "Orders, listing decisions, earnings, and verification", fields: { push: "seller_push", email: "seller_email" } },
  { label: "Wishlist updates", description: "Meaningful price or availability changes", fields: { in_app: "wishlist_in_app", push: "wishlist_push", email: "wishlist_email" } },
  { label: "Product recommendations", description: "Relevant discovery and occasional digests", fields: { in_app: "recommendations_in_app", push: "recommendations_push", email: "recommendations_email" } },
  { label: "Promotional campaigns", description: "Optional administrator-approved marketplace promotions", fields: { in_app: "marketing_in_app", push: "marketing_push", email: "marketing_email" } },
]

export default function NotificationPreferenceMatrix({ prefs, onChange }: {
  prefs: NotificationPrefs
  onChange: (next: NotificationPrefs) => void
}) {
  const [busy, setBusy] = useState<EditableKey | null>(null)
  async function change(field: EditableKey, value: boolean) {
    setBusy(field)
    try { onChange(await updateNotificationPrefs({ [field]: value })) }
    finally { setBusy(null) }
  }
  return <div className="overflow-x-auto rounded-xl border">
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead className="bg-pink-50 text-pink-950 dark:bg-pink-950/30 dark:text-pink-100"><tr><th className="p-3">Notification type</th><th className="p-3 text-center">In-app</th><th className="p-3 text-center">Push</th><th className="p-3 text-center">Email</th></tr></thead>
      <tbody>{ROWS.map((row) => <tr key={row.label} className="border-t"><td className="p-3"><strong>{row.label}</strong><span className="block text-xs text-foreground/60">{row.description}</span></td>{(["in_app", "push", "email"] as const).map((channel) => { const field = row.fields[channel]; return <td key={channel} className="p-3 text-center">{field ? <input type="checkbox" aria-label={`${row.label}: ${channel}`} checked={Boolean(prefs[field])} disabled={busy !== null} onChange={(event) => void change(field, event.target.checked)} className="h-5 w-5 accent-pink-600"/> : <span aria-label="Always on" className="text-xs text-foreground/45">Required</span>}</td> })}</tr>)}</tbody>
    </table>
    <p className="border-t p-3 text-xs text-foreground/60">Enabling a promotional channel records your current consent. Turning every promotional channel off withdraws that consent. Essential security and account notices remain available.</p>
  </div>
}
