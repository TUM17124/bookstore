'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function PrivacyPage() {
  return (
    <LegalOverlay title="Privacy Policy" updated="September 6, 2026">
      <p>
        PlugYard (“we”, “us”, “our”) operates https://plugyard.com and the
        related application programming interface (together, the “Service”).
        This Privacy Policy explains what personal data we collect, why we
        collect it, how we use and share it, how long we keep it, and the
        choices available to you. By creating an account, checking out, or
        otherwise using the Service, you acknowledge this Policy.
      </p>

      <h2>1. Who we are and how to contact us</h2>
      <p>
        PlugYard is a digital bookstore and media platform. For privacy
        requests, write to{' '}
        <a href="mailto:contact@plugyard.com">contact@plugyard.com</a>. We
        will use that address as the primary channel for access, correction,
        deletion, and complaint handling.
      </p>

      <h2>2. Personal data we collect</h2>
      <p>Depending on how you use the Service, we may collect:</p>
      <ul>
        <li>
          Identity and account data: name, email address, password hash (we
          never store your raw password), and optional profile details you
          provide.
        </li>
        <li>
          Google Sign-In data: verified email and name if you choose Google
          authentication.
        </li>
        <li>
          Transaction data: checkout email, titles purchased or accessed,
          amounts, currency, order status, and Paystack payment references.
        </li>
        <li>
          Content you submit: bookmarks, ratings, comments, notes, and similar
          library activity.
        </li>
        <li>
          Technical data: IP address, browser type, device type, approximate
          location derived from IP, request logs, and security events needed
          to operate and protect the Service.
        </li>
        <li>
          Support data: messages you send to us, including attachments you
          choose to include.
        </li>
      </ul>
      <p>
        We do not collect full card numbers or M-Pesa PINs. Those details are
        entered with Paystack and remain with Paystack.
      </p>

      <h2>3. How we collect data</h2>
      <ul>
        <li>Directly from you when you register, check out, review a title, or email us.</li>
        <li>Automatically when you browse, play audio, open a reader, or load pages.</li>
        <li>From payment and authentication providers when you complete Google Sign-In or Paystack checkout.</li>
      </ul>

      <h2>4. Why we use personal data</h2>
      <ul>
        <li>Create, verify, and secure your account, including email codes sent through our email provider.</li>
        <li>Process payments and deliver paid files or in-browser access only after a successful order.</li>
        <li>Link a guest checkout to a later account created with the same email.</li>
        <li>Show your library, bookmarks, ratings, comments, and reading or listening progress where the product supports it.</li>
        <li>Prevent fraud, abuse, scraping, credential stuffing, and other misuse.</li>
        <li>Diagnose errors, measure reliability, and improve the Service.</li>
        <li>Comply with accounting, tax, consumer, and other legal duties.</li>
        <li>Communicate about an order, a security issue, or a change that affects your account.</li>
      </ul>

      <h2>5. Legal bases</h2>
      <p>
        Where a data-protection law requires a legal basis, we rely on:
        performance of a contract (account and delivery); our legitimate
        interests in security, support, and product improvement; consent where
        you choose optional features; and legal obligation where we must keep
        transaction records.
      </p>

      <h2>6. Payments</h2>
      <p>
        Card and mobile-money processing is handled by Paystack. We store
        order status and a payment reference so we can confirm payment and
        unlock the correct title. We do not store full card PAN, CVV, or
        mobile-money secrets.
      </p>

      <h2>7. Email</h2>
      <p>
        We use an email delivery provider (currently Resend) to send
        activation codes, password-reset codes, and transactional messages
        about orders or security. We do not sell your email list. Marketing
        mail, if introduced later, will be optional and will include an
        unsubscribe method.
      </p>

      <h2>8. Google Sign-In</h2>
      <p>
        If you use Google, Google shares your verified email and name with us.
        We use that only to create or sign in to your PlugYard account and to
        associate purchases made with that email.
      </p>

      <h2>9. Files, hosting, and processors</h2>
      <p>
        Book files, covers, and application data are stored with our hosting
        and storage providers. Access to paid files is checked against a valid
        order and the email or account tied to that order. Providers act on
        our instructions and may process data in the countries where they
        operate. We select processors that offer contractual and technical
        safeguards appropriate to the Service.
      </p>

      <h2>10. Cookies and local storage</h2>
      <p>
        We store a login token and preferences in your browser. We may also
        store bookmarks or reader progress locally if you are not signed in.
        You can clear cookies and site data in your browser. Doing so may sign
        you out and reset local progress.
      </p>

      <h2>11. Retention</h2>
      <p>
        Account data is kept while the account is active. Order and payment
        references are kept for as long as needed for support, accounting,
        chargeback defence, and legal retention. Security logs are kept for a
        limited operational period unless a longer hold is required for an
        investigation. When data is no longer needed, we delete or irreversibly
        anonymise it where practicable.
      </p>

      <h2>12. Sharing</h2>
      <p>We share personal data only:</p>
      <ul>
        <li>With processors who help us host, send email, process payments, or secure the Service.</li>
        <li>With you, when you request your data.</li>
        <li>When required by law, court order, or a competent authority.</li>
        <li>To protect the rights, safety, or property of PlugYard, our users, or the public.</li>
        <li>In connection with a merger, sale, or reorganisation, subject to this Policy or equivalent protection.</li>
      </ul>
      <p>We do not sell personal data.</p>

      <h2>13. Security</h2>
      <p>
        We use HTTPS, hashed passwords, access controls on paid media, and
        rate limiting on sensitive endpoints. No internet service is perfectly
        secure. You must keep your password confidential and use a unique
        password.
      </p>

      <h2>14. Your choices</h2>
      <p>
        You may request access, correction, or deletion of account data by
        emailing{' '}
        <a href="mailto:contact@plugyard.com">contact@plugyard.com</a>. We
        may retain order records required by law or needed to prove a past
        licence grant. You may close your account; paid licences already
        granted remain subject to the Terms.
      </p>

      <h2>15. Children</h2>
      <p>
        The Service is not directed at children under 13. Do not create an
        account for a child under 13. If we learn that we hold such an
        account, we will delete it.
      </p>

      <h2>16. International users</h2>
      <p>
        The Service is operated with Kenya as the primary place of business.
        If you access it from another country, your data may be processed in
        Kenya and in the countries of our processors.
      </p>

      <h2>17. Changes</h2>
      <p>
        We may update this Policy. The “updated” date at the top will change.
        Material changes will be posted on this page. Continued use after the
        update constitutes acceptance where permitted by law.
      </p>

      <h2>18. Contact</h2>
      <p>
        Privacy questions and data requests:{' '}
        <a href="mailto:contact@plugyard.com">contact@plugyard.com</a>
      </p>
    </LegalOverlay>
  )
}