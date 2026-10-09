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
  return (
    <>
      {/* Light mode: transparent-background logo (no background clipping needed) */}
      <img
        src="/logo-64-light.png"
        srcSet="/logo-64-light.png 64w, /logo-128-light.png 128w"
        sizes={`${size}px`}
        width={size}
        height={size}
        alt={alt}
        decoding="async"
        className={`dark:hidden ${className}`}
      />
      {/* Dark mode: original dark-background logo (WebP where supported) */}
      <picture>
        <source type="image/webp" srcSet="/logo-64.webp 64w, /logo-128.webp 128w" sizes={`${size}px`} />
        {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimiser */}
        <img
          src="/logo-64.png"
          srcSet="/logo-64.png 64w, /logo-128.png 128w"
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
