/** Where a hand-off may send the browser: our own pages or a https payment page. */
export function safePaymentUrl(raw: string, origin: string): string | null {
  try {
    const u = new URL(raw, origin)
    if (u.origin === origin) return u.toString()
    if (u.protocol === 'https:') return u.toString()
    return null
  } catch {
    return null
  }
}

/** "paystack.com" for the notice line; falls back to the site name. */
export function paymentHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'the payment page'
  }
}
