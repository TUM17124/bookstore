"use client"

import { useEffect } from "react"
import { useSiteConfig } from "@/lib/site-config"

export function BrandingTokens() {
  const [config] = useSiteConfig()
  useEffect(() => {
    if (!config?.branding) return
    const root = document.documentElement
    root.style.setProperty("--brand-primary", config.branding.colors.primary)
    root.style.setProperty("--brand-secondary", config.branding.colors.secondary)
    root.style.setProperty("--brand-accent", config.branding.colors.accent)
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (favicon && config.branding.favicon) favicon.href = config.branding.favicon
  }, [config])
  return null
}
