"use client"

import { createElement } from "react"
import { cachedResource } from "@/lib/cached-resource"
import {
  Baby,
  BookOpen,
  Briefcase,
  Church,
  Cpu,
  Feather,
  FlaskConical,
  GraduationCap,
  Headphones,
  Heart,
  Landmark,
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
}

export function categoryIcon(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || BookOpen
}

/** The admin-chosen icon for a category (Lucide), rendered. */
export function CategoryIcon({ name, className }: { name?: string; className?: string }) {
  return createElement(categoryIcon(name), { className, "aria-hidden": true })
}

export function categoryHref(slug: string): string {
  return `/?category=${encodeURIComponent(slug)}`
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
