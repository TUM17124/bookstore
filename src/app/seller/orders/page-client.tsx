"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { CircleDollarSign, PackageCheck, Truck } from "lucide-react"
import { getToken } from "@/lib/api"
import { decideCancellation, requestDeliveryReview, sellerOrders, sellerWallet, updateFulfillment, withdrawMarketplaceEarnings, type SellerOrder, type SellerWallet } from "@/lib/marketplace"
import DeliveryEvidencePanel from "./delivery-evidence-panel"

const ACTIONS: Record<string, { key: string; label: string }[]> = {
  awaiting_fulfillment: [{ key: "process", label: "Start processing" }, { key: "cancel_request", label: "Request cancellation" }],
  processing: [{ key: "pack", label: "Packed / ready" }, { key: "ship", label: "Shipped" }, { key: "pickup_ready", label: "Ready for pickup" }, { key: "complete_delivery", label: "Service or delivery completed" }],
  packed: [{ key: "ship", label: "Shipped" }, { key: "pickup_ready", label: "Ready for pickup" }],
  shipped: [{ key: "complete_delivery", label: "Delivered — request buyer confirmation" }],
  ready_for_pickup: [{ key: "complete_delivery", label: "Picked up — request buyer confirmation" }],
}
export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [wallet, setWallet] = useState<SellerWallet | null>(null)
  const [busy, setBusy] = useState("")
  const [notice, setNotice] = useState("")
  const [withdrawal, setWithdrawal] = useState("")
  const [carrier, setCarrier] = useState("")
  const [tracking, setTracking] = useState("")
  const load = useCallback(async () => {
    if (!getToken()) { window.location.href = `/login?next=${encodeURIComponent("/seller/orders")}`; return }
    try { const [sales, balance] = await Promise.all([sellerOrders(), sellerWallet()]); setOrders(sales.results); setWallet(balance) }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not load seller orders.") }
  }, [])
  useEffect(() => { const initial = setTimeout(() => void load(), 0); return () => clearTimeout(initial) }, [load])
  async function transition(order: SellerOrder, action: string) {
    setBusy(`${order.id}:${action}`); setNotice("")
    try { await updateFulfillment(order.id, action, { carrier, tracking_number: tracking }); await load() }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not update fulfillment.") }
    finally { setBusy("") }
  }
  async function withdraw() {
    setBusy("withdraw"); setNotice("")
    try { const result = await withdrawMarketplaceEarnings(withdrawal); setNotice(`Withdrawal #${result.id} is ${result.status}.`); setWithdrawal(""); await load() }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not request withdrawal.") }
    finally { setBusy("") }
  }
  async function escalate(order: SellerOrder) {
    setBusy(`${order.id}:review`); setNotice("")
    try { const result = await requestDeliveryReview(order.id, "Please review the recorded delivery evidence and buyer nonresponse."); setNotice(result.message || `Delivery review is ${result.status}.`) }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not request delivery review.") }
    finally { setBusy("") }
  }
  async function cancellation(order: SellerOrder, action: "accept" | "reject") {
    if (!order.cancellation) return
    const reason = action === "reject" ? window.prompt("Explain why the cancellation is rejected.") || "" : ""
    setBusy(`${order.id}:cancel-${action}`); setNotice("")
    try { await decideCancellation(order.cancellation.id, action, reason); setNotice(action === "accept" ? "Cancellation accepted. The refund is awaiting authorized processing." : "Cancellation rejected."); await load() }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not decide the cancellation.") }
    finally { setBusy("") }
  }

  return <main className="mx-auto max-w-6xl px-4 py-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-semibold text-pink-600">Seller dashboard</p><h1 className="text-4xl font-black">Orders &amp; earnings</h1></div><Link href="/seller/listings" className="rounded-full border px-5 py-3 font-bold">My listings</Link></div><DeliveryEvidencePanel orders={orders} onChanged={load} onNotice={setNotice}/>
    {notice && <p role="status" className="mt-5 rounded-xl bg-pink-50 p-3 text-pink-950">{notice}</p>}
    {wallet && <section className="mt-7"><h2 className="flex items-center gap-2 text-xl font-black"><CircleDollarSign className="text-pink-600"/>Marketplace wallet</h2><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Pending",wallet.pending],["Available",wallet.available],["Processing",wallet.withdrawal_processing],["Withdrawn",wallet.withdrawn],["Refunded",wallet.refunded],["On hold",wallet.on_hold],["Liability",wallet.liability]].map(([label,value]) => <div key={label} className="rounded-2xl border p-4"><p className="text-xs text-foreground/55">{label}</p><p className="mt-1 font-black">KES {value}</p></div>)}</div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="number" min="0.01" step="0.01" max={wallet.available} value={withdrawal} onChange={(event) => setWithdrawal(event.target.value)} placeholder="Amount to withdraw" className="min-h-11 rounded-xl border px-3"/><button onClick={() => void withdraw()} disabled={busy === "withdraw" || !Number(withdrawal)} className="min-h-11 rounded-xl bg-pink-600 px-5 font-bold text-white disabled:opacity-50">Withdraw available earnings</button><Link href="/dashboard" className="flex min-h-11 items-center justify-center rounded-xl border px-5 font-bold">Manage payout destination</Link></div><p className="mt-2 text-xs text-foreground/60">PlugYard does not impose a minimum or monthly waiting cycle. Provider limits, fees, and settlement checks still apply.</p></section>}
    <section className="mt-10"><h2 className="flex items-center gap-2 text-xl font-black"><PackageCheck className="text-pink-600"/>Fulfillment</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Carrier (when applicable)" className="rounded-xl border p-3"/><input value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="Tracking number (when applicable)" className="rounded-xl border p-3"/></div><div className="mt-5 space-y-4">{orders.length === 0 ? <div className="rounded-3xl border border-dashed p-10 text-center"><Truck className="mx-auto text-pink-500"/><p className="mt-2">No marketplace orders yet.</p></div> : orders.map((order) => <article key={order.id} className="rounded-3xl border bg-white p-5 shadow-sm dark:bg-zinc-950"><div className="flex flex-col justify-between gap-2 sm:flex-row"><div><h3 className="text-lg font-black">{order.title}</h3><p className="text-sm text-foreground/60">Order #{order.id} · {order.buyer} · {order.item_type}</p></div><p className="font-black">{order.currency} {order.amount}</p></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-zinc-100 px-3 py-1 capitalize dark:bg-zinc-800">Payment: {order.payment_status.replaceAll("_", " ")}</span><span className="rounded-full bg-pink-50 px-3 py-1 capitalize text-pink-800">Fulfillment: {order.fulfillment_status.replaceAll("_", " ")}</span></div><div className="mt-4 flex flex-wrap gap-2">{(ACTIONS[order.fulfillment_status] || []).filter((action) => order.item_type !== "digital" || ["process", "complete_delivery", "cancel_request"].includes(action.key)).map((action) => <button key={action.key} onClick={() => void transition(order, action.key)} disabled={!!busy} className="min-h-11 rounded-full border border-pink-200 px-4 text-sm font-bold text-pink-700 disabled:opacity-50">{busy === `${order.id}:${action.key}` ? "Updating…" : action.label}</button>)}{order.fulfillment_status === "awaiting_buyer_confirmation" && <button onClick={() => void escalate(order)} disabled={!!busy} className="min-h-11 rounded-full border border-amber-300 px-4 text-sm font-bold text-amber-800 disabled:opacity-50">{busy === `${order.id}:review` ? "Requesting…" : "Request nonresponse review"}</button>}</div>{order.cancellation?.requested_by_buyer && <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-amber-950"><p className="font-bold">Buyer requested cancellation</p><p className="mt-1 text-sm whitespace-pre-wrap">{order.cancellation.reason}</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void cancellation(order, "accept")} disabled={!!busy} className="min-h-11 rounded-full bg-pink-600 px-4 text-sm font-bold text-white disabled:opacity-50">Accept &amp; request refund</button><button onClick={() => void cancellation(order, "reject")} disabled={!!busy} className="min-h-11 rounded-full border border-amber-300 px-4 text-sm font-bold disabled:opacity-50">Reject with reason</button></div></div>}{order.timeline.length > 0 && <ol className="mt-4 border-l-2 border-pink-100 pl-4 text-sm">{order.timeline.map((event, index) => <li key={`${event.created_at}-${index}`} className="mb-2"><strong className="capitalize">{event.to_status.replaceAll("_", " ")}</strong> · {new Date(event.created_at).toLocaleString()}{event.tracking_number && <span> · Tracking {event.tracking_number}</span>}</li>)}</ol>}</article>)}</div></section>
  </main>
}
