import type { MetadataRoute } from "next"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://plugyard.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    "/bookmarks",
    "/login",
    "/signup",
    "/terms",
    "/terms-of-use",
    "/refund-policy",
  ]

  return paths.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "daily" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }))
}