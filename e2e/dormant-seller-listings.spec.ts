import { expect, test } from "@playwright/test"

test("seller can find a dormant listing, confirm availability, and see moderation state", async ({ page }) => {
  const token = `x.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString("base64url")}.x`
  await page.addInitScript((value) => localStorage.setItem("access_token", value), token)
  await page.route("**/api/site/config/**", (route) => route.fulfill({ json: { features: { marketplace: true } } }))
  await page.route("**/api/marketplace/categories/**", (route) => route.fulfill({ json: [] }))

  let restored = false
  let confirmBody: Record<string, unknown> | null = null
  await page.route("**/api/marketplace/me/listings/**", (route) => route.fulfill({ json: {
    count: 1, next: null, previous: null,
    results: [{
      id: 41, seller: { id: 2, name: "Test Seller" }, category: "stock-products",
      title: "Dormant test product", slug: "dormant-test-product", description_text: "Test listing",
      price_type: "fixed", price_amount: "1250.00", price_min: null, price_max: null,
      currency: "KES", fulfillment_type: "shipping", status: "active",
      moderation_status: restored ? "pending" : "approved", published_at: null,
      media: [], viewer: { mode: "gallery", config: {} }, url: "/listings/dormant-test-product/",
      legacy_book_id: null, inventory_summary: { policy: "finite", configured: true, in_stock: true, variants: [] },
      checkout_disabled: false, is_demo: false,
      inactive_paused_at: restored ? null : "2026-10-27T10:00:00Z",
      inactive_pause_reason: restored ? "" : "Seller availability requires confirmation.",
    }],
  } }))
  await page.route("**/api/marketplace/seller/confirm-availability/", async (route) => {
    confirmBody = route.request().postDataJSON() as Record<string, unknown>
    restored = true
    await route.fulfill({ json: { restored: [41], skipped: [], skipped_reasons: {},
      message: "Availability confirmed.", requires_moderation: true } })
  })

  page.on("dialog", (dialog) => dialog.accept())
  await page.goto("/seller/listings/")
  await expect(page.getByRole("heading", { name: "Dormant test product" })).toBeVisible()
  await expect(page.getByText("Hidden due to seller inactivity")).toBeVisible()
  await page.getByRole("button", { name: "Confirm availability & restore" }).click()
  await expect.poll(() => confirmBody).toEqual({ listing_ids: [41] })
  await expect(page.getByRole("status")).toContainText("awaiting administrator review")
  await expect(page.getByText("Hidden due to seller inactivity")).toHaveCount(0)
  await expect(page.getByText("pending", { exact: false })).toBeVisible()
})
