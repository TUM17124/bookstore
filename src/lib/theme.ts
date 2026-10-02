/**
 * The light/dark choice.
 *
 * - Stored in the browser under "theme" (the key next-themes reads and
 *   syncs between tabs), for guests and logged-in users alike.
 * - Before any choice: the device's setting.
 * - Logged in: also saved to the account (/api/me/theme/), so it follows the
 *   user to other devices; on login and page load the account's choice wins.
 * - A change that hasn't reached the account yet is remembered as "pending"
 *   (per user) and sent first next time, so the account's older value can
 *   never overwrite a newer choice.
 */

export type ThemeChoice = "light" | "dark"

export const THEME_KEY = "theme"
const PENDING_KEY = "plugyard_theme_pending_v1"

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "light" || v === "dark"
}

/** The choice saved in this browser, or null (follow the device). */
export function localTheme(): ThemeChoice | null {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return isThemeChoice(t) ? t : null
  } catch {
    return null
  }
}

/** The signed-in user's id from the access token (JWT `user_id`), or null. */
export function tokenUserId(token: string | null): number | null {
  if (!token) return null
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    const id = Number(JSON.parse(atob(part)).user_id)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

export type PendingTheme = { theme: ThemeChoice; uid: number }

export function readPending(): PendingTheme | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null")
    return p && isThemeChoice(p.theme) && typeof p.uid === "number" ? p : null
  } catch {
    return null
  }
}

export function setPending(theme: ThemeChoice, uid: number) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ theme, uid }))
  } catch {
    // private mode: the account save still runs now
  }
}

/** Forget the pending change once the account has `theme`. */
export function clearPending(theme: ThemeChoice) {
  try {
    if (readPending()?.theme === theme) localStorage.removeItem(PENDING_KEY)
  } catch {
    // ignore
  }
}

/** Inline <head> script: puts the right class on <html> before the first
 * paint, so the page never flashes the wrong theme. It only sets the class;
 * the colour-scheme comes from globals.css (`only light` / `dark`), which
 * keeps phone browsers' automatic dark mode off light pages. */
export function themeInitScript(): string {
  return `(function(){try{var d=document.documentElement,t=null;try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.classList.remove("light","dark");d.classList.add(t)}catch(e){}})();`
}
