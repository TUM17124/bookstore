"use client"


// Components using useSearchParams() require a Suspense
// boundary or the static export's build-time prerender of /_not-found fails.
// Split into an inner component so the boundary sits around the (synchronous,
// no real async work) hook only, not around `children` itself — the fallback
// below renders children immediately with the offset applied (the common
// case: a normal site page, not the focused editor), so there's no visible
// blocking; only a focused-editor page load could theoretically show one
// offset frame before this resolves, and in practice resolves same-tick.
function MainOffsetInner({ children }: { children: React.ReactNode }) {
  return <div className="site-main site-main-offset">{children}</div>
}

export function MainOffset({ children }: { children: React.ReactNode }) {
  return <MainOffsetInner>{children}</MainOffsetInner>
}
