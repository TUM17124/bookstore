const KEY = "plugyard_referral_code"

export function normalizeReferralCode(value: string | null | undefined) {
  return (value || "").trim().toUpperCase().replace(/\s+/g, "")
}

export function getReferralCode() {
  if (typeof window === "undefined") return ""
  return normalizeReferralCode(localStorage.getItem(KEY) || "")
}

export function setReferralCode(value: string) {
  if (typeof window === "undefined") return
  const code = normalizeReferralCode(value)
  if (code) localStorage.setItem(KEY, code)
  else localStorage.removeItem(KEY)
}

export function clearReferralCode() {
  if (typeof window === "undefined") return
  localStorage.removeItem(KEY)
}

export function captureReferralFromLocation(search?: string) {
  if (typeof window === "undefined") return getReferralCode()

  const params = new URLSearchParams(search ?? window.location.search)
  const fromQuery = normalizeReferralCode(
    params.get("ref") || params.get("referral") || params.get("referral_code") || "",
  )

  if (fromQuery) {
    setReferralCode(fromQuery)
    return fromQuery
  }

  return getReferralCode()
}

export function withReferralQuery(href: string) {
  const code = getReferralCode()
  if (!code) return href
  const url = new URL(href, "https://plugyard.com")
  if (!url.searchParams.get("ref")) url.searchParams.set("ref", code)
  return `${url.pathname}${url.search}${url.hash}`
}
