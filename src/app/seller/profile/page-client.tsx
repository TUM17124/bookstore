"use client"

import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"
import { BadgeCheck, Camera, ExternalLink } from "lucide-react"
import { getToken } from "@/lib/api"
import { mySellerProfile, updateSellerProfile, type SellerProfile } from "@/lib/marketplace"

export default function SellerProfilePage() {
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!getToken()) { window.location.href = `/login?next=${encodeURIComponent("/seller/profile")}`; return }
    mySellerProfile().then(setProfile).catch((error) => setNotice(error instanceof Error ? error.message : "Could not load your profile."))
  }, [])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice("")
    try {
      const form = new FormData(event.currentTarget)
      form.set("show_location", String((event.currentTarget.elements.namedItem("show_location") as HTMLInputElement).checked))
      form.set("message_notifications", String((event.currentTarget.elements.namedItem("message_notifications") as HTMLInputElement).checked))
      const next = await updateSellerProfile(form); setProfile(next); setNotice("Seller profile saved.")
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not save your profile.") }
    finally { setSaving(false) }
  }
  if (!profile) return <main className="mx-auto max-w-3xl px-4 py-10"><p>{notice || "Loading seller profile…"}</p></main>
  return <main className="mx-auto max-w-4xl px-4 py-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-semibold text-pink-600">Seller dashboard</p><h1 className="text-4xl font-black">Public profile</h1><p className="mt-2 text-foreground/60">Control the information buyers see. Identity and contact records remain private.</p></div><Link href={`/sellers/${profile.slug}/`} target="_blank" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 font-bold"><ExternalLink className="h-4 w-4"/>View public profile</Link></div>
    {profile.verified && <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-pink-100 px-4 py-2 font-bold text-pink-700"><BadgeCheck className="h-5 w-5"/>Identity Verified</p>}
    {notice && <p role="status" className="mt-5 rounded-xl bg-pink-50 p-3 text-pink-950">{notice}</p>}
    <form onSubmit={submit} className="mt-7 space-y-6 rounded-3xl border bg-white p-5 shadow-sm dark:bg-zinc-950 sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><Field label="Display name"><input name="display_name" required maxLength={160} defaultValue={profile.display_name} className="input"/></Field><Field label="Public profile URL"><div className="flex rounded-xl border"><span className="flex items-center bg-zinc-50 px-3 text-sm text-foreground/50 dark:bg-zinc-900">/sellers/</span><input name="slug" required defaultValue={profile.slug} className="min-w-0 flex-1 rounded-r-xl p-3"/></div></Field></div><Field label="Biography"><textarea name="biography" maxLength={3000} rows={6} defaultValue={profile.biography} className="input"/></Field><Field label="Public business details"><textarea name="business_details" maxLength={2000} rows={4} defaultValue={profile.business_details} className="input"/></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Public location"><input name="public_location" maxLength={160} defaultValue={profile.public_location} className="input"/></Field><label className="flex items-center gap-3 self-end rounded-xl border p-3"><input type="checkbox" name="show_location" value="true" defaultChecked={profile.show_location} className="h-4 w-4 accent-pink-600"/>Show my general location publicly</label></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Profile image"><input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" className="input"/><span className="mt-1 flex items-center gap-1 text-xs text-foreground/50"><Camera className="h-3 w-3"/>Square images work best.</span></Field><Field label="Storefront banner"><input type="file" name="banner" accept="image/png,image/jpeg,image/webp" className="input"/></Field></div><label className="flex items-center gap-3 rounded-xl border p-3"><input type="checkbox" name="message_notifications" value="true" defaultChecked={profile.message_notifications} className="h-4 w-4 accent-pink-600"/>Notify me about buyer messages</label><button disabled={saving} className="flex min-h-12 w-full items-center justify-center rounded-full bg-pink-600 px-6 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save public profile"}</button></form>
    <div className="mt-5 flex flex-wrap gap-2"><Link href="/seller/listings" className="rounded-full border px-4 py-2 font-bold">My listings</Link><Link href="/seller/orders" className="rounded-full border px-4 py-2 font-bold">Orders &amp; earnings</Link><Link href="/seller/verification" className="rounded-full border px-4 py-2 font-bold">Seller verification</Link></div>
  </main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-sm font-semibold">{label}</span><div className="mt-1">{children}</div></label> }
