import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
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

const SITE = "https://plugyard.com"

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "PlugYard — Buy or Sell eBooks & Audiobooks Online",
    template: "%s | PlugYard",
  },
  description:
    "PlugYard — Kenya's eBook and audiobook marketplace. Buy, read, and listen instantly — no account required. Publish your own eBooks and audiobooks, set your price, and get paid. AI-powered narration. Free in-browser PDF editor. Business, career, academic, personal finance, and lifestyle.",
  keywords: [
    "PlugYard",
    "ebook Kenya",
    "audiobook Kenya",
    "buy ebook without account",
    "digital bookstore Kenya",
    "free PDF editor online",
    "PDF reader online",
    "edit PDF online",
    "instant ebook download Kenya",
    "business guides Kenya",
    "academic ebooks Kenya",
    "career guides Kenya",
    "personal finance Kenya",
    "lifestyle ebooks Kenya",
    "PlugYard Pro",
    "text to speech ebooks Kenya",
    "KRA tax guide",
    "KASNEB study notes",
    "CBC study materials",
    "employment contract Kenya",
    "sign up PlugYard",
    "login PlugYard",
  ],
  authors: [{ name: "PlugYard", url: SITE }],
  creator: "PlugYard",
  publisher: "PlugYard",
  applicationName: "PlugYard",
  category: "education",
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
  icons: {
    icon: [{ url: "/logo.png", type: "image/png" }],
    apple: "/logo.png",
    shortcut: "/logo.png",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_KE",
    url: SITE,
    siteName: "PlugYard",
    title: "PlugYard — Buy or Sell eBooks & Audiobooks Online",
    description:
      "Buy eBooks and audiobooks instantly — no account needed. Publish your content, set your price, and get paid. AI narration on every title. Free PDF editor with auto-save.",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "PlugYard",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "PlugYard — Buy eBooks & Audiobooks Online",
    description:
      "Buy or sell eBooks & audiobooks online. No account to purchase. Publish content and get paid. AI narration. Free PDF editor.",
    images: ["/logo.png"],
  },
  verification: {
    google: "G5QylOyQKIG9YdPoVnVJAABBv2hONBE7kGmMH7XpdCQ",
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      "url": SITE,
      "name": "PlugYard",
      "description": "Kenya's eBook and audiobook marketplace — buy, publish, and sell digital titles online.",
      "potentialAction": {
        "@type": "SearchAction",
        "target": { "@type": "EntryPoint", "urlTemplate": `${SITE}/?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      "name": "PlugYard",
      "url": SITE,
      "logo": { "@type": "ImageObject", "url": `${SITE}/logo.png` },
      "contactPoint": { "@type": "ContactPoint", "email": "contact@plugyard.com", "contactType": "customer support" },
      "sameAs": [],
    },
    {
      "@type": "SiteLinksSearchBox",
      "url": SITE,
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${SITE}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-KE" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <BookmarksProvider>
            <PwaRegister />
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