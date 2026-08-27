import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { NotchNavbar } from "@/components/ui/notch-navbar"
import { BookmarksProvider } from '@/components/bookmarks-context';
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Bookstore",
  description: "Shop books online",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
           
          <BookmarksProvider>
          <NotchNavbar />
          <div className="site-main-offset pt-14">{children}</div>
          <SiteFooter />
          </BookmarksProvider>
          
        </ThemeProvider>
      </body>
    </html>
  )
}