'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function TermsOfUsePage() {
  return (
    <LegalOverlay title="Terms of Use" updated="August 30, 2026">
      <h2>1. License to use</h2>
      <p>
        We grant you a limited, non-exclusive, non-transferable licence to use
        PlugYard for personal browsing, reading free public-law titles,
        purchasing paid titles when offered, bookmarking, and reviewing books
        as the service intends.
      </p>

      <h2>2. Content you submit</h2>
      <p>
        Ratings and comments may be moderated. You grant us permission to
        display your reviews next to the relevant titles.
      </p>

      <h2>3. Intellectual property</h2>
      <p>
        Site design, branding, and software are owned by PlugYard. Official
        legal texts remain public documents of the Republic of Kenya. We host
        copies for reading convenience. Do not treat a PlugYard file as the
        only official gazette copy.
      </p>

      <h2>4. Service changes</h2>
      <p>
        Features may be updated, paused, or removed. User-posted books and new
        catalogues are planned and are not a promise of a launch date.
      </p>

      <h2>5. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, PlugYard is not liable for
        indirect or consequential loss from use of the site, including reliance
        on a statute text without checking an official source.
      </p>
    </LegalOverlay>
  )
}