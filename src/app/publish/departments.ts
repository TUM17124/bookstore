import type { CategoryInfo } from "@/lib/api"

export type PublishingKind = "book" | "product" | "service"

export function publishingKind(category: Pick<CategoryInfo, "viewer_mode" | "fulfillment_type">): PublishingKind {
  if (category.viewer_mode === "book_3d") return "book"
  return category.fulfillment_type === "service" ? "service" : "product"
}

function hasUsefulAdminDescription(description?: string): boolean {
  const value = description?.trim() ?? ""
  if (value.length < 12) return false
  return !/\b(demo|example|placeholder|sample text|lorem ipsum|coming soon)\b/i.test(value)
}

export function publishingDescription(category: CategoryInfo): string {
  if (hasUsefulAdminDescription(category.description)) return category.description.trim()
  const label = category.label.trim()
  const kind = publishingKind(category)
  const words = `${category.label} ${category.slug}`.toLowerCase()

  if (kind === "book") return `Submit a book in ${label} for review, then manage its publication from your seller dashboard.`
  if (kind === "service") return `Offer ${label} services with clear pricing, scope and availability for customers.`
  if (/car|vehicle|automotive|motor/.test(words)) return "List a car or vehicle with accurate condition, price and availability so buyers can review the details."
  if (/digital.?download|download|software|file/.test(words)) return "List digital files or downloads with clear format, access and usage details for customers."
  return `Create a ${label} listing with accurate details, pricing and availability for customers.`
}

export function publishingCategoryHref(category: Pick<CategoryInfo, "slug">): string {
  return `/publish/?category=${encodeURIComponent(category.slug)}`
}
