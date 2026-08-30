'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function TermsPage() {
  return (
    <LegalOverlay title="Terms & Conditions" updated="August 30, 2026">
      <h2>1. Agreement</h2>
      <p>
        By using https://plugyard.com you agree to these Terms & Conditions,
        the Terms of Use, the Refund Policy, and the Privacy Policy. If you
        do not agree, do not use the service.
      </p>

      <h2>2. What PlugYard is</h2>
      <p>
        PlugYard is a Kenyan digital library. The current catalogue is official
        public-law and constitutional texts that you may read on the site.
        Other categories and user-uploaded books may be added later. Listings
        and features can change.
      </p>

      <h2>3. Accounts</h2>
      <p>
        You are responsible for your login details and for activity under your
        account. Guest checkout uses the email you enter so we can link payment
        and downloads if you later create an account with that email.
      </p>

      <h2>4. Free and paid titles</h2>
      <p>
        Titles marked free may be read without payment. Paid titles, when
        offered, require a completed Paystack payment before download or
        continued reading. Prices and availability can change.
      </p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>Do not scrape, bulk-copy, or resell files from the library.</li>
        <li>Do not misuse ratings, comments, or other community features.</li>
        <li>Do not attempt to disrupt or abuse the platform.</li>
        <li>Do not post unlawful, harmful, or infringing content.</li>
      </ul>

      <h2>6. Public-law texts</h2>
      <p>
        Official statutes are provided for convenient reading. They are not
        legal advice. Confirm the current text with Kenya Law or another
        official source before you rely on it in court, business, or study.
      </p>

      <h2>7. Contact</h2>
      <p>contact@plugyard.com</p>
    </LegalOverlay>
  )
}