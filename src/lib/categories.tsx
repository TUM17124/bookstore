"use client"

import { useEffect, useState } from "react"
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

export function categoryHref(slug: string): string {
  return `/?category=${encodeURIComponent(slug)}`
}

const CACHE_KEY = "plugyard_categories_v1"

type Cached = { navbar: CategoryInfo[]; all: CategoryInfo[] }

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Cached) : null
  } catch {
    return null
  }
}

let inflight: Promise<Cached | null> | null = null

/** The admin's categories. Paints instantly from the last copy this browser
 * saw (so the navbar doesn't jump), then refreshes from the server. */
export function useCategories(): Cached & { ready: boolean } {
  const [data, setData] = useState<Cached>({ navbar: [], all: [] })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setData(cached)
      setReady(true)
    }
    let cancelled = false
    inflight ??= getCategories().finally(() => {
      setTimeout(() => (inflight = null), 30_000)
    })
    inflight.then((fresh) => {
      if (cancelled || !fresh) return
      setData(fresh)
      setReady(true)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(fresh))
      } catch {
        // private mode: still shown, just not remembered
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { ...data, ready }
}
