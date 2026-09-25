"use client"

import { usePathname } from "next/navigation"

export function MainOffset({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // The editor hides the site nav entirely (see NotchNavbar) and manages its
  // own full-viewport layout - the 4rem offset meant to clear that nav would
  // just leave a dead gap at the top instead.
  const isEditor = pathname?.startsWith("/tools/pdf-editor")
  return <div className={isEditor ? undefined : "site-main-offset"}>{children}</div>
}
