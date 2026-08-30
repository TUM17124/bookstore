'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function PrivacyPage() {
  return (
    <LegalOverlay title="Privacy Policy" updated="August 30, 2026">
      <p>
        PlugYard (“we”, “us”) operates https://plugyard.com and the related API.
        This policy explains what we collect and how we use it.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>Account name, email, and password hash (we do not store your raw password).</li>
        <li>Google account email and name if you sign in with Google.</li>
        <li>Checkout email, titles accessed or purchased, amount, and Paystack payment reference.</li>
        <li>Bookmarks, ratings, and comments you submit.</li>
        <li>Technical logs (IP, browser) needed to run and secure the service.</li>
      </ul>

      <h2>2. Why we collect it</h2>
      <ul>
        <li>Create and verify your account (email codes via Resend).</li>
        <li>Process payments and let you download or read titles you paid for.</li>
        <li>Link guest checkout to a later login using the same email.</li>
        <li>Show bookmarks, ratings, and comments.</li>
        <li>Prevent abuse and fix errors.</li>
      </ul>

      <h2>3. Payments</h2>
      <p>
        Card and M-Pesa details are handled by Paystack. We do not store full card
        numbers. We store order status and a payment reference so we can confirm
        payment and deliver a file when a title is paid.
      </p>

      <h2>4. Email</h2>
      <p>
        We use Resend to send activation and password-reset codes. We do not sell
        your email. We may email you about an order or a security issue.
      </p>

      <h2>5. Google Sign-In</h2>
      <p>
        If you use Google, Google shares your verified email and name with us.
        We use that only to create or log in to your PlugYard account.
      </p>

      <h2>6. Files and hosting</h2>
      <p>
        Book files are stored with our hosting and storage providers (including
        Render and Supabase). Access to paid files is checked against a paid
        order and email. Public-law texts marked free may be read without payment.
      </p>

      <h2>7. Cookies and local data</h2>
      <p>
        We store a login token and some preferences in your browser (for example
        bookmarks if you are not logged in). You can clear these in the browser.
      </p>

      <h2>8. How long we keep data</h2>
      <p>
        Account and order records are kept while the account exists and as long
        as we need them for support, accounting, and fraud prevention.
      </p>

      <h2>9. Your choices</h2>
      <p>
        You can request access, correction, or deletion of your account data by
        emailing contact@plugyard.com. We may keep order records required by law.
      </p>

      <h2>10. Children</h2>
      <p>
        PlugYard is not directed at children under 13. Do not create an account
        for a child under 13.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions: contact@plugyard.com
      </p>
    </LegalOverlay>
  )
}