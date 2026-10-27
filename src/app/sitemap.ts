import type { MetadataRoute } from "next"
import { getBookPageUrls, getPublicPageUrls } from "@/lib/book-pages"
import { getSeo, seoText } from "@/lib/seo"

export const dynamic = "force-static"


// Only public, indexable pages belong here.
// Private pages (dashboard, bookmarks, purchases, settings, publish) use
// noindex in their metadata and must not appear in the sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const configured = seoText(await getSeo(), "seo.canonical_domain")
  const SITE = /^https:\/\/[^/?#]+\/?$/.test(configured) ? configured.replace(/\/$/, "") : "https://plugyard.com"
  // One page per published book (/b/<slug>/), read from the API at build time.
  const books = (await getBookPageUrls()).map((url) => ({ url, changeFrequency: "weekly" as const, priority: 0.7 }))
  const [listings, sellers, categories, auctions] = await Promise.all([
    getPublicPageUrls("sitemap-listings.xml"),
    getPublicPageUrls("sitemap-sellers.xml"),
    getPublicPageUrls("sitemap-categories.xml"),
    getPublicPageUrls("sitemap-auctions.xml"),
  ])

  return [
    { url: `${SITE}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE}/marketplace/`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/books/`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/pro/`, changeFrequency: "monthly", priority: 0.85 },
    { url: `${SITE}/terms/`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE}/terms-of-use/`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE}/refund-policy/`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE}/privacy/`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE}/legal/buyer-protection/`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE}/legal/shipping-delivery/`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE}/legal/seller-policy/`, changeFrequency: "yearly", priority: 0.4 },
    ...books,
    ...listings.map((url) => ({ url, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...sellers.map((url) => ({ url, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...categories.map((url) => ({ url, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...auctions.map((url) => ({ url, changeFrequency: "hourly" as const, priority: 0.8 })),
  ]
}
