import type { MetadataRoute } from "next"

export const dynamic = "force-static"

const SITE = "https://plugyard.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,                         lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${SITE}/signup`,                   lastModified: now, changeFrequency: "monthly", priority: 0.95 },
    { url: `${SITE}/login`,                    lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/tools/pdf-editor`,         lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/pro`,                      lastModified: now, changeFrequency: "monthly", priority: 0.85 },
    { url: `${SITE}/publish`,                  lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/dashboard`,                lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/tools/pdf-editor/documents`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/purchases`,                lastModified: now, changeFrequency: "monthly", priority: 0.65 },
    { url: `${SITE}/bookmarks`,                lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${SITE}/settings`,                 lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
  ]

  return staticRoutes
}
