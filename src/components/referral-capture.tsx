"use client"

import { useEffect } from "react"
import { captureReferralFromLocation } from "@/lib/referral"

export function ReferralCapture() {
  useEffect(() => {
    captureReferralFromLocation()
  }, [])

  return null
}
