"use client"

import { createElement } from "react"
import { cachedResource } from "@/lib/cached-resource"
import {
  Baby,
  BookOpen,
  CarFront,
  Briefcase,
  Church,
  Cpu,
  Download,
  Feather,
  FlaskConical,
  GraduationCap,
  Headphones,
  Heart,
  Landmark,
  Laptop,
  Package,
  Shirt,
  Sofa,
  House,
  Gavel,
  Sparkles,
  Tag,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { getCategories, type CategoryInfo } from "@/lib/api"

/**
 * Part B: categories are defined by the admin (Django admin → Categories):
 * which ones, order, labels, icons, navbar on/off. Nothing here is a
 * hard-coded category list — only the icon NAMES the admin can choose from
 * (shop/models_sections.py CATEGORY_ICONS) mapped to their drawings.
 */

const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  car: CarFront,
  download: Download,
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  wallet: Wallet,
  heart: Heart,
  baby: Baby,
  sparkles: Sparkles,
  feather: Feather,
  landmark: Landmark,
  "flask-conical": FlaskConical,
  cpu: Cpu,
  church: Church,
  utensils: Utensils,
  headphones: Headphones,
  tag: Tag,
  laptop: Laptop,
  shirt: Shirt,
  sofa: Sofa,
  package: Package,
  house: House,
  gavel: Gavel,
}

export function categoryIcon(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Package
}

/** A useful visual fallback for marketplace departments that still have the historical
 * default book icon. Explicit non-book admin choices always take precedence. */
export function marketplaceCategoryIcon(label: string, slug: string, configuredIcon?: string, isBookDepartment = false, fulfillmentType?: string): LucideIcon {
  if (isBookDepartment) return BookOpen
  if (configuredIcon && configuredIcon !== "book-open" && ICONS[configuredIcon]) return ICONS[configuredIcon]
  const value = `${label} ${slug}`.toLowerCase()
  if (/book|author|publish|literature/.test(value)) return BookOpen
  if (/car|vehicle|automotive|motor|truck/.test(value)) return CarFront
  if (/digital.?download|download|ebook|software|file/.test(value)) return Download
  if (/laptop|computer|electronic|technology|phone|device/.test(value)) return Laptop
  if (/fashion|clothing|apparel|shirt|denim/.test(value)) return Shirt
  if (/furniture|sofa|chair|home decor/.test(value)) return Sofa
  if (/home|kitchen|house|storage|appliance/.test(value)) return House
  if (fulfillmentType === "service" || /service|professional|consult|repair/.test(value)) return Briefcase
  if (/auction|bid/.test(value)) return Gavel
  return Package
}

/** The admin-chosen icon for a category (Lucide), rendered. */
export function CategoryIcon({ name, className }: { name?: string; className?: string }) {
  return createElement(categoryIcon(name), { className, "aria-hidden": true })
}

export function categoryHref(category: string | CategoryInfo): string {
  if (typeof category !== "string") return category.browse_url || `/categories/${encodeURIComponent(category.slug)}/`
  return `/categories/${encodeURIComponent(category)}/`
}

type Cached = { navbar: CategoryInfo[]; all: CategoryInfo[] }

const EMPTY: Cached = { navbar: [], all: [] }

const useCategoriesResource = cachedResource<Cached>("plugyard_categories_v1", getCategories, EMPTY)

/** The admin's categories. Paints instantly from the last copy this browser
 * saw (so the navbar doesn't jump), then refreshes from the server. */
export function useCategories(): Cached & { ready: boolean } {
  const [data, ready] = useCategoriesResource()
  return { navbar: data.navbar, all: data.all, ready }
}
