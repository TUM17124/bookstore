"use client"

import { useSiteConfig } from "@/lib/site-config"

/**
 * The PlugYard logo at UI sizes. Swaps between a transparent-background
 * version (light mode) and the original dark-background version (dark mode)
 * using Tailwind class-based dark mode — no CSS filter, no flash on load
 * because themeInitScript() sets the class before the first paint.
 *
 * Source files:
 *   logo-64-light.png / logo-128-light.png  — transparent bg, light mode
 *   logo-64.webp / logo-64.png              — dark bg, dark mode
 *   logo-128.webp / logo-128.png            — dark bg, dark mode (2×)
 */
export function BrandLogo({ size, alt = "", className = "" }: { size: number; alt?: string; className?: string }) {
  const [config] = useSiteConfig()
  const light = config?.branding?.light_logo || config?.branding?.primary_logo || "/logo-128-light.png"
  const dark = config?.branding?.dark_logo || config?.branding?.secondary_logo || "/logo-128.png"
  return (
    <>
      {/* Light mode: transparent-background logo (no background clipping needed) */}
      <img
        src={light}
        sizes={`${size}px`}
        width={size}
        height={size}
        alt={alt}
        decoding="async"
        className={`dark:hidden ${className}`}
      />
      {/* Dark mode: original dark-background logo (WebP where supported) */}
      <picture>
        {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimiser */}
        <img
          src={dark}
          sizes={`${size}px`}
          width={size}
          height={size}
          alt=""
          aria-hidden="true"
          decoding="async"
          className={`hidden dark:block ${className}`}
        />
      </picture>
    </>
  )
}
