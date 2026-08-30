'use client'

import { LegalOverlay } from '@/components/legal-overlay'

export default function RefundPolicyPage() {
  return (
    <LegalOverlay title="Refund Policy" updated="August 30, 2026">
      <h2>1. Overview</h2>
      <p>
        PlugYard is a digital library. Most titles on the shelf today are
        official public-law texts that you can read for free. This policy covers
        paid digital purchases if and when a title is sold.
      </p>

      <h2>2. Free titles</h2>
      <p>
        Free-to-read statutes and public documents are not a sale. There is
        nothing to refund for opening or reading a free file.
      </p>

      <h2>3. Paid digital files</h2>
      <p>
        Where a title is paid (ebook or audiobook), access is generally
        non-refundable once download or in-browser reading has been granted,
        except where Kenyan consumer law requires otherwise, or where a
        technical failure on our side stops you from opening a file we cannot
        repair.
      </p>

      <h2>4. How to request a refund</h2>
      <p>
        Email contact@plugyard.com with the order number, the email used at
        checkout, the title, and what went wrong. Approved refunds go back to
        the original Paystack method within a reasonable time.
      </p>

      <h2>5. Charge disputes</h2>
      <p>
        If a payment posted twice or you were charged for a file that never
        unlocked, write to us first so we can check the Paystack reference
        before a chargeback.
      </p>
    </LegalOverlay>
  )
}