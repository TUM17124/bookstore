"use client"

import { Suspense, useId, useState } from "react"
import Link from "next/link"
import { BookOpen, ChevronDown, Mail } from "lucide-react"
import { useIsEditorFocusedRoute } from "@/lib/pdf-editor/use-is-editor-focused-route"
import { categoryHref, useCategories } from "@/lib/categories"
import { BrandLogo } from "@/components/brand-logo"
import { fill, usePairs, useSupportEmail, useText, type LinkPair } from "@/lib/site-config"

const policyLinks = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/terms-of-use", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
]


type FooterLink = { href: string; label: string }

/** Admin "Label | /path or https://…" lines -> links. */
function toLinks(pairs: LinkPair[]): FooterLink[] {
  return pairs.filter((p) => p.label && p.value).map((p) => ({ href: p.value, label: p.label }))
}

/** A site page uses next/link; a full https:// link opens in a new tab. */
function FooterLinkItem({ link, className }: { link: FooterLink; className: string }) {
  if (/^https?:\/\//.test(link.href)) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {link.label}
      </a>
    )
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  )
}

/** Footer texts and links (Django admin → Site: Footer). */
function useFooter() {
  return {
    toolsHeading: useText("footer.tools_heading"),
    toolLinks: toLinks(usePairs("footer.tools_links")),
    accountHeading: useText("footer.account_heading"),
    accountLinks: toLinks(usePairs("footer.account_links")),
    legalHeading: useText("footer.legal_heading"),
    taglineLong: useText("footer.tagline_long"),
    taglineShort: useText("footer.tagline_short"),
    copyright: useText("footer.copyright"),
    motto: useText("footer.motto"),
    social: toLinks(usePairs("footer.social_links")),
    apps: toLinks(usePairs("footer.app_badges")),
    supportEmail: useSupportEmail(),
  }
}

type Footer = ReturnType<typeof useFooter>

/** Social links and app-store links, only when the admin added some. */
function ExtraLinks({ f, className }: { f: Footer; className: string }) {
  const links = [...f.social, ...f.apps]
  if (!links.length) return null
  return (
    <ul className={className}>
      {links.map((l) => (
        <li key={`${l.label}-${l.href}`}>
          <FooterLinkItem
            link={l}
            className="inline-flex min-h-[32px] items-center text-xs font-medium text-foreground/60 underline-offset-2 hover:text-foreground hover:underline"
          />
        </li>
      ))}
    </ul>
  )
}

/** Phones: one footer column as a collapsed accordion row. */
function FooterAccordion({ title, links }: { title: string; links: FooterLink[] }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="border-b border-foreground/10">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[48px] w-full items-center justify-between text-left text-sm font-semibold text-foreground/80 outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        >
          {title}
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 text-foreground/50 motion-safe:transition-transform motion-safe:duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h3>
      {/* grid-rows 0fr -> 1fr: a smooth open/close with no fixed height. */}
      <div
        id={id}
        className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        inert={!open}
      >
        <ul className="grid min-h-0 grid-cols-2 gap-x-4 overflow-hidden">
          {links.map((l) => (
            <li key={`${l.label}-${l.href}`} className="min-w-0">
              <FooterLinkItem
                link={l}
                className="flex min-h-[44px] items-center text-sm text-foreground/70 hover:text-foreground"
              />
            </li>
          ))}
          <li className="col-span-2 h-2" aria-hidden />
        </ul>
      </div>
    </div>
  )
}

/** Phones (under 768px): accordions + one compact brand/legal block. The
 * categories are left out here - they're already in the navbar chips and
 * the "All" sheet. Desktop/tablet keep the full footer below. */
function PhoneFooter({ year, f }: { year: number; f: Footer }) {
  return (
    <div className="px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 md:hidden">
      <nav aria-label="Footer">
        <FooterAccordion title={f.toolsHeading} links={f.toolLinks} />
        <FooterAccordion title={f.accountHeading} links={f.accountLinks} />
      </nav>
      <div className="mt-5 space-y-3">
        <Link href="/" className="inline-flex items-center gap-2">
          <BrandLogo size={28} className="h-7 w-7 rounded-md object-contain" />
          <span className="text-sm font-semibold text-foreground">PlugYard</span>
          <span className="text-xs text-foreground/50">· {f.taglineShort}</span>
        </Link>
        <a
          href={`mailto:${f.supportEmail}`}
          className="flex min-h-[44px] w-fit items-center gap-2 text-sm font-medium text-foreground underline-offset-2 hover:underline"
        >
          <Mail className="h-4 w-4" aria-hidden />
          {f.supportEmail}
        </a>
        <ExtraLinks f={f} className="flex flex-wrap gap-x-4" />
        <p className="text-xs leading-relaxed text-foreground/45">
          © {year} PlugYard ·{" "}
          {policyLinks.map((l, i) => (
            <span key={l.href}>
              <Link href={l.href} className="underline-offset-2 hover:text-foreground hover:underline">
                {l.label.replace(" & Conditions", "").replace(" Policy", "")}
              </Link>
              {i < policyLinks.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}

function SiteFooterInner() {
  const year = new Date().getFullYear()
  const isEditorFocusedRoute = useIsEditorFocusedRoute()
  // Admin-defined categories (same list as the navbar), not a fixed list.
  const { navbar } = useCategories()
  const browseLinks = navbar.map((c) => ({ href: categoryHref(c.slug), label: c.label }))
  const f = useFooter()

  // The focused editor view is a full-screen app-like tool (own fixed
  // toolbar, fills exactly the viewport below the nav) - the marketing
  // footer has nowhere to go there and just adds dead scroll height below
  // it. The landing/upload prompt and My Documents keep the footer
  // (redesign #5).
  if (isEditorFocusedRoute) return null

  return (
    <footer className="site-footer relative border-t border-foreground/5 bg-zinc-50 dark:bg-background">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-foreground/[0.04]"
        aria-hidden
      />

      <PhoneFooter year={year} f={f} />

      <div className="mx-auto hidden max-w-6xl px-4 py-12 sm:px-6 md:block lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand + contact */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <BrandLogo size={36} className="h-9 w-9 rounded-lg object-contain" />
              <span className="text-base font-semibold tracking-tight text-foreground">
                PlugYard
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-foreground/55">{f.taglineLong}</p>

            {/* Contact — visible */}
            <a
              href={`mailto:${f.supportEmail}`}
              className="
                mt-5 inline-flex max-w-full items-center gap-2.5
                rounded-2xl border border-foreground/10
                bg-foreground/[0.04] px-3.5 py-2.5
                text-sm font-medium text-foreground
                transition-colors
                hover:border-foreground/20 hover:bg-foreground/[0.07]
              "
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground">
                <Mail className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
                  Contact
                </span>
                <span className="block truncate font-semibold text-foreground underline-offset-2 hover:underline">
                  {f.supportEmail}
                </span>
              </span>
            </a>
            <ExtraLinks f={f} className="mt-4 flex flex-wrap gap-x-4 gap-y-1" />
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

          {/* Tools & Pro */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
              {f.toolsHeading}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {f.toolLinks.map((l) => (
                <li key={`${l.label}-${l.href}`}>
                  <FooterLinkItem link={l} className="text-sm text-foreground/70 transition-colors hover:text-foreground" />
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
              {f.accountHeading}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {f.accountLinks.map((l) => (
                <li key={`${l.label}-${l.href}`}>
                  <FooterLinkItem link={l} className="text-sm text-foreground/70 transition-colors hover:text-foreground" />
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
              {f.legalHeading}
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
          <p className="text-xs text-foreground/45">{fill(f.copyright, { year })}</p>
          <a
            href={`mailto:${f.supportEmail}`}
            className="text-xs font-medium text-foreground/70 hover:text-foreground hover:underline"
          >
            {f.supportEmail}
          </a>
          <p className="inline-flex items-center gap-1.5 text-xs text-foreground/40">
            <BookOpen className="h-3.5 w-3.5 opacity-70" />
            {f.motto}
          </p>
        </div>
      </div>
    </footer>
  )
}

// useSearchParams() (inside useIsEditorFocusedRoute) requires a Suspense
// boundary or the static export's build-time prerender of /_not-found fails.
// fallback={null}: same reasoning as NotchNavbar's wrapper.
export function SiteFooter() {
  return (
    <Suspense fallback={null}>
      <SiteFooterInner />
    </Suspense>
  )
}