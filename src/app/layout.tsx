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
    default: "PlugYard — Buy eBooks & Audiobooks Online",
    template: "%s | PlugYard",
  },
  description:
    "PlugYard — Kenya's online store for eBooks and audiobooks. Buy and instantly read or listen — no account required. AI-powered narration turns every eBook into an audiobook. Free in-browser PDF editor with auto-save. Business, career, academic, personal finance, and lifestyle titles.",
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
    title: "PlugYard — Buy eBooks & Audiobooks Online",
    description:
      "Buy eBooks and audiobooks online — no account needed. AI-powered narration on every title. Practical guides for business, career, academic, personal finance, and lifestyle. Free PDF editor with auto-save included.",
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
      "Buy eBooks & audiobooks online — no account needed. AI narration on every title. Business, career, academic, finance & lifestyle guides. Free PDF editor.",
    images: ["/logo.png"],
  },
  verification: {
    google: "G5QylOyQKIG9YdPoVnVJAABBv2hONBE7kGmMH7XpdCQ",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-KE" suppressHydrationWarning>
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