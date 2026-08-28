import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { NotchNavbar } from "@/components/ui/notch-navbar"
import { BookmarksProvider } from "@/components/bookmarks-context"
import { SiteFooter } from "@/components/site-footer"

const SITE = "https://plugyard.com"

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "PlugYard — Kenyan digital library",
    template: "%s | PlugYard",
  },
  description:
    "Read and download Kenyan statutes and practical guides: business and compliance, career, academic, personal finance, and lifestyle. Official public-law texts, free to read.",
  keywords: [
    "PlugYard",
    "Kenya law",
    "Kenya statutes",
    "Employment Act Kenya",
    "KRA",
    "Companies Act",
    "Data Protection Act",
    "ebook Kenya",
    "digital library Kenya",
    "business compliance Kenya",
    "career guides Kenya",
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
    title: "PlugYard — Kenyan digital library",
    description:
      "Official Kenya statutes and practical documents for business, career, study, money, and daily life. Read free on PlugYard.",
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
    title: "PlugYard — Kenyan digital library",
    description:
      "Kenya statutes and practical guides. Business, career, academic, finance, lifestyle.",
    images: ["/logo.png"],
  },
  alternates: {
    canonical: SITE,
  },
  verification: {
    // Paste the code Google Search Console gives you (content= value only)
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
            <NotchNavbar />
            <div className="site-main-offset pt-20">{children}</div>
            <SiteFooter />
          </BookmarksProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}