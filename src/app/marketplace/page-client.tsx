"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Filter, Heart, MapPin, MessageCircle, Search, SlidersHorizontal } from "lucide-react"
import { ListingViewer } from "@/components/marketplace/listing-viewer"
import { addWishlist, inventoryLabel, listingPrice, makeOffer, marketCategories, marketListing, marketListings, marketRecommendations, marketplaceCheckout, removeWishlist, startConversation, trackListingClick, type MarketCategory, type MarketListing, type MarketRecommendation } from "@/lib/marketplace"
import { getToken } from "@/lib/api"
import { useText } from "@/lib/site-config"

export default function MarketplacePage() {
  const [categories, setCategories] = useState<MarketCategory[]>([])
  const [listings, setListings] = useState<MarketListing[]>([])
  const [count, setCount] = useState(0)
  const [category, setCategory] = useState("")
  const [search, setSearch] = useState("")
  const [condition, setCondition] = useState("")
  const [fulfillment, setFulfillment] = useState("")
  const [location, setLocation] = useState("")
  const [ordering, setOrdering] = useState("-created_at")
  const [attributes, setAttributes] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<MarketListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [recommendations, setRecommendations] = useState<MarketRecommendation[]>([])
  const schema = useMemo(() => categories.find((item) => item.slug === category), [categories, category])
  const fulfillmentOptions = useMemo(() => Array.from(new Set(categories.map((item) => item.fulfillment_type).filter(Boolean))), [categories])
  const heroEyebrow = useText("marketplace.hero_eyebrow")
  const heroTitle = useText("marketplace.hero_title")
  const heroDescription = useText("marketplace.hero_description")
  const sellCta = useText("marketplace.sell_cta")
  const recommendationsTitle = useText("marketplace.recommendations_title")
  const recommendationsDescription = useText("marketplace.recommendations_description")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    const params = new URLSearchParams()
    if (category) params.set("category", category)
    if (search) params.set("search", search)
    if (condition) params.set("condition", condition)
    if (fulfillment) params.set("fulfillment", fulfillment)
    if (location) params.set("locality", location)
    params.set("ordering", ordering)
    for (const [key, value] of Object.entries(attributes)) if (value) params.set(`attr.${key}`, value)
    try { const page = await marketListings(params.toString()); setListings(page.results); setCount(page.count) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load listings.") }
    finally { setLoading(false) }
  }, [attributes, category, condition, fulfillment, location, ordering, search])

  useEffect(() => { marketCategories().then(setCategories).catch(() => setError("Could not load categories.")) }, [])
  useEffect(() => { if (getToken()) marketRecommendations().then((data) => setRecommendations(data.results.slice(0, 6))).catch(() => undefined) }, [])
  useEffect(() => { const timer = setTimeout(() => void load(), 200); return () => clearTimeout(timer) }, [load])
  useEffect(() => { const slug = new URLSearchParams(window.location.search).get("listing"); if (slug) marketListing(slug).then(setSelected).catch(() => undefined) }, [])

  return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <section className="mb-8 rounded-[2rem] bg-gradient-to-br from-pink-600 via-rose-600 to-fuchsia-700 p-7 text-white shadow-xl sm:p-12">
      <p className="text-sm font-semibold uppercase tracking-[.2em] text-pink-100">{heroEyebrow}</p>
      <h1 className="mt-3 max-w-3xl text-4xl font-black sm:text-6xl">{heroTitle}</h1>
      <p className="mt-4 max-w-2xl text-pink-50">{heroDescription}</p>
      <div className="mt-7 flex flex-wrap gap-3"><Link href="/sell" className="rounded-full bg-card text-card-foreground px-5 py-3 font-bold text-[var(--brand-pink-text)]">{sellCta}</Link><Link href="/offers" className="rounded-full border border-white/50 px-5 py-3 font-bold">My offers</Link></div>
    </section>

    {recommendations.length > 0 && <section aria-labelledby="recommended-heading" className="mb-8">
      <h2 id="recommended-heading" className="text-2xl font-black">{recommendationsTitle}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{recommendationsDescription}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{recommendations.map(({ listing, reason }) => <button key={listing.id} type="button" onClick={() => { void trackListingClick(listing.id, "marketplace_recs"); setSelected(listing) }} className="flex overflow-hidden rounded-3xl border border-border bg-card text-card-foreground text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="h-28 w-28 shrink-0 bg-muted">{listing.media[0] && <img src={listing.media[0].image || listing.media[0].external_url} alt={listing.media[0].alt_text || listing.title} className="h-full w-full object-cover" />}</div><div className="min-w-0 p-4"><h3 className="line-clamp-1 font-bold">{listing.title}</h3><p className="mt-1 font-black text-[var(--brand-pink-text)]">{listingPrice(listing)}</p><p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{reason}</p></div></button>)}</div>
    </section>}
    <div className="grid gap-7 lg:grid-cols-[280px_1fr]">
      <aside className="h-fit space-y-5 rounded-3xl border border-border bg-card text-card-foreground p-5 shadow-sm lg:sticky lg:top-24">
        <h2 className="flex items-center gap-2 font-bold"><SlidersHorizontal className="h-4 w-4" /> Filters</h2>
        <label className="block text-sm"><span>Category</span><select aria-label="Category" value={category} onChange={(event) => { setCategory(event.target.value); setAttributes({}) }} className="mt-1 w-full rounded-xl border p-2"><option value="">All categories</option>{categories.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>
        <label className="block text-sm"><span>Fulfillment</span><select value={fulfillment} onChange={(event) => setFulfillment(event.target.value)} className="mt-1 w-full rounded-xl border p-2"><option value="">Any</option>{fulfillmentOptions.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label className="block text-sm"><span>Condition</span><input value={condition} onChange={(event) => setCondition(event.target.value)} placeholder="e.g. used-good" className="mt-1 w-full rounded-xl border p-2" /></label>
        <label className="block text-sm"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Town or city" className="mt-1 w-full rounded-xl border p-2" /></label>
        {schema?.attributes.filter((item) => item.filterable).map((attribute) => <label key={attribute.key} className="block text-sm"><span>{attribute.label}{attribute.unit ? ` (${attribute.unit})` : ""}</span>{attribute.options.length ? <select value={attributes[attribute.key] || ""} onChange={(event) => setAttributes((old) => ({ ...old, [attribute.key]: event.target.value }))} className="mt-1 w-full rounded-xl border p-2"><option value="">Any</option>{attribute.options.map((option) => <option key={option}>{option}</option>)}</select> : <input type={attribute.value_type === "number" ? "number" : "text"} value={attributes[attribute.key] || ""} onChange={(event) => setAttributes((old) => ({ ...old, [attribute.key]: event.target.value }))} className="mt-1 w-full rounded-xl border p-2" />}</label>)}
      </aside>

      <section>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><input aria-label="Search products and services" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products and services" className="w-full rounded-2xl border py-3 pl-10 pr-4" /></label><select aria-label="Sort listings" value={ordering} onChange={(event) => setOrdering(event.target.value)} className="rounded-2xl border px-4"><option value="-created_at">Newest</option><option value="price">Price: low to high</option><option value="-price">Price: high to low</option><option value="relevance">Relevant</option></select></div>
        <p className="mb-4 text-sm text-muted-foreground">{loading ? "Loading listings…" : `${count} listing${count === 1 ? "" : "s"}`}</p>
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
        {!loading && !listings.length ? <div className="rounded-3xl border border-dashed p-12 text-center"><Filter className="mx-auto mb-3" /><h2 className="font-bold">No listings match these filters</h2><p className="text-muted-foreground">Try a broader category or location.</p></div> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{listings.map((listing) => <button key={listing.id} onClick={() => setSelected(listing)} className="overflow-hidden rounded-3xl border border-border bg-card text-card-foreground text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><div className="aspect-[4/3] bg-muted">{listing.media[0] && <img src={listing.media[0].image || listing.media[0].external_url} alt={listing.media[0].alt_text || listing.title} className="h-full w-full object-cover" />}</div><div className="p-4"><p className="text-xs font-semibold uppercase text-[var(--brand-pink-text)]">{categories.find((item) => item.slug === listing.category)?.label || listing.category}</p><h2 className="mt-1 line-clamp-2 text-lg font-bold">{listing.title}</h2><p className="mt-3 font-black">{listingPrice(listing)}</p><StockStatus listing={listing} />{listing.locality && <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{listing.locality}</p>}</div></button>)}</div>}
      </section>
    </div>
    {selected && <ListingDialog listing={selected} category={categories.find((item) => item.slug === selected.category)} onClose={() => setSelected(null)} />}
  </main>
}

function StockStatus({ listing }: { listing: MarketListing }) {
  const status = inventoryLabel(listing.inventory_summary)
  return <p className={`mt-2 text-sm font-semibold ${status.label === "Out of stock" ? "text-destructive" : status.low ? "text-warning" : "text-success"}`}>{status.label}</p>
}

function ListingDialog({ listing, category, onClose }: { listing: MarketListing; category?: MarketCategory; onClose: () => void }) {
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState("")
  const [notice, setNotice] = useState("")
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [deliveryMethod, setDeliveryMethod] = useState(listing.fulfillment_type === "digital_download" ? "" : listing.delivery_options?.[0]?.code || "")
  const [checkoutEmail, setCheckoutEmail] = useState("")
  const [deliveryCountry, setDeliveryCountry] = useState("KE")
  const [deliveryRegion, setDeliveryRegion] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [deliveryContact, setDeliveryContact] = useState("")
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const availableVariants = listing.inventory_summary.variants.filter((row) => row.variant_id !== null)
  const [variant, setVariant] = useState<number | undefined>(availableVariants.find((row) => row.in_stock)?.variant_id || undefined)
  const [quantity, setQuantity] = useState(1)
  const selectedInventory = listing.inventory_summary.variants.find((row) => row.variant_id === (variant ?? null))
  const purchasable = listing.inventory_summary.in_stock && !listing.checkout_disabled && !listing.is_demo && !listing.inactive_paused_at
  async function send() { try { await makeOffer(listing.id, Number(amount), message); setNotice("Your private offer was sent.") } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not send offer.") } }
  async function toggleSaved() { if (!getToken()) { window.location.href = `/login?next=${encodeURIComponent(`/marketplace?listing=${listing.slug}`)}&wishlist=${listing.id}`; return } const before = saved; setSaved(!before); setSaving(true); try { if (before) await removeWishlist(listing.id); else await addWishlist(listing.id) } catch (reason) { setSaved(before); setNotice(reason instanceof Error ? reason.message : "Could not update wishlist.") } finally { setSaving(false) } }
  async function messageSeller() { if (!getToken()) { window.location.href = `/login?next=${encodeURIComponent(`/marketplace?listing=${listing.slug}`)}`; return } try { await startConversation(listing.id); window.location.href = "/messages" } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not start conversation.") } }
  async function buyNow() {
    if (!legalAccepted) { setNotice("Review and accept the checkout policies before continuing."); return }
    if (!getToken() && !checkoutEmail.trim()) { setNotice("Enter an email address for your receipt and secure order access."); return }
    if (listing.fulfillment_type !== "digital_download" && !deliveryMethod) { setNotice("Choose an available delivery method."); return }
    if (!["digital_download", "service"].includes(listing.fulfillment_type) && (!deliveryCountry || !deliveryAddress.trim() || !deliveryContact.trim())) { setNotice("Enter the delivery country, address, and contact information."); return }
    setCheckingOut(true); setNotice("")
    try {
      const result = await marketplaceCheckout({ listing: listing.id, variant, quantity, email: checkoutEmail.trim() || undefined,
        delivery_method: deliveryMethod || undefined, delivery_country: deliveryCountry,
        delivery_region: deliveryRegion, delivery_address: deliveryAddress, contact: deliveryContact,
        legal_accepted: true })
      window.location.href = result.checkout_url
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Checkout could not be started."); setCheckingOut(false) }
  }
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-black/55 p-4" onClick={onClose}><div className="mx-auto my-8 max-w-4xl rounded-[2rem] bg-background p-5 shadow-2xl sm:p-8" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex justify-between"><a href={`/listings/${listing.slug}/`} className="text-sm font-semibold text-[var(--brand-pink-text)]">Permanent listing page</a><button onClick={onClose} className="rounded-full border px-3 py-1">Close</button></div><div className="grid gap-8 md:grid-cols-2"><ListingViewer listing={listing} /><div><p className="text-sm font-semibold text-[var(--brand-pink-text)]">{category?.label || listing.category}</p><h2 className="text-3xl font-black">{listing.title}</h2><p className="mt-3 text-2xl font-bold">{listingPrice(listing)}</p><StockStatus listing={listing} /><div className="mt-5 rounded-2xl border border-border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sold by</p><div className="mt-1 flex flex-wrap items-center gap-2"><Link href={`/sellers/${listing.seller.slug}`} className="font-bold text-[var(--brand-pink-text)]">{listing.seller.display_name}</Link>{listing.seller.identity_verified && <span className="rounded-full bg-muted px-2 py-1 text-xs font-bold text-[var(--brand-pink-text)]" aria-label="Identity Verified">✓ Identity Verified</span>}</div><p className="mt-1 text-sm text-muted-foreground">{listing.seller.review_count ? `${listing.seller.rating_average}/5 · ${listing.seller.review_count} reviews` : "No reviews yet"}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void toggleSaved()} disabled={saving} aria-label={saved ? "Remove from Wishlist" : "Add to Wishlist"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-4 font-semibold text-[var(--brand-pink-text)] disabled:opacity-50"><Heart className={`h-5 w-5 ${saved ? "fill-pink-600" : ""}`} />{saved ? "Saved" : "Wishlist"}</button><button type="button" onClick={() => void messageSeller()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pink-600 px-4 font-semibold text-white"><MessageCircle className="h-5 w-5" />Message Seller</button></div></div>{listing.sale_mode === "auction" && listing.auction_slug ? <Link href={`/auctions?auction=${listing.auction_slug}`} className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-pink-600 px-5 font-bold text-white">Open live auction</Link> : listing.price_type === "fixed" && <div className="mt-5 rounded-2xl border border-border p-4"><button type="button" onClick={() => setCheckoutOpen((open) => !open)} disabled={!purchasable} className="flex min-h-12 w-full items-center justify-center rounded-full bg-pink-600 px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{purchasable ? (checkoutOpen ? "Close checkout review" : "Buy Now") : "Currently unavailable"}</button>{checkoutOpen && <div className="mt-4 space-y-4"><p className="text-sm text-foreground/70">Review delivery, disclosures, and applicable policies before Paystack opens.</p>{availableVariants.length > 0 && <label className="block text-sm"><span>Product option</span><select value={variant || ""} onChange={(event) => { setVariant(Number(event.target.value)); setQuantity(1) }} className="mt-1 w-full rounded-xl border p-3">{availableVariants.map((row) => <option key={row.variant_id} value={row.variant_id || ""} disabled={!row.in_stock}>{row.name || `Option ${row.variant_id}`}{!row.in_stock ? " - Out of stock" : ""}</option>)}</select></label>}{["finite", "booking"].includes(listing.inventory_summary.policy) && <label className="block text-sm"><span>{listing.inventory_summary.policy === "booking" ? "Capacity" : "Quantity"}</span><input type="number" min={1} max={selectedInventory?.available_quantity ?? undefined} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="mt-1 w-full rounded-xl border p-3" /></label>}{!getToken() && <label className="block text-sm"><span>Receipt email</span><input type="email" required value={checkoutEmail} onChange={(event) => setCheckoutEmail(event.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>}{listing.fulfillment_type !== "digital_download" && <label className="block text-sm"><span>Delivery method</span><select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value)} className="mt-1 w-full rounded-xl border p-3"><option value="">Choose delivery</option>{listing.delivery_options?.map((option) => <option key={option.code} value={option.code}>{option.label || option.code.replaceAll("_", " ")} · {listing.currency} {Number(option.fee || 0).toFixed(2)}</option>)}</select></label>}{listing.fulfillment_type !== "digital_download" && listing.fulfillment_type !== "service" && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm"><span>Delivery country code</span><input value={deliveryCountry} onChange={(event) => setDeliveryCountry(event.target.value.toUpperCase().slice(0, 2))} maxLength={2} className="mt-1 w-full rounded-xl border p-3" placeholder="KE" /></label><label className="text-sm"><span>County / region</span><input value={deliveryRegion} onChange={(event) => setDeliveryRegion(event.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label><label className="text-sm sm:col-span-2"><span>Delivery address</span><textarea value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} className="mt-1 w-full rounded-xl border p-3" rows={3} /></label><label className="text-sm sm:col-span-2"><span>Delivery contact</span><input value={deliveryContact} onChange={(event) => setDeliveryContact(event.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label></div>}<div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><strong>Condition and disclosures:</strong> {listing.condition_and_defects || "No known defects disclosed."}<br /><strong>Seller return conditions:</strong> {listing.seller_return_condition || "PlugYard’s applicable marketplace policy applies."}{listing.seller_warranty && <><br /><strong>Seller warranty:</strong> {listing.seller_warranty}</>}</div><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-pink-600" /><span>I agree to the <Link href="/legal/terms-of-service" target="_blank" className="font-semibold text-[var(--brand-pink-text)] underline">Terms</Link>, <Link href="/legal/returns-refunds" target="_blank" className="font-semibold text-[var(--brand-pink-text)] underline">Returns &amp; Refunds Policy</Link>, <Link href="/legal/privacy-policy" target="_blank" className="font-semibold text-[var(--brand-pink-text)] underline">Privacy Policy</Link>, and the product, delivery, and seller disclosures shown above.</span></label><button type="button" onClick={() => void buyNow()} disabled={checkingOut || !legalAccepted || !purchasable} className="flex min-h-12 w-full items-center justify-center rounded-full bg-pink-600 px-5 font-bold text-white disabled:opacity-50">{checkingOut ? "Opening secure payment…" : "Continue to secure payment"}</button></div>}</div>}{listing.condition_and_defects && <><h3 className="mt-6 font-bold">Known Defects / Important Disclosures</h3><p className="whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-amber-950">{listing.condition_and_defects}</p></>}<p className="mt-5 whitespace-pre-wrap text-foreground/75">{listing.description_text}</p>{category?.negotiation_enabled && purchasable && <div className="mt-7 rounded-2xl bg-muted p-4 text-foreground"><h3 className="font-bold">Send a private offer</h3><input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={`Amount (${listing.currency})`} className="mt-3 w-full rounded-xl border bg-card text-card-foreground p-2" /><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Optional message" className="mt-2 w-full rounded-xl border bg-card text-card-foreground p-2" /><button onClick={() => void send()} disabled={!Number(amount)} className="mt-2 rounded-full bg-pink-600 px-4 py-2 font-bold text-white disabled:opacity-50">Send offer</button></div>}{notice && <p role="status" className="mt-3 text-sm">{notice}</p>}</div></div></div></div>
}
