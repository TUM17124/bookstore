/**
 * The PlugYard logo at UI sizes. Small WebP (1-2 KB) with a PNG fallback,
 * 64 px for normal screens and 128 px for sharp (retina) ones - instead of
 * the 1.4 MB original, which is kept only as the source file
 * (design/logo-source.png).
 */
export function BrandLogo({ size, alt = "", className = "" }: { size: number; alt?: string; className?: string }) {
  return (
    <picture>
      <source type="image/webp" srcSet="/logo-64.webp 64w, /logo-128.webp 128w" sizes={`${size}px`} />
      {/* eslint-disable-next-line @next/next/no-img-element -- static export: no image optimiser */}
      <img
        src="/logo-64.png"
        srcSet="/logo-64.png 64w, /logo-128.png 128w"
        sizes={`${size}px`}
        width={size}
        height={size}
        alt={alt}
        decoding="async"
        className={className}
      />
    </picture>
  )
}
