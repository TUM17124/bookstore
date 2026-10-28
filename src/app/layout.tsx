import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { themeInitScript } from "@/lib/theme"
import { ThemeAccountSync } from "@/components/theme-account-sync"
import { preloadScript } from "@/lib/preload"
import { NotchNavbar } from "@/components/ui/notch-navbar"
import { MainOffset } from "@/components/main-offset"
import { BookmarksProvider } from "@/components/bookmarks-context"
import { SiteFooter } from "@/components/site-footer"
import { PwaRegister } from "@/components/pwa-register"
import { PublishInviteModal } from "@/components/publish-invite-modal"
import { LegalGate } from '@/components/legal-gate'
import { InstallAndPush } from "@/components/install-and-push"
import { PushPrompt } from "@/components/push-prompt"
import { ReferralCapture } from "@/components/referral-capture"
import { BrandingTokens } from "@/components/branding-tokens"
import { getSeo, seoList, seoText } from "@/lib/seo"

const SITE = "https://plugyard.com"

// Site-wide SEO texts (title, template, description, keywords, social
// cards) come from Django admin → Site: SEO at build time; see generateMetadata.
const baseMetadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "PlugYard Marketplace",
    template: "%s | PlugYard",
  },
  description:
    "PlugYard is Kenya's marketplace for books, electronics, vehicles, furniture, services, and more. Shop public listings or sell your own products.",
  keywords: ["PlugYard", "marketplace"],
  authors: [{ name: "PlugYard", url: SITE }],
  creator: "PlugYard",
  publisher: "PlugYard",
  applicationName: "PlugYard",
  category: "shopping",
  referrer: "origin-when-cross-origin",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Small, purpose-sized icons (the 1.4 MB original is only the source file:
  // design/logo-source.png). /logo.png still answers, at 512 px, for old links.
  icons: {
    icon: [
      { url: "/favicon-20261028.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon-192-20261028.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512-20261028.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon-20261028.png", sizes: "180x180" }],
    shortcut: "/favicon-20261028.ico",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: SITE,
    siteName: "PlugYard",
    title: "PlugYard Marketplace",
    description:
      "Shop books, products, and services from independent sellers on PlugYard.",
    images: [
      {
        url: "/icon-512-20261028.png",
        width: 512,
        height: 512,
        alt: "PlugYard",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "PlugYard Marketplace",
    description:
      "Shop books, products, and services or publish your own listing on PlugYard.",
    images: ["/icon-512-20261028.png"],
  },
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getSeo()
  const title = seoText(t, "seo.default_title")
  return {
    ...baseMetadata,
    metadataBase: new URL(seoText(t, "seo.canonical_domain") || SITE),
    verification: seoText(t, "seo.search_console_verification") ? { google: seoText(t, "seo.search_console_verification") } : undefined,
    title: { default: title, template: seoText(t, "seo.title_template") || "%s | PlugYard" },
    description: seoText(t, "seo.description"),
    keywords: seoList(t, "seo.keywords"),
    openGraph: {
      ...baseMetadata.openGraph,
      title: seoText(t, "seo.og_title") || title,
      description: seoText(t, "seo.og_description"),
    },
    twitter: {
      ...baseMetadata.twitter,
      title: seoText(t, "seo.twitter_title") || title,
      description: seoText(t, "seo.twitter_description"),
    },
  }
}

const jsonLd = (websiteDescription: string) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      "url": SITE,
      "name": "PlugYard",
      "description": websiteDescription,
      "potentialAction": {
        "@type": "SearchAction",
        "target": { "@type": "EntryPoint", "urlTemplate": `${SITE}/marketplace/?search={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      "name": "PlugYard",
      "alternateName": "Plug Yard",
      "url": SITE,
      "logo": { "@type": "ImageObject", "url": `${SITE}/icon-512-20261028.png`, "width": 512, "height": 512 },
      "contactPoint": { "@type": "ContactPoint", "email": "contact@plugyard.com", "contactType": "customer support" },
      "sameAs": [],
    },
  ],
})

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const seo = await getSeo()
  return (
    <html lang="en-KE" suppressHydrationWarning>
      <head>
        {/* The saved (or device) theme on <html> before the first paint: no flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
        {/* Perf Step 2: start the home page's data requests now, not when the JS is ready. */}
        <script dangerouslySetInnerHTML={{ __html: preloadScript(process.env.NEXT_PUBLIC_API_URL || "") }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(seoText(seo, "seo.website_description"))).replace(/</g, "\\u003c") }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem enableColorScheme={false}>
          <ThemeAccountSync />
          <BookmarksProvider>
            <PwaRegister />
            <BrandingTokens />
            <ReferralCapture />
            <div className="site-nav">
              <NotchNavbar />
              <PushPrompt />
            </div>
            <MainOffset>{children}</MainOffset>
             <LegalGate />
             <InstallAndPush />
            <PublishInviteModal />
            <SiteFooter />
          </BookmarksProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
