'use client'

import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/40">
        Legal
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-foreground/50">Last updated: 28 August 2026</p>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-foreground/80">
        <p>
          PlugYard (“we”, “us”) operates https://plugyard.com and the related API.
          This policy explains what we collect and how we use it.
        </p>

        <h2 className="text-lg font-semibold text-foreground">1. What we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Account name, email, and password hash (we do not store your raw password).</li>
          <li>Google account email and name if you sign in with Google.</li>
          <li>Order email, book purchased, amount, and Paystack payment reference.</li>
          <li>Bookmarks, ratings, and comments you submit.</li>
          <li>Technical logs (IP, browser) needed to run and secure the service.</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground">2. Why we collect it</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Create and verify your account (email codes via Resend).</li>
          <li>Process payments and let you download or read titles you paid for.</li>
          <li>Link guest checkout to later login using the same email.</li>
          <li>Show bookmarks, ratings, and comments.</li>
          <li>Prevent abuse and fix errors.</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground">3. Payments</h2>
        <p>
          Card and M-Pesa details are handled by Paystack. We do not store full card
          numbers. We store order status and a payment reference so we can confirm
          payment and deliver the file.
        </p>

        <h2 className="text-lg font-semibold text-foreground">4. Email</h2>
        <p>
          We use Resend to send activation and password-reset codes. We do not sell
          your email. We may email you about an order or a security issue.
        </p>

        <h2 className="text-lg font-semibold text-foreground">5. Google Sign-In</h2>
        <p>
          If you use Google, Google shares your verified email and name with us.
          We use that only to create or log in to your PlugYard account.
        </p>

        <h2 className="text-lg font-semibold text-foreground">6. Files and hosting</h2>
        <p>
          Book files are stored with our hosting and storage providers (including
          Render and Supabase). Access to paid files is checked against a paid
          order and email.
        </p>

        <h2 className="text-lg font-semibold text-foreground">7. Cookies and local data</h2>
        <p>
          We store a login token and some preferences in your browser (for example
          bookmarks if you are not logged in). You can clear these in the browser.
        </p>

        <h2 className="text-lg font-semibold text-foreground">8. How long we keep data</h2>
        <p>
          Account and order records are kept while the account exists and as long
          as we need them for support, accounting, and fraud prevention.
        </p>

        <h2 className="text-lg font-semibold text-foreground">9. Your choices</h2>
        <p>
          You can request access, correction, or deletion of your account data by
          emailing{' '}
          <a href="mailto:contact@plugyard.com" className="underline">
            contact@plugyard.com
          </a>
          . We may keep order records required by law.
        </p>

        <h2 className="text-lg font-semibold text-foreground">10. Children</h2>
        <p>
          PlugYard is not directed at children under 13. Do not create an account
          for a child under 13.
        </p>

        <h2 className="text-lg font-semibold text-foreground">11. Contact</h2>
        <p>
          Questions:{' '}
          <a href="mailto:contact@plugyard.com" className="underline">
            contact@plugyard.com
          </a>
        </p>
      </div>

      <p className="mt-10 text-sm text-foreground/50">
        Also see{' '}
        <Link href="/terms" className="underline">
          Terms
        </Link>
        ,{' '}
        <Link href="/terms-of-use" className="underline">
          Terms of Use
        </Link>
        , and{' '}
        <Link href="/refund-policy" className="underline">
          Refund Policy
        </Link>
        .
      </p>
    </main>
  )
}