'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function TermsPage() {
  return (
    <LegalOverlay title="Terms & Conditions" updated="September 6, 2026">
      <h2>1. Agreement</h2>
      <p>
        These Terms & Conditions (“Terms”) govern access to and use of
        https://plugyard.com, the PlugYard application programming interface,
        and related readers, players, and checkout flows (the “Service”). By
        using the Service you agree to these Terms, the Terms of Use, the
        Refund Policy, and the Privacy Policy. If you do not agree, do not use
        the Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        PlugYard is a digital bookstore. We offer catalogues of ebooks and
        audiobooks, some free and some paid, together with account, bookmark,
        rating, review, reader, and audio features. Listings, prices,
        categories, and features may change without notice.
      </p>

      <h2>3. Eligibility and accounts</h2>
      <p>
        You must be able to form a binding contract under Kenyan law. You are
        responsible for your login details and for activity under your
        account. Guest checkout uses the email you enter so we can link
        payment and delivery if you later create an account with that email.
        Notify us at once if you believe your account has been misused.
      </p>

      <h2>4. Free and paid titles</h2>
      <p>
        Titles marked free may be read or previewed without payment, subject
        to these Terms. Paid titles require a completed Paystack payment
        before download, continued reading, or full audio access. Prices,
        currency display, and availability can change. A displayed price is an
        invitation to treat until payment is confirmed.
      </p>

      <h2>5. Licence, not ownership of the file system</h2>
      <p>
        Payment grants a limited, personal, non-exclusive, non-transferable
        licence to access the purchased title for your own use through the
        Service or a download we authorise. You do not acquire copyright in
        the work. You may not resell, rent, sublicense, upload to a public
        library, or commercially exploit the file.
      </p>

      <h2>6. Acceptable use</h2>
      <ul>
        <li>Do not scrape, bulk-copy, or resell files from the library.</li>
        <li>Do not share paid login sessions or paid download links.</li>
        <li>Do not circumvent paywalls, rate limits, or access controls.</li>
        <li>Do not misuse ratings, comments, or other community features.</li>
        <li>Do not attempt to disrupt, overload, or reverse engineer the platform except as allowed by law.</li>
        <li>Do not post unlawful, defamatory, harmful, or infringing content.</li>
        <li>Do not use the Service to send spam or malware.</li>
      </ul>

      <h2>7. User content</h2>
      <p>
        Ratings and comments must be honest and lawful. We may refuse, edit,
        or remove content that violates these Terms. You grant PlugYard a
        worldwide, royalty-free licence to host and display your reviews next
        to the relevant titles for as long as they remain on the Service.
      </p>

      <h2>8. Payments</h2>
      <p>
        Checkout is processed by Paystack. You authorise us and Paystack to
        charge the selected method for the stated amount. An order is complete
        only when Paystack confirms success and we record the reference. Taxes
        or mobile-money fees charged by your provider are your responsibility
        unless the checkout page states otherwise.
      </p>

      <h2>9. Delivery</h2>
      <p>
        Digital access is delivered by unlocking the reader, player, or
        authenticated download for the paid title. Delivery is complete when
        that unlock succeeds. Offline copies, where offered, remain subject
        to the licence in section 5.
      </p>

      <h2>10. Intellectual property</h2>
      <p>
        Site design, branding, software, compilation of the catalogue, and
        original PlugYard titles are owned by PlugYard or its licensors.
        Third-party works remain owned by their rights holders. You may not
        copy our marks or interface except for ordinary browsing.
      </p>

      <h2>11. Notices of alleged infringement</h2>
      <p>
        If you believe a listing infringes your copyright, email{' '}
        <a href="mailto:contact@plugyard.com">contact@plugyard.com</a> with
        the work claimed, the URL or title on PlugYard, your contact details,
        and a statement made in good faith. We may remove or restore material
        after review.
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        The Service and all titles are provided “as is” and “as available”.
        Content is for general information and personal development. It is not
        legal, tax, medical, or investment advice. You remain responsible for
        decisions you take after reading or listening.
      </p>

      <h2>13. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by Kenyan law, PlugYard is not liable
        for indirect, incidental, special, or consequential loss, including
        lost profit, lost data, or business interruption, arising from use of
        the Service. Our aggregate liability for a paid order is limited to
        the amount you paid for that order in the three months before the
        claim, except where liability cannot be limited (including death or
        personal injury caused by negligence, or fraud).
      </p>

      <h2>14. Indemnity</h2>
      <p>
        You will indemnify PlugYard against claims, damages, and reasonable
        legal costs arising from your breach of these Terms, your user
        content, or your misuse of a title.
      </p>

      <h2>15. Suspension and termination</h2>
      <p>
        We may suspend or close an account that breaches these Terms, presents
        a security risk, or is tied to payment fraud. You may stop using the
        Service at any time. Sections that by nature should survive
        (licence limits, IP, liability, indemnity, governing law) survive
        termination.
      </p>

      <h2>16. Force majeure</h2>
      <p>
        We are not liable for delay or failure caused by events beyond
        reasonable control, including network outages, payment-provider
        downtime, hosting failure, or legal prohibition.
      </p>

      <h2>17. Changes</h2>
      <p>
        We may update these Terms. The date at the top will change. Continued
        use after posting constitutes acceptance where permitted by law. If
        you do not agree, stop using the Service.
      </p>

      <h2>18. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of Kenya. Courts of competent
        jurisdiction in Kenya have exclusive jurisdiction, without prejudice
        to any non-waivable consumer right.
      </p>

      <h2>19. Contact</h2>
      <p>
        <a href="mailto:contact@plugyard.com">contact@plugyard.com</a>
      </p>
    </LegalOverlay>
  )
}