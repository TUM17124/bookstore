'use client'

import { useCallback, useState } from 'react'

// True "float on top of OTHER APPS" (like a chat head) needs OS-level
// permission only available to a native app — not achievable from a web
// page. The Document Picture-in-Picture API is the correct web substitute:
// a small always-on-top window that floats above other browser tabs and,
// on desktop, above other application windows too. Chromium-based browsers
// only (Chrome/Edge/Opera) — there is no fallback, the pop-out control
// simply doesn't render when unsupported.
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
      window: Window | null
    }
  }
}

function copyStylesInto(pipWindow: Window) {
  Array.from(document.styleSheets).forEach((styleSheet) => {
    try {
      const rules = Array.from(styleSheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n')
      const style = pipWindow.document.createElement('style')
      style.textContent = rules
      pipWindow.document.head.appendChild(style)
    } catch {
      // Cross-origin stylesheet — cssRules access throws. Re-link it
      // instead of inlining (works the same for a same-origin <link>, and
      // is the only option for a cross-origin one).
      if (styleSheet.href) {
        const link = pipWindow.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = styleSheet.href
        pipWindow.document.head.appendChild(link)
      }
    }
  })
}

export function usePictureInPicture(background = '#0b1020') {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window

  const open = useCallback(
    async (opts?: { width?: number; height?: number }) => {
      if (!supported || !window.documentPictureInPicture) return null
      try {
        const win = await window.documentPictureInPicture.requestWindow({
          width: opts?.width ?? 340,
          height: opts?.height ?? 220,
        })
        copyStylesInto(win)
        win.document.documentElement.style.colorScheme = 'dark'
        win.document.body.style.margin = '0'
        win.document.body.style.background = background
        win.document.body.style.overflow = 'hidden'
        win.addEventListener('pagehide', () => setPipWindow(null))
        setPipWindow(win)
        return win
      } catch {
        // User dismissed the permission prompt, or the API rejected — not
        // an error worth surfacing, the pop-out button just stays inactive.
        return null
      }
    },
    [supported, background],
  )

  const close = useCallback(() => {
    pipWindow?.close()
    setPipWindow(null)
  }, [pipWindow])

  return { pipWindow, supported, open, close }
}


