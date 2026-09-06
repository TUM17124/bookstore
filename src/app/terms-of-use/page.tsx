'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function TermsOfUsePage() {
  return (
    <LegalOverlay title="Terms of Use" updated="September 6, 2026">
      <h2>1. Licence to use the Service</h2>
      <p>
        We grant you a limited, personal, non-exclusive, non-transferable,
        revocable licence to use PlugYard for browsing the catalogue, reading
        free titles, purchasing and accessing paid titles when offered,
        bookmarking, rating, reviewing, and using the reader and audio player
        as the product is designed. No other licence is granted.
      </p>

      <h2>2. Rules of access</h2>
      <ul>
        <li>Use only interfaces we provide. Do not use undocumented endpoints to harvest the catalogue.</li>
        <li>Do not share an account password or a paid download URL.</li>
        <li>Do not interfere with other users’ sessions or with our rate limits.</li>
        <li>Keep playback and reader use within normal personal consumption.</li>
      </ul>

      <h2>3. Content you submit</h2>
      <p>
        Ratings and comments may be moderated or removed. You grant us
        permission to display your reviews next to the relevant titles and to
        use short excerpts for catalogue presentation. You warrant that your
        reviews are your own and do not infringe third-party rights.
      </p>

      <h2>4. Intellectual property</h2>
      <p>
        Site design, branding, software, original covers, and original PlugYard
        publications are owned by PlugYard or its licensors. Do not copy,
        frame, or mirror the Service except as needed for ordinary private
        use. Do not remove rights-management notices from files we deliver.
      </p>

      <h2>5. Paid media access</h2>
      <p>
        Paid PDF and audio URLs are issued only after a valid order. Public
        catalogue responses do not include working paid-file URLs. Attempting
        to guess, share, or replay authenticated download links outside your
        own session is a breach of these Terms of Use.
      </p>

      <h2>6. Service changes</h2>
      <p>
        Features may be updated, paused, or removed. New catalogues, formats,
        or community tools are not a promise of a launch date. We may replace
        a file with a corrected edition of the same title.
      </p>

      <h2>7. Availability and support</h2>
      <p>
        We aim for continuous availability but do not warrant uninterrupted
        access. Maintenance, hosting incidents, and payment-provider outages
        may occur. Write to{' '}
        <a href="mailto:contact@plugyard.com">contact@plugyard.com</a> if a
        paid title will not open after a successful payment.
      </p>

      <h2>8. Prohibited technical conduct</h2>
      <p>
        You must not introduce viruses, run unauthorised load tests, bypass
        authentication, or attempt to obtain another user’s data. Security
        research must be reported privately to the same contact address and
        must not include exfiltration of user data or paid files.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, PlugYard is not liable for
        indirect or consequential loss from use of the site, including
        reliance on a title without independent professional advice. Mandatory
        consumer protections under Kenyan law are not excluded.
      </p>

      <h2>10. Termination of the licence</h2>
      <p>
        The licence in section 1 ends if you breach these Terms of Use or if
        we suspend the Service or your account. On termination you must stop
        using paid files obtained in breach. Lawfully purchased copies already
        downloaded for personal use remain subject to copyright and to the
        non-transferable licence in the Terms & Conditions.
      </p>

      <h2>11. Entire use framework</h2>
      <p>
        These Terms of Use work together with the Terms & Conditions, Refund
        Policy, and Privacy Policy. If there is a conflict on payments or
        refunds, the Refund Policy and Terms & Conditions control those
        subjects.
      </p>

      <h2>12. Contact</h2>
      <p>
        <a href="mailto:contact@plugyard.com">contact@plugyard.com</a>
      </p>
    </LegalOverlay>
  )
}