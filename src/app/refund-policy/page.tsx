'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function RefundPolicyPage() {
  return (
    <LegalOverlay title="Refund Policy" updated="September 6, 2026">
      <h2>1. Overview</h2>
      <p>
        PlugYard sells and delivers digital products, including ebooks,
        preview pages, and audiobooks. This Refund Policy applies to paid
        digital purchases completed through Paystack on https://plugyard.com.
        It should be read with the Terms & Conditions and Terms of Use.
      </p>

      <h2>2. Nature of digital goods</h2>
      <p>
        A paid title is a licence to access a digital file or stream, not a
        physical book. Once we have unlocked download or in-browser reading or
        listening for that title, the product has been delivered. Because a
        digital file can be copied after delivery, refunds after unlock are
        limited.
      </p>

      <h2>3. Free titles</h2>
      <p>
        Titles marked free are not a sale. Opening or reading a free title
        does not create a refund right.
      </p>

      <h2>4. When a refund is not available</h2>
      <p>Except where Kenyan consumer law requires otherwise, we do not refund:</p>
      <ul>
        <li>Change of mind after payment has succeeded and access has been granted.</li>
        <li>Failure to meet a device, browser, or network requirement that we published or that is reasonably expected for streaming or PDF viewing.</li>
        <li>Dissatisfaction with editorial style, length, or opinion after you have opened the title.</li>
        <li>Purchases made with an email or account you no longer control, if we can show delivery to that email or account.</li>
        <li>Promotional or discounted prices after the promotion has ended.</li>
      </ul>

      <h2>5. When we will consider a refund</h2>
      <p>We will consider a full or partial refund, or a replacement file, if:</p>
      <ul>
        <li>You were charged twice for the same title and the same order email.</li>
        <li>Payment succeeded but the file never unlocked and we cannot repair access within a reasonable time.</li>
        <li>The delivered file is corrupt or incomplete and a working replacement cannot be provided.</li>
        <li>Kenyan consumer law or a binding authority requires a remedy in the specific facts.</li>
      </ul>

      <h2>6. How to request a refund</h2>
      <p>
        Email{' '}
        <a href="mailto:contact@plugyard.com">contact@plugyard.com</a> with:
      </p>
      <ul>
        <li>order number or Paystack reference;</li>
        <li>the email used at checkout;</li>
        <li>the title;</li>
        <li>the date and amount; and</li>
        <li>a short description of the fault.</li>
      </ul>
      <p>
        We may ask for screenshots or the device and browser you used. Approved
        refunds are returned to the original Paystack method within a
        reasonable time after approval. Bank or mobile-money posting times are
        outside our control.
      </p>

      <h2>7. Time limit</h2>
      <p>
        Raise a delivery or charging problem as soon as you notice it, and in
        any event within fourteen (14) days of the payment date, unless a
        longer period is required by law. Late requests are harder to verify
        and may be declined if the file was already unlocked.
      </p>

      <h2>8. Chargebacks</h2>
      <p>
        If a payment posted twice or a file never unlocked, contact us first
        so we can check the Paystack reference. A chargeback opened without
        giving us a chance to repair access may delay resolution and may lead
        to suspension of the account tied to that dispute while the claim is
        investigated.
      </p>

      <h2>9. Abuse</h2>
      <p>
        Repeated unlock-and-dispute behaviour, sharing of paid files, or
        false refund claims may result in refusal of future sales and
        termination of access as described in the Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Refund and billing questions:{' '}
        <a href="mailto:contact@plugyard.com">contact@plugyard.com</a>
      </p>
    </LegalOverlay>
  )
}