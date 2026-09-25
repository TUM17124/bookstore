"use client"

import { Suspense } from "react"
import { useIsEditorFocusedRoute } from "@/lib/pdf-editor/use-is-editor-focused-route"

// useSearchParams() (inside useIsEditorFocusedRoute) requires a Suspense
// boundary or the static export's build-time prerender of /_not-found fails.
// Split into an inner component so the boundary sits around the (synchronous,
// no real async work) hook only, not around `children` itself — the fallback
// below renders children immediately with the offset applied (the common
// case: a normal site page, not the focused editor), so there's no visible
// blocking; only a focused-editor page load could theoretically show one
// offset frame before this resolves, and in practice resolves same-tick.
function MainOffsetInner({ children }: { children: React.ReactNode }) {
  // Only the focused editor view (`/tools/pdf-editor?id=...`) hides the site
  // nav entirely (see NotchNavbar) and manages its own full-viewport layout -
  // the 4rem offset meant to clear that nav would just leave a dead gap at
  // the top instead. The landing/upload prompt and My Documents are normal
  // site pages and keep the usual offset (redesign #5).
  const isEditor = useIsEditorFocusedRoute()
  return <div className={isEditor ? undefined : "site-main-offset"}>{children}</div>
}

export function MainOffset({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="site-main-offset">{children}</div>}>
      <MainOffsetInner>{children}</MainOffsetInner>
    </Suspense>
  )
}
