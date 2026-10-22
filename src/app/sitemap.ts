import type { MetadataRoute } from "next"
import { getBookPageUrls } from "@/lib/book-pages"

export const dynamic = "force-static"

const SITE = "https://plugyard.com"

// Only public, indexable pages belong here.
// Private pages (dashboard, bookmarks, purchases, settings, publish) use
// noindex in their metadata and must not appear in the sitemap.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  // One page per published book (/b/<slug>/), read from the API at build time.
  const books = (await getBookPageUrls()).map((url) => ({ url, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 }))

  return [
    { url: `${SITE}/`,                 lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${SITE}/pro/`,             lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${SITE}/login/`,           lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
    { url: `${SITE}/signup/`,          lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
    { url: `${SITE}/auctions/`,        lastModified: now, changeFrequency: "hourly",  priority: 0.8 },
    { url: `${SITE}/terms/`,           lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${SITE}/terms-of-use/`,    lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${SITE}/refund-policy/`,   lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${SITE}/privacy/`,         lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${SITE}/legal/buyer-protection/`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE}/legal/shipping-delivery/`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE}/legal/seller-policy/`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    ...books,
  ]
}
