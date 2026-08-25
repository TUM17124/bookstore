'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function TermsPage() {
  return (
    <LegalOverlay title="Terms & Conditions" updated="August 25, 2026">
      <h2>1. Agreement</h2>
      <p>
        By accessing or using Bookstore, you agree to these Terms & Conditions.
        If you do not agree, please do not use the service.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You are responsible for maintaining the confidentiality of your login
        credentials and for all activity under your account.
      </p>

      <h2>3. Products & availability</h2>
      <p>
        Book listings, prices, and stock are subject to change. We may limit
        quantities or refuse orders where necessary.
      </p>

      <h2>4. Acceptable use</h2>
      <ul>
        <li>Do not misuse ratings, comments, or other community features.</li>
        <li>Do not attempt to disrupt or abuse the platform.</li>
        <li>Do not post unlawful, harmful, or infringing content.</li>
      </ul>

      <h2>5. Contact</h2>
      <p>
        For questions about these terms, contact us through the details provided
        on the site.
      </p>
    </LegalOverlay>
  )
}