import Link from "next/link"
import { BookOpen, Mail } from "lucide-react"

const policyLinks = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/terms-of-use", label: "Terms of Use" },
   { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
]

const browseLinks = [
  { href: "/?category=business-compliance", label: "Business & Compliance" },
  { href: "/?category=career", label: "Career" },
  { href: "/?category=academic", label: "Academic" },
  { href: "/?category=personal-finance", label: "Personal Finance" },
  { href: "/?category=lifestyle", label: "Lifestyle" },
]

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="relative mt-auto border-t border-foreground/5 bg-zinc-50 dark:bg-black">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-foreground/[0.04]"
        aria-hidden
      />

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand + contact */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                className="h-9 w-9 rounded-lg object-contain"
              />
              <span className="text-base font-semibold tracking-tight text-foreground">
                Bookstore
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-foreground/55">
              Discover featured titles, save bookmarks, and share ratings with a
              quiet, focused reading experience.
            </p>

            {/* Contact — visible */}
            <a
              href="mailto:contact@plugyard.com"
              className="
                mt-5 inline-flex max-w-full items-center gap-2.5
                rounded-2xl border border-foreground/10
                bg-foreground/[0.04] px-3.5 py-2.5
                text-sm font-medium text-foreground
                transition-colors
                hover:border-foreground/20 hover:bg-foreground/[0.07]
              "
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <Mail className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
                  Contact
                </span>
                <span className="block truncate font-semibold text-sky-600 underline-offset-2 hover:underline dark:text-sky-400">
                  contact@plugyard.com
                </span>
              </span>
            </a>
          </div>

          {/* Browse */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
              Browse
            </h3>
            <ul className="mt-4 space-y-2.5">
              {browseLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-foreground/70 transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
              Account
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/login"
                  className="text-sm text-foreground/70 transition-colors hover:text-foreground"
                >
                  Log in
                </Link>
              </li>
              <li>
                <Link
                  href="/signup"
                  className="text-sm text-foreground/70 transition-colors hover:text-foreground"
                >
                  Sign up
                </Link>
              </li>
              <li>
                <Link
                  href="/bookmarks"
                  className="text-sm text-foreground/70 transition-colors hover:text-foreground"
                >
                  Bookmarks
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
              Legal
            </h3>
            <ul className="mt-4 space-y-2.5">
              {policyLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-foreground/70 transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-foreground/5 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-foreground/45">
            © {year} Bookstore. All rights reserved.
          </p>
          <a
            href="mailto:contact@plugyard.com"
            className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
          >
            contact@plugyard.com
          </a>
          <p className="inline-flex items-center gap-1.5 text-xs text-foreground/40">
            <BookOpen className="h-3.5 w-3.5 opacity-70" />
            Read more. Worry less.
          </p>
        </div>
      </div>
    </footer>
  )
}