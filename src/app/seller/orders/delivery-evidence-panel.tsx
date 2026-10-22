"use client"

import { useState } from "react"
import { uploadDeliveryEvidence, type SellerOrder } from "@/lib/marketplace"

export default function DeliveryEvidencePanel({ orders, onChanged, onNotice }: {
  orders: SellerOrder[]
  onChanged: () => Promise<void>
  onNotice: (message: string) => void
}) {
  const [orderId, setOrderId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const eligible = orders.filter((order) => order.payment_status === "paid" &&
    !["awaiting_fulfillment", "completed", "cancelled", "refunded"].includes(order.fulfillment_status))

  async function upload() {
    if (!orderId || !file) { onNotice("Choose an order and evidence file first."); return }
    setBusy(true)
    try {
      await uploadDeliveryEvidence(Number(orderId), file, note)
      setFile(null); setNote("")
      onNotice("Delivery evidence uploaded securely.")
      await onChanged()
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not upload delivery evidence.")
    } finally { setBusy(false) }
  }

  return <section className="mt-8 rounded-3xl border border-dashed p-5">
    <h2 className="font-black">Private delivery evidence</h2>
    <p className="mt-1 text-sm text-foreground/60">Upload a PDF, JPEG, or PNG up to 10 MB. Only order participants and authorized reviewers can access it.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
      <select value={orderId} onChange={(event) => setOrderId(event.target.value)} className="min-h-11 rounded-xl border px-3">
        <option value="">Choose order</option>
        {eligible.map((order) => <option key={order.id} value={order.id}>#{order.id} · {order.title}</option>)}
      </select>
      <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} className="min-h-11 rounded-xl border p-2 text-sm"/>
      <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Evidence note" className="min-h-11 rounded-xl border px-3"/>
      <button onClick={() => void upload()} disabled={busy || !file || !orderId} className="min-h-11 rounded-xl bg-pink-600 px-4 font-bold text-white disabled:opacity-50">{busy ? "Uploading…" : "Upload securely"}</button>
    </div>
    {orders.some((order) => order.delivery_evidence.length) && <div className="mt-4 grid gap-2 sm:grid-cols-2">{orders.flatMap((order) => order.delivery_evidence.map((item) => <div key={item.id} className="rounded-xl border p-3 text-sm"><strong>Order #{order.id}: {item.name}</strong>{item.note && <p className="text-foreground/60">{item.note}</p>}</div>))}</div>}
  </section>
}
