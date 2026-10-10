import type { MetadataRoute } from "next"

export const dynamic = "force-static"

const SITE = "https://plugyard.com"

// Only public, indexable pages belong here.
// Private pages (dashboard, bookmarks, purchases, settings, publish) use
// noindex in their metadata and must not appear in the sitemap.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  return [
    { url: `${SITE}/`,                 lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${SITE}/tools/pdf-editor/`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/pro/`,             lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${SITE}/login/`,           lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
    { url: `${SITE}/signup/`,          lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
    { url: `${SITE}/terms/`,           lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${SITE}/terms-of-use/`,    lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${SITE}/refund-policy/`,   lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
    { url: `${SITE}/privacy/`,         lastModified: now, changeFrequency: "yearly",  priority: 0.4 },
  ]
}
