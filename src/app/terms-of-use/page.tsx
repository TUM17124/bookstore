'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function TermsOfUsePage() {
  return (
    <LegalOverlay title="Terms of Use" updated="August 25, 2026">
      <h2>1. License to use</h2>
      <p>
        We grant you a limited, non-exclusive, non-transferable license to use
        Bookstore for personal, non-commercial browsing, purchasing, bookmarking,
        and reviewing books as intended by the service.
      </p>

      <h2>2. Content you submit</h2>
      <p>
        Ratings and comments remain subject to moderation. You grant us permission
        to display your reviews in connection with the relevant titles.
      </p>

      <h2>3. Intellectual property</h2>
      <p>
        Site design, branding, and software are owned by Bookstore or its
        licensors. Book metadata and covers are used for catalog purposes.
      </p>

      <h2>4. Service changes</h2>
      <p>
        Features may be updated, suspended, or discontinued at any time without
        prior notice.
      </p>

      <h2>5. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Bookstore is not liable for
        indirect or consequential damages arising from use of the service.
      </p>
    </LegalOverlay>
  )
}