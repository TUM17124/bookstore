"use client"

import Link from "next/link"
import { useSiteConfig } from "@/lib/site-config"
import { useCurrency } from "@/lib/money"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { conditionOptions, createListing, marketCategories, submitListing, uploadListingMedia, type MarketCategory } from "@/lib/marketplace"

export default function SellPage() {
  const [config, configReady] = useSiteConfig()
  const currency = useCurrency()
  const canPublish = !!(config?.features?.marketplace || config?.features?.marketplace_publishing)
  const [categories, setCategories] = useState<MarketCategory[]>([])
  const [conditions, setConditions] = useState<{ key: string; label: string }[]>([])
  const [categorySlug, setCategorySlug] = useState("")
  const [priceType, setPriceType] = useState("fixed")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [savedListingLink, setSavedListingLink] = useState<{ href: string; label: string } | null>(null)
  const [variants, setVariants] = useState([{ name: "", sku: "", quantity: "", price_override: "" }])
  const category = useMemo(() => categories.find((item) => item.slug === categorySlug), [categories, categorySlug])
  const isService = category?.fulfillment_type === "service"
  const complianceHold = !!category?.is_regulated && (!category.regulated_sale_approved || category.minimum_buyer_age > 0)
  useEffect(() => { Promise.all([marketCategories(), conditionOptions()]).then(([cats, conds]) => { const eligible = cats.filter(c => c.viewer_mode !== "book_3d"); setCategories(eligible); setConditions(conds); const requested = new URLSearchParams(window.location.search).get("category"); const initial = eligible.find(c => c.slug === requested) || eligible[0]; if (initial) { setCategorySlug(initial.slug); setPriceType(initial.pricing_options[0] || "fixed") } }).catch(() => setNotice("Could not load the publishing form.")) }, [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!category || !canPublish) return
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const saveAsDraft = submitter?.value === "draft"
    setBusy(true); setNotice(""); setSavedListingLink(null)
    const form = event.currentTarget
    const fd = new FormData(form)
    const description = String(fd.get("description") || "").trim()
    const attributes: Record<string, unknown> = {}
    for (const attribute of category.attributes) {
      if (attribute.value_type === "multi_select") attributes[attribute.key] = fd.getAll(`attr.${attribute.key}`).map(String)
      else if (attribute.value_type === "boolean") attributes[attribute.key] = fd.get(`attr.${attribute.key}`) === "on"
      else { const value = fd.get(`attr.${attribute.key}`); if (value !== null && String(value) !== "") attributes[attribute.key] = attribute.value_type === "number" ? Number(value) : String(value) }
    }
    try {
      const inventoryPayload = category.inventory_policy === "finite" || category.inventory_policy === "booking"
        ? { quantity: Number(fd.get("stock_quantity") || 0), low_stock_threshold: Number(fd.get("low_stock_threshold") || 0) }
        : { quantity: 0 }
      const variantPayload = category.variants_enabled ? variants.filter((row) => row.name.trim()).map((row) => ({
        name: row.name.trim(), sku: row.sku.trim(), quantity: Number(row.quantity || 0),
        price_override: row.price_override ? Number(row.price_override) : null,
      })) : undefined
      const listing = await createListing({
        category: category.slug, title: fd.get("title"), description: { type: "doc", content: description ? [{ type: "paragraph", content: [{ type: "text", text: description }] }] : [] },
        seo_description: fd.get("seo_description"), condition: fd.get("condition") || null,
        condition_and_defects: fd.get("condition_and_defects"), price_type: priceType,
        price_amount: priceType === "fixed" ? Number(fd.get("price_amount")) : null,
        price_min: priceType === "range" ? Number(fd.get("price_min")) : null,
        price_max: priceType === "range" ? Number(fd.get("price_max")) : null,
        currency: fd.get("currency") || currency.code, country: fd.get("country") || "KE",
        administrative_area: fd.get("administrative_area"), locality: fd.get("locality"), attributes,
        inventory: category.variants_enabled ? undefined : inventoryPayload, variants: variantPayload,
      })
      setSavedListingLink({ href: isService ? "/dashboard?tab=services" : "/dashboard?tab=products", label: isService ? "Manage this service" : "Manage this product" })
      for (const slot of category.media_slots) {
        const files = fd.getAll(`media.${slot.key}`).filter((item): item is File => item instanceof File && item.size > 0)
        for (const file of files) await uploadListingMedia(listing.id, slot.key, file)
      }
      if (complianceHold) {
        setNotice("Saved as an unpublished draft. This restricted category cannot be listed or sold until compliance approval and any required age-verification controls are complete.")
      } else if (saveAsDraft) {
        setNotice(`${isService ? "Service" : "Product"} draft saved. You can reopen and edit it from the matching section in your Seller Dashboard.`)
      } else {
        const submitted = await submitListing(listing.id)
        setNotice(submitted.status === "active" ? `Your ${isService ? "service" : "product"} is live.` : `Your ${isService ? "service" : "product"} was submitted for review.`)
      }
      form.reset()
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not save the listing.") }
    finally { setBusy(false) }
  }

  if (!configReady) return <main className="p-8" aria-busy="true">Loading publishing settings…</main>
  if (!canPublish) return <main className="mx-auto max-w-3xl p-8"><h1 className="text-3xl font-bold">Marketplace submissions are paused</h1><p className="mt-4">Browse departments or return to the available publishing options.</p><Link href="/publish/" className="mt-4 inline-flex rounded-full border px-5 py-3">Publishing options</Link></main>
  return <main className="mx-auto max-w-4xl px-4 py-10"><div className="mb-8"><p className="font-semibold text-[var(--brand-pink-text)]">Seller tools</p><h1 className="text-4xl font-black">{isService ? "Offer a service" : "Sell a product"}</h1><p className="mt-2 text-muted-foreground">{isService ? "Describe your service, pricing and availability. Your listing will appear in the Services section of your dashboard." : "Describe your product, price and stock. Your listing will appear in Products in your seller dashboard."}</p></div>
    <form onSubmit={save} className="space-y-7 rounded-[2rem] border border-border bg-card text-card-foreground p-5 shadow-sm sm:p-9">
      <Section title="What are you listing?"><Field label="Category"><select value={categorySlug} onChange={(event) => { setCategorySlug(event.target.value); setPriceType(categories.find((item) => item.slug === event.target.value)?.pricing_options[0] || "fixed") }} className="input"><option value="">Choose a category</option>{categories.map((item) => <option key={item.slug} value={item.slug}>{item.label}{item.is_regulated ? " · compliance review required" : ""}</option>)}</select></Field>{complianceHold && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">This restricted category is saved as an unpublished draft. Online listing, advertising, auctions and checkout remain disabled until compliance approval is recorded.{category?.minimum_buyer_age ? " Age-restricted sales also require an approved age-verification system." : ""}</p>}<Field label="Title"><input name="title" required maxLength={255} className="input" /></Field><Field label="Description"><textarea name="description" required rows={7} className="input" placeholder="Describe what makes this item or service useful, including relevant details." /></Field><Field label="Short search description (optional)"><input name="seo_description" maxLength={320} className="input" /></Field></Section>
      <Section title="Condition and known defects"><Field label="Condition"><select name="condition" className="input"><option value="">Not applicable</option>{conditions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></Field><Field label="Condition and defects"><textarea name="condition_and_defects" rows={4} className="input" placeholder="Be specific: what works, what does not, wear, damage, repairs, or limitations." /></Field></Section>
      {category && <><Section title="Category details">{category.attributes.map((attribute) => <Field key={attribute.key} label={`${attribute.label}${attribute.required ? " *" : ""}${attribute.unit ? ` (${attribute.unit})` : ""}`} help={attribute.help_text}>{attribute.value_type === "boolean" ? <input name={`attr.${attribute.key}`} type="checkbox" /> : attribute.options.length ? <select name={`attr.${attribute.key}`} required={attribute.required} multiple={attribute.value_type === "multi_select"} className="input"><option value="">Choose</option>{attribute.options.map((option) => <option key={option}>{option}</option>)}</select> : <input name={`attr.${attribute.key}`} type={attribute.value_type === "number" ? "number" : attribute.value_type === "date" ? "date" : "text"} required={attribute.required} min={attribute.minimum || undefined} max={attribute.maximum || undefined} className="input" />}</Field>)}</Section>
      <Section title="Photos">{category.media_slots.map((slot) => <Field key={slot.key} label={`${slot.label}${slot.required ? " *" : ""}`} help={slot.help_text}><input name={`media.${slot.key}`} type="file" accept="image/*" required={slot.required} multiple={slot.max_count > 1} className="block w-full text-sm" /></Field>)}</Section>
      <Section title={category.inventory_policy === "booking" ? "Availability and capacity" : "Inventory and stock"}>
        {category.inventory_policy === "unlimited" && <p className="rounded-xl bg-muted p-3 text-sm text-foreground">This category uses unlimited digital availability. Physical stock is not deducted.</p>}
        {category.inventory_policy === "none" && <p className="rounded-xl bg-muted p-3 text-sm text-foreground">This category does not track quantity. Unique items still cannot be sold twice.</p>}
        {(category.inventory_policy === "finite" || category.inventory_policy === "booking") && !category.variants_enabled && <div className="grid gap-4 sm:grid-cols-2"><Field label={category.inventory_policy === "booking" ? "Available booking capacity" : "Quantity available"}><input name="stock_quantity" type="number" min="0" step="1" required={category.inventory_required} className="input" /></Field><Field label="Low-stock alert threshold"><input name="low_stock_threshold" type="number" min="0" step="1" defaultValue="0" className="input" /></Field></div>}
        {category.variants_enabled && <div className="space-y-3"><p className="text-sm text-muted-foreground">Each independently purchasable option has its own stock.</p>{variants.map((variant, index) => <div key={index} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-4"><Field label="Variant name"><input value={variant.name} onChange={(event) => setVariants((rows) => rows.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} required={category.inventory_required} className="input" /></Field><Field label="SKU"><input value={variant.sku} onChange={(event) => setVariants((rows) => rows.map((row, i) => i === index ? { ...row, sku: event.target.value } : row))} className="input" /></Field><Field label="Quantity"><input type="number" min="0" step="1" value={variant.quantity} onChange={(event) => setVariants((rows) => rows.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} required className="input" /></Field><Field label="Price override"><input type="number" min="0" step="0.01" value={variant.price_override} onChange={(event) => setVariants((rows) => rows.map((row, i) => i === index ? { ...row, price_override: event.target.value } : row))} className="input" /></Field>{variants.length > 1 && <button type="button" onClick={() => setVariants((rows) => rows.filter((_, i) => i !== index))} className="rounded-full border px-4 py-2 text-sm font-bold text-destructive sm:col-span-4">Remove variant</button>}</div>)}<button type="button" onClick={() => setVariants((rows) => [...rows, { name: "", sku: "", quantity: "", price_override: "" }])} className="rounded-full border border-border px-4 py-2 font-bold text-[var(--brand-pink-text)]">Add variant</button></div>}
      </Section>
      <Section title="Price and location"><Field label="Pricing"><select value={priceType} onChange={(event) => setPriceType(event.target.value)} className="input">{category.pricing_options.map((option) => <option key={option} value={option}>{option === "range" ? "Price range" : option[0].toUpperCase() + option.slice(1)}</option>)}</select></Field>{priceType === "fixed" && <Field label="Price"><input name="price_amount" type="number" min="0" step="0.01" required className="input" /></Field>}{priceType === "range" && <div className="grid grid-cols-2 gap-3"><Field label="Minimum"><input name="price_min" type="number" min="0" step="0.01" required className="input" /></Field><Field label="Maximum"><input name="price_max" type="number" min="0" step="0.01" required className="input" /></Field></div>}<Field label="Currency"><input name="currency" defaultValue={currency.code} maxLength={3} className="input" /></Field>{category.fulfillment_type !== "digital_download" && <div className="grid gap-3 sm:grid-cols-2"><Field label="Town or city"><input name="locality" className="input" /></Field><Field label="County / region"><input name="administrative_area" className="input" /></Field><input type="hidden" name="country" value="KE" /></div>}<p className="rounded-xl bg-muted p-3 text-sm text-foreground">Fulfillment: {category.fulfillment_type.replaceAll("_", " ")}</p></Section></>}
      {notice && <div role="status" className="rounded-xl bg-muted p-3 text-sm text-foreground"><p>{notice}</p>{savedListingLink && <Link href={savedListingLink.href} className="mt-2 inline-flex min-h-11 items-center font-semibold text-[var(--brand-pink-text)] underline underline-offset-2">{savedListingLink.label}</Link>}</div>}<div className="flex flex-wrap gap-3"><button name="intent" value="publish" disabled={busy || !category} className="min-h-11 rounded-full bg-pink-600 px-6 py-3 font-bold text-white disabled:opacity-50">{busy ? "Saving…" : isService ? "Submit service" : "Submit product"}</button><button name="intent" value="draft" disabled={busy || !category} className="min-h-11 rounded-full border px-6 py-3 font-bold disabled:opacity-50">{busy ? "Saving…" : "Save draft"}</button><Link href="/publish/" className="inline-flex min-h-11 items-center rounded-full border px-6 py-3 font-bold">Cancel</Link></div>
    </form><style jsx global>{`.input{margin-top:.3rem;width:100%;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:.75rem;background:transparent;padding:.65rem .8rem}`}</style></main>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className="space-y-4 border-b border-foreground/10 pb-7"><legend className="mb-4 text-xl font-black">{title}</legend>{children}</fieldset> }
function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) { return <label className="block text-sm font-semibold">{label}{children}{help && <span className="mt-1 block text-xs font-normal text-muted-foreground">{help}</span>}</label> }
