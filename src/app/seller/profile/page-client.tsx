"use client"

import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"
import { BadgeCheck, Camera, ExternalLink } from "lucide-react"
import { getToken } from "@/lib/api"
import { changeName } from "@/lib/api"
import { refreshMe, setStoredUser, type AuthUser } from "@/lib/auth-client"
import { mySellerProfile, updateSellerProfile, type SellerProfile } from "@/lib/marketplace"

export default function SellerProfilePage() {
  const [profile, setProfile] = useState<SellerProfile | null>(null)
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)
  const [account, setAccount] = useState<AuthUser | null>(null)
  const [savingName, setSavingName] = useState(false)
  useEffect(() => {
    if (!getToken()) { window.location.href = `/login?next=${encodeURIComponent("/seller/profile")}`; return }
    Promise.all([mySellerProfile(), refreshMe()]).then(([seller, user]) => { setProfile(seller); setAccount(user) }).catch((error) => setNotice(error instanceof Error ? error.message : "Could not load your profile."))
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
  async function saveAccountName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingName(true); setNotice("")
    const data = new FormData(event.currentTarget)
    try {
      const result = await changeName(String(data.get("first_name") || ""), String(data.get("last_name") || "")) as { user?: AuthUser }
      if (result.user) { setStoredUser(result.user); setAccount(result.user) }
      setNotice("Account name saved.")
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save the account name.") }
    finally { setSavingName(false) }
  }
  if (!profile) return <main className="mx-auto max-w-3xl px-4 py-10"><p>{notice || "Loading seller profile…"}</p></main>
  return <main className="mx-auto max-w-4xl px-4 py-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-semibold text-[var(--brand-pink-text)]">Account</p><h1 className="text-4xl font-black">My Profile</h1><p className="mt-2 text-muted-foreground">Manage your private account details and the separate profile buyers can see.</p></div><Link href={`/sellers/${profile.slug}/`} target="_blank" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 font-bold"><ExternalLink className="h-4 w-4"/>View public storefront</Link></div>
    {profile.verified && <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 font-bold text-[var(--brand-pink-text)]"><BadgeCheck className="h-5 w-5"/>Identity Verified</p>}
    {notice && <p role="status" className="mt-5 rounded-xl bg-muted p-3 text-foreground">{notice}</p>}
    <section className="mt-7 rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-8"><h2 className="text-xl font-bold">Private account information</h2><p className="mt-1 text-sm text-muted-foreground">Your email is visible only to you here. Manage email changes and notification choices in Settings.</p><p className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm"><span className="font-semibold">Email:</span> {account?.email || "Loading…"}</p><form onSubmit={saveAccountName} className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="First name"><input name="first_name" maxLength={150} defaultValue={account?.first_name || ""} className="input"/></Field><Field label="Last name"><input name="last_name" maxLength={150} defaultValue={account?.last_name || ""} className="input"/></Field><button disabled={savingName} className="flex min-h-11 items-center justify-center rounded-full border px-5 font-semibold sm:col-span-2">{savingName ? "Saving…" : "Save account name"}</button></form><Link href="/settings/" className="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--brand-pink-text)] underline">Account, privacy &amp; contact preferences</Link></section>
    <form onSubmit={submit} className="mt-6 space-y-6 rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-8"><div><h2 className="text-xl font-bold">Public seller profile</h2><p className="mt-1 text-sm text-muted-foreground">These details are displayed on your storefront. Do not add private contact or payout details.</p></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Public seller name"><input name="display_name" required maxLength={120} defaultValue={profile.display_name} className="input"/></Field><Field label="Public profile URL"><div className="flex rounded-xl border"><span className="flex items-center bg-zinc-50 px-3 text-sm text-muted-foreground dark:bg-zinc-900">/sellers/</span><input name="slug" required defaultValue={profile.slug} className="min-w-0 flex-1 rounded-r-xl p-3"/></div></Field></div><Field label="Biography"><textarea name="biography" maxLength={3000} rows={5} defaultValue={profile.biography} className="input"/></Field><Field label="Public business details"><textarea name="business_details" maxLength={1500} rows={3} defaultValue={profile.business_details} className="input"/></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Public location"><input name="public_location" maxLength={160} defaultValue={profile.public_location} className="input"/></Field><label className="flex items-center gap-3 self-end rounded-xl border p-3"><input type="checkbox" name="show_location" value="true" defaultChecked={profile.show_location} className="h-4 w-4 accent-pink-600"/>Show my general location publicly</label></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Profile photo"><input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" className="input"/><span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Camera className="h-3 w-3"/>Square images work best.</span></Field><Field label="Storefront banner"><input type="file" name="banner" accept="image/png,image/jpeg,image/webp" className="input"/></Field></div><label className="flex items-center gap-3 rounded-xl border p-3"><input type="checkbox" name="message_notifications" value="true" defaultChecked={profile.message_notifications} className="h-4 w-4 accent-pink-600"/>Notify me about buyer messages</label><button disabled={saving} className="flex min-h-12 w-full items-center justify-center rounded-full bg-pink-600 px-6 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save public profile"}</button></form>
    <div className="mt-5 flex flex-wrap gap-2"><Link href="/seller/listings" className="rounded-full border px-4 py-2 font-bold">My listings</Link><Link href="/seller/orders" className="rounded-full border px-4 py-2 font-bold">Orders &amp; earnings</Link><Link href="/seller/verification" className="rounded-full border px-4 py-2 font-bold">Seller verification</Link></div>
  </main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-sm font-semibold">{label}</span><div className="mt-1">{children}</div></label> }
