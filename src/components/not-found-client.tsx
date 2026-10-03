"use client"

import Link from "next/link"
import { useText } from "@/lib/site-config"

/** Django admin → Site: General → Empty pages → "Page not found". */
export function NotFoundClient() {
  const title = useText("notfound.title")
  const body = useText("notfound.body")
  const cta = useText("notfound.cta")
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-foreground/65">{body}</p>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background hover:bg-foreground/90"
      >
        {cta}
      </Link>
    </main>
  )
}
