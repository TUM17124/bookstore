'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function RefundPolicyPage() {
  return (
    <LegalOverlay title="Refund Policy" updated="August 25, 2026">
      <h2>1. Overview</h2>
      <p>
        We want you to be satisfied with your purchase. This policy explains when
        refunds may be available.
      </p>

      <h2>2. Physical books</h2>
      <ul>
        <li>
          Unopened items may be returned within 14 days of delivery if in
          original condition.
        </li>
        <li>
          Damaged or incorrect items should be reported within 7 days of delivery
          with supporting photos.
        </li>
      </ul>

      <h2>3. Digital / audiobook purchases</h2>
      <p>
        Digital products are generally non-refundable once access has been
        granted, except where required by law or in cases of technical failure
        we cannot resolve.
      </p>

      <h2>4. How to request a refund</h2>
      <p>
        Contact support with your order details and reason for the request.
        Approved refunds are processed to the original payment method within a
        reasonable timeframe.
      </p>

      <h2>5. Exceptions</h2>
      <p>
        Final-sale, clearance, or personalized items may be excluded from returns
        unless defective.
      </p>
    </LegalOverlay>
  )
}