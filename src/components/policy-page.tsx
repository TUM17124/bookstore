import Link from "next/link"

export function PolicyPage({
  title,
  updated,
  children,
}: {
  title: string
  updated?: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="text-sm text-foreground/50 transition-colors hover:text-foreground"
      >
        ← Home
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
        {title}
      </h1>
      {updated && (
        <p className="mt-2 text-sm text-foreground/45">Last updated: {updated}</p>
      )}
      <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none text-[15px] leading-relaxed text-foreground/80 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </main>
  )
}