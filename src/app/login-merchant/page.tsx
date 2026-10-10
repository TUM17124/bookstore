import type { Metadata } from "next"
import LoginMerchantRedirect from "./redirect"

// Old backend route — permanently redirected by nginx:
//   location /login-merchant { return 301 /login/; }
// This page is a static-export fallback for any cached HTML hits.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: "https://plugyard.com/login/" },
}

export default function LoginMerchantPage() {
  return <LoginMerchantRedirect />
}
