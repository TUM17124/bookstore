"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import {
  Home,
  BookOpen,
  GraduationCap,
  Briefcase,
  Wallet,
  Heart,
  Search,
  Menu,
  X,
  Sun,
  Moon,
  Bookmark,
  Upload,
  LayoutDashboard,
  LogOut,
  ChevronDown,
  User,
} from "lucide-react"
import { BookSearchModal } from "@/components/book-search-modal"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { motion, AnimatePresence } from "framer-motion"
import { useTheme } from "@teispace/next-themes"
import { useBookmarks } from "@/components/bookmarks-context"
import {
  getStoredUser,
  isLoggedIn,
  clientLogout,
  type AuthUser,
} from "@/lib/auth-client"

const NavLink = ({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
}) => (
  <Link
    href={href}
    onClick={onClick}
    className="
      group flex items-center gap-1.5 text-sm font-medium
      text-foreground/70 hover:text-foreground
      transition-colors whitespace-nowrap shrink-0
    "
  >
    <Icon className="w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
    <span>{label}</span>
  </Link>
)

const MobileThemeToggle = () => {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <div className="w-9 h-9" />

  const isDark = theme === "dark" || resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}

export function NotchNavbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const { bookmarks, refreshBookmarks } = useBookmarks()
  const bookmarkCount = bookmarks.length

  const [user, setUser] = useState<AuthUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sync = () => {
      if (isLoggedIn()) setUser(getStoredUser())
      else setUser(null)
      setAuthReady(true)
      void refreshBookmarks?.()
    }
    sync()
    window.addEventListener("auth-changed", sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener("auth-changed", sync)
      window.removeEventListener("storage", sync)
    }
  }, [refreshBookmarks])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  const handleLogout = () => {
    clientLogout()
    setUser(null)
    setIsMobileMenuOpen(false)
    setAccountOpen(false)
    void refreshBookmarks?.()
  }

  const categories = [
    { label: "Business", href: "/?category=business-compliance", icon: Briefcase },
    { label: "Career", href: "/?category=career", icon: GraduationCap },
    { label: "Academic", href: "/?category=academic", icon: BookOpen },
    { label: "Finance", href: "/?category=personal-finance", icon: Wallet },
    { label: "Lifestyle", href: "/?category=lifestyle", icon: Heart },
  ]

  const accountMenu = (
    <div className="py-1">
      <div className="px-3 py-2 text-xs text-foreground/50 truncate max-w-[220px]">
        {user?.name || user?.email}
      </div>
      <Link
        href="/publish"
        onClick={() => setAccountOpen(false)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-foreground/5"
      >
        <Upload className="w-4 h-4" />
        Publish
      </Link>
      <Link
        href="/dashboard"
        onClick={() => setAccountOpen(false)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-foreground/5"
      >
        <LayoutDashboard className="w-4 h-4" />
        Dashboard
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-foreground/5 text-left"
      >
        <LogOut className="w-4 h-4" />
        Log out
      </button>
    </div>
  )

  const authDesktop = !authReady ? null : user ? (
    <div className="relative" ref={accountRef}>
      <button
        type="button"
        onClick={() => setAccountOpen((v) => !v)}
        className="flex items-center gap-1.5 h-9 px-2.5 rounded-full hover:bg-foreground/5 text-sm font-medium text-foreground/80"
        aria-expanded={accountOpen}
        aria-haspopup="menu"
      >
        <User className="w-4 h-4" />
        <span className="hidden xl:inline max-w-[90px] truncate">
          {user.name || user.email}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition ${accountOpen ? "rotate-180" : ""}`} />
      </button>
      {accountOpen && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 rounded-xl border border-foreground/10 bg-zinc-50 dark:bg-zinc-950 shadow-lg"
        >
          {accountMenu}
        </div>
      )}
    </div>
  ) : (
    <>
      <Link
        href="/login"
        className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors whitespace-nowrap"
      >
        Log in
      </Link>
      <Link
        href="/signup"
        className="px-3 py-1.5 text-sm font-medium text-background bg-foreground rounded-2xl hover:bg-foreground/90 transition-colors shadow-sm shadow-foreground/10 whitespace-nowrap"
      >
        Sign up
      </Link>
    </>
  )

  return (
    <>
      <header
        className={cn("site-navbar fixed top-0 inset-x-0 z-50 h-16 flex px-0", className)}
        {...props}
      >
        <div className="flex-1 h-10 bg-zinc-50 dark:bg-black z-20 relative min-w-0">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <line x1="0" y1="39.5" x2="100%" y2="39.5" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
            <line x1="0" y1="36.5" x2="100%" y2="36.5" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
          </svg>
        </div>

        <div className="flex h-16 relative z-10 shrink-0 -ml-px max-w-[min(100%,1100px)]">
          <div className="w-[36px] sm:w-[50px] h-full relative shrink-0">
            <div className="absolute inset-0 bg-zinc-50 dark:bg-black" style={{ clipPath: "path('M0 0 H50 V64 C25 64 25 40 0 40 Z')" }} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 50 64">
              <path d="M0 39.5 C25 39.5 25 63.5 50 63.5" fill="none" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
              <path d="M0 36.5 C25 36.5 25 60.5 50 60.5" fill="none" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
            </svg>
          </div>

          <div className="flex-1 h-full relative min-w-0 -ml-px">
            <div className="absolute inset-0 bg-zinc-50 dark:bg-black">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                <line x1="0" y1="63.5" x2="100%" y2="63.5" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
                <line x1="0" y1="60.5" x2="100%" y2="60.5" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
              </svg>
            </div>

            <div className="relative w-full h-full flex items-end justify-between pb-2 px-2 sm:px-4 lg:px-5">
              <div className="hidden lg:flex items-center gap-3 xl:gap-4 mb-1 w-full min-w-0">
                <Link href="/" className="flex items-center shrink-0" aria-label="Home">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="Logo" className="h-8 w-8 rounded-lg object-contain" />
                </Link>

                <nav className="flex items-center gap-3 xl:gap-4 min-w-0 overflow-hidden">
                  <NavLink href="/" icon={Home} label="Home" />
                  {categories.map((category) => (
                    <NavLink
                      key={category.label}
                      href={category.href}
                      icon={category.icon}
                      label={category.label}
                    />
                  ))}
                </nav>

                <div className="flex-1 min-w-2" aria-hidden />

                <div className="flex gap-1 pl-3 border-l border-foreground/10 shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
                    aria-label="Search books"
                  >
                    <Search className="w-4 h-4" />
                  </button>

                  <Link
                    href="/bookmarks"
                    className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
                    aria-label={`Bookmarks${bookmarkCount ? ` (${bookmarkCount})` : ""}`}
                  >
                    <Bookmark className="w-4 h-4" />
                    {bookmarkCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
                        {bookmarkCount > 99 ? "99+" : bookmarkCount}
                      </span>
                    )}
                  </Link>

                  <Link
                    href="/purchases"
                    className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-foreground/5 text-foreground/70 hover:text-foreground"
                    aria-label="Purchases"
                    title="Purchases"
                  >
                    <BookOpen className="w-4 h-4" />
                  </Link>

                  <ThemeToggle />
                  {authDesktop}
                </div>
              </div>

              <div className="lg:hidden flex items-center gap-2 mb-1">
                <Link href="/" className="flex items-center shrink-0" aria-label="Home">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="Logo" className="h-7 w-7 rounded-md object-contain" />
                </Link>
                <button
                  type="button"
                  className="p-1 text-foreground/70 hover:text-foreground transition-colors"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  aria-label="Toggle menu"
                >
                  {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>

              <div className="flex-1 lg:hidden" />

              <div className="lg:hidden flex items-center gap-1 mb-1">
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
                  aria-label="Search books"
                >
                  <Search className="w-4 h-4" />
                </button>
                <Link
                  href="/bookmarks"
                  className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-foreground/5 transition-colors text-foreground/70 hover:text-foreground"
                  aria-label={`Bookmarks${bookmarkCount ? ` (${bookmarkCount})` : ""}`}
                >
                  <Bookmark className="w-4 h-4" />
                  {bookmarkCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
                      {bookmarkCount > 99 ? "99+" : bookmarkCount}
                    </span>
                  )}
                </Link>
                <MobileThemeToggle />
              </div>
            </div>
          </div>

          <div className="w-[36px] sm:w-[50px] h-full relative shrink-0 -ml-px">
            <div className="absolute inset-0 bg-zinc-50 dark:bg-black" style={{ clipPath: "path('M0 0 H50 V40 C25 40 25 64 0 64 Z')" }} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 50 64">
              <path d="M0 63.5 C25 63.5 25 39.5 50 39.5" fill="none" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
              <path d="M0 60.5 C25 60.5 25 36.5 50 36.5" fill="none" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
            </svg>
          </div>
        </div>

        <div className="flex-1 h-10 bg-zinc-50 dark:bg-black z-20 relative min-w-0 -ml-px">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <line x1="0" y1="39.5" x2="100%" y2="39.5" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
            <line x1="0" y1="36.5" x2="100%" y2="36.5" stroke="currentColor" strokeOpacity={0.05} strokeWidth={0.5} className="text-foreground" />
          </svg>
        </div>
      </header>

      <BookSearchModal open={searchOpen} onOpenChange={setSearchOpen} />

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-16 z-40 bg-zinc-50 dark:bg-black border-b border-foreground/5 p-4 lg:hidden shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto"
          >
            <nav className="flex flex-col gap-1">
              <Link href="/" className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
                <Home className="w-5 h-5 opacity-70" />
                <span className="font-medium text-foreground/90">Home</span>
              </Link>

              <div className="h-px bg-foreground/10 my-3" />
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-foreground/40">Browse</p>

              {categories.map((category) => (
                <Link key={category.label} href={category.href} className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors" onClick={() => setIsMobileMenuOpen(false)}>
                  <category.icon className="w-5 h-5 opacity-70 shrink-0" />
                  <span className="font-medium text-foreground/90">{category.label}</span>
                </Link>
              ))}

              <div className="h-px bg-foreground/10 my-3" />
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-foreground/40">Library</p>
              <Link href="/purchases" className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5" onClick={() => setIsMobileMenuOpen(false)}>
                <BookOpen className="w-5 h-5 opacity-70" />
                <span className="font-medium text-foreground/90">Purchases</span>
              </Link>
              <Link href="/bookmarks" className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5" onClick={() => setIsMobileMenuOpen(false)}>
                <Bookmark className="w-5 h-5 opacity-70" />
                <span className="font-medium text-foreground/90">Bookmarks</span>
              </Link>

              <div className="h-px bg-foreground/10 my-3" />
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-foreground/40">Account</p>

              {!authReady ? null : user ? (
                <>
                  <div className="px-3 py-2 text-sm text-foreground/70 truncate">
                    {user.name || user.email}
                  </div>
                  <Link href="/publish" className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5" onClick={() => setIsMobileMenuOpen(false)}>
                    <Upload className="w-5 h-5 opacity-70" />
                    <span className="font-medium text-foreground/90">Publish</span>
                  </Link>
                  <Link href="/dashboard" className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5" onClick={() => setIsMobileMenuOpen(false)}>
                    <LayoutDashboard className="w-5 h-5 opacity-70" />
                    <span className="font-medium text-foreground/90">Dashboard</span>
                  </Link>
                  <button
                    type="button"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors font-medium text-foreground/90 text-left"
                    onClick={handleLogout}
                  >
                    <LogOut className="w-5 h-5 opacity-70" />
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="flex items-center gap-3 p-3 rounded-lg hover:bg-foreground/5 transition-colors font-medium text-foreground/90" onClick={() => setIsMobileMenuOpen(false)}>
                    Log in
                  </Link>
                  <Link href="/signup" className="flex items-center justify-center gap-2 p-3 rounded-lg bg-foreground text-background font-medium mt-2" onClick={() => setIsMobileMenuOpen(false)}>
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}